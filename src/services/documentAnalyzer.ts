import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type {
  Cfdi,
  CfdiConcepto,
  CfdiPago,
  Empresa,
  FiscalDatabaseState,
} from '../types/fiscal';
import type { AssistantMessage } from './assistantEngine';
import {
  comprehendSpreadsheet,
  comprehendTextDocument,
  extractDocxContent,
  extractPptxContent,
  formatMetricValue,
  isMonetaryColumnHeader,
  retrieveBestPassages,
  type DocumentComprehension,
} from './documentComprehension';
import { getIsrPeriodo, getIvaFlujoPeriodo, getPpdPendientesCobro } from './fiscalCalculations';
import { basicNormalize, fuzzyWordMatch, type SemanticTopic } from './nluEngine';
import { extractPdfTextFromBuffer } from './pdfExtractor';
import {
  CATALOGO_FORMA_PAGO,
  CATALOGO_TIPO_CFDI,
  formatMoney,
  formatShortDate,
  shortUuid,
} from '../utils/format';
import { parseCfdiXml } from '../utils/xmlParser';
import {
  assertSafeXml,
  isSafeZipEntryPath,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  safeJsonParse,
  validateFileUpload,
} from '../utils/security';

export type DocumentFormat =
  | 'xml'
  | 'zip'
  | 'excel'
  | 'csv'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'sat_metadata'
  | 'json'
  | 'text'
  | 'unknown';

export type FiscalDocCategory =
  | 'cfdi_xml'
  | 'paquete_zip_sat'
  | 'constancia_csf'
  | 'opinion_sat_32d'
  | 'opinion_imss'
  | 'factura_pdf'
  | 'estado_cuenta'
  | 'declaracion_sat'
  | 'metadata_sat_txt'
  | 'hoja_calculo_fiscal'
  | 'contrato_convenio'
  | 'cotizacion_propuesta'
  | 'orden_compra'
  | 'estado_financiero'
  | 'nomina_rh'
  | 'manual_guia'
  | 'minuta_informe'
  | 'oficio_notificacion'
  | 'presentacion'
  | 'documento_general';

export interface SpreadsheetNumericCol {
  column: string;
  sum: number;
  avg: number;
  min: number;
  max: number;
  nonZeroCount: number;
  isCurrency: boolean;
}

export interface SpreadsheetSheetSummary {
  name: string;
  headers: string[];
  rowCount: number;
  rows: Record<string, string | number>[];
  numericColumns: SpreadsheetNumericCol[];
}

export interface PortalReconciliationSummary {
  uuidsInPortal: string[];
  uuidsMissingInPortal: string[];
  efosAlerts: Array<{ rfc: string; nombre: string; situacion: string }>;
  ppdMatches: Array<{ folio: string; cliente: string; saldo: number; matchedAmount: number }>;
}

export interface AnalyzedDocument {
  id: string;
  fileName: string;
  format: DocumentFormat;
  category: FiscalDocCategory;
  categoryLabel: string;
  sizeBytes: number;
  uploadedAt: string;
  pageCount?: number;
  rawText: string;
  lines: string[];
  extractedRfcs: string[];
  extractedUuids: string[];
  extractedDates: string[];
  extractedAmounts: number[];
  keyFields: Record<string, string>;
  findings: string[];
  comprehension?: DocumentComprehension;
  cfdi?: Cfdi;
  cfdiConceptos?: CfdiConcepto[];
  cfdiPagos?: CfdiPago[];
  cfdiBelongsToActiveEmpresa?: boolean;
  zipCfdis?: Cfdi[];
  zipNestedDocs?: Array<{ name: string; format: DocumentFormat; note: string }>;
  sheets?: SpreadsheetSheetSummary[];
  portalMatch?: PortalReconciliationSummary;
  parseError?: string;
}

export interface DocumentInput {
  fileName: string;
  sizeBytes?: number;
  textContent?: string;
  arrayBuffer?: ArrayBuffer;
}

// =========================================================================
// EXTRACTORES BASE (RFC, UUID, FECHAS, MONTOS, LIMPIEZA NUMÉRICA)
// =========================================================================

const RFC_REGEX = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/gi;
const UUID_REGEX = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
const DATE_REGEX =
  /\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4})\b/gi;

function extractRfcs(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(RFC_REGEX) || [];
  for (const m of matches) {
    const up = m.toUpperCase();
    const offset = up.length === 12 ? 3 : 4;
    const mm = parseInt(up.slice(offset + 2, offset + 4), 10);
    const dd = parseInt(up.slice(offset + 4, offset + 6), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      found.add(up);
    }
  }
  return Array.from(found);
}

function extractUuids(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(UUID_REGEX) || [];
  for (const m of matches) {
    found.add(m.toUpperCase());
  }
  return Array.from(found);
}

function extractDates(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(DATE_REGEX) || [];
  for (const m of matches) {
    found.add(m.trim());
  }
  return Array.from(found).slice(0, 30);
}

function parseNumericValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;
  const isParenNeg = cleaned.startsWith('(') && cleaned.endsWith(')');
  cleaned = cleaned.replace(/[()$\s,MXNUSDmxnusd]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;
  return isParenNeg ? -Math.abs(num) : num;
}

function extractMonetaryAmounts(text: string): number[] {
  const amounts: number[] = [];
  // Solo extraer cantidades con símbolo/código de divisa explícito ($, €, MXN, USD, EUR, pesos, dólares)
  // o etiqueta monetaria inequívoca (nunca números simples, mediciones, porcentajes o conteos)
  const currencyRegex =
    /(?:(?:\$|€|US\$|MXN\s+|USD\s+|EUR\s+)\s*(\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?)|(\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?)\s*(?:MXN|USD|EUR|pesos|d[oó]lares)\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = currencyRegex.exec(text)) !== null) {
    const rawNum = match[1] || match[2];
    const val = parseNumericValue(rawNum);
    if (val !== null && Math.abs(val) > 0 && Math.abs(val) < 1e11) {
      amounts.push(val);
    }
  }
  return amounts;
}

function detectFormat(fileName: string): DocumentFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.ods')) return 'excel';
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.log') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text';
  }
  return 'unknown';
}

function reconcileWithPortal(
  uuids: string[],
  rfcs: string[],
  amounts: number[],
  state: FiscalDatabaseState,
  empresa: Empresa,
): PortalReconciliationSummary {
  const portalUuidMap = new Set(
    state.cfdis
      .filter((c) => c.empresa_id === empresa.id && !c.solo_en_sat)
      .map((c) => c.uuid.toUpperCase()),
  );

  const uuidsInPortal: string[] = [];
  const uuidsMissingInPortal: string[] = [];
  for (const u of uuids) {
    if (portalUuidMap.has(u.toUpperCase())) uuidsInPortal.push(u.toUpperCase());
    else uuidsMissingInPortal.push(u.toUpperCase());
  }

  const efosAlerts: PortalReconciliationSummary['efosAlerts'] = [];
  const seenEfos = new Set<string>();
  for (const rfc of rfcs) {
    const hit = state.lista_efos.find((e) => e.rfc.toUpperCase() === rfc.toUpperCase());
    if (hit && !seenEfos.has(hit.rfc)) {
      seenEfos.add(hit.rfc);
      efosAlerts.push({ rfc: hit.rfc, nombre: hit.razon_social, situacion: hit.situacion });
    }
  }

  const ppdMatches: PortalReconciliationSummary['ppdMatches'] = [];
  if (amounts.length > 0) {
    const pendientes = getPpdPendientesCobro(state, empresa.id);
    for (const p of pendientes) {
      const matched = amounts.find((a) => Math.abs(Math.abs(a) - p.pendiente) <= 1.5);
      if (matched !== undefined) {
        ppdMatches.push({
          folio: `${p.cfdi.serie}-${p.cfdi.folio}`,
          cliente: p.cfdi.nombre_receptor,
          saldo: p.pendiente,
          matchedAmount: Math.abs(matched),
        });
      }
    }
  }

  return { uuidsInPortal, uuidsMissingInPortal, efosAlerts, ppdMatches };
}

// =========================================================================
// PARSER XML (CON SOPORTE COMPLETO EN NAVEGADOR + RESPALDO NODE.JS)
// =========================================================================

function fallbackParseXmlWithoutDom(
  xmlText: string,
  empresa: Empresa,
): { cfdi: Cfdi; conceptos: CfdiConcepto[]; belongsToActive: boolean } | null {
  const attr = (tag: string, name: string): string => {
    const tagMatch = xmlText.match(new RegExp(`<[a-z0-9_]*:?${tag}\\b([^>]+)>`, 'i'));
    if (!tagMatch) return '';
    const m = tagMatch[1].match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
  };

  const version = attr('Comprobante', 'Version') || '4.0';
  const fecha = attr('Comprobante', 'Fecha') || new Date().toISOString();
  const total = parseFloat(attr('Comprobante', 'Total') || '0') || 0;
  const subtotal = parseFloat(attr('Comprobante', 'SubTotal') || '0') || 0;
  const tipo = (attr('Comprobante', 'TipoDeComprobante') || 'I').toUpperCase() as Cfdi['tipo'];
  const metodo = (attr('Comprobante', 'MetodoPago') || '') as Cfdi['metodo_pago'];
  const forma = attr('Comprobante', 'FormaPago') || '';
  const moneda = (attr('Comprobante', 'Moneda') || 'MXN').toUpperCase() as Cfdi['moneda'];
  const tc = parseFloat(attr('Comprobante', 'TipoCambio') || '1') || 1;
  const serie = attr('Comprobante', 'Serie') || 'XML';
  const folio = attr('Comprobante', 'Folio') || 'S/N';

  const rfcEmisor = attr('Emisor', 'Rfc').toUpperCase();
  const nombreEmisor = attr('Emisor', 'Nombre') || rfcEmisor || 'EMISOR XML';
  const regEmisor = attr('Emisor', 'RegimenFiscal') || '601';
  const rfcReceptor = attr('Receptor', 'Rfc').toUpperCase();
  const nombreReceptor = attr('Receptor', 'Nombre') || rfcReceptor || 'RECEPTOR XML';
  const usoCfdi = attr('Receptor', 'UsoCFDI') || 'G03';
  const uuid = (attr('TimbreFiscalDigital', 'UUID') || '').toUpperCase();

  if (!uuid && !rfcEmisor) return null;

  const ivaMatch = xmlText.match(/Impuesto="002"[^>]*Importe="([\d.]+)"/i);
  const ivaTrasladado = ivaMatch ? parseFloat(ivaMatch[1]) || 0 : 0;

  const activeRfc = empresa.rfc.toUpperCase();
  const belongsToActive = rfcEmisor === activeRfc || rfcReceptor === activeRfc;
  const direccion: 'E' | 'R' = rfcEmisor === activeRfc ? 'E' : 'R';

  const conceptos: CfdiConcepto[] = [];
  const cRegex = /<[a-z0-9_]*:?Concepto\b([^>]+)/gi;
  let cm: RegExpExecArray | null;
  let idx = 1;
  while ((cm = cRegex.exec(xmlText)) !== null) {
    const body = cm[1];
    const ga = (k: string) => body.match(new RegExp(`\\b${k}="([^"]*)"`, 'i'))?.[1] || '';
    conceptos.push({
      id: `cx-${idx++}`,
      uuid: uuid || 'SIN-UUID',
      clave_prod_serv: ga('ClaveProdServ') || '01010101',
      cantidad: parseFloat(ga('Cantidad') || '1') || 1,
      unidad: ga('Unidad') || ga('ClaveUnidad') || 'E48',
      descripcion: ga('Descripcion') || 'Concepto',
      valor_unitario: parseFloat(ga('ValorUnitario') || '0') || 0,
      importe: parseFloat(ga('Importe') || '0') || 0,
      objeto_imp: '02',
    });
  }

  return {
    belongsToActive,
    conceptos,
    cfdi: {
      uuid: uuid || `XML-${Date.now()}`,
      empresa_id: empresa.id,
      direccion,
      tipo,
      version: version === '3.3' ? '3.3' : '4.0',
      serie,
      folio,
      fecha_emision: fecha,
      fecha_timbrado: fecha,
      fecha_fiscal: fecha.slice(0, 10),
      rfc_emisor: rfcEmisor,
      nombre_emisor: nombreEmisor,
      regimen_emisor: regEmisor,
      rfc_receptor: rfcReceptor,
      nombre_receptor: nombreReceptor,
      regimen_receptor: '601',
      uso_cfdi: usoCfdi,
      metodo_pago: metodo,
      forma_pago: forma,
      moneda: moneda === 'USD' || moneda === 'EUR' ? moneda : 'MXN',
      tipo_cambio: tc,
      subtotal,
      descuento: 0,
      iva_trasladado: ivaTrasladado,
      iva_retenido: 0,
      isr_retenido: 0,
      ieps: 0,
      total,
      total_mxn: Number((total * tc).toFixed(2)),
      estatus_sat: 'vigente',
      fecha_cancelacion: null,
      xml_path: '',
      origen: 'manual',
      estatus_contable: 'sin_registro',
    },
  };
}

function parseXmlFlexible(
  xmlText: string,
  empresa: Empresa,
): {
  ok: boolean;
  cfdi?: Cfdi;
  conceptos?: CfdiConcepto[];
  pagos?: CfdiPago[];
  belongsToActive?: boolean;
  error?: string;
} {
  if (typeof DOMParser !== 'undefined') {
    const direct = parseCfdiXml(xmlText, empresa, new Set());
    if (direct.ok && direct.cfdi) {
      return {
        ok: true,
        cfdi: direct.cfdi,
        conceptos: direct.conceptos,
        pagos: direct.pagos,
        belongsToActive: true,
      };
    }
    if (direct.errorCode === 'rfc_mismatch' && direct.detectedRfcs) {
      const tempEmpresa: Empresa = {
        ...empresa,
        rfc: direct.detectedRfcs.emisor || direct.detectedRfcs.receptor,
        razon_social: direct.detectedRfcs.emisorNombre || direct.detectedRfcs.receptorNombre,
      };
      const second = parseCfdiXml(xmlText, tempEmpresa, new Set());
      if (second.ok && second.cfdi) {
        return {
          ok: true,
          cfdi: second.cfdi,
          conceptos: second.conceptos,
          pagos: second.pagos,
          belongsToActive: false,
        };
      }
    }
    return { ok: false, error: direct.error || 'No fue posible interpretar el XML.' };
  }

  const fb = fallbackParseXmlWithoutDom(xmlText, empresa);
  if (!fb) return { ok: false, error: 'Estructura XML CFDI no reconocida.' };
  return {
    ok: true,
    cfdi: fb.cfdi,
    conceptos: fb.conceptos,
    pagos: [],
    belongsToActive: fb.belongsToActive,
  };
}

function auditCfdiFindings(
  c: Cfdi,
  belongsToActive: boolean,
  state: FiscalDatabaseState,
  empresa: Empresa,
): string[] {
  const findings: string[] = [];
  const exists = state.cfdis.some((x) => x.uuid.toUpperCase() === c.uuid.toUpperCase());
  findings.push(
    exists
      ? 'El UUID ya se encuentra incorporado en el portal.'
      : 'El UUID aún no ha sido importado al portal.',
  );
  if (!belongsToActive) {
    findings.push(
      `El comprobante no corresponde al RFC activo (${empresa.rfc}), sino a la relación entre ${c.rfc_emisor} y ${c.rfc_receptor}.`,
    );
  }
  if (c.metodo_pago === 'PUE' && c.forma_pago === '99') {
    findings.push('Inconsistencia SAT: combina método PUE con forma de pago 99 (Por definir).');
  }
  if (c.metodo_pago === 'PPD' && c.forma_pago && c.forma_pago !== '99') {
    findings.push(`Alerta PPD: el método PPD debería asentarse con forma 99 (presenta forma ${c.forma_pago}).`);
  }
  if (c.direccion === 'R' && c.metodo_pago === 'PUE' && c.forma_pago === '01' && c.total_mxn > 2000) {
    findings.push('No deducible para ISR (Art. 27 fracc. III LISR): gasto pagado en efectivo superior a $2,000.00 MXN.');
  }
  if (c.direccion === 'R' && c.uso_cfdi === 'S01') {
    findings.push('Uso CFDI S01 (Sin efectos fiscales): excluido automáticamente de deducciones ISR.');
  }
  for (const rfc of [c.rfc_emisor, c.rfc_receptor]) {
    const efos = state.lista_efos.find((e) => e.rfc.toUpperCase() === rfc.toUpperCase());
    if (efos) {
      findings.push(
        `Alerta Art. 69-B CFF: ${efos.razon_social} (${efos.rfc}) figura en lista EFOS con estatus ${efos.situacion.toUpperCase()}.`,
      );
    }
  }
  return findings;
}

// =========================================================================
// CLASIFICADOR Y EXTRACTOR DE TEXTOS FISCALES + CORPORATIVOS (PDF / DOCX / TXT)
// =========================================================================

function classifyAndEnrichRichTextDoc(
  text: string,
  fileName: string,
  state: FiscalDatabaseState,
  empresa: Empresa,
  portalMatch: PortalReconciliationSummary,
  comprehension: DocumentComprehension,
): {
  category: FiscalDocCategory;
  categoryLabel: string;
  keyFields: Record<string, string>;
  findings: string[];
} {
  const norm = basicNormalize(text);
  const nameNorm = basicNormalize(fileName);
  const keyFields: Record<string, string> = {};
  const findings: string[] = [];

  const rfcs = extractRfcs(text);
  const uuids = extractUuids(text);
  const dates = extractDates(text);
  const amounts = extractMonetaryAmounts(text);

  // 1. Constancia de Situación Fiscal (CSF)
  if (
    norm.includes('constancia de situacion fiscal') ||
    norm.includes('cedula de identificacion fiscal') ||
    (norm.includes('datos de identificacion del contribuyente') && norm.includes('regimen'))
  ) {
    const rfcMatch = rfcs[0] || text.match(/RFC[:\s]+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i)?.[1]?.toUpperCase();
    const razonMatch = text.match(
      /(?:Denominaci[oó]n\s*\/?\s*Raz[oó]n\s*Social|Raz[oó]n\s*Social|Nombre(?:\s*\(s\))?)[:\s]+([^\n]{3,90})/i,
    );
    const estatusMatch = text.match(/Estatus\s+en\s+el\s+padr[oó]n[:\s]+([A-ZÁÉÍÓÚÑ\s]{4,25})/i);
    const cpMatch = text.match(/C[oó]digo\s*Postal[:\s]+(\d{5})/i);
    const regMatch = text.match(/R[eé]gimen(?:es)?(?:\s+Fiscal)?[:\s]+([^\n]{5,90})/i);

    if (rfcMatch) keyFields['RFC'] = rfcMatch;
    if (razonMatch) keyFields['Contribuyente'] = razonMatch[1].trim();
    if (estatusMatch) keyFields['Estatus padrón'] = estatusMatch[1].trim();
    if (cpMatch) keyFields['Código Postal'] = cpMatch[1];
    if (regMatch) keyFields['Régimen fiscal'] = regMatch[1].trim();
    if (dates.length > 0) keyFields['Fecha(s)'] = dates.slice(0, 2).join(', ');

    if (rfcMatch) {
      if (rfcMatch === empresa.rfc.toUpperCase()) {
        findings.push(`El RFC (${rfcMatch}) coincide exactamente con la empresa activa (${empresa.razon_social}).`);
      } else {
        findings.push(`Atención: el RFC de la constancia (${rfcMatch}) difiere de la empresa activa (${empresa.rfc}).`);
      }
    }
    if (estatusMatch && !basicNormalize(estatusMatch[1]).includes('activo')) {
      findings.push(`Alerta: el estatus en el padrón aparece como "${estatusMatch[1].trim()}" (no ACTIVO).`);
    } else if (estatusMatch) {
      findings.push('Estatus en el padrón del SAT confirmado como ACTIVO.');
    }

    return {
      category: 'constancia_csf',
      categoryLabel: 'Constancia de Situación Fiscal (CSF)',
      keyFields,
      findings,
    };
  }

  // 2. Opinión de Cumplimiento SAT (32-D)
  if (
    norm.includes('opinion del cumplimiento de obligaciones fiscales') ||
    (norm.includes('opinion de cumplimiento') && (norm.includes('32-d') || norm.includes('32d') || norm.includes('sat'))) ||
    (norm.includes('servicio de administracion tributaria') && norm.includes('sentido'))
  ) {
    const sentido = norm.includes('negativo') || norm.includes('negativa')
      ? 'NEGATIVO'
      : norm.includes('positivo') || norm.includes('positiva')
        ? 'POSITIVO'
        : norm.includes('sin obligaciones')
          ? 'SIN OBLIGACIONES'
          : 'Por verificar';
    const folioMatch = text.match(/Folio[:\s]+([A-Z0-9-]{6,30})/i);
    keyFields['Sentido 32-D'] = sentido;
    if (folioMatch) keyFields['Folio SAT'] = folioMatch[1].trim();
    if (rfcs[0]) keyFields['RFC'] = rfcs[0];
    if (dates.length > 0) keyFields['Fecha'] = dates[0];

    const docPortal = state.documentos.find(
      (d) => d.empresa_id === empresa.id && d.tipo === 'opinion_sat',
    );
    if (sentido === 'NEGATIVO') {
      findings.push('Alerta crítica: la Opinión de Cumplimiento SAT 32-D resulta NEGATIVA; revise declaraciones o créditos fiscales pendientes.');
    } else if (sentido === 'POSITIVO') {
      findings.push('Opinión SAT 32-D en sentido POSITIVO: el contribuyente se encuentra al corriente ante el SAT.');
    }
    if (docPortal) {
      findings.push(
        `Comparación con #fiscal/documentos: el portal tenía registrada la opinión ${docPortal.folio_documento} (${docPortal.sentido.toUpperCase()}, ${formatShortDate(docPortal.fecha_consulta)}).`,
      );
    }

    return {
      category: 'opinion_sat_32d',
      categoryLabel: 'Opinión de Cumplimiento SAT (32-D)',
      keyFields,
      findings,
    };
  }

  // 3. Opinión de Cumplimiento IMSS
  if (
    norm.includes('instituto mexicano del seguro social') ||
    (norm.includes('imss') && norm.includes('cumplimiento'))
  ) {
    const sentido = norm.includes('negativ') ? 'NEGATIVA' : norm.includes('positiv') ? 'POSITIVA' : 'Por verificar';
    const rpMatch = text.match(/Registro\s+Patronal[:\s]+([A-Z0-9-]{8,15})/i);
    keyFields['Sentido IMSS'] = sentido;
    if (rpMatch) keyFields['Registro Patronal'] = rpMatch[1].trim();
    if (dates.length > 0) keyFields['Fecha'] = dates[0];
    findings.push(
      sentido === 'POSITIVA'
        ? 'Opinión de Cumplimiento IMSS en sentido POSITIVA. Puede resguardarla en #fiscal/documentos.'
        : `Opinión IMSS con sentido ${sentido}. Conviene validar cuotas obrero-patronales pendientes.`,
    );
    return {
      category: 'opinion_imss',
      categoryLabel: 'Opinión de Cumplimiento IMSS',
      keyFields,
      findings,
    };
  }

  // 4. Acuse de Declaración SAT / Línea de Captura
  if (
    norm.includes('acuse de recibo') ||
    norm.includes('linea de captura') ||
    norm.includes('declaracion provisional') ||
    (norm.includes('impuesto al valor agregado') && norm.includes('cantidad a pagar'))
  ) {
    const lcMatch = text.match(/L[ií]nea\s+de\s+Captura[:\s]+([A-Z0-9\s-]{16,28})/i);
    const pagarMatch = text.match(/(?:Cantidad\s+a\s+pagar|Total\s+a\s+pagar|A\s+cargo)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i);
    const periodoMatch = text.match(/Per[ií]odo[:\s]+([A-Za-zÁÉÍÓÚáéíóúñÑ]+\s*(?:202\d)?)/i);
    if (lcMatch) keyFields['Línea de captura'] = lcMatch[1].trim();
    if (pagarMatch) keyFields['Importe a pagar'] = `$${pagarMatch[1]}`;
    if (periodoMatch) keyFields['Periodo declarado'] = periodoMatch[1].trim();

    if (pagarMatch) {
      const montoDecl = parseNumericValue(pagarMatch[1]) || 0;
      const ivaOct = getIvaFlujoPeriodo(state, empresa.id, '2026-10');
      const isrOct = getIsrPeriodo(state, empresa.id, '2026-10');
      if (norm.includes('valor agregado') || norm.includes('iva')) {
        const diff = montoDecl - ivaOct.ivaACargo;
        findings.push(
          `Cruce contra IVA en flujo del portal (octubre 2026: ${formatMoney(ivaOct.ivaACargo, false)}): variación de ${formatMoney(diff, false)} respecto al acuse.`,
        );
      } else if (norm.includes('renta') || norm.includes('isr')) {
        findings.push(
          `Referencia portal ISR octubre 2026: ingresos cobrados ${formatMoney(isrOct.totalIngresos, false)} y deducciones ${formatMoney(isrOct.totalDeducciones, false)}.`,
        );
      }
    }

    return {
      category: 'declaracion_sat',
      categoryLabel: 'Acuse de Declaración SAT / Línea de Captura',
      keyFields,
      findings,
    };
  }

  // 5. Representación Impresa de CFDI / Factura PDF
  if (
    uuids.length > 0 &&
    (norm.includes('folio fiscal') || norm.includes('cfdi') || norm.includes('factura') || norm.includes('uso cfdi') || norm.includes('sello digital'))
  ) {
    const mainUuid = uuids[0];
    keyFields['Folio Fiscal (UUID)'] = mainUuid;
    const totalMatch = text.match(/(?:Total|Importe\s+Total)[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    const subMatch = text.match(/Sub\s*-?\s*total[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    const ivaMatch = text.match(/IVA(?:\s*16%?)?[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    const metMatch = text.match(/\b(PUE|PPD)\b/);
    if (rfcs.length > 0) keyFields['RFC(s)'] = rfcs.slice(0, 2).join(' · ');
    if (subMatch) keyFields['Subtotal'] = `$${subMatch[1]}`;
    if (ivaMatch) keyFields['IVA'] = `$${ivaMatch[1]}`;
    if (totalMatch) keyFields['Total'] = `$${totalMatch[1]}`;
    if (metMatch) keyFields['Método de pago'] = metMatch[1];

    const portalCfdi = state.cfdis.find((c) => c.uuid.toUpperCase() === mainUuid);
    if (portalCfdi) {
      findings.push(
        `El UUID coincide con el CFDI ${portalCfdi.serie}-${portalCfdi.folio} ya descargado en el portal (estatus SAT: ${portalCfdi.estatus_sat.toUpperCase()}, Aspel SAE: ${portalCfdi.poliza_aspel || 'pendiente'}).`,
      );
    } else {
      findings.push('El Folio Fiscal (UUID) de este PDF aún no aparece descargado en el portal; verifique su XML en #fiscal/sincronizacion o #fiscal/visor.');
    }

    return {
      category: 'factura_pdf',
      categoryLabel: 'Representación Impresa de Factura (CFDI PDF)',
      keyFields,
      findings,
    };
  }

  // 6. Estado de Cuenta Bancario / Comprobante de Transferencia SPEI
  if (
    norm.includes('estado de cuenta') ||
    norm.includes('clabe') ||
    norm.includes('comprobante electronico de pago') ||
    norm.includes('spei') ||
    norm.includes('saldo inicial') ||
    nameNorm.includes('edo_cta') ||
    nameNorm.includes('estado_de_cuenta') ||
    nameNorm.includes('banco')
  ) {
    const bankMatch = text.match(/\b(BBVA|Banamex|Citibanamex|Santander|Banorte|HSBC|Scotiabank|Inbursa|Baj[ií]o|Afirme|Banregio|Hey Banco)\b/i);
    const clabeMatch = text.match(/\b(\d{18})\b/);
    const saldoFinMatch = text.match(/Saldo\s+(?:Final|al\s+corte|actual)[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    const depMatch = text.match(/(?:Dep[oó]sitos|Abonos|Ingresos)[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    const retMatch = text.match(/(?:Retiros|Cargos|Egresos)[:\s]*\$?\s*([\d,]+\.\d{2})/i);

    if (bankMatch) keyFields['Institución'] = bankMatch[1];
    if (clabeMatch) keyFields['CLABE'] = clabeMatch[1];
    if (depMatch) keyFields['Depósitos / Abonos'] = `$${depMatch[1]}`;
    if (retMatch) keyFields['Retiros / Cargos'] = `$${retMatch[1]}`;
    if (saldoFinMatch) keyFields['Saldo final'] = `$${saldoFinMatch[1]}`;

    if (portalMatch.ppdMatches.length > 0) {
      for (const m of portalMatch.ppdMatches) {
        findings.push(
          `Posible cobro PPD detectado: el monto ${formatMoney(m.matchedAmount, false)} coincide con el saldo pendiente de la factura ${m.folio} (${m.cliente}). Recuerde emitir su REP 2.0 antes del día 5 del mes siguiente.`,
        );
      }
    } else if (amounts.length > 0) {
      findings.push(`Se identificaron ${amounts.length} importe(s) bancarios; el mayor monto registrado es ${formatMoney(Math.max(...amounts), false)}.`);
    }

    return {
      category: 'estado_cuenta',
      categoryLabel: 'Estado de Cuenta / Comprobante Bancario',
      keyFields,
      findings,
    };
  }

  // 7. CUALQUIER OTRO DOCUMENTO CORPORATIVO / TÉCNICO / LEGAL / FINANCIERO / GENERAL
  // Aquí usamos TODA la comprensión semántica extraída por comprehendTextDocument!
  keyFields['Título / Asunto'] = comprehension.title;
  keyFields['Tipo identificado'] = comprehension.domainLabel;
  keyFields['Extensión'] = `${comprehension.wordCount} palabras · ${comprehension.paragraphCount} bloque(s)`;
  if (comprehension.topThemes.length > 0) {
    keyFields['Temas principales'] = comprehension.topThemes.slice(0, 6).join(', ');
  }
  if (comprehension.sections.length > 0) {
    keyFields['Secciones detectadas'] = comprehension.sections.slice(0, 4).join(' · ');
  }
  if (comprehension.organizations.length > 0) {
    keyFields['Empresas / Entidades'] = comprehension.organizations.slice(0, 3).join(', ');
  }
  if (comprehension.people.length > 0) {
    keyFields['Personas mencionadas'] = comprehension.people.slice(0, 3).join(', ');
  }
  if (rfcs.length > 0) keyFields['RFC(s) detectados'] = rfcs.slice(0, 4).join(', ');
  if (dates.length > 0) keyFields['Fecha(s) clave'] = dates.slice(0, 3).join(', ');
  if (comprehension.labeledAmounts.length > 0) {
    const topAmt = [...comprehension.labeledAmounts].sort((a, b) => b.amount - a.amount)[0];
    keyFields[`Importe principal (${topAmt.label})`] = topAmt.formatted;
  } else if (amounts.length > 0) {
    keyFields['Importe monetario mayor'] = formatMoney(Math.max(...amounts), false);
  } else if (comprehension.numericMetrics.length > 0) {
    keyFields['Cifras / mediciones (no monetarias)'] = comprehension.numericMetrics
      .slice(0, 3)
      .map((m) => `${m.label}: ${m.formatted}`)
      .join(' · ');
  }
  // Agregar los pares Clave: Valor más relevantes detectados dentro del propio texto
  for (const kv of comprehension.keyValuePairs.slice(0, 5)) {
    if (!keyFields[kv.key]) keyFields[kv.key] = kv.value;
  }

  if (uuids.length > 0) {
    findings.push(
      `Cruce con portal: se localizaron ${uuids.length} UUID(s) (${portalMatch.uuidsInPortal.length} ya existen en el portal y ${portalMatch.uuidsMissingInPortal.length} faltan por descargar).`,
    );
  }
  if (portalMatch.efosAlerts.length > 0) {
    for (const a of portalMatch.efosAlerts) {
      findings.push(`Alerta Art. 69-B: el documento menciona a ${a.nombre} (${a.rfc}) con estatus ${a.situacion.toUpperCase()}.`);
    }
  }
  if (portalMatch.ppdMatches.length > 0) {
    for (const m of portalMatch.ppdMatches) {
      findings.push(
        `Coincidencia PPD: el importe ${formatMoney(m.matchedAmount, false)} coincide con el saldo insoluto de ${m.folio} (${m.cliente}).`,
      );
    }
  }

  const validCategory = (
    [
      'contrato_convenio',
      'cotizacion_propuesta',
      'orden_compra',
      'estado_financiero',
      'nomina_rh',
      'manual_guia',
      'minuta_informe',
      'oficio_notificacion',
      'presentacion',
    ].includes(comprehension.domainKey)
      ? comprehension.domainKey
      : 'documento_general'
  ) as FiscalDocCategory;

  return {
    category: validCategory,
    categoryLabel: comprehension.domainLabel,
    keyFields,
    findings,
  };
}

// =========================================================================
// PARSER DE EXCEL (.xlsx/.xls) Y CSV CON DETECCIÓN INTELIGENTE DE ENCABEZADOS
// =========================================================================

const NON_SUMMABLE_HEADER =
  /\b(ano|anio|year|folio|serie|cp|codigo postal|clave|regimen|rfc|telefono|cuenta|clabe|parcialidad|tasa|tipo cambio|tc|mes|dia|numero|num|id|#)\b/;

function parseWorkbookSheets(workbook: XLSX.WorkBook): {
  sheets: SpreadsheetSheetSummary[];
  rawText: string;
  allAmounts: number[];
} {
  const sheets: SpreadsheetSheetSummary[] = [];
  const textParts: string[] = [];
  const allAmounts: number[] = [];

  for (const sheetName of workbook.SheetNames.slice(0, 6)) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const nonEmptyRows = matrix.filter(
      (r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== ''),
    );
    if (nonEmptyRows.length === 0) continue;

    let headerIdx = 0;
    let bestHeaderScore = -1;
    for (let i = 0; i < Math.min(8, nonEmptyRows.length); i++) {
      const row = nonEmptyRows[i];
      const strCells = row.filter((c) => typeof c === 'string' && c.trim().length >= 2).length;
      const totalNonEmpty = row.filter((c) => String(c ?? '').trim() !== '').length;
      if (totalNonEmpty >= 2 && strCells >= 2 && strCells > bestHeaderScore) {
        bestHeaderScore = strCells;
        headerIdx = i;
      }
    }

    const rawHeaders = nonEmptyRows[headerIdx].map((h, idx) => {
      const clean = String(h ?? '').trim();
      return clean || `Columna_${idx + 1}`;
    });

    const dataRows = nonEmptyRows.slice(headerIdx + 1);
    const parsedRows: Record<string, string | number>[] = [];
    const colValues = new Map<string, number[]>();
    const colCurrencyHits = new Map<string, number>();

    // Revisar también el formato nativo de celdas de Excel (ws[addr].z) para detectar formato moneda ($ / MXN / USD)
    const wsRange = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (wsRange) {
      for (let c = 0; c < rawHeaders.length; c++) {
        const h = rawHeaders[c];
        let fmtHits = 0;
        const maxCheck = Math.min(wsRange.e.r, wsRange.s.r + headerIdx + 30);
        for (let r = wsRange.s.r + headerIdx + 1; r <= maxCheck; r++) {
          const cellObj = ws[XLSX.utils.encode_cell({ r, c: wsRange.s.c + c })];
          if (cellObj && typeof cellObj.z === 'string' && /[$€]|MXN|USD|EUR/i.test(cellObj.z)) {
            fmtHits++;
          }
        }
        if (fmtHits > 0) colCurrencyHits.set(h, fmtHits);
      }
    }

    for (const row of dataRows) {
      const obj: Record<string, string | number> = {};
      const rowTextCells: string[] = [];
      for (let c = 0; c < rawHeaders.length; c++) {
        const h = rawHeaders[c];
        const rawCell = row[c];
        const strVal = String(rawCell ?? '').trim();
        if (strVal) rowTextCells.push(strVal);

        if (typeof rawCell === 'string' && /[$€]|MXN|USD|EUR/i.test(rawCell)) {
          colCurrencyHits.set(h, (colCurrencyHits.get(h) || 0) + 1);
        }

        const num = parseNumericValue(rawCell);
        if (num !== null) {
          obj[h] = num;
          const hNorm = basicNormalize(h);
          if (!NON_SUMMABLE_HEADER.test(hNorm)) {
            const arr = colValues.get(h) || [];
            arr.push(num);
            colValues.set(h, arr);
          }
        } else {
          obj[h] = strVal;
        }
      }
      if (parsedRows.length < 1500) {
        parsedRows.push(obj);
      }
      if (rowTextCells.length > 0) {
        textParts.push(rowTextCells.join(' | '));
      }
    }

    const numericColumns: SpreadsheetNumericCol[] = [];
    colValues.forEach((vals, column) => {
      if (vals.length === 0) return;
      const sum = vals.reduce((s, v) => s + v, 0);
      const nonZero = vals.filter((v) => Math.abs(v) > 0.0001).length;
      if (nonZero === 0) return;
      const isCurrency =
        (colCurrencyHits.get(column) || 0) > 0 || isMonetaryColumnHeader(column);
      if (isCurrency) {
        for (const v of vals) {
          if (Math.abs(v) >= 1) allAmounts.push(v);
        }
      }
      numericColumns.push({
        column,
        sum: Number(sum.toFixed(2)),
        avg: Number((sum / vals.length).toFixed(2)),
        min: Number(Math.min(...vals).toFixed(2)),
        max: Number(Math.max(...vals).toFixed(2)),
        nonZeroCount: nonZero,
        isCurrency,
      });
    });

    numericColumns.sort((a, b) => {
      const rank = (col: SpreadsheetNumericCol) => {
        const n = basicNormalize(col.column);
        if (col.isCurrency && n.includes('total')) return 0;
        if (col.isCurrency && (n.includes('importe') || n.includes('monto') || n.includes('saldo'))) return 1;
        if (col.isCurrency && n.includes('iva')) return 2;
        if (col.isCurrency && n.includes('subtotal')) return 3;
        if (col.isCurrency) return 4;
        return 5;
      };
      return rank(a) - rank(b) || Math.abs(b.sum) - Math.abs(a.sum);
    });

    sheets.push({
      name: sheetName,
      headers: rawHeaders,
      rowCount: dataRows.length,
      rows: parsedRows,
      numericColumns,
    });
  }

  return { sheets, rawText: textParts.join('\n'), allAmounts };
}

// =========================================================================
// PARSER DE METADATOS SAT (.txt delimitado por ~)
// =========================================================================

function tryParseSatMetadataTxt(
  text: string,
  state: FiscalDatabaseState,
  empresa: Empresa,
): {
  isSatMetadata: boolean;
  sheet?: SpreadsheetSheetSummary;
  keyFields: Record<string, string>;
  findings: string[];
  uuids: string[];
  rfcs: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes('~')) {
    return { isSatMetadata: false, keyFields: {}, findings: [], uuids: [], rfcs: [] };
  }

  const headers = lines[0].split('~').map((h) => h.trim());
  const firstNorm = basicNormalize(headers.join(' '));
  if (!firstNorm.includes('uuid') || !firstNorm.includes('rfcemisor')) {
    return { isSatMetadata: false, keyFields: {}, findings: [], uuids: [], rfcs: [] };
  }

  const idxUuid = headers.findIndex((h) => basicNormalize(h) === 'uuid');
  const idxRfcEm = headers.findIndex((h) => basicNormalize(h).includes('rfcemisor'));
  const idxNomEm = headers.findIndex((h) => basicNormalize(h).includes('nombreemisor'));
  const idxRfcRec = headers.findIndex((h) => basicNormalize(h).includes('rfcreceptor'));
  const idxMonto = headers.findIndex((h) => basicNormalize(h) === 'monto');
  const idxEstatus = headers.findIndex((h) => basicNormalize(h) === 'estatus');
  const idxFecha = headers.findIndex((h) => basicNormalize(h).includes('fechaemision'));

  const rows: Record<string, string | number>[] = [];
  const uuids: string[] = [];
  const rfcSet = new Set<string>();
  let totalMonto = 0;
  let vigentes = 0;
  let cancelados = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('~');
    const uuid = (cols[idxUuid] || '').trim().toUpperCase();
    if (!uuid) continue;
    uuids.push(uuid);
    const rEm = (cols[idxRfcEm] || '').trim().toUpperCase();
    const rRec = (cols[idxRfcRec] || '').trim().toUpperCase();
    if (rEm) rfcSet.add(rEm);
    if (rRec) rfcSet.add(rRec);
    const monto = parseNumericValue(cols[idxMonto]) || 0;
    const estRaw = (cols[idxEstatus] || '').trim();
    const isVig = estRaw === '1' || basicNormalize(estRaw).includes('vigente');
    if (isVig) {
      vigentes++;
      totalMonto += monto;
    } else {
      cancelados++;
    }
    rows.push({
      UUID: uuid,
      Fecha: (cols[idxFecha] || '').slice(0, 10),
      Emisor: cols[idxNomEm] || rEm,
      RFC_Emisor: rEm,
      RFC_Receptor: rRec,
      Monto: monto,
      Estatus: isVig ? 'Vigente' : 'Cancelado',
    });
  }

  const portalMatch = reconcileWithPortal(uuids, Array.from(rfcSet), [], state, empresa);
  const findings: string[] = [
    `Archivo oficial de Metadatos SAT: ${rows.length} registro(s) (${vigentes} vigentes por ${formatMoney(totalMonto, false)} y ${cancelados} cancelados).`,
    `Conciliación instantánea contra el portal: ${portalMatch.uuidsInPortal.length} UUID(s) ya coinciden y ${portalMatch.uuidsMissingInPortal.length} faltan por descargar en el portal.`,
  ];
  for (const a of portalMatch.efosAlerts) {
    findings.push(`Alerta Art. 69-B: RFC ${a.rfc} (${a.nombre}) detectado en los metadatos con estatus ${a.situacion.toUpperCase()}.`);
  }

  return {
    isSatMetadata: true,
    uuids,
    rfcs: Array.from(rfcSet),
    keyFields: {
      Registros: String(rows.length),
      Vigentes: String(vigentes),
      Cancelados: String(cancelados),
      'Monto vigente': formatMoney(totalMonto, false),
      'En portal / Faltantes': `${portalMatch.uuidsInPortal.length} / ${portalMatch.uuidsMissingInPortal.length}`,
    },
    findings,
    sheet: {
      name: 'Metadata SAT',
      headers: ['UUID', 'Fecha', 'Emisor', 'RFC_Emisor', 'RFC_Receptor', 'Monto', 'Estatus'],
      rowCount: rows.length,
      rows,
      numericColumns: [
        {
          column: 'Monto',
          sum: Number(totalMonto.toFixed(2)),
          avg: rows.length ? Number((totalMonto / rows.length).toFixed(2)) : 0,
          min: rows.length ? Math.min(...rows.map((r) => Number(r.Monto) || 0)) : 0,
          max: rows.length ? Math.max(...rows.map((r) => Number(r.Monto) || 0)) : 0,
          nonZeroCount: rows.filter((r) => (Number(r.Monto) || 0) > 0).length,
          isCurrency: true,
        },
      ],
    },
  };
}

// =========================================================================
// PUNTO DE ENTRADA PRINCIPAL DE ANÁLISIS DE DOCUMENTOS
// =========================================================================

export async function analyzeDocumentInput(
  input: DocumentInput,
  state: FiscalDatabaseState,
  empresa: Empresa,
): Promise<AnalyzedDocument> {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const uploadedAt = new Date().toISOString();
  const format = detectFormat(input.fileName);
  const sizeBytes = input.sizeBytes ?? input.arrayBuffer?.byteLength ?? input.textContent?.length ?? 0;

  // 0. Validación de política de seguridad en archivos cargados (bloquea ejecutables, SVGs y >25 MB)
  const fileCheck = validateFileUpload(input.fileName, sizeBytes);
  if (!fileCheck.ok) {
    return {
      id,
      fileName: input.fileName,
      format,
      category: 'documento_general',
      categoryLabel: 'Archivo bloqueado por seguridad',
      sizeBytes,
      uploadedAt,
      rawText: '',
      lines: [],
      extractedRfcs: [],
      extractedUuids: [],
      extractedDates: [],
      extractedAmounts: [],
      keyFields: { Seguridad: 'Bloqueado' },
      findings: [fileCheck.error || 'Archivo no permitido por política de seguridad.'],
      parseError: fileCheck.error,
    };
  }

  try {
    // 1. XML CFDI
    if (format === 'xml') {
      const xmlText =
        input.textContent ??
        (input.arrayBuffer ? new TextDecoder('utf-8').decode(input.arrayBuffer) : '');
      const xmlSafe = assertSafeXml(xmlText);
      if (!xmlSafe.ok) {
        return {
          id,
          fileName: input.fileName,
          format: 'xml',
          category: 'documento_general',
          categoryLabel: 'XML bloqueado (Seguridad XXE)',
          sizeBytes,
          uploadedAt,
          rawText: '',
          lines: [],
          extractedRfcs: [],
          extractedUuids: [],
          extractedDates: [],
          extractedAmounts: [],
          keyFields: { Seguridad: 'Protección XXE / XML Bomb' },
          findings: [xmlSafe.error || 'XML bloqueado por política de seguridad.'],
          parseError: xmlSafe.error,
        };
      }
      const parsed = parseXmlFlexible(xmlText, empresa);
      if (parsed.ok && parsed.cfdi) {
        const c = parsed.cfdi;
        const belongs = Boolean(parsed.belongsToActive);
        const rfcs = Array.from(new Set([c.rfc_emisor, c.rfc_receptor].filter(Boolean)));
        const uuids = [c.uuid.toUpperCase()];
        const portalMatch = reconcileWithPortal(uuids, rfcs, [c.total_mxn], state, empresa);
        const findings = auditCfdiFindings(c, belongs, state, empresa);
        const conceptosList = parsed.conceptos || [];
        const conceptosTxt = conceptosList
          .map((x) => `${x.descripcion} (${x.cantidad} ${x.unidad}: ${formatMoney(x.importe, false)})`)
          .join('\n');

        const summaryDesc =
          conceptosList.length > 0
            ? `Ampara ${conceptosList.length} concepto(s), principalmente: ${conceptosList.slice(0, 2).map((x) => `«${x.descripcion}»`).join(' y ')}.`
            : '';

        const comp = comprehendTextDocument(
          `CFDI ${c.serie}-${c.folio}\nComprobante fiscal digital (${CATALOGO_TIPO_CFDI[c.tipo]} v${c.version}) emitido por ${c.nombre_emisor} (${c.rfc_emisor}) a favor de ${c.nombre_receptor} (${c.rfc_receptor}) el ${formatShortDate(c.fecha_fiscal)} por ${formatMoney(c.total, false, c.moneda)} (${c.metodo_pago || 'sin método'}). ${summaryDesc}\n${conceptosTxt}`,
          input.fileName,
        );

        return {
          id,
          fileName: input.fileName,
          format: 'xml',
          category: 'cfdi_xml',
          categoryLabel: `CFDI ${c.version} · ${CATALOGO_TIPO_CFDI[c.tipo]}`,
          sizeBytes,
          uploadedAt,
          rawText: `${c.serie}-${c.folio} ${c.uuid} ${c.nombre_emisor} ${c.rfc_emisor} ${c.nombre_receptor} ${c.rfc_receptor}\n${conceptosTxt}`,
          lines: [
            `Folio ${c.serie}-${c.folio} · UUID ${c.uuid}`,
            `Emisor: ${c.nombre_emisor} (${c.rfc_emisor})`,
            `Receptor: ${c.nombre_receptor} (${c.rfc_receptor})`,
            `Total: ${formatMoney(c.total, false, c.moneda)} (IVA ${formatMoney(c.iva_trasladado, false)})`,
            ...conceptosList.map((x) => `Concepto: ${x.descripcion} — ${formatMoney(x.importe, false)}`),
          ],
          extractedRfcs: rfcs,
          extractedUuids: uuids,
          extractedDates: [c.fecha_fiscal],
          extractedAmounts: [c.subtotal, c.iva_trasladado, c.total_mxn],
          keyFields: {
            UUID: c.uuid,
            Folio: `${c.serie}-${c.folio}`,
            Tipo: `${CATALOGO_TIPO_CFDI[c.tipo]} (v${c.version})`,
            Fecha: formatShortDate(c.fecha_fiscal),
            Emisor: `${c.nombre_emisor} (${c.rfc_emisor})`,
            Receptor: `${c.nombre_receptor} (${c.rfc_receptor})`,
            'Método / Forma / Uso': `${c.metodo_pago || 'N/A'} · ${CATALOGO_FORMA_PAGO[c.forma_pago] || c.forma_pago || 'N/A'} · ${c.uso_cfdi}`,
            Subtotal: formatMoney(c.subtotal, false, c.moneda),
            IVA: formatMoney(c.iva_trasladado, false),
            Total: formatMoney(c.total, false, c.moneda),
          },
          findings,
          comprehension: {
            ...comp,
            executiveSummary: `El archivo **${input.fileName}** es un **CFDI ${c.version} de tipo ${CATALOGO_TIPO_CFDI[c.tipo]}** (${c.direccion === 'E' ? 'emitido a' : 'recibido de'} **${c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor}**), folio **${c.serie}-${c.folio}**, expedido el **${formatShortDate(c.fecha_fiscal)}** por un total de **${formatMoney(c.total, false, c.moneda)}** (IVA: **${formatMoney(c.iva_trasladado, false)}**, método **${c.metodo_pago || 'N/A'}**). ${summaryDesc}`,
          },
          cfdi: c,
          cfdiConceptos: parsed.conceptos,
          cfdiPagos: parsed.pagos,
          cfdiBelongsToActiveEmpresa: belongs,
          portalMatch,
        };
      }

      // XML no-CFDI: extraer texto legible para aún así explicar de qué trata!
      const strippedXml = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const comp = comprehendTextDocument(strippedXml || xmlText.slice(0, 3000), input.fileName);
      return {
        id,
        fileName: input.fileName,
        format: 'xml',
        category: 'documento_general',
        categoryLabel: 'XML estructurado (no CFDI)',
        sizeBytes,
        uploadedAt,
        rawText: strippedXml,
        lines: strippedXml.split(/\.\s+/).slice(0, 60),
        extractedRfcs: extractRfcs(xmlText),
        extractedUuids: extractUuids(xmlText),
        extractedDates: extractDates(xmlText),
        extractedAmounts: extractMonetaryAmounts(xmlText),
        keyFields: { Tipo: 'XML no-CFDI', 'Extensión': `${comp.wordCount} palabras` },
        findings: [parsed.error || 'El archivo XML no corresponde a un CFDI del SAT, pero se extrajo su contenido textual.'],
        comprehension: comp,
      };
    }

    // 2. MICROSOFT WORD (.docx)
    if (format === 'docx') {
      let text = input.textContent || '';
      let headings: string[] = [];
      let tables: Array<{ headers: string[]; rows: string[][] }> = [];

      if (!text && input.arrayBuffer) {
        const extracted = await extractDocxContent(input.arrayBuffer);
        text = extracted.text;
        headings = extracted.headings;
        tables = extracted.tables;
      }

      if (text.trim().length < 10) {
        return {
          id,
          fileName: input.fileName,
          format: 'docx',
          category: 'documento_general',
          categoryLabel: 'Documento Word sin texto',
          sizeBytes,
          uploadedAt,
          rawText: text,
          lines: [],
          extractedRfcs: [],
          extractedUuids: [],
          extractedDates: [],
          extractedAmounts: [],
          keyFields: {},
          findings: ['El archivo Word no contiene texto legible (posiblemente solo contiene imágenes insertadas).'],
          parseError: 'Documento Word sin texto extraíble.',
        };
      }

      const rfcs = extractRfcs(text);
      const uuids = extractUuids(text);
      const dates = extractDates(text);
      const amounts = extractMonetaryAmounts(text);
      const portalMatch = reconcileWithPortal(uuids, rfcs, amounts, state, empresa);
      const comprehension = comprehendTextDocument(text, input.fileName, headings, tables);
      const classified = classifyAndEnrichRichTextDoc(text, input.fileName, state, empresa, portalMatch, comprehension);

      return {
        id,
        fileName: input.fileName,
        format: 'docx',
        category: classified.category,
        categoryLabel: `Word · ${classified.categoryLabel}`,
        sizeBytes,
        uploadedAt,
        rawText: text,
        lines: comprehension.paragraphs.length > 0 ? comprehension.paragraphs : text.split(/\r?\n/).filter(Boolean),
        extractedRfcs: rfcs,
        extractedUuids: uuids,
        extractedDates: dates,
        extractedAmounts: amounts,
        keyFields: {
          ...classified.keyFields,
          ...(tables.length > 0 ? { 'Tablas integradas': `${tables.length} tabla(s)` } : {}),
        },
        findings: classified.findings,
        comprehension,
        portalMatch,
      };
    }

    // 3. POWERPOINT (.pptx)
    if (format === 'pptx') {
      let text = input.textContent || '';
      let slidesCount = 1;
      let slideTitles: string[] = [];

      if (!text && input.arrayBuffer) {
        const extracted = await extractPptxContent(input.arrayBuffer);
        text = extracted.text;
        slidesCount = extracted.slidesCount;
        slideTitles = extracted.slideTitles;
      }

      const rfcs = extractRfcs(text);
      const uuids = extractUuids(text);
      const dates = extractDates(text);
      const amounts = extractMonetaryAmounts(text);
      const portalMatch = reconcileWithPortal(uuids, rfcs, amounts, state, empresa);
      const comprehension = comprehendTextDocument(text, input.fileName, slideTitles);

      return {
        id,
        fileName: input.fileName,
        format: 'pptx',
        category: 'presentacion',
        categoryLabel: `Presentación (${slidesCount} diapositivas)`,
        sizeBytes,
        uploadedAt,
        pageCount: slidesCount,
        rawText: text,
        lines: comprehension.paragraphs,
        extractedRfcs: rfcs,
        extractedUuids: uuids,
        extractedDates: dates,
        extractedAmounts: amounts,
        keyFields: {
          Diapositivas: String(slidesCount),
          'Tema principal': comprehension.title,
          ...(comprehension.topThemes.length > 0 ? { 'Temas clave': comprehension.topThemes.slice(0, 6).join(', ') } : {}),
        },
        findings: [],
        comprehension: {
          ...comprehension,
          domainLabel: `Presentación PowerPoint (${slidesCount} diapositivas)`,
          sections: slideTitles.slice(0, 12),
        },
        portalMatch,
      };
    }

    // 4. ZIP PAQUETE SAT
    if (format === 'zip') {
      if (!input.arrayBuffer) {
        throw new Error('No se recibió el contenido binario del paquete ZIP.');
      }
      const zip = await JSZip.loadAsync(input.arrayBuffer);
      const cfdis: Cfdi[] = [];
      const nestedDocs: Array<{ name: string; format: DocumentFormat; note: string }> = [];
      const allUuids: string[] = [];
      const rfcSet = new Set<string>();
      const findings: string[] = [];
      const seenInZip = new Set<string>();
      let invalidXmls = 0;
      let pue99Count = 0;
      let cashNonDedCount = 0;
      let s01Count = 0;

      const entries = Object.values(zip.files).filter(
        (f) => !f.dir && !f.name.startsWith('__MACOSX') && !f.name.split('/').pop()?.startsWith('._'),
      );

      if (entries.length > MAX_ZIP_ENTRIES) {
        throw new Error(
          `El paquete ZIP supera el límite seguro de ${MAX_ZIP_ENTRIES} archivos (protección anti ZIP-Bomb).`,
        );
      }

      let uncompressedBytes = 0;

      for (const entry of entries) {
        if (!isSafeZipEntryPath(entry.name)) {
          findings.push(`Entrada bloqueada por política anti Zip Slip: ${entry.name}`);
          continue;
        }
        const baseName = entry.name.split('/').pop() || entry.name;
        const entryFmt = detectFormat(baseName);
        if (entryFmt === 'xml') {
          const xmlStr = await entry.async('string');
          uncompressedBytes += xmlStr.length;
          if (uncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
            throw new Error(
              'El contenido descomprimido del ZIP excede el límite seguro de 50 MB (protección anti ZIP-Bomb).',
            );
          }
          const xmlSafe = assertSafeXml(xmlStr);
          if (!xmlSafe.ok) {
            invalidXmls++;
            findings.push(`XML rechazado dentro del ZIP (${baseName}): ${xmlSafe.error}`);
            continue;
          }
          const parsed = parseXmlFlexible(xmlStr, empresa);
          if (parsed.ok && parsed.cfdi) {
            const c = parsed.cfdi;
            if (!seenInZip.has(c.uuid.toUpperCase())) {
              seenInZip.add(c.uuid.toUpperCase());
              cfdis.push(c);
              allUuids.push(c.uuid.toUpperCase());
              if (c.rfc_emisor) rfcSet.add(c.rfc_emisor.toUpperCase());
              if (c.rfc_receptor) rfcSet.add(c.rfc_receptor.toUpperCase());
              if (c.metodo_pago === 'PUE' && c.forma_pago === '99') pue99Count++;
              if (c.direccion === 'R' && c.metodo_pago === 'PUE' && c.forma_pago === '01' && c.total_mxn > 2000) cashNonDedCount++;
              if (c.direccion === 'R' && c.uso_cfdi === 'S01') s01Count++;
            }
          } else {
            invalidXmls++;
          }
        } else {
          nestedDocs.push({
            name: baseName,
            format: entryFmt,
            note: entryFmt === 'pdf' ? 'Representación impresa PDF incluida' : `Archivo ${entryFmt.toUpperCase()}`,
          });
        }
      }

      const rfcs = Array.from(rfcSet);
      const totalEmitidos = cfdis.filter((c) => c.direccion === 'E').reduce((s, c) => s + c.total_mxn, 0);
      const totalRecibidos = cfdis.filter((c) => c.direccion === 'R').reduce((s, c) => s + c.total_mxn, 0);
      const totalIva = cfdis.reduce((s, c) => s + c.iva_trasladado, 0);
      const portalMatch = reconcileWithPortal(allUuids, rfcs, cfdis.map((c) => c.total_mxn), state, empresa);

      findings.push(
        `El paquete contiene ${cfdis.length} CFDI(s) válidos (${cfdis.filter((c) => c.direccion === 'E').length} emitidos por ${formatMoney(totalEmitidos, false)} y ${cfdis.filter((c) => c.direccion === 'R').length} recibidos por ${formatMoney(totalRecibidos, false)}).`,
      );
      findings.push(
        `Conciliación contra el portal: ${portalMatch.uuidsInPortal.length} ya existen y ${portalMatch.uuidsMissingInPortal.length} son nuevos listos para importar.`,
      );
      if (pue99Count > 0) findings.push(`Alerta SAT: ${pue99Count} CFDI(s) combinan PUE con forma 99.`);
      if (cashNonDedCount > 0) findings.push(`Alerta ISR: ${cashNonDedCount} gasto(s) en efectivo > $2,000 MXN.`);
      if (s01Count > 0) findings.push(`Aviso ISR: ${s01Count} comprobante(s) con uso S01 (sin efectos fiscales).`);
      if (invalidXmls > 0) findings.push(`${invalidXmls} archivo(s) .xml dentro del ZIP no correspondieron a un CFDI válido.`);
      for (const a of portalMatch.efosAlerts) {
        findings.push(`Alerta crítica 69-B: RFC ${a.rfc} (${a.nombre}) aparece como ${a.situacion.toUpperCase()}.`);
      }

      const rawLines = cfdis.map(
        (c) =>
          `${c.serie}-${c.folio} | ${c.fecha_fiscal} | ${c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor} | ${formatMoney(c.total_mxn, false)} | ${c.uuid}`,
      );

      return {
        id,
        fileName: input.fileName,
        format: 'zip',
        category: 'paquete_zip_sat',
        categoryLabel: `Paquete ZIP (${cfdis.length} CFDI)`,
        sizeBytes,
        uploadedAt,
        rawText: rawLines.join('\n'),
        lines: rawLines,
        extractedRfcs: rfcs,
        extractedUuids: allUuids,
        extractedDates: Array.from(new Set(cfdis.map((c) => c.fecha_fiscal))).sort(),
        extractedAmounts: cfdis.map((c) => c.total_mxn),
        keyFields: {
          'Total archivos en ZIP': String(entries.length),
          'CFDIs válidos': String(cfdis.length),
          'Emitidos / Recibidos': `${cfdis.filter((c) => c.direccion === 'E').length} / ${cfdis.filter((c) => c.direccion === 'R').length}`,
          'Monto Emitidos': formatMoney(totalEmitidos, false),
          'Monto Recibidos': formatMoney(totalRecibidos, false),
          'IVA acumulado': formatMoney(totalIva, false),
          'Nuevos vs ya en portal': `${portalMatch.uuidsMissingInPortal.length} nuevos / ${portalMatch.uuidsInPortal.length} ya cargados`,
        },
        findings,
        comprehension: {
          title: input.fileName,
          domainKey: 'paquete_zip_sat',
          domainLabel: `Paquete ZIP SAT (${cfdis.length} CFDIs)`,
          wordCount: cfdis.length * 12,
          paragraphCount: cfdis.length,
          sections: ['Emitidos', 'Recibidos', ...(nestedDocs.length > 0 ? [`Otros archivos (${nestedDocs.length})`] : [])],
          topThemes: ['cfdi', 'xml', 'sat', ...rfcs.slice(0, 3).map((r) => r.toLowerCase())],
          executiveSummary: `El paquete comprimido **${input.fileName}** agrupa **${entries.length} archivo(s)**, de los cuales **${cfdis.length}** son comprobantes CFDI válidos (${cfdis.filter((c) => c.direccion === 'E').length} emitidos por **${formatMoney(totalEmitidos, false)}** y ${cfdis.filter((c) => c.direccion === 'R').length} recibidos por **${formatMoney(totalRecibidos, false)}**, IVA acumulado **${formatMoney(totalIva, false)}**).`,
          keyPoints: findings,
          paragraphs: rawLines,
          sentences: rawLines,
          keyValuePairs: [],
          labeledAmounts: [
            { label: 'Total Emitidos', amount: totalEmitidos, formatted: formatMoney(totalEmitidos, false), contextLine: 'Emitidos' },
            { label: 'Total Recibidos', amount: totalRecibidos, formatted: formatMoney(totalRecibidos, false), contextLine: 'Recibidos' },
            { label: 'IVA acumulado', amount: totalIva, formatted: formatMoney(totalIva, false), contextLine: 'IVA' },
          ],
          numericMetrics: [],
          organizations: Array.from(new Set(cfdis.map((c) => c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor))).slice(0, 6),
          people: [],
          emails: [],
          phones: [],
          deadlines: [],
        },
        zipCfdis: cfdis,
        zipNestedDocs: nestedDocs,
        portalMatch,
      };
    }

    // 5. EXCEL (.xlsx/.xls) Y CSV
    if (format === 'excel' || format === 'csv') {
      const workbook =
        format === 'csv' && input.textContent !== undefined
          ? XLSX.read(input.textContent, { type: 'string' })
          : input.arrayBuffer
            ? XLSX.read(input.arrayBuffer, { type: 'array' })
            : XLSX.read(input.textContent || '', { type: 'string' });

      const { sheets, rawText, allAmounts } = parseWorkbookSheets(workbook);
      const rfcs = extractRfcs(rawText);
      const uuids = extractUuids(rawText);
      const dates = extractDates(rawText);
      const portalMatch = reconcileWithPortal(uuids, rfcs, allAmounts, state, empresa);
      const primarySheet = sheets[0];
      const totalRows = sheets.reduce((s, sh) => s + sh.rowCount, 0);
      const comprehension = comprehendSpreadsheet(input.fileName, sheets, dates);

      const keyFields: Record<string, string> = {
        'Hojas analizadas': sheets.map((s) => `${s.name} (${s.rowCount} filas)`).join(', ') || '0',
        'Total de registros': String(totalRows),
      };
      if (primarySheet) {
        for (const col of primarySheet.numericColumns.slice(0, 4)) {
          keyFields[`Suma ${col.column}`] = formatMetricValue(col.sum, col.isCurrency, false);
        }
      }

      const findings: string[] = [];
      if (primarySheet && primarySheet.numericColumns.length > 0) {
        const topCol = primarySheet.numericColumns[0];
        findings.push(
          `Columna principal "${topCol.column}": suma total de ${formatMetricValue(topCol.sum, topCol.isCurrency, false)} (promedio ${formatMetricValue(topCol.avg, topCol.isCurrency, false)}, máximo ${formatMetricValue(topCol.max, topCol.isCurrency, false)}).`,
        );
      }
      if (comprehension.groupBreakdowns?.[0]?.topGroups[0]) {
        const gb = comprehension.groupBreakdowns[0];
        const lead = gb.topGroups[0];
        findings.push(
          `Concentración por ${gb.groupColumn}: encabeza "${lead.name}" con ${formatMetricValue(lead.total, gb.isCurrency, false)} (${lead.pct} % en ${lead.count} registro(s)).`,
        );
      }
      if (uuids.length > 0) {
        findings.push(
          `Conciliación automática de UUIDs: ${portalMatch.uuidsInPortal.length} de ${uuids.length} UUID(s) del archivo ya están en el portal y ${portalMatch.uuidsMissingInPortal.length} no aparecen descargados.`,
        );
      }
      if (portalMatch.efosAlerts.length > 0) {
        for (const a of portalMatch.efosAlerts) {
          findings.push(`Alerta Art. 69-B: el archivo incluye al RFC ${a.rfc} (${a.nombre}) listado como ${a.situacion.toUpperCase()}.`);
        }
      }
      if (portalMatch.ppdMatches.length > 0) {
        findings.push(
          `Se identificaron ${portalMatch.ppdMatches.length} importe(s) que coinciden con saldos PPD pendientes de cobro (${portalMatch.ppdMatches.map((m) => m.folio).join(', ')}).`,
        );
      }

      return {
        id,
        fileName: input.fileName,
        format,
        category: 'hoja_calculo_fiscal',
        categoryLabel: `${format === 'excel' ? 'Excel' : 'CSV'} · ${totalRows} registro(s)`,
        sizeBytes,
        uploadedAt,
        rawText,
        lines: rawText.split('\n').filter(Boolean),
        extractedRfcs: rfcs,
        extractedUuids: uuids,
        extractedDates: dates,
        extractedAmounts: allAmounts,
        keyFields,
        findings,
        comprehension,
        sheets,
        portalMatch,
      };
    }

    // 6. PDF
    if (format === 'pdf') {
      let text = input.textContent || '';
      let pageCount = 1;
      let isScannedLikely = false;

      if (!text && input.arrayBuffer) {
        const extracted = await extractPdfTextFromBuffer(input.arrayBuffer);
        text = extracted.text;
        pageCount = extracted.pageCount;
        isScannedLikely = extracted.isScannedLikely;
      }

      if (isScannedLikely || text.trim().length < 15) {
        return {
          id,
          fileName: input.fileName,
          format: 'pdf',
          category: 'documento_general',
          categoryLabel: `PDF escaneado (${pageCount} pág.)`,
          sizeBytes,
          uploadedAt,
          pageCount,
          rawText: text,
          lines: [],
          extractedRfcs: [],
          extractedUuids: [],
          extractedDates: [],
          extractedAmounts: [],
          keyFields: { Páginas: String(pageCount), 'Capa de texto': 'No detectada (imagen escaneada)' },
          findings: [
            'El PDF parece haber sido escaneado como imagen sin capa de texto seleccionable. Para analizarlo automáticamente le sugiero adjuntar el PDF digital original (o su versión en Word/Excel/XML).',
          ],
          parseError: 'PDF sin capa de texto seleccionable (imagen escaneada).',
        };
      }

      const rfcs = extractRfcs(text);
      const uuids = extractUuids(text);
      const dates = extractDates(text);
      const amounts = extractMonetaryAmounts(text);
      const portalMatch = reconcileWithPortal(uuids, rfcs, amounts, state, empresa);
      const comprehension = comprehendTextDocument(text, input.fileName);
      const classified = classifyAndEnrichRichTextDoc(
        text,
        input.fileName,
        state,
        empresa,
        portalMatch,
        comprehension,
      );

      return {
        id,
        fileName: input.fileName,
        format: 'pdf',
        category: classified.category,
        categoryLabel: classified.categoryLabel,
        sizeBytes,
        uploadedAt,
        pageCount,
        rawText: text,
        lines: comprehension.paragraphs.length > 0 ? comprehension.paragraphs : text.split(/\r?\n/).filter(Boolean),
        extractedRfcs: rfcs,
        extractedUuids: uuids,
        extractedDates: dates,
        extractedAmounts: amounts,
        keyFields: {
          Páginas: String(pageCount),
          ...classified.keyFields,
        },
        findings: classified.findings,
        comprehension,
        portalMatch,
      };
    }

    // 7. TXT / METADATA SAT / JSON / HTML / MARKDOWN
    let text =
      input.textContent ??
      (input.arrayBuffer ? new TextDecoder('utf-8').decode(input.arrayBuffer) : '');

    if (format === 'text') {
      const satMeta = tryParseSatMetadataTxt(text, state, empresa);
      if (satMeta.isSatMetadata) {
        const portalMatch = reconcileWithPortal(satMeta.uuids, satMeta.rfcs, [], state, empresa);
        return {
          id,
          fileName: input.fileName,
          format: 'sat_metadata',
          category: 'metadata_sat_txt',
          categoryLabel: `Metadata SAT (${satMeta.sheet?.rowCount || 0} CFDI)`,
          sizeBytes,
          uploadedAt,
          rawText: text,
          lines: text.split(/\r?\n/).filter(Boolean),
          extractedRfcs: satMeta.rfcs,
          extractedUuids: satMeta.uuids,
          extractedDates: extractDates(text),
          extractedAmounts: (satMeta.sheet?.rows || []).map((r) => Number(r.Monto) || 0),
          keyFields: satMeta.keyFields,
          findings: satMeta.findings,
          comprehension: satMeta.sheet
            ? comprehendSpreadsheet(input.fileName, [satMeta.sheet], extractDates(text))
            : undefined,
          sheets: satMeta.sheet ? [satMeta.sheet] : undefined,
          portalMatch,
        };
      }
      if (input.fileName.toLowerCase().endsWith('.html') || input.fileName.toLowerCase().endsWith('.htm')) {
        text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n');
      }
    }

    if (format === 'json') {
      const parsedJson = safeJsonParse<unknown>(text);
      if (parsedJson !== null) {
        const flatLines: string[] = [];
        const walk = (obj: unknown, prefix = '') => {
          if (flatLines.length > 250) return;
          if (Array.isArray(obj)) {
            flatLines.push(`${prefix || 'Elementos'}: ${obj.length} registro(s)`);
            obj.slice(0, 20).forEach((item, i) => walk(item, `${prefix}[${i + 1}]`));
          } else if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
              if (v && typeof v === 'object') walk(v, prefix ? `${prefix}.${k}` : k);
              else flatLines.push(`${prefix ? `${prefix}.${k}` : k}: ${String(v)}`);
            }
          }
        };
        walk(parsedJson);
        if (flatLines.length > 0) text = flatLines.join('\n');
      }
    }

    const rfcs = extractRfcs(text);
    const uuids = extractUuids(text);
    const dates = extractDates(text);
    const amounts = extractMonetaryAmounts(text);
    const portalMatch = reconcileWithPortal(uuids, rfcs, amounts, state, empresa);
    const comprehension = comprehendTextDocument(text, input.fileName);
    const classified = classifyAndEnrichRichTextDoc(
      text,
      input.fileName,
      state,
      empresa,
      portalMatch,
      comprehension,
    );

    return {
      id,
      fileName: input.fileName,
      format: format === 'unknown' ? 'text' : format,
      category: classified.category,
      categoryLabel: format === 'json' ? `JSON · ${classified.categoryLabel}` : classified.categoryLabel,
      sizeBytes,
      uploadedAt,
      rawText: text,
      lines: comprehension.paragraphs.length > 0 ? comprehension.paragraphs : text.split(/\r?\n/).filter(Boolean),
      extractedRfcs: rfcs,
      extractedUuids: uuids,
      extractedDates: dates,
      extractedAmounts: amounts,
      keyFields: classified.keyFields,
      findings: classified.findings,
      comprehension,
      portalMatch,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error inesperado al leer el documento.';
    return {
      id,
      fileName: input.fileName,
      format,
      category: 'documento_general',
      categoryLabel: 'Error de lectura',
      sizeBytes,
      uploadedAt,
      rawText: '',
      lines: [],
      extractedRfcs: [],
      extractedUuids: [],
      extractedDates: [],
      extractedAmounts: [],
      keyFields: {},
      findings: [`No fue posible procesar el archivo: ${errMsg}`],
      parseError: errMsg,
    };
  }
}

export async function analyzeUploadedFile(
  file: File,
  state: FiscalDatabaseState,
  empresa: Empresa,
): Promise<AnalyzedDocument> {
  const format = detectFormat(file.name);
  if (format === 'xml' || format === 'csv' || format === 'text' || format === 'json') {
    const textContent = await file.text();
    return analyzeDocumentInput(
      { fileName: file.name, sizeBytes: file.size, textContent },
      state,
      empresa,
    );
  }
  const arrayBuffer = await file.arrayBuffer();
  return analyzeDocumentInput(
    { fileName: file.name, sizeBytes: file.size, arrayBuffer },
    state,
    empresa,
  );
}

// =========================================================================
// GENERACIÓN DE REPORTES COMPRENSIVOS Y PREGUNTAS SOBRE DOCUMENTOS
// =========================================================================

function maskIfNeeded(value: string, ocultarMontos: boolean): string {
  if (!ocultarMontos) return value;
  return value.replace(/\$[\d,]+(?:\.\d{2})?/g, '•••••');
}

function buildSingleDocumentReport(
  doc: AnalyzedDocument,
  saludoNombre: string,
  empresa: Empresa,
  ocultarMontos: boolean,
  totalDocsInContext: number,
): Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'> {
  if (doc.parseError) {
    return {
      vistaConsultada: `Análisis de documento · ${doc.fileName}`,
      text: `Lamento informarle${saludoNombre} que no fue posible extraer el texto de **${doc.fileName}**.\n\n• **Motivo técnico:** ${doc.parseError}\n• **Recomendación:** verifique que el archivo no esté dañado ni protegido con contraseña; si se trata de un PDF escaneado como fotografía, le sugiero adjuntar el PDF digital original o el archivo en formato Word (\`.docx\`), Excel (\`.xlsx\`) o XML.`,
      actions: [{ label: 'Ir a Sincronización', route: 'sincronizacion' }],
    };
  }

  const comp = doc.comprehension;
  const parts: string[] = [];

  // 1. Explicación clara y humana DE QUÉ TRATA el documento
  if (comp?.executiveSummary) {
    parts.push(`Con mucho gusto${saludoNombre}. He leído y analizado **${doc.fileName}**.\n\n**¿De qué trata este documento?**\n${maskIfNeeded(comp.executiveSummary, ocultarMontos)}`);
  } else {
    parts.push(`Con mucho gusto${saludoNombre}. He analizado el documento **${doc.fileName}** (clasificado como **${doc.categoryLabel}**):`);
  }

  // 2. Puntos clave comprendidos del documento
  if (comp && comp.keyPoints.length > 0 && doc.format !== 'zip') {
    parts.push(
      `**Puntos clave extraídos:**\n${comp.keyPoints
        .slice(0, 5)
        .map((kp) => `• ${maskIfNeeded(kp, ocultarMontos)}`)
        .join('\n')}`,
    );
  }

  // 3. Hallazgos y cruce fiscal en vivo contra la empresa activa
  if (doc.findings.length > 0) {
    parts.push(
      `**Hallazgos y cruce en vivo con ${empresa.razon_social}:**\n${doc.findings
        .map((f) => `• ${maskIfNeeded(f, ocultarMontos)}`)
        .join('\n')}`,
    );
  }

  // 4. Recordatorio de memoria acumulativa
  parts.push(
    totalDocsInContext > 1
      ? `*Conservé este documento en el contexto junto con sus otros ${totalDocsInContext - 1} archivo(s) adjuntos; puede preguntarme detalles puntuales, montos, fechas o pedirme compararlos.*`
      : `*Este documento quedó guardado en la memoria de nuestra conversación; puede preguntarme cualquier detalle sobre su contenido (por ejemplo: montos, fechas, secciones o algún tema puntual).*`,
  );

  const kvRows = Object.entries(doc.keyFields).map(([k, v]) => [k, maskIfNeeded(v, ocultarMontos)]);

  const actions: AssistantMessage['actions'] = [];
  if (doc.cfdi) {
    const inPortal = (doc.portalMatch?.uuidsInPortal.length || 0) > 0;
    actions.push(
      inPortal
        ? { label: `Abrir ${doc.cfdi.serie}-${doc.cfdi.folio} en portal`, cfdiUuid: doc.cfdi.uuid }
        : { label: 'Importar XML en Sincronización', route: 'sincronizacion' },
    );
  } else if (doc.category === 'paquete_zip_sat' || doc.category === 'metadata_sat_txt') {
    actions.push({ label: 'Ir a Sincronización', route: 'sincronizacion' });
    actions.push({ label: 'Abrir Conciliación SAT', route: 'visor' });
  } else if (doc.category === 'constancia_csf' || doc.category === 'opinion_sat_32d' || doc.category === 'opinion_imss') {
    actions.push({ label: 'Ir a Datos fiscales', route: 'documentos' });
  } else if (doc.category === 'declaracion_sat') {
    actions.push({ label: 'Comparar en Impuestos IVA', route: 'iva' });
    actions.push({ label: 'Comparar en Impuestos ISR', route: 'isr' });
  } else if (doc.category === 'factura_pdf' && doc.portalMatch?.uuidsInPortal[0]) {
    actions.push({ label: 'Abrir CFDI en portal', cfdiUuid: doc.portalMatch.uuidsInPortal[0] });
  } else if (doc.portalMatch && doc.portalMatch.uuidsMissingInPortal.length > 0) {
    actions.push({ label: 'Revisar faltantes en Conciliación SAT', route: 'visor' });
  }

  // Gráfica automática para hojas de cálculo, ZIP o documentos con varios importes monetarios
  let chart: AssistantMessage['chart'];
  if (doc.sheets && doc.sheets[0]?.numericColumns.length >= 2) {
    const cols = doc.sheets[0].numericColumns.slice(0, 5);
    const chartIsCurrency = cols.every((c) => c.isCurrency);
    chart = {
      title: `Totales por columna · ${doc.fileName}`,
      series1Label: 'Suma total',
      isCurrency: chartIsCurrency,
      data: cols.map((c) => ({ label: c.column.slice(0, 14), valor: Math.abs(c.sum) })),
    };
  } else if (doc.zipCfdis && doc.zipCfdis.length > 0) {
    const em = doc.zipCfdis.filter((c) => c.direccion === 'E').reduce((s, c) => s + c.total_mxn, 0);
    const rec = doc.zipCfdis.filter((c) => c.direccion === 'R').reduce((s, c) => s + c.total_mxn, 0);
    chart = {
      title: `Resumen del paquete ZIP · ${doc.fileName}`,
      series1Label: 'MXN',
      isCurrency: true,
      data: [
        { label: 'Emitidos', valor: Number(em.toFixed(2)) },
        { label: 'Recibidos', valor: Number(rec.toFixed(2)) },
      ],
    };
  } else if (comp && comp.labeledAmounts.length >= 3) {
    const topAmts = [...comp.labeledAmounts].sort((a, b) => b.amount - a.amount).slice(0, 5);
    chart = {
      title: `Importes monetarios detectados · ${doc.fileName}`,
      series1Label: 'Importe',
      isCurrency: true,
      data: topAmts.map((a) => ({ label: a.label.slice(0, 14), valor: a.amount })),
    };
  }

  const followUps: string[] = [];
  if (doc.sheets && doc.sheets[0]) {
    const hasCurrencyCol = doc.sheets[0].numericColumns.some((c) => c.isCurrency);
    followUps.push(
      hasCurrencyCol
        ? `¿Cuál es el registro de mayor monto en ${doc.fileName}?`
        : `¿Cuál es el valor más alto en ${doc.fileName}?`,
    );
    if (comp?.groupBreakdowns && comp.groupBreakdowns.length > 0) {
      followUps.push(`Desglosa ${doc.fileName} por ${comp.groupBreakdowns[0].groupColumn}`);
    }
    if ((doc.extractedUuids.length || 0) > 0) {
      followUps.push('¿Qué UUIDs del archivo faltan en el portal?');
    }
  } else {
    if (comp && comp.sections.length >= 2) followUps.push('¿Qué secciones o temas abarca?');
    if (comp && comp.labeledAmounts.length > 0) {
      followUps.push('¿Cuáles son todos los montos y costos que menciona?');
    } else if (comp && comp.numericMetrics.length > 0) {
      followUps.push('¿Qué datos numéricos o mediciones contiene?');
    }
    if (comp && (comp.deadlines.length > 0 || doc.extractedDates.length > 0)) {
      followUps.push('¿Qué fechas o plazos establece?');
    }
    if (comp && (comp.organizations.length > 0 || comp.people.length > 0)) {
      followUps.push('¿Quiénes participan o firman en el documento?');
    }
  }
  if (totalDocsInContext >= 2) {
    followUps.push('Compara los documentos adjuntos');
  }

  return {
    vistaConsultada: `Análisis inteligente · ${doc.categoryLabel}`,
    text: parts.join('\n\n'),
    table:
      kvRows.length > 0
        ? {
            exportName: `Analisis_${doc.fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            headers: ['Dato / Indicador identificado', 'Valor extraído'],
            rows: kvRows,
          }
        : undefined,
    chart,
    actions: actions.length > 0 ? actions : undefined,
    followUps: followUps.slice(0, 3),
  };
}

export function buildBatchDocumentUploadReport(
  newDocs: AnalyzedDocument[],
  allContextDocs: AnalyzedDocument[],
  prompt: string,
  state: FiscalDatabaseState,
  empresa: Empresa,
  ocultarMontos: boolean,
  saludoNombre: string,
): Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'> {
  const qNorm = basicNormalize(prompt);
  const isGenericUploadMsg =
    !qNorm ||
    qNorm.startsWith('analiza el archivo') ||
    qNorm.startsWith('analiza los archivos') ||
    (/^(analiza|revisa|audita|checa|lee|verifica|resume|de que trata|explicame)\b/.test(qNorm) &&
      qNorm.split(' ').length <= 8);

  if (!isGenericUploadMsg) {
    const targeted = answerQuestionAboutDocuments(
      prompt,
      allContextDocs,
      state,
      empresa,
      ocultarMontos,
      saludoNombre,
      { newlyAttached: newDocs, recentlyDiscussedDoc: true },
    );
    if (targeted) return targeted;
  }

  if (newDocs.length === 1) {
    return buildSingleDocumentReport(
      newDocs[0],
      saludoNombre,
      empresa,
      ocultarMontos,
      allContextDocs.length,
    );
  }

  const summaryLines = newDocs.map((d) => {
    const summaryBit =
      d.comprehension?.executiveSummary ||
      d.findings[0] ||
      'Procesado correctamente.';
    return `• **${d.fileName}** (*${d.categoryLabel}*): ${maskIfNeeded(summaryBit.slice(0, 220), ocultarMontos)}`;
  });

  const totalUuids = new Set(newDocs.flatMap((d) => d.extractedUuids)).size;
  const totalMissing = new Set(newDocs.flatMap((d) => d.portalMatch?.uuidsMissingInPortal || [])).size;
  const efosCount = newDocs.reduce((s, d) => s + (d.portalMatch?.efosAlerts.length || 0), 0);

  return {
    vistaConsultada: `Análisis múltiple · ${newDocs.length} documentos adjuntos`,
    text: `Con mucho gusto${saludoNombre}. He leído y analizado los **${newDocs.length} documentos** adjuntados y los incorporé a la memoria de esta conversación (total acumulado: **${allContextDocs.length} archivo(s)**):\n\n${summaryLines.join('\n')}${totalUuids > 0 ? `\n\n• **Cruce consolidado:** se identificaron **${totalUuids} UUID(s)** únicos (${totalMissing} pendientes de descargar en el portal).` : ''}${efosCount > 0 ? `\n• **Alerta 69-B:** se detectaron **${efosCount} coincidencia(s)** con la lista negra EFOS.` : ''}`,
    table: {
      exportName: `Resumen_Documentos_${empresa.rfc}`,
      headers: ['Archivo', 'Tipo detectado', 'RFCs', 'UUIDs', 'Resumen principal'],
      rows: newDocs.map((d) => [
        d.fileName,
        d.categoryLabel,
        String(d.extractedRfcs.length),
        String(d.extractedUuids.length),
        maskIfNeeded(d.findings[0] || d.comprehension?.title || d.parseError || 'Analizado', ocultarMontos),
      ]),
    },
    followUps: [
      'Compara los documentos adjuntos',
      '¿Qué riesgos o inconsistencias tienen los archivos adjuntos?',
      '¿Cuadran los UUIDs de los archivos contra el portal?',
    ],
  };
}

// =========================================================================
// MOTOR DE PREGUNTAS DE SEGUIMIENTO Y COMPRENSIÓN SOBRE DOCUMENTOS EN SESIÓN
// =========================================================================

const EXPLICIT_PORTAL_TOPICS = new Set<SemanticTopic>([
  'onboarding_guide',
  'portal_scope',
  'portal_all_routes',
  'create_indicator',
  'ocultar_montos',
  'descarga_historica',
  'sincronizacion_error',
  'sincronizacion_zip',
  'ppd_rep_workflow',
  'efirma',
  'usuarios_roles',
  'empresas_rfc',
  'aspel_sae',
  'visor_sat',
  'consumo',
  'notificaciones',
  'compare_months',
]);

function referencesAttachedDocuments(
  qNorm: string,
  docs: AnalyzedDocument[],
  recentlyDiscussedDoc: boolean,
  portalTopic?: SemanticTopic,
  portalScore = 0,
): boolean {
  if (docs.length === 0) return false;

  // 1. Referencia explícita a un archivo/documento
  if (
    /\b(documento|documentos|archivo|archivos|adjunto|adjuntos|adjunte|subi|cargue|mande|envie|pdf|word|docx|pptx|presentacion|excel|csv|zip|hoja|ese archivo|esos archivos|lo que subi|lo que adjunte|lo que mande|archivo anterior|ultimo archivo|primer archivo)\b/.test(
      qNorm,
    )
  ) {
    return true;
  }

  // 2. Menciona el nombre (o base) de algún archivo cargado
  for (const d of docs) {
    const base = basicNormalize(d.fileName.replace(/\.[^.]+$/, ''));
    if (base.length >= 4 && qNorm.includes(base)) return true;
  }

  // Si la consulta es inequívocamente sobre un apartado específico del portal (e.g. e.firma, IVA del mes, rutas), respetar el portal
  const mentionsPortalExplicitly = /\b(portal|pagina|menu|rutas|apartados del portal|sistema)\b/.test(qNorm);
  if (
    portalTopic &&
    EXPLICIT_PORTAL_TOPICS.has(portalTopic) &&
    portalScore >= 5 &&
    !(
      recentlyDiscussedDoc &&
      !mentionsPortalExplicitly &&
      /\b(secciones|clausulas|capitulos|indice|diapositivas|temas|estructura)\b/.test(qNorm)
    )
  ) {
    return false;
  }
  if (
    portalTopic &&
    (portalTopic === 'iva' || portalTopic === 'isr' || portalTopic === 'urgent_priorities' || portalTopic === 'non_deductible') &&
    portalScore >= 6 &&
    !/\b(trata|tratan|dice|explica|resume|resumen|contenido|secciones|clausulas|firmantes|partes|garantia|entrega|plazo)\b/.test(qNorm)
  ) {
    return false;
  }

  // 3. Preguntas anafóricas de comprensión ("¿de qué trata?", "¿qué dice?", "explícame", "¿cuáles son los puntos clave?")
  if (
    /\b(de que trata|de que tratan|de que habla|que trata|que es esto|que dice|que contiene|que informacion trae|que informacion tiene|que datos tiene|resumelo|resumeme|resumen del|explicame|explicalo|cual es el objetivo|que puntos clave|puntos importantes|que secciones|que seccion|clausulas|clausula|capitulos|indice|estructura|diapositivas|que temas|quien lo firma|quienes participan|que concluye|que acuerdos|que fechas trae|que plazos|cuanto cuesta|cuales son los montos|desglosa por)\b/.test(
      qNorm,
    )
  ) {
    return true;
  }

  // 4. Continuidad conversacional inmediata: si en el turno previo estábamos analizando un documento
  // y la nueva consulta no dispara un tema fuerte del portal, consultamos los documentos adjuntos
  if (recentlyDiscussedDoc && portalScore < 5) {
    return true;
  }

  return false;
}

function selectTargetDocs(
  qNorm: string,
  docs: AnalyzedDocument[],
  preferredDocs?: AnalyzedDocument[],
): AnalyzedDocument[] {
  const byName = docs.filter((d) => {
    const base = basicNormalize(d.fileName.replace(/\.[^.]+$/, ''));
    return base.length >= 3 && qNorm.includes(base);
  });
  if (byName.length > 0) return byName;

  if (qNorm.includes('word') || qNorm.includes('docx')) {
    const wordDocs = docs.filter((d) => d.format === 'docx');
    if (wordDocs.length > 0) return wordDocs;
  }
  if (qNorm.includes('presentacion') || qNorm.includes('pptx') || qNorm.includes('diapositiva')) {
    const ppts = docs.filter((d) => d.format === 'pptx');
    if (ppts.length > 0) return ppts;
  }
  if (qNorm.includes('pdf') || qNorm.includes('constancia') || qNorm.includes('opinion') || qNorm.includes('estado de cuenta')) {
    const pdfs = docs.filter((d) => d.format === 'pdf');
    if (pdfs.length > 0) return pdfs;
  }
  if (qNorm.includes('excel') || qNorm.includes('csv') || qNorm.includes('hoja') || qNorm.includes('columna')) {
    const sheets = docs.filter((d) => d.format === 'excel' || d.format === 'csv' || d.format === 'sat_metadata');
    if (sheets.length > 0) return sheets;
  }
  if (qNorm.includes('zip') || qNorm.includes('paquete')) {
    const zips = docs.filter((d) => d.format === 'zip');
    if (zips.length > 0) return zips;
  }
  if (qNorm.includes('xml')) {
    const xmls = docs.filter((d) => d.format === 'xml' || d.format === 'zip');
    if (xmls.length > 0) return xmls;
  }

  if (qNorm.includes('ultimo') || qNorm.includes('reciente')) {
    return [docs[docs.length - 1]];
  }
  if (qNorm.includes('primero') || qNorm.includes('primer archivo') || qNorm.includes('primer documento')) {
    return [docs[0]];
  }

  return preferredDocs && preferredDocs.length > 0 ? preferredDocs : docs;
}

export function answerQuestionAboutDocuments(
  prompt: string,
  attachedDocs: AnalyzedDocument[],
  _state: FiscalDatabaseState,
  empresa: Empresa,
  ocultarMontos: boolean,
  saludoNombre: string,
  ctx?: {
    newlyAttached?: AnalyzedDocument[];
    recentlyDiscussedDoc?: boolean;
    portalTopic?: SemanticTopic;
    portalScore?: number;
  },
): Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'> | null {
  if (attachedDocs.length === 0) return null;
  const qNorm = basicNormalize(prompt);
  const tokens = qNorm.split(' ').filter(Boolean);

  if (
    !ctx?.newlyAttached &&
    !referencesAttachedDocuments(
      qNorm,
      attachedDocs,
      Boolean(ctx?.recentlyDiscussedDoc),
      ctx?.portalTopic,
      ctx?.portalScore ?? 0,
    )
  ) {
    return null;
  }

  const targetDocs = selectTargetDocs(qNorm, attachedDocs, ctx?.newlyAttached);
  const primaryDoc = targetDocs[targetDocs.length - 1];

  // A. Listar qué documentos hay cargados en contexto
  if (
    /\b(que documentos|que archivos|cuales documentos|cuales archivos|lista de documentos|tengo cargados|he adjuntado|he subido)\b/.test(
      qNorm,
    )
  ) {
    return {
      vistaConsultada: `Contexto documental activo (${attachedDocs.length} archivo(s))`,
      text: `Actualmente conservo **${attachedDocs.length} documento(s)** analizados en la memoria de esta conversación${saludoNombre}. Puede consultarme de qué trata cualquiera de ellos, buscar datos puntuales o pedirme compararlos:`,
      table: {
        exportName: 'Documentos_En_Contexto',
        headers: ['#', 'Archivo', 'Categoría', 'RFCs', 'UUIDs', 'Asunto / Resumen'],
        rows: attachedDocs.map((d, idx) => [
          String(idx + 1),
          d.fileName,
          d.categoryLabel,
          String(d.extractedRfcs.length),
          String(d.extractedUuids.length),
          maskIfNeeded(d.comprehension?.title || d.findings[0] || 'Listo para consulta', ocultarMontos),
        ]),
      },
      followUps:
        attachedDocs.length >= 2
          ? ['Compara los documentos adjuntos', '¿Cuadran los UUIDs de los archivos contra el portal?']
          : [`¿De qué trata ${attachedDocs[0].fileName}?`],
    };
  }

  // B. Comparar múltiples documentos adjuntos entre sí
  if (
    attachedDocs.length >= 2 &&
    /\b(compara|comparar|comparativo|diferencia|diferencias|versus|vs|contra el otro|entre los documentos|entre los archivos)\b/.test(
      qNorm,
    ) &&
    !qNorm.includes('contra el portal') &&
    !qNorm.includes('con el portal')
  ) {
    const docsToCompare = targetDocs.length >= 2 ? targetDocs : attachedDocs;
    const d1 = docsToCompare[0];
    const d2 = docsToCompare[docsToCompare.length - 1];
    const u1 = new Set(d1.extractedUuids);
    const u2 = new Set(d2.extractedUuids);
    const sharedUuids = Array.from(u1).filter((u) => u2.has(u));
    const onlyIn1 = Array.from(u1).filter((u) => !u2.has(u));
    const onlyIn2 = Array.from(u2).filter((u) => !u1.has(u));

    const r1 = new Set(d1.extractedRfcs);
    const r2 = new Set(d2.extractedRfcs);
    const sharedRfcs = Array.from(r1).filter((r) => r2.has(r));

    const mainMetric = (d: AnalyzedDocument): { value: number; isCurrency: boolean } => {
      if (d.sheets?.[0]?.numericColumns[0]) {
        return {
          value: d.sheets[0].numericColumns[0].sum,
          isCurrency: d.sheets[0].numericColumns[0].isCurrency,
        };
      }
      if (d.cfdi) return { value: d.cfdi.total_mxn, isCurrency: true };
      if (d.zipCfdis?.length) {
        return {
          value: d.zipCfdis.reduce((s, c) => s + c.total_mxn, 0),
          isCurrency: true,
        };
      }
      if (d.extractedAmounts.length) {
        return { value: Math.max(...d.extractedAmounts), isCurrency: true };
      }
      return { value: 0, isCurrency: false };
    };

    const m1 = mainMetric(d1);
    const m2 = mainMetric(d2);
    const bothCurrency = m1.isCurrency && m2.isCurrency;
    const diffMonto = Number((m1.value - m2.value).toFixed(2));

    const bullets: string[] = [
      `**Naturaleza:** *${d1.fileName}* es un(a) **${d1.categoryLabel}**, mientras que *${d2.fileName}* corresponde a un(a) **${d2.categoryLabel}**.`,
    ];
    if (u1.size > 0 || u2.size > 0) {
      bullets.push(
        `**UUIDs:** **${sharedUuids.length}** coinciden en ambos archivos; **${onlyIn1.length}** aparecen solo en *${d1.fileName}* y **${onlyIn2.length}** solo en *${d2.fileName}*.`,
      );
    }
    if (sharedRfcs.length > 0) {
      bullets.push(`**RFCs en común:** ${sharedRfcs.join(', ')}.`);
    } else if (r1.size > 0 && r2.size > 0) {
      bullets.push(`**Atención RFC:** no comparten RFCs en común (*${d1.fileName}*: ${Array.from(r1).slice(0, 2).join(', ')} vs *${d2.fileName}*: ${Array.from(r2).slice(0, 2).join(', ')}).`);
    }
    if (m1.value > 0 || m2.value > 0) {
      bullets.push(
        `**${bothCurrency ? 'Importe principal' : 'Valor numérico principal'}:** *${d1.fileName}* refleja **${formatMetricValue(m1.value, m1.isCurrency, ocultarMontos)}** frente a **${formatMetricValue(m2.value, m2.isCurrency, ocultarMontos)}** en *${d2.fileName}* (diferencia: **${formatMetricValue(diffMonto, bothCurrency, ocultarMontos)}**).`,
      );
    }

    return {
      vistaConsultada: `Comparativo documental · ${d1.fileName} vs ${d2.fileName}`,
      text: `Con gusto le presento el comparativo entre **${d1.fileName}** y **${d2.fileName}**${saludoNombre}:\n\n${bullets.map((b) => `• ${b}`).join('\n')}`,
      table: {
        exportName: 'Comparativo_Documentos',
        headers: ['Criterio', d1.fileName, d2.fileName],
        rows: [
          ['Tipo de documento', d1.categoryLabel, d2.categoryLabel],
          ['Asunto / Título', d1.comprehension?.title || '—', d2.comprehension?.title || '—'],
          ['RFCs detectados', d1.extractedRfcs.slice(0, 3).join(', ') || '—', d2.extractedRfcs.slice(0, 3).join(', ') || '—'],
          ['UUIDs detectados', String(d1.extractedUuids.length), String(d2.extractedUuids.length)],
          ['UUIDs faltantes en portal', String(d1.portalMatch?.uuidsMissingInPortal.length ?? 0), String(d2.portalMatch?.uuidsMissingInPortal.length ?? 0)],
          [
            bothCurrency ? 'Importe principal' : 'Valor numérico principal',
            m1.value ? formatMetricValue(m1.value, m1.isCurrency, ocultarMontos) : '—',
            m2.value ? formatMetricValue(m2.value, m2.isCurrency, ocultarMontos) : '—',
          ],
          ['Alertas 69-B', String(d1.portalMatch?.efosAlerts.length ?? 0), String(d2.portalMatch?.efosAlerts.length ?? 0)],
        ],
      },
      chart:
        m1.value > 0 || m2.value > 0
          ? {
              title: bothCurrency ? 'Comparativo de importe principal (MXN)' : 'Comparativo numérico principal',
              series1Label: bothCurrency ? 'Importe MXN' : 'Valor',
              isCurrency: bothCurrency,
              data: [
                { label: d1.fileName.slice(0, 14), valor: m1.value },
                { label: d2.fileName.slice(0, 14), valor: m2.value },
              ],
            }
          : undefined,
    };
  }

  // C. Conciliación contra el portal (UUIDs faltantes / coincidencias)
  if (
    /\b(cuadran|cuadra|concilia|conciliacion|faltan|faltantes|portal|descargados|existen|coinciden|uuid|uuids)\b/.test(
      qNorm,
    )
  ) {
    const allIn = new Set<string>();
    const allMissing = new Set<string>();
    const rows: string[][] = [];

    for (const d of targetDocs) {
      for (const u of d.portalMatch?.uuidsInPortal || []) {
        allIn.add(u);
        rows.push([d.fileName, shortUuid(u), 'Coincide en portal']);
      }
      for (const u of d.portalMatch?.uuidsMissingInPortal || []) {
        allMissing.add(u);
        rows.push([d.fileName, shortUuid(u), 'Faltante en portal']);
      }
    }

    if (allIn.size > 0 || allMissing.size > 0) {
      return {
        vistaConsultada: `Conciliación documental vs portal (${empresa.rfc})`,
        text: `He cruzado los **${allIn.size + allMissing.size} UUID(s)** contenidos en ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')} contra la base de **${empresa.razon_social}**${saludoNombre}:\n\n• **Coinciden en el portal:** **${allIn.size}** comprobante(s).\n• **No localizados en el portal:** **${allMissing.size}** comprobante(s)${allMissing.size > 0 ? ' (le sugiero verificar su descarga en `#fiscal/sincronizacion` o `#fiscal/visor`)' : ' — conciliación cuadrada al 100 %'}.`,
        table: {
          exportName: `Conciliacion_Documentos_${empresa.rfc}`,
          headers: ['Documento', 'UUID', 'Estatus en portal'],
          rows: rows.slice(0, 25),
        },
        actions:
          allMissing.size > 0
            ? [
                { label: 'Ir a Sincronización', route: 'sincronizacion' },
                { label: 'Abrir Conciliación SAT', route: 'visor' },
              ]
            : undefined,
      };
    }
  }

  // D. PREGUNTA EXPLÍCITA: "¿DE QUÉ TRATA?" / RESUMEN / EXPLICACIÓN / OBJETIVO / PUNTOS CLAVE
  if (
    /\b(de que trata|de que tratan|de que habla|que trata|que es esto|que contiene|que informacion trae|que informacion tiene|que datos tiene|resumelo|resumeme|resume|resumen|explicame|explicalo|cual es el objetivo|proposito|puntos clave|puntos importantes|idea principal)\b/.test(
      qNorm,
    )
  ) {
    return buildSingleDocumentReport(
      primaryDoc,
      saludoNombre,
      empresa,
      ocultarMontos,
      attachedDocs.length,
    );
  }

  // E. ESTRUCTURA / SECCIONES / TEMAS / ÍNDICE / CLÁUSULAS
  if (/\b(secciones|seccion|capitulos|indice|estructura|clausulas|temas|apartados|diapositivas|partes del documento)\b/.test(qNorm)) {
    const comp = primaryDoc.comprehension;
    const sections = comp?.sections || [];
    const themes = comp?.topThemes || [];
    return {
      vistaConsultada: `Estructura y temas · ${primaryDoc.fileName}`,
      text: `Con gusto${saludoNombre}. El documento **${primaryDoc.fileName}** (*${primaryDoc.categoryLabel}*) se organiza de la siguiente forma:\n\n${
        sections.length > 0
          ? `**Secciones / encabezados detectados (${sections.length}):**\n${sections.map((s) => `• ${s}`).join('\n')}`
          : `No presenta encabezados numerados explícitos, pero abarca **${comp?.paragraphCount || primaryDoc.lines.length} bloques de texto** centrados en los temas: **${themes.join(', ') || 'contenido general'}**.`
      }${themes.length > 0 && sections.length > 0 ? `\n\n**Conceptos más frecuentes:** ${themes.join(', ')}.` : ''}`,
    };
  }

  // F. FECHAS / PLAZOS / VIGENCIA / ENTREGA
  if (/\b(fecha|fechas|plazo|plazos|vigencia|vence|vencimiento|entrega|cuando|calendario|dias)\b/.test(qNorm)) {
    const deadlines = targetDocs.flatMap((d) =>
      (d.comprehension?.deadlines || []).map((line) => ({ doc: d.fileName, line })),
    );
    const dates = Array.from(new Set(targetDocs.flatMap((d) => d.extractedDates)));
    return {
      vistaConsultada: `Fechas y plazos extraídos · ${primaryDoc.fileName}`,
      text:
        deadlines.length > 0 || dates.length > 0
          ? `Con gusto${saludoNombre}. Estas son las fechas, vigencias y plazos identificados en ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}:\n\n${
              deadlines.length > 0
                ? deadlines.slice(0, 6).map((x) => `• **${x.doc}:** ${x.line}`).join('\n')
                : ''
            }${dates.length > 0 ? `\n\n• **Fechas literales detectadas:** ${dates.slice(0, 8).join(', ')}.` : ''}`
          : `Revisé ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')} y no identifiqué fechas ni plazos explícitos en el texto extraído.`,
    };
  }

  // G. DESGLOSE AGRUPADO EN HOJAS DE CÁLCULO (GROUP-BY POR PROVEEDOR / CATEGORÍA / ETC.)
  const sheetDocs = targetDocs.filter((d) => d.sheets && d.sheets.length > 0);
  if (
    sheetDocs.length > 0 &&
    /\b(desglosa|agrupa|agrupado|agrupacion|por categoria|por proveedor|por cliente|por departamento|por mes|por estatus|distribucion)\b/.test(
      qNorm,
    )
  ) {
    const doc = sheetDocs[sheetDocs.length - 1];
    const gbs = doc.comprehension?.groupBreakdowns || [];
    if (gbs.length > 0) {
      const gb =
        gbs.find((g) => tokens.some((t) => fuzzyWordMatch(t, basicNormalize(g.groupColumn)))) ||
        gbs[0];
      return {
        vistaConsultada: `Agrupación · ${doc.fileName} por ${gb.groupColumn}`,
        text: `Con gusto${saludoNombre}. Aquí tiene el desglose de **${doc.fileName}** agrupado por **${gb.groupColumn}** (medido sobre **${gb.metricColumn}**):\n\n${gb.topGroups
          .map((g) => `• **${g.name}:** **${formatMetricValue(g.total, gb.isCurrency, ocultarMontos)}** (${g.pct} % · ${g.count} registro(s)).`)
          .join('\n')}`,
        table: {
          exportName: `Desglose_${gb.groupColumn}`,
          headers: [gb.groupColumn, 'Registros', `Total ${gb.metricColumn}`, '% Participación'],
          rows: gb.topGroups.map((g) => [g.name, String(g.count), formatMetricValue(g.total, gb.isCurrency, ocultarMontos), `${g.pct} %`]),
        },
        chart: {
          title: `${gb.metricColumn} por ${gb.groupColumn}`,
          series1Label: gb.metricColumn,
          isCurrency: gb.isCurrency,
          data: gb.topGroups.map((g) => ({ label: g.name.slice(0, 14), valor: Math.abs(g.total) })),
        },
      };
    }
  }

  // H. PERSONAS / EMPRESAS / FIRMANTES / PARTES / CONTACTOS
  if (
    !/\b(desglosa|agrupa|distribucion)\b/.test(qNorm) &&
    /\b(quien|quienes|firma|firman|firmantes|participan|empresas|partes|cliente|proveedor|contacto|correo|telefono|responsable|responsables|autor)\b/.test(
      qNorm,
    )
  ) {
    const orgs = Array.from(new Set(targetDocs.flatMap((d) => d.comprehension?.organizations || [])));
    const people = Array.from(new Set(targetDocs.flatMap((d) => d.comprehension?.people || [])));
    const rfcs = Array.from(new Set(targetDocs.flatMap((d) => d.extractedRfcs)));
    const emails = Array.from(new Set(targetDocs.flatMap((d) => d.comprehension?.emails || [])));
    const phones = Array.from(new Set(targetDocs.flatMap((d) => d.comprehension?.phones || [])));

    if (orgs.length > 0 || people.length > 0 || rfcs.length > 0 || emails.length > 0) {
      const bullets: string[] = [];
      if (orgs.length > 0) bullets.push(`**Empresas / organizaciones:** ${orgs.join(', ')}.`);
      if (people.length > 0) bullets.push(`**Personas / representantes:** ${people.join(', ')}.`);
      if (rfcs.length > 0) bullets.push(`**RFC(s) identificados:** \`${rfcs.join('`, `')}\`.`);
      if (emails.length > 0) bullets.push(`**Correos electrónicos:** ${emails.join(', ')}.`);
      if (phones.length > 0) bullets.push(`**Teléfonos:** ${phones.join(', ')}.`);

      return {
        vistaConsultada: `Entidades y contactos · ${primaryDoc.fileName}`,
        text: `Con gusto${saludoNombre}. Estas son las organizaciones, personas y datos de contacto localizados en ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}:\n\n${bullets.map((b) => `• ${b}`).join('\n')}`,
      };
    }
  }

  // I. RIESGOS, ERRORES, INCONSISTENCIAS O 69-B EN ARCHIVOS ADJUNTOS
  if (/\b(riesgo|riesgos|error|errores|alerta|alertas|inconsistencia|inconsistencias|problema|problemas|69-b|69b|efos|lista negra)\b/.test(qNorm)) {
    const allFindings = targetDocs.flatMap((d) =>
      d.findings.map((f) => ({ doc: d.fileName, text: f })),
    );
    const allEfos = targetDocs.flatMap((d) => d.portalMatch?.efosAlerts || []);
    return {
      vistaConsultada: `Auditoría de riesgos en documentos adjuntos`,
      text:
        allFindings.length > 0
          ? `Con base en la revisión de ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}, estos son los hallazgos y alertas detectados${saludoNombre}:\n\n${allFindings.map((f) => `• **${f.doc}:** ${maskIfNeeded(f.text, ocultarMontos)}`).join('\n')}`
          : `No se identificaron alertas fiscales ni proveedores en lista 69-B dentro de ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}.`,
      actions: allEfos.length > 0 ? [{ label: 'Revisar Indicadores 69-B', route: 'indicadores' }] : undefined,
    };
  }

  // J. MÉTRICAS DE HOJAS DE CÁLCULO (SUMAS, COLUMNA ESPECÍFICA, MAYOR/MENOR VALOR)
  if (
    sheetDocs.length > 0 &&
    /\b(suma|suman|total|totales|promedio|mayor|mas alto|mas alta|mas grande|maximo|minimo|menor|columna|columnas|desglose|cuanto|montos|importes|numeros|cifras|cantidades|valores)\b/.test(
      qNorm,
    )
  ) {
    const doc = sheetDocs[sheetDocs.length - 1];
    const sheet = doc.sheets![0];

    const matchedCol =
      sheet.numericColumns.find((col) => {
        const colWords = basicNormalize(col.column).split(' ').filter((w) => w.length >= 3);
        return colWords.some((cw) => tokens.some((t) => fuzzyWordMatch(t, cw)));
      }) || sheet.numericColumns[0];

    if (matchedCol) {
      const colCurrencyMap = new Map(sheet.numericColumns.map((c) => [c.column, c.isCurrency]));
      const asksExtreme = /\b(mayor|mas alto|mas alta|mas grande|maximo|top|principales)\b/.test(qNorm);
      const sortedRows = [...sheet.rows].sort(
        (a, b) => (Number(b[matchedCol.column]) || 0) - (Number(a[matchedCol.column]) || 0),
      );
      const topRows = sortedRows.slice(0, 5);
      const displayHeaders = sheet.headers.slice(0, 5);
      const fmtCol = (val: number, isCur = matchedCol.isCurrency) =>
        formatMetricValue(val, isCur, ocultarMontos);

      return {
        vistaConsultada: `Análisis cuantitativo · ${doc.fileName} (${sheet.name})`,
        text: asksExtreme
          ? `Con gusto${saludoNombre}. En **${doc.fileName}** (hoja **${sheet.name}**, ${sheet.rowCount} filas), el valor más alto en la columna **${matchedCol.column}** es de **${fmtCol(matchedCol.max)}** (la suma total de la columna es **${fmtCol(matchedCol.sum)}**). A continuación le presento los **${topRows.length} registros mayores**:`
          : `Con gusto${saludoNombre}. En **${doc.fileName}** (hoja **${sheet.name}**, **${sheet.rowCount} registros**), la columna **${matchedCol.column}** suma **${fmtCol(matchedCol.sum)}** (promedio: **${fmtCol(matchedCol.avg)}**, mínimo: **${fmtCol(matchedCol.min)}**, máximo: **${fmtCol(matchedCol.max)}**).\n\n${sheet.numericColumns.slice(0, 4).map((c) => `• **${c.column}:** ${fmtCol(c.sum, c.isCurrency)}`).join('\n')}`,
        table: asksExtreme
          ? {
              exportName: `Top_${doc.fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              headers: displayHeaders,
              rows: topRows.map((r) =>
                displayHeaders.map((h) => {
                  const v = r[h];
                  return typeof v === 'number' && !NON_SUMMABLE_HEADER.test(basicNormalize(h))
                    ? formatMetricValue(v, Boolean(colCurrencyMap.get(h)), ocultarMontos)
                    : String(v ?? '');
                }),
              ),
            }
          : {
              exportName: `Totales_${doc.fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              headers: ['Columna numérica', 'Suma total', 'Promedio', 'Mínimo', 'Máximo'],
              rows: sheet.numericColumns.map((c) => [
                c.column,
                fmtCol(c.sum, c.isCurrency),
                fmtCol(c.avg, c.isCurrency),
                fmtCol(c.min, c.isCurrency),
                fmtCol(c.max, c.isCurrency),
              ]),
            },
        chart: {
          title: `Totales numéricos · ${doc.fileName}`,
          series1Label: 'Suma',
          isCurrency: sheet.numericColumns.slice(0, 5).every((c) => c.isCurrency),
          data: sheet.numericColumns.slice(0, 5).map((c) => ({
            label: c.column.slice(0, 14),
            valor: Math.abs(c.sum),
          })),
        },
      };
    }
  }

  // K. MONTOS / PRECIOS vs DATOS NUMÉRICOS / MEDICIONES EN DOCUMENTOS DE TEXTO (PDF / WORD / TXT)
  const asksPrices = /\b(monto|montos|precio|precios|costo|costos|cuanto cuesta|importe|importes|presupuesto|inversion|anticipo|honorarios)\b/.test(
    qNorm,
  );
  const asksPlainNumbers = /\b(numeros|cifras|mediciones|medicion|cantidades|indicadores numericos|datos numericos|valores)\b/.test(
    qNorm,
  );

  if (asksPrices || asksPlainNumbers) {
    const labeled = targetDocs.flatMap((d) =>
      (d.comprehension?.labeledAmounts || []).map((a) => ({ doc: d.fileName, ...a })),
    );
    const plainMetrics = targetDocs.flatMap((d) =>
      (d.comprehension?.numericMetrics || []).map((m) => ({ doc: d.fileName, ...m })),
    );

    if (asksPrices && labeled.length > 0) {
      const sorted = [...labeled].sort((a, b) => b.amount - a.amount);
      return {
        vistaConsultada: `Importes monetarios · ${primaryDoc.fileName}`,
        text: `Con gusto${saludoNombre}. Identifiqué **${sorted.length} importe(s) monetario(s)** en ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}:\n\n${sorted
          .slice(0, 8)
          .map((a) => `• **${a.label}:** **${maskIfNeeded(a.formatted, ocultarMontos)}** *(${a.doc})*`)
          .join('\n')}`,
        table: {
          exportName: 'Montos_Documento',
          headers: ['Concepto / Etiqueta', 'Importe', 'Contexto en documento'],
          rows: sorted.slice(0, 12).map((a) => [
            a.label,
            maskIfNeeded(a.formatted, ocultarMontos),
            maskIfNeeded(a.contextLine, ocultarMontos),
          ]),
        },
        chart:
          sorted.length >= 2
            ? {
                title: 'Principales importes detectados',
                series1Label: 'Importe',
                isCurrency: true,
                data: sorted.slice(0, 5).map((a) => ({ label: a.label.slice(0, 14), valor: a.amount })),
              }
            : undefined,
      };
    }

    if (asksPrices && labeled.length === 0) {
      return {
        vistaConsultada: `Verificación de precios · ${primaryDoc.fileName}`,
        text: `Revisé ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')} y **no contiene precios ni importes monetarios**${saludoNombre}.${
          plainMetrics.length > 0
            ? `\n\nÚnicamente registra **datos numéricos / mediciones no monetarias**:\n${plainMetrics
                .slice(0, 6)
                .map((m) => `• **${m.label}:** **${m.formatted}** *(${m.doc})*`)
                .join('\n')}`
            : ''
        }`,
        table:
          plainMetrics.length > 0
            ? {
                exportName: 'Datos_Numericos_Documento',
                headers: ['Indicador / Etiqueta', 'Valor', 'Contexto en documento'],
                rows: plainMetrics.slice(0, 12).map((m) => [m.label, m.formatted, m.contextLine]),
              }
            : undefined,
      };
    }

    if (asksPlainNumbers && (plainMetrics.length > 0 || labeled.length > 0)) {
      return {
        vistaConsultada: `Datos numéricos extraídos · ${primaryDoc.fileName}`,
        text: `Con gusto${saludoNombre}. Estas son las cifras numéricas identificadas en ${targetDocs.map((d) => `**${d.fileName}**`).join(', ')}:\n\n${[
          ...plainMetrics.slice(0, 6).map((m) => `• **${m.label}:** **${m.formatted}** *(dato numérico)*`),
          ...labeled.slice(0, 4).map((a) => `• **${a.label}:** **${maskIfNeeded(a.formatted, ocultarMontos)}** *(importe monetario)*`),
        ].join('\n')}`,
        table: {
          exportName: 'Cifras_Documento',
          headers: ['Concepto / Etiqueta', 'Valor', 'Tipo'],
          rows: [
            ...plainMetrics.slice(0, 10).map((m) => [m.label, m.formatted, m.unit ? `Medición (${m.unit})` : 'Numérico']),
            ...labeled.slice(0, 6).map((a) => [a.label, maskIfNeeded(a.formatted, ocultarMontos), 'Monetario']),
          ],
        },
      };
    }
  }

  // L. RECUPERACIÓN SEMÁNTICA DE PASAJES (CON SINÓNIMOS Y TOLERANCIA A ORTOGRAFÍA)
  const docStop = new Set([
    'que', 'dice', 'dise', 'sobre', 'busca', 'buscar', 'encuentra', 'muestra', 'muestrame', 'dame',
    'cual', 'cuales', 'como', 'donde', 'cuanto', 'tiene', 'vienen', 'viene', 'trae', 'contiene',
    'trata', 'tratan', 'habla', 'explica', 'explicame', 'cuentame', 'dime', 'resumen', 'resume',
    'analiza', 'revisa', 'informacion', 'datos', 'significa', 'consiste', 'menciona',
    'documento', 'documentos', 'archivo', 'archivos', 'adjunto', 'adjuntos', 'adjunte', 'subi',
    'mande', 'envie', 'pdf', 'word', 'docx', 'excel', 'csv', 'xml', 'zip',
    'los', 'las', 'del', 'con', 'para', 'por', 'una', 'uno', 'este', 'esta', 'ese', 'esa', 'esto',
  ]);
  const searchTerms = tokens.filter((t) => t.length >= 3 && !docStop.has(t));

  if (searchTerms.length > 0) {
    const passageHits: Array<{ doc: string; text: string; score: number }> = [];

    for (const d of targetDocs) {
      // 1. Buscar en keyFields directos
      for (const [k, v] of Object.entries(d.keyFields)) {
        const kvWords = basicNormalize(`${k} ${v}`).split(/[^a-z0-9]+/);
        if (searchTerms.some((st) => kvWords.some((w) => w.length >= 3 && fuzzyWordMatch(st, w)))) {
          passageHits.push({ doc: d.fileName, text: `${k}: ${v}`, score: 10 });
        }
      }

      // 2. Recuperación semántica con expansión de sinónimos sobre párrafos y oraciones
      if (d.comprehension) {
        const best = retrieveBestPassages(
          searchTerms,
          d.comprehension.paragraphs,
          d.comprehension.sentences,
          d.comprehension.keyValuePairs,
        );
        for (const b of best) {
          passageHits.push({ doc: d.fileName, text: b.text, score: b.score });
        }
      } else {
        for (const line of d.lines) {
          const lineWords = basicNormalize(line).split(/[^a-z0-9]+/);
          if (searchTerms.some((st) => lineWords.some((w) => w.length >= 3 && fuzzyWordMatch(st, w)))) {
            passageHits.push({ doc: d.fileName, text: line.slice(0, 240), score: 5 });
          }
        }
      }
    }

    passageHits.sort((a, b) => b.score - a.score);
    const deduped: Array<{ doc: string; text: string }> = [];
    for (const h of passageHits) {
      if (deduped.length >= 6) break;
      if (deduped.some((x) => x.text === h.text)) continue;
      deduped.push({ doc: h.doc, text: h.text });
    }

    if (deduped.length > 0) {
      return {
        vistaConsultada: `Comprensión y búsqueda semántica en documentos adjuntos`,
        text: `Con gusto${saludoNombre}. Esto es lo que señala la documentación adjunta respecto a su consulta:\n\n${deduped
          .map((h) => `• **${h.doc}:** ${maskIfNeeded(h.text, ocultarMontos)}`)
          .join('\n')}`,
        table:
          deduped.length >= 3
            ? {
                exportName: 'Extractos_Documentos',
                headers: ['Documento', 'Pasaje / Dato relevante'],
                rows: deduped.map((h) => [h.doc, maskIfNeeded(h.text, ocultarMontos)]),
              }
            : undefined,
      };
    }
  }

  // M. Respaldo inteligente: entregar el resumen comprensivo completo del documento en foco
  return buildSingleDocumentReport(
    primaryDoc,
    saludoNombre,
    empresa,
    ocultarMontos,
    attachedDocs.length,
  );
}
