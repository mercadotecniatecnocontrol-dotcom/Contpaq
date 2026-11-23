import JSZip from 'jszip';
import { basicNormalize, fuzzyWordMatch } from './nluEngine';
import { formatMoney } from '../utils/format';

export interface LabeledAmount {
  label: string;
  amount: number;
  formatted: string;
  contextLine: string;
}

export interface NumericMetric {
  label: string;
  value: number;
  unit: string;
  formatted: string;
  contextLine: string;
}

export interface GroupBreakdown {
  groupColumn: string;
  metricColumn: string;
  isCurrency: boolean;
  topGroups: Array<{ name: string; count: number; total: number; pct: number }>;
}

export interface DocumentComprehension {
  title: string;
  domainKey: string;
  domainLabel: string;
  wordCount: number;
  paragraphCount: number;
  sections: string[];
  topThemes: string[];
  executiveSummary: string;
  keyPoints: string[];
  paragraphs: string[];
  sentences: string[];
  keyValuePairs: Array<{ key: string; value: string }>;
  labeledAmounts: LabeledAmount[];
  numericMetrics: NumericMetric[];
  organizations: string[];
  people: string[];
  emails: string[];
  phones: string[];
  deadlines: string[];
  groupBreakdowns?: GroupBreakdown[];
  extractedTables?: Array<{ headers: string[]; rows: string[][] }>;
}

export function formatPlainNumber(val: number): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(val);
}

export function formatMetricValue(
  val: number,
  isCurrency: boolean,
  ocultarMontos = false,
): string {
  return isCurrency ? formatMoney(val, ocultarMontos) : formatPlainNumber(val);
}

const NON_CURRENCY_COLUMN_HINT =
  /\b(cantidad|cant|qty|piezas|pieza|pzas|pza|unidades|unidad|stock|existencia|existencias|inventario|horas|hora|hrs|minutos|min|segundos|dias|dia|meses|anos|anio|edad|peso|kg|kilos|gramos|toneladas|metros|cm|mm|km|distancia|litros|lts|volumen|temperatura|presion|bar|psi|voltaje|volts|corriente|amperes|watts|kw|hz|rpm|porcentaje|pct|calificacion|calif|nota|puntaje|puntos|personas|empleados|alumnos|estudiantes|usuarios|visitas|intentos|registros|casos|equipos|productos|articulos|elementos|paginas|version|nivel|capacidad|frecuencia|velocidad|promedio_calif|indice|ranking|asistencias|faltas|retardos)\b/;

const CURRENCY_COLUMN_HINT =
  /\b(precio|precios|costo|costos|monto|montos|importe|importes|subtotal|sub_total|iva|isr|ieps|retencion|saldo|saldos|abono|abonos|cargo|cargos|pago|pagos|cobro|cobros|sueldo|sueldos|salario|salarios|nomina|venta|ventas|gasto|gastos|ingreso|ingresos|egreso|egresos|presupuesto|honorario|honorarios|tarifa|tarifas|utilidad|ganancia|perdida|capital|activo|pasivo|descuento|anticipo|facturado|facturacion|mxn|usd|eur|pesos|dolares|dinero|inversion|deuda|credito|debito|valor_unitario|valor unitario|cuota|renta|comision)\b/;

export function isMonetaryColumnHeader(header: string): boolean {
  const norm = basicNormalize(header);
  if (!norm) return false;
  if (NON_CURRENCY_COLUMN_HINT.test(norm)) return false;
  if (CURRENCY_COLUMN_HINT.test(norm)) return true;
  // "total" o "neto" solo se presume moneda cuando viene solo o acompañado de términos fiscales/comerciales
  if (/^(total|gran total|neto|total neto|total general|total factura|total mxn|total usd)$/.test(norm)) {
    return true;
  }
  return false;
}

const SPANISH_STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o',
  'este', 'si', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'tambien',
  'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos',
  'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto',
  'mi', 'antes', 'algunos', 'que', 'unos', 'yo', 'otro', 'otras', 'otra', 'el', 'tanto',
  'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar',
  'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tu', 'te', 'ti', 'tus', 'ellas',
  'nosotras', 'vosotros', 'vosotras', 'os', 'mio', 'mia', 'mios', 'mias', 'tuyo', 'tuya',
  'suyo', 'suya', 'nuestro', 'nuestra', 'vuestro', 'vuestra', 'esos', 'esas', 'estoy',
  'esta', 'estan', 'son', 'ser', 'fue', 'sido', 'era', 'han', 'ha', 'he', 'tiene', 'tienen',
  'puede', 'pueden', 'debe', 'deben', 'asi', 'cada', 'cualquier', 'bajo', 'mediante',
  'segun', 'traves', 'pagina', 'hoja', 'fecha', 'nombre', 'numero', 'num', 'www', 'http',
  'https', 'com', 'mx', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
]);

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// =========================================================================
// EXTRACTORES NATIVOS DE MICROSOFT WORD (.docx) Y POWERPOINT (.pptx)
// =========================================================================

export async function extractDocxContent(buffer: ArrayBuffer): Promise<{
  text: string;
  headings: string[];
  tables: Array<{ headers: string[]; rows: string[][] }>;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('El archivo .docx no contiene word/document.xml válido.');
  }

  const xml = await docFile.async('string');
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];

  // Extraer tablas (<w:tbl>) antes de limpiar el texto general
  const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tblRegex.exec(xml)) !== null) {
    const tblXml = tm[0];
    const trMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) || [];
    const matrix: string[][] = [];
    for (const tr of trMatches) {
      const tcMatches = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) || [];
      const rowCells = tcMatches.map((tc) => {
        const texts = Array.from(tc.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map((m) =>
          decodeXmlEntities(m[1]),
        );
        return texts.join('').replace(/\s+/g, ' ').trim();
      });
      if (rowCells.some(Boolean)) matrix.push(rowCells);
    }
    if (matrix.length >= 2) {
      tables.push({ headers: matrix[0], rows: matrix.slice(1) });
    }
  }

  // Extraer párrafos (<w:p>) conservando encabezados
  const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/gi) || [];
  for (const p of pMatches) {
    const isHeading = /<w:pStyle[^>]*w:val="(?:Heading|T[ií]tulo|Title|Subtitle)/i.test(p);
    const texts = Array.from(p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map((m) =>
      decodeXmlEntities(m[1]),
    );
    const clean = texts.join('').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    paragraphs.push(clean);
    if (isHeading && clean.length >= 3 && clean.length <= 140) {
      headings.push(clean);
    }
  }

  // Leer encabezados/pies de página breves si existen
  const headerEntries = Object.keys(zip.files).filter((k) => /^word\/header\d*\.xml$/i.test(k));
  const headerLines: string[] = [];
  for (const hk of headerEntries.slice(0, 2)) {
    const hXml = await zip.file(hk)!.async('string');
    const hText = Array.from(hXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi))
      .map((m) => decodeXmlEntities(m[1]))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (hText && hText.length >= 4 && !paragraphs[0]?.includes(hText)) {
      headerLines.push(hText);
    }
  }

  const allLines = [...headerLines, ...paragraphs];
  return {
    text: allLines.join('\n'),
    headings,
    tables,
  };
}

export async function extractPptxContent(buffer: ArrayBuffer): Promise<{
  text: string;
  slidesCount: number;
  slideTitles: string[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const slideKeys = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] || '0', 10);
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || '0', 10);
      return na - nb;
    });

  const slideBlocks: string[] = [];
  const slideTitles: string[] = [];

  for (let i = 0; i < slideKeys.length; i++) {
    const xml = await zip.file(slideKeys[i])!.async('string');
    const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/gi) || [];
    const lines = pMatches
      .map((p) =>
        Array.from(p.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi))
          .map((m) => decodeXmlEntities(m[1]))
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);

    if (lines.length > 0) {
      slideTitles.push(`Diapositiva ${i + 1}: ${lines[0].slice(0, 90)}`);
      slideBlocks.push(`[Diapositiva ${i + 1}]\n${lines.join('\n')}`);
    }
  }

  return {
    text: slideBlocks.join('\n\n'),
    slidesCount: slideKeys.length,
    slideTitles,
  };
}

// =========================================================================
// RECONSTRUCCIÓN DE PÁRRAFOS, ORACIONES Y SECCIONES
// =========================================================================

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length <= 1) return true;
  if (/^p[aá]gina\s+\d+(?:\s+de\s+\d+)?$/i.test(t)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
  if (/^[-_=•·*~]{3,}$/.test(t)) return true;
  return false;
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 125) return false;
  if (/[.?!]$/.test(t) && t.length > 65) return false;
  // Encabezados numerados: "1. Introducción", "2.3 Alcance del proyecto", "I. Antecedentes"
  if (/^(?:\d+(?:\.\d+){0,3}|[IVX]{1,5})[.)]\s+[A-ZÁÉÍÓÚÑ]/.test(t)) return true;
  // Cláusulas, capítulos, artículos, diapositivas
  if (/^(?:CL[ÁA]USULA|CAP[ÍI]TULO|SECCI[ÓO]N|ART[ÍI]CULO|ANEXO|PARTIDA|APARTADO|Diapositiva)\b/i.test(t)) {
    return true;
  }
  // Títulos cortos completamente en mayúsculas con al menos 2 letras
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letters.length >= 5 && letters.length <= 75 && letters === letters.toUpperCase() && !t.includes('$')) {
    return true;
  }
  return false;
}

function reconstructParagraphs(rawText: string): string[] {
  const rawLines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());

  const paragraphs: string[] = [];
  let buffer = '';

  const flush = () => {
    const clean = buffer.replace(/\s+/g, ' ').trim();
    if (clean.length >= 3) paragraphs.push(clean);
    buffer = '';
  };

  for (const line of rawLines) {
    if (!line || isNoiseLine(line)) {
      flush();
      continue;
    }

    const isBullet = /^(?:[•\-–—*]|\d+[.)]|[a-z][)])\s+/.test(line);
    const isHeading = looksLikeHeading(line);
    const isKeyVal = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s/()#-]{2,38}:\s+\S/.test(line);

    if (isHeading || isBullet || isKeyVal) {
      flush();
      buffer = line;
      if (isHeading || isKeyVal) flush();
      continue;
    }

    if (!buffer) {
      buffer = line;
    } else if (/[.!?:;]$/.test(buffer)) {
      // Si el buffer ya cerró una oración y la siguiente línea empieza con mayúscula, separar si es largo
      if (buffer.length > 260 && /^[A-ZÁÉÍÓÚÑ]/.test(line)) {
        flush();
        buffer = line;
      } else {
        buffer += ` ${line}`;
      }
    } else {
      // Unir saltos de línea artificiales propios de PDFs
      if (buffer.endsWith('-') && /^[a-záéíóúñ]/.test(line)) {
        buffer = buffer.slice(0, -1) + line;
      } else {
        buffer += ` ${line}`;
      }
    }
  }
  flush();
  return paragraphs;
}

function splitIntoSentences(paragraphs: string[]): string[] {
  const sentences: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= 220) {
      sentences.push(p);
      continue;
    }
    const parts = p
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9•\-])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 18);
    if (parts.length > 0) sentences.push(...parts);
    else sentences.push(p);
  }
  return sentences;
}

// =========================================================================
// CLASIFICADOR SEMÁNTICO DE DOMINIO (16 CATEGORÍAS CORPORATIVAS Y FISCALES)
// =========================================================================

interface DomainRule {
  key: string;
  label: string;
  signals: Array<{ phrase: string; weight: number }>;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    key: 'constancia_csf',
    label: 'Constancia de Situación Fiscal (CSF)',
    signals: [
      { phrase: 'constancia de situacion fiscal', weight: 12 },
      { phrase: 'cedula de identificacion fiscal', weight: 10 },
      { phrase: 'datos de identificacion del contribuyente', weight: 8 },
      { phrase: 'estatus en el padron', weight: 6 },
    ],
  },
  {
    key: 'opinion_sat_32d',
    label: 'Opinión de Cumplimiento SAT (32-D)',
    signals: [
      { phrase: 'opinion del cumplimiento de obligaciones fiscales', weight: 12 },
      { phrase: '32-d', weight: 8 },
      { phrase: 'opinion de cumplimiento', weight: 7 },
    ],
  },
  {
    key: 'opinion_imss',
    label: 'Opinión de Cumplimiento IMSS',
    signals: [
      { phrase: 'instituto mexicano del seguro social', weight: 10 },
      { phrase: 'registro patronal', weight: 6 },
      { phrase: 'obligaciones fiscales en materia de seguridad social', weight: 10 },
    ],
  },
  {
    key: 'declaracion_sat',
    label: 'Acuse de Declaración SAT / Línea de Captura',
    signals: [
      { phrase: 'linea de captura', weight: 10 },
      { phrase: 'declaracion provisional', weight: 9 },
      { phrase: 'acuse de recibo', weight: 7 },
      { phrase: 'cantidad a pagar', weight: 5 },
    ],
  },
  {
    key: 'factura_pdf',
    label: 'Representación Impresa de Factura (CFDI)',
    signals: [
      { phrase: 'folio fiscal', weight: 8 },
      { phrase: 'sello digital del cfdi', weight: 9 },
      { phrase: 'cadena original del complemento', weight: 9 },
      { phrase: 'uso cfdi', weight: 6 },
    ],
  },
  {
    key: 'estado_cuenta',
    label: 'Estado de Cuenta / Comprobante Bancario',
    signals: [
      { phrase: 'estado de cuenta', weight: 10 },
      { phrase: 'clabe', weight: 6 },
      { phrase: 'saldo inicial', weight: 6 },
      { phrase: 'saldo final', weight: 6 },
      { phrase: 'comprobante electronico de pago', weight: 9 },
      { phrase: 'spei', weight: 5 },
    ],
  },
  {
    key: 'contrato_convenio',
    label: 'Contrato / Convenio Legal',
    signals: [
      { phrase: 'contrato de', weight: 8 },
      { phrase: 'clausula', weight: 7 },
      { phrase: 'clausulas', weight: 7 },
      { phrase: 'declaraciones', weight: 5 },
      { phrase: 'el prestador', weight: 6 },
      { phrase: 'el cliente', weight: 3 },
      { phrase: 'convenio de', weight: 8 },
      { phrase: 'confidencialidad', weight: 5 },
      { phrase: 'rescision', weight: 6 },
      { phrase: 'jurisdiccion', weight: 5 },
    ],
  },
  {
    key: 'cotizacion_propuesta',
    label: 'Cotización / Propuesta Comercial',
    signals: [
      { phrase: 'cotizacion', weight: 10 },
      { phrase: 'propuesta economica', weight: 10 },
      { phrase: 'propuesta comercial', weight: 10 },
      { phrase: 'propuesta tecnica', weight: 9 },
      { phrase: 'presupuesto', weight: 7 },
      { phrase: 'vigencia de la cotizacion', weight: 9 },
      { phrase: 'condiciones comerciales', weight: 7 },
      { phrase: 'tiempo de entrega', weight: 5 },
      { phrase: 'precio unitario', weight: 5 },
    ],
  },
  {
    key: 'orden_compra',
    label: 'Orden de Compra / Requisición',
    signals: [
      { phrase: 'orden de compra', weight: 11 },
      { phrase: 'requisicion', weight: 8 },
      { phrase: 'pedido de compra', weight: 9 },
      { phrase: 'condiciones de entrega', weight: 5 },
    ],
  },
  {
    key: 'estado_financiero',
    label: 'Estado Financiero / Reporte Contable',
    signals: [
      { phrase: 'estado de resultados', weight: 11 },
      { phrase: 'balance general', weight: 11 },
      { phrase: 'balanza de comprobacion', weight: 11 },
      { phrase: 'estado de situacion financiera', weight: 11 },
      { phrase: 'activo circulante', weight: 8 },
      { phrase: 'pasivo a corto plazo', weight: 8 },
      { phrase: 'utilidad neta', weight: 7 },
      { phrase: 'capital contable', weight: 7 },
      { phrase: 'poliza contable', weight: 7 },
    ],
  },
  {
    key: 'nomina_rh',
    label: 'Recibo de Nómina / Documento de RH',
    signals: [
      { phrase: 'recibo de nomina', weight: 10 },
      { phrase: 'percepciones', weight: 6 },
      { phrase: 'deducciones', weight: 4 },
      { phrase: 'salario diario', weight: 8 },
      { phrase: 'numero de seguridad social', weight: 8 },
      { phrase: 'finiquito', weight: 8 },
      { phrase: 'aguinaldo', weight: 6 },
    ],
  },
  {
    key: 'manual_guia',
    label: 'Manual / Guía / Especificación Técnica',
    signals: [
      { phrase: 'manual de', weight: 9 },
      { phrase: 'guia de', weight: 8 },
      { phrase: 'especificacion', weight: 7 },
      { phrase: 'procedimiento', weight: 6 },
      { phrase: 'politica de', weight: 7 },
      { phrase: 'instructivo', weight: 8 },
      { phrase: 'requisitos', weight: 4 },
      { phrase: 'arquitectura', weight: 5 },
      { phrase: 'objetivo general', weight: 5 },
      { phrase: 'alcance', weight: 3 },
    ],
  },
  {
    key: 'minuta_informe',
    label: 'Informe / Reporte Ejecutivo / Minuta',
    signals: [
      { phrase: 'minuta de reunion', weight: 11 },
      { phrase: 'informe ejecutivo', weight: 10 },
      { phrase: 'reporte mensual', weight: 9 },
      { phrase: 'reporte de', weight: 6 },
      { phrase: 'informe de', weight: 7 },
      { phrase: 'resumen ejecutivo', weight: 7 },
      { phrase: 'conclusiones', weight: 5 },
      { phrase: 'acuerdos', weight: 5 },
      { phrase: 'asistentes', weight: 5 },
    ],
  },
  {
    key: 'oficio_notificacion',
    label: 'Oficio / Carta / Comunicación Formal',
    signals: [
      { phrase: 'estimado', weight: 4 },
      { phrase: 'por medio de la presente', weight: 9 },
      { phrase: 'a quien corresponda', weight: 9 },
      { phrase: 'atentamente', weight: 5 },
      { phrase: 'oficio', weight: 7 },
      { phrase: 'requerimiento', weight: 6 },
      { phrase: 'notificacion', weight: 5 },
    ],
  },
];

function classifyDomain(normText: string, fileName: string): { key: string; label: string } {
  const combined = `${basicNormalize(fileName)} ${normText.slice(0, 6000)}`;
  let best = { key: 'documento_general', label: 'Documento Analizado', score: 0 };

  for (const rule of DOMAIN_RULES) {
    let score = 0;
    for (const s of rule.signals) {
      if (combined.includes(s.phrase)) score += s.weight;
    }
    if (score > best.score) {
      best = { key: rule.key, label: rule.label, score };
    }
  }

  return best.score >= 7
    ? { key: best.key, label: best.label }
    : { key: 'documento_general', label: 'Documento de Texto / Informe' };
}

// =========================================================================
// EXTRACTOR DE ENTIDADES, MONTOS ETIQUETADOS Y RESUMEN EXTRACTIVO SALIENTE
// =========================================================================

const NON_MONETARY_UNIT_AFTER =
  /^\s*(%|por\s*ciento|kg|g|gr|mg|ton|t\b|mm|cm|m\b|mts|km|bar|psi|v\b|vac|vdc|volts?|a\b|amp|ma|hz|khz|mhz|w\b|kw|mw|°c|°f|grados?|l\b|lt|lts|litros?|ml|m3|hrs?|horas?|min|minutos?|seg|d[ií]as?|semanas?|meses?|a[ñn]os?|pzas?|piezas?|unidades?|personas?|empleados?|alumnos?|p[aá]ginas?|puntos?|mb|gb|tb|kb|rpm|metros?|kilos?|equipos?|productos?|registros?|elementos?)\b/i;

const EXPLICIT_MONETARY_LABEL =
  /\b(precio|costo|subtotal|sub-total|iva|isr|ieps|importe|monto|saldo|abono|cargo|anticipo|honorarios?|tarifa|presupuesto|inversi[oó]n|sueldo|salario|pago|facturaci[oó]n|ingresos?|egresos?|gastos?|utilidad|ventas?|deuda|cr[eé]dito|descuento|renta|comisi[oó]n|total\s+(?:a\s+pagar|de\s+la\s+(?:factura|cotizaci[oó]n|propuesta|compra|venta|orden)|mxn|usd|neto|general))\b/i;

const NON_MONETARY_LABEL =
  /\b(versi[oó]n|cap[ií]tulo|secci[oó]n|art[ií]culo|cl[áa]usula|p[aá]gina|folio|c[oó]digo\s*postal|cp\b|tel[eé]fono|extensi[oó]n|clabe|cuenta|cantidad|piezas|unidades|stock|existencia|horas|d[ií]as|meses|a[ñn]os|edad|peso|altura|longitud|distancia|volumen|capacidad|temperatura|presi[oó]n|voltaje|corriente|potencia|frecuencia|velocidad|porcentaje|avance|calificaci[oó]n|puntaje|personas|empleados|alumnos|asistencias|equipos|registros|total\s+de\s+(?:piezas|unidades|personas|empleados|alumnos|d[ií]as|horas|p[aá]ginas|equipos|registros|productos|art[ií]culos|casos|elementos|kilos|metros|litros))\b/i;

function extractNumbersStructured(lines: string[]): {
  labeledAmounts: LabeledAmount[];
  numericMetrics: NumericMetric[];
} {
  const labeledAmounts: LabeledAmount[] = [];
  const numericMetrics: NumericMetric[] = [];
  const seenMoney = new Set<string>();
  const seenMetric = new Set<string>();

  for (const line of lines) {
    // 1. Buscar cantidades explícitamente monetarias (símbolo $, €, MXN, USD, EUR, pesos, dólares o etiqueta monetaria inequívoca)
    const moneyMatch = line.match(
      /([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s/().-]{0,50}?)[:\s]*(\$|€|US\$|MXN\s*|USD\s*|EUR\s*)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(MXN|USD|EUR|pesos|d[oó]lares)?([^\n]{0,25})/i,
    );

    if (moneyMatch) {
      const rawLabel = (moneyMatch[1] || '').replace(/^[\s•\-–—*]+|[:\s]+$/g, '').trim();
      const prefixCur = (moneyMatch[2] || '').trim();
      const numStr = moneyMatch[3];
      const suffixCur = (moneyMatch[4] || '').trim();
      const trailing = moneyMatch[5] || '';
      const num = parseFloat(numStr.replace(/,/g, ''));

      if (Number.isFinite(num) && num > 0 && num < 1e11) {
        const hasCurrencyMarker = Boolean(prefixCur || suffixCur);
        const hasNonMonetaryUnit = NON_MONETARY_UNIT_AFTER.test(trailing);
        const hasNonMonetaryLabel = NON_MONETARY_LABEL.test(rawLabel);
        const hasExplicitMoneyLabel = EXPLICIT_MONETARY_LABEL.test(rawLabel);

        // Solo clasificar como PRECIO / IMPORTE MONETARIO si hay señal inequívoca de dinero
        // y NO tiene unidad física/cantidad ni etiqueta no monetaria
        if (
          !hasNonMonetaryUnit &&
          (hasCurrencyMarker || (hasExplicitMoneyLabel && !hasNonMonetaryLabel))
        ) {
          // Evitar años sueltos si no hay símbolo monetario ni decimales
          if (!hasCurrencyMarker && !numStr.includes('.') && num >= 1900 && num <= 2099) {
            // ignorar año
          } else {
            const label = rawLabel.length >= 2 ? rawLabel : 'Importe';
            const key = `${basicNormalize(label)}-${num.toFixed(2)}`;
            if (!seenMoney.has(key)) {
              seenMoney.add(key);
              const curCode = /USD|d[oó]lar/i.test(prefixCur + suffixCur)
                ? 'USD'
                : /EUR|€/i.test(prefixCur + suffixCur)
                  ? 'EUR'
                  : 'MXN';
              labeledAmounts.push({
                label,
                amount: num,
                formatted: formatMoney(num, false, curCode),
                contextLine: line.slice(0, 150),
              });
            }
            continue;
          }
        }
      }
    }

    // 2. Si NO es moneda, extraer como dato numérico / medición / cantidad con su unidad real (NUNCA con $)
    const metricMatch = line.match(
      /^[\s•\-–—*]*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s/().-]{2,42})[:\s]+(\d{1,3}(?:,\d{3})*(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?)\s*(%|por\s*ciento|kg|g|gr|mg|ton|mm|cm|m\b|mts|km|bar|psi|v\b|vac|vdc|volts?|amp|hz|kw|w\b|°c|°f|grados?|litros?|lts?|ml|m3|horas?|hrs?|minutos?|d[ií]as?|semanas?|meses?|a[ñn]os?|piezas?|pzas?|unidades?|personas?|empleados?|alumnos?|equipos?|registros?|puntos?|mb|gb|rpm)?\b/i,
    );
    if (metricMatch) {
      const label = metricMatch[1].replace(/^[\s•\-–—*]+|[:\s]+$/g, '').trim();
      const numStr = metricMatch[2];
      const unit = (metricMatch[3] || '').trim();
      const val = parseFloat(numStr.replace(/,/g, ''));
      // Omitir códigos postales, teléfonos, años solos sin unidad y números de capítulo
      if (!Number.isFinite(val)) continue;
      if (!unit && val >= 1900 && val <= 2099) continue;
      if (/^(c[oó]digo\s*postal|cp|tel[eé]fono|rfc|folio|p[aá]gina|clabe|cuenta)$/i.test(label)) continue;
      if (label.length < 2) continue;

      const key = `${basicNormalize(label)}-${val}-${unit.toLowerCase()}`;
      if (!seenMetric.has(key)) {
        seenMetric.add(key);
        const formatted = unit ? `${formatPlainNumber(val)} ${unit}` : formatPlainNumber(val);
        numericMetrics.push({
          label,
          value: val,
          unit,
          formatted,
          contextLine: line.slice(0, 150),
        });
      }
    }
  }

  return {
    labeledAmounts: labeledAmounts.slice(0, 20),
    numericMetrics: numericMetrics.slice(0, 20),
  };
}

function extractKeyValuePairs(lines: string[]): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s/()#-]{2,36}):\s+(.{2,140})$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    const kNorm = basicNormalize(key);
    if (seen.has(kNorm) || kNorm.includes('http') || kNorm.length < 3) continue;
    seen.add(kNorm);
    pairs.push({ key, value });
    if (pairs.length >= 16) break;
  }
  return pairs;
}

function extractEntities(text: string) {
  // Empresas / organizaciones mexicanas y corporativas
  const orgMatches =
    text.match(
      /\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.,\s]{2,55}\s+(?:S\.?\s*A\.?\s*DE\s*C\.?\s*V\.?|S\.?\s*A\.?\s*P\.?\s*I\.?(?:\s*DE\s*C\.?\s*V\.?)?|S\.?\s*DE\s*R\.?\s*L\.?(?:\s*DE\s*C\.?\s*V\.?)?|S\.?\s*C\.?|A\.?\s*C\.?|INC\.?|LLC)\b/g,
    ) || [];
  const organizations = Array.from(new Set(orgMatches.map((o) => o.replace(/\s+/g, ' ').trim()))).slice(0, 8);

  // Personas con título o prefijo de responsabilidad
  const peopleMatches =
    text.match(
      /\b(?:Ing\.|Lic\.|C\.P\.|Dr\.|Dra\.|Mtro\.|Arq\.|Sr\.|Sra\.)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}/g,
    ) || [];
  const people = Array.from(new Set(peopleMatches.map((p) => p.replace(/\s+/g, ' ').trim()))).slice(0, 8);

  const emails = Array.from(
    new Set(text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || []),
  ).slice(0, 6);

  const phones = Array.from(
    new Set(text.match(/(?:\+?52\s*)?(?:\(\d{2,3}\)\s*|\d{2,3}[-.\s])\d{3,4}[-.\s]\d{4}\b/g) || []),
  ).slice(0, 6);

  return { organizations, people, emails, phones };
}

function extractTopThemes(text: string): string[] {
  const tokens = basicNormalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !SPANISH_STOPWORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const tok of tokens) {
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2 || tokens.length < 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(basicNormalize(a).split(' ').filter((w) => w.length >= 4));
  const setB = new Set(basicNormalize(b).split(' ').filter((w) => w.length >= 4));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / (setA.size + setB.size - inter);
}

function selectSalientSentences(
  sentences: string[],
  themes: string[],
  maxCount: number,
): string[] {
  const themeSet = new Set(themes);
  const purposeCues =
    /\b(objetivo|proposito|finalidad|consiste|tiene por objeto|presente|establece|incluye|alcance|resultado|conclusion|resumen|acuerdo|total|importe|vigencia|plazo|requisito|obligacion|propuesta|servicio|proyecto|pago|entrega|solucion|sistema)\b/;

  const candidates = sentences
    .filter(
      (s) =>
        s.length >= 28 &&
        s.length <= 420 &&
        !looksLikeHeading(s) &&
        // Evitar usar mini líneas de metadatos ("Cliente: ...", "Fecha: ...") como prosa del resumen
        !(/^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s/()#-]{2,32}:\s+/.test(s) && s.length < 75),
    )
    .map((s, idx) => {
      const norm = basicNormalize(s);
      const words = norm.split(' ').filter((w) => w.length >= 4 && !SPANISH_STOPWORDS.has(w));
      const uniqueWords = new Set(words);

      // 1. Densidad temática (palabras clave del documento)
      let themeHits = 0;
      for (const w of uniqueWords) {
        if (themeSet.has(w)) themeHits++;
      }
      let score = themeHits * 2.4;

      // 2. Posición estructural (introducción y cierre suelen concentrar tesis y conclusiones)
      if (idx <= 3) score += 4.5 - idx * 0.7;
      if (idx >= sentences.length - 3 && sentences.length > 6) score += 2.2;

      // 3. Presencia de señales informativas (objetivos, montos, porcentajes, plazos, verbos clave)
      if (purposeCues.test(norm)) score += 3.5;
      if (/\$[\d,]+|\d+%|\d+\s+dias|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/i.test(s)) score += 2.2;

      // 4. Longitud óptima de lectura (oraciones completas, ni micro-etiquetas ni muros gigantes)
      if (s.length >= 55 && s.length <= 260) score += 2.0;

      // Penalizar líneas que son pura lista de códigos o basura de encabezados
      const digitRatio = (s.match(/\d/g)?.length || 0) / s.length;
      if (digitRatio > 0.45) score -= 3;

      return { sentence: s, idx, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ sentence: string; idx: number }> = [];
  for (const c of candidates) {
    if (selected.length >= maxCount) break;
    if (selected.some((sel) => jaccardSimilarity(sel.sentence, c.sentence) > 0.55)) continue;
    selected.push({ sentence: c.sentence, idx: c.idx });
  }

  // Devolver en el orden natural del documento para lectura coherente
  return selected.sort((a, b) => a.idx - b.idx).map((x) => x.sentence);
}

export function comprehendTextDocument(
  rawText: string,
  fileName: string,
  extraHeadings: string[] = [],
  extractedTables?: Array<{ headers: string[]; rows: string[][] }>,
): DocumentComprehension {
  const paragraphs = reconstructParagraphs(rawText);
  const sentences = splitIntoSentences(paragraphs);
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && !isNoiseLine(l));

  const normText = basicNormalize(rawText);
  const domain = classifyDomain(normText, fileName);

  // Título probable del documento (encabezado explícito o primeras líneas limpias)
  const cleanFileName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const detectedHeadings = Array.from(
    new Set([
      ...extraHeadings,
      ...rawLines.filter((l) => looksLikeHeading(l)),
    ]),
  ).slice(0, 12);

  const candidateTitle =
    extraHeadings[0] ||
    rawLines.find((l) => l.length >= 6 && l.length <= 120 && !/^https?:\/\//i.test(l) && !/^\d+$/.test(l)) ||
    cleanFileName;

  const themes = extractTopThemes(rawText);
  const { labeledAmounts, numericMetrics } = extractNumbersStructured(rawLines);
  const keyValuePairs = extractKeyValuePairs(rawLines);
  const entities = extractEntities(rawText);

  const deadlines = rawLines
    .filter((l) =>
      /\b(vigencia|vence|vencimiento|plazo|entrega|fecha l[ií]mite|d[ií]as h[aá]biles|d[ií]as naturales|a m[aá]s tardar|antes del|periodo)\b/i.test(
        l,
      ),
    )
    .slice(0, 6);

  const salient = selectSalientSentences(sentences, themes, 5);
  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;

  // Construir un resumen ejecutivo humano, claro y comprensible sobre DE QUÉ TRATA el documento
  let executiveSummary = '';
  if (salient.length > 0) {
    const lead = salient.slice(0, 2).join(' ');
    executiveSummary = `El documento **«${candidateTitle}»** corresponde a un(a) **${domain.label}** (${wordCount} palabras${detectedHeadings.length > 0 ? `, organizado en ${detectedHeadings.length} sección(es)` : ''}). En síntesis: ${lead}`;
  } else if (paragraphs.length > 0) {
    executiveSummary = `El documento **«${candidateTitle}»** corresponde a un(a) **${domain.label}**. Su contenido principal señala: ${paragraphs.slice(0, 2).join(' ').slice(0, 320)}`;
  } else {
    executiveSummary = `El documento **${fileName}** fue clasificado como **${domain.label}**, aunque contiene muy poco texto legible (${wordCount} palabras).`;
  }

  // Puntos clave concretos (distinguiendo precios reales vs mediciones/cifras no monetarias)
  const keyPoints: string[] = [];
  for (const s of salient.slice(2, 5)) {
    keyPoints.push(s);
  }
  if (labeledAmounts.length > 0) {
    const topAmounts = [...labeledAmounts].sort((a, b) => b.amount - a.amount).slice(0, 3);
    keyPoints.push(
      `Importes monetarios detectados: ${topAmounts.map((a) => `**${a.label}** (${a.formatted})`).join(', ')}.`,
    );
  } else if (numericMetrics.length > 0) {
    keyPoints.push(
      `Cifras / mediciones clave detectadas (no monetarias): ${numericMetrics
        .slice(0, 4)
        .map((m) => `**${m.label}** (${m.formatted})`)
        .join(', ')}.`,
    );
  }
  if (entities.organizations.length > 0) {
    keyPoints.push(`Organizaciones / empresas mencionadas: **${entities.organizations.slice(0, 4).join('**, **')}**.`);
  }
  if (deadlines.length > 0) {
    keyPoints.push(`Plazos o vigencias clave: ${deadlines[0].slice(0, 140)}.`);
  }
  if (detectedHeadings.length >= 2) {
    keyPoints.push(`Estructura detectada: ${detectedHeadings.slice(0, 5).join(' · ')}.`);
  }
  if (keyPoints.length === 0 && paragraphs.length > 0) {
    paragraphs.slice(0, 3).forEach((p) => keyPoints.push(p.slice(0, 200)));
  }

  return {
    title: candidateTitle,
    domainKey: domain.key,
    domainLabel: domain.label,
    wordCount,
    paragraphCount: paragraphs.length,
    sections: detectedHeadings,
    topThemes: themes,
    executiveSummary,
    keyPoints: keyPoints.slice(0, 6),
    paragraphs,
    sentences,
    keyValuePairs,
    labeledAmounts,
    numericMetrics,
    organizations: entities.organizations,
    people: entities.people,
    emails: entities.emails,
    phones: entities.phones,
    deadlines,
    extractedTables,
  };
}

// =========================================================================
// COMPRENSIÓN SEMÁNTICA DE HOJAS DE CÁLCULO (EXCEL / CSV)
// =========================================================================

export function comprehendSpreadsheet(
  fileName: string,
  sheets: Array<{
    name: string;
    headers: string[];
    rowCount: number;
    rows: Record<string, string | number>[];
    numericColumns: Array<{
      column: string;
      sum: number;
      avg: number;
      min: number;
      max: number;
      nonZeroCount: number;
      isCurrency: boolean;
    }>;
  }>,
  dates: string[],
): DocumentComprehension {
  const primary = sheets[0];
  const totalRows = sheets.reduce((s, sh) => s + sh.rowCount, 0);
  const allHeadersNorm = basicNormalize(sheets.flatMap((s) => s.headers).join(' '));
  const cleanTitle = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const hasAnyCurrency = sheets.some((s) => s.numericColumns.some((c) => c.isCurrency));

  // Inferir propósito del Excel a partir de encabezados y nombre de archivo
  let purpose = hasAnyCurrency ? 'base de datos tabular / reporte financiero' : 'tabla de registros / datos numéricos';
  if (/uuid|rfc|emisor|receptor|cfdi|factura/.test(allHeadersNorm)) {
    purpose = 'relación de comprobantes fiscales (CFDI / facturación)';
  } else if (/empleado|salario|sueldo|nomina|curp|nss|percepcion/.test(allHeadersNorm)) {
    purpose = 'reporte de nómina / recursos humanos';
  } else if (/cuenta|cargo|abono|saldo|banco|movimiento|deposito/.test(allHeadersNorm)) {
    purpose = 'auxiliar contable / movimientos bancarios';
  } else if (/producto|articulo|sku|existencia|inventario|stock|piezas|unidades/.test(allHeadersNorm)) {
    purpose = hasAnyCurrency
      ? 'catálogo de productos / control de inventario valorizado'
      : 'control de inventario / existencias y cantidades';
  } else if (/proveedor|gasto|egreso|compra/.test(allHeadersNorm)) {
    purpose = 'control de compras y gastos por proveedor';
  } else if (/cliente|venta|ingreso|cobranza/.test(allHeadersNorm)) {
    purpose = 'reporte comercial de ventas y cobranza';
  } else if (/presupuesto|partida|cotizacion|proyecto/.test(allHeadersNorm)) {
    purpose = 'presupuesto / desglose de partidas';
  } else if (/temperatura|presion|voltaje|horas|medicion|lectura|sensor/.test(allHeadersNorm)) {
    purpose = 'bitácora técnica de mediciones / lecturas operativas';
  }

  // Detectar columnas categóricas para agrupamiento automático (Group-By)
  const groupBreakdowns: GroupBreakdown[] = [];
  if (primary && primary.rows.length > 0 && primary.numericColumns.length > 0) {
    const metricObj = primary.numericColumns[0];
    const metricCol = metricObj.column;
    const totalMetric = metricObj.sum || 1;

    for (const header of primary.headers) {
      if (header === metricCol) continue;
      const hNorm = basicNormalize(header);
      if (/uuid|folio|fecha|hora|observacion|nota|direccion|correo|telefono/.test(hNorm)) continue;
      const values = primary.rows
        .map((r) => r[header])
        .filter((v) => typeof v === 'string' && v.trim().length >= 2) as string[];
      if (values.length < Math.max(2, primary.rows.length * 0.4)) continue;

      const distinct = new Set(values.map((v) => v.trim()));
      if (distinct.size >= 2 && distinct.size <= Math.min(35, primary.rows.length)) {
        const grouped = new Map<string, { count: number; total: number }>();
        for (const r of primary.rows) {
          const k = String(r[header] ?? '').trim();
          if (!k) continue;
          const val = typeof r[metricCol] === 'number' ? Number(r[metricCol]) : 0;
          const cur = grouped.get(k) || { count: 0, total: 0 };
          cur.count += 1;
          cur.total += val;
          grouped.set(k, cur);
        }
        const topGroups = Array.from(grouped.entries())
          .map(([name, info]) => ({
            name,
            count: info.count,
            total: Number(info.total.toFixed(2)),
            pct: Number(((Math.abs(info.total) / Math.abs(totalMetric)) * 100).toFixed(1)),
          }))
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
          .slice(0, 5);

        groupBreakdowns.push({
          groupColumn: header,
          metricColumn: metricCol,
          isCurrency: metricObj.isCurrency,
          topGroups,
        });
        if (groupBreakdowns.length >= 2) break;
      }
    }
  }

  const topMetric = primary?.numericColumns[0];
  const dateRangeStr =
    dates.length >= 2 ? ` con fechas entre **${dates[0]}** y **${dates[dates.length - 1]}**` : '';

  const executiveSummary = `El archivo **«${cleanTitle}»** es una **${purpose}** compuesta por **${sheets.length} hoja(s)** y **${totalRows} registro(s)**${dateRangeStr}. ${
    primary
      ? `Sus columnas principales son *${primary.headers.slice(0, 6).join(', ')}*${primary.headers.length > 6 ? ` (y ${primary.headers.length - 6} más)` : ''}.`
      : ''
  }${
    topMetric
      ? ` La columna numérica principal (**${topMetric.column}**) suma **${formatMetricValue(topMetric.sum, topMetric.isCurrency, false)}** (promedio de ${formatMetricValue(topMetric.avg, topMetric.isCurrency, false)} y máximo de ${formatMetricValue(topMetric.max, topMetric.isCurrency, false)}).`
      : ''
  }`;

  const keyPoints: string[] = [];
  if (primary) {
    for (const col of primary.numericColumns.slice(0, 3)) {
      keyPoints.push(
        `**${col.column}:** suma total de **${formatMetricValue(col.sum, col.isCurrency, false)}** (mínimo ${formatMetricValue(col.min, col.isCurrency, false)}, máximo ${formatMetricValue(col.max, col.isCurrency, false)}).`,
      );
    }
  }
  if (groupBreakdowns[0]?.topGroups[0]) {
    const gb = groupBreakdowns[0];
    const lead = gb.topGroups[0];
    keyPoints.push(
      `Agrupación por **${gb.groupColumn}:** encabeza **${lead.name}** con **${formatMetricValue(lead.total, gb.isCurrency, false)}** (${lead.pct} % en ${lead.count} registro(s)).`,
    );
  }

  const currencyCols = (primary?.numericColumns || []).filter((c) => c.isCurrency);
  const plainCols = (primary?.numericColumns || []).filter((c) => !c.isCurrency);

  return {
    title: cleanTitle,
    domainKey: 'hoja_calculo_fiscal',
    domainLabel: `Hoja de Cálculo (${purpose})`,
    wordCount: totalRows * (primary?.headers.length || 1),
    paragraphCount: totalRows,
    sections: sheets.map((s) => `${s.name} (${s.rowCount} filas)`),
    topThemes: primary ? primary.headers.slice(0, 6).map((h) => basicNormalize(h)) : [],
    executiveSummary,
    keyPoints,
    paragraphs: [],
    sentences: [],
    keyValuePairs: [],
    labeledAmounts: currencyCols.map((c) => ({
      label: `Suma ${c.column}`,
      amount: c.sum,
      formatted: formatMoney(c.sum, false),
      contextLine: `${c.column}: suma ${formatMoney(c.sum, false)}`,
    })),
    numericMetrics: plainCols.map((c) => ({
      label: `Suma ${c.column}`,
      value: c.sum,
      unit: '',
      formatted: formatPlainNumber(c.sum),
      contextLine: `${c.column}: suma ${formatPlainNumber(c.sum)} (promedio ${formatPlainNumber(c.avg)})`,
    })),
    organizations: [],
    people: [],
    emails: [],
    phones: [],
    deadlines: [],
    groupBreakdowns,
  };
}

// =========================================================================
// MOTOR DE EXPANSIÓN SEMÁNTICA PARA BÚSQUEDA DE PASAJES EN DOCUMENTOS
// =========================================================================

const SEMANTIC_SYNONYM_GROUPS: string[][] = [
  ['precio', 'precios', 'costo', 'costos', 'monto', 'montos', 'importe', 'importes', 'total', 'totales', 'tarifa', 'presupuesto', 'valor', 'inversion', 'cuanto'],
  ['plazo', 'plazos', 'tiempo', 'entrega', 'fecha', 'fechas', 'vigencia', 'vence', 'vencimiento', 'dias', 'calendario', 'cronograma'],
  ['pago', 'pagos', 'anticipo', 'credito', 'contado', 'transferencia', 'banco', 'cuenta', 'clabe', 'deposito', 'liquidacion'],
  ['garantia', 'garantias', 'soporte', 'mantenimiento', 'respaldo', 'cobertura'],
  ['penalizacion', 'penalizaciones', 'multa', 'multas', 'incumplimiento', 'rescision', 'cancelacion', 'terminacion'],
  ['objetivo', 'objetivos', 'alcance', 'proposito', 'finalidad', 'meta', 'metas', 'descripcion'],
  ['requisito', 'requisitos', 'obligacion', 'obligaciones', 'condicion', 'condiciones', 'regla', 'reglas', 'politica'],
  ['conclusion', 'conclusiones', 'acuerdo', 'acuerdos', 'recomendacion', 'recomendaciones', 'resultado', 'resultados'],
  ['contacto', 'correo', 'email', 'telefono', 'celular', 'direccion', 'domicilio', 'ubicacion'],
];

export function expandQueryTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const t of terms) {
    for (const group of SEMANTIC_SYNONYM_GROUPS) {
      if (group.some((g) => fuzzyWordMatch(t, g))) {
        group.forEach((g) => expanded.add(g));
      }
    }
  }
  return Array.from(expanded);
}

export function retrieveBestPassages(
  queryTerms: string[],
  paragraphs: string[],
  sentences: string[],
  keyValuePairs: Array<{ key: string; value: string }>,
): Array<{ text: string; score: number }> {
  const expanded = expandQueryTerms(queryTerms);
  const directSet = new Set(queryTerms);
  const pool = [
    ...keyValuePairs.map((kv) => `${kv.key}: ${kv.value}`),
    ...(sentences.length > 0 ? sentences : paragraphs),
  ];

  const scored: Array<{ text: string; score: number }> = [];
  for (const item of pool) {
    const words = basicNormalize(item).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (words.length === 0) continue;

    let score = 0;
    let directHits = 0;
    for (const qt of expanded) {
      if (words.some((w) => fuzzyWordMatch(qt, w))) {
        if (directSet.has(qt)) {
          score += 4;
          directHits++;
        } else {
          score += 1.8;
        }
      }
    }

    if (score > 0 && (directHits > 0 || score >= 3.5)) {
      scored.push({ text: item.slice(0, 320), score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const unique: Array<{ text: string; score: number }> = [];
  for (const s of scored) {
    if (unique.length >= 6) break;
    if (unique.some((u) => jaccardSimilarity(u.text, s.text) > 0.6)) continue;
    unique.push(s);
  }
  return unique;
}
