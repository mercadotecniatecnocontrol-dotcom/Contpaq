import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { Cfdi, CfdiConcepto } from '../types/fiscal';
import { sanitizeExcelCell, sanitizeFileName } from './security';

export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  fileName: string,
  sheetName = 'Datos',
): void {
  const rawRows: Record<string, unknown>[] =
    rows.length > 0 ? rows : [{ Aviso: 'Sin registros con los filtros actuales' }];
  // Neutralizar Excel / CSV Formula Injection (=, +, -, @) en cada celda exportada
  const safeRows: Record<string, unknown>[] = rawRows.map((row) => {
    const cleanRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      cleanRow[k] = sanitizeExcelCell(v);
    }
    return cleanRow;
  });
  const worksheet = XLSX.utils.json_to_sheet(safeRows);

  const keys = Object.keys(safeRows[0]);
  worksheet['!cols'] = keys.map((k) => {
    const maxLen = Math.max(
      k.length,
      ...safeRows.slice(0, 100).map((r) => String(r[k] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const safeBase = sanitizeFileName(fileName);
  const cleanName = safeBase.endsWith('.xlsx') ? safeBase : `${safeBase}.xlsx`;
  XLSX.writeFile(workbook, cleanName);
}

export function buildCfdiXmlString(cfdi: Cfdi, conceptos: CfdiConcepto[]): string {
  const escapeXml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const conceptosXml =
    conceptos.length > 0
      ? conceptos
          .map(
            (c) => `    <cfdi:Concepto ClaveProdServ="${escapeXml(c.clave_prod_serv)}" Cantidad="${c.cantidad}" ClaveUnidad="${escapeXml(c.unidad)}" Descripcion="${escapeXml(c.descripcion)}" ValorUnitario="${c.valor_unitario.toFixed(2)}" Importe="${c.importe.toFixed(2)}" ObjetoImp="${c.objeto_imp}" />`,
          )
          .join('\n')
      : `    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicios administrativos y de ingeniería" ValorUnitario="${cfdi.subtotal.toFixed(2)}" Importe="${cfdi.subtotal.toFixed(2)}" ObjetoImp="02" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="${cfdi.version}" Serie="${escapeXml(cfdi.serie)}" Folio="${escapeXml(cfdi.folio)}" Fecha="${cfdi.fecha_emision}" FormaPago="${cfdi.forma_pago}" SubTotal="${cfdi.subtotal.toFixed(2)}" Descuento="${cfdi.descuento.toFixed(2)}" Moneda="${cfdi.moneda}" TipoCambio="${cfdi.tipo_cambio}" Total="${cfdi.total.toFixed(2)}" TipoDeComprobante="${cfdi.tipo}" MetodoPago="${cfdi.metodo_pago}">
  <cfdi:Emisor Rfc="${escapeXml(cfdi.rfc_emisor)}" Nombre="${escapeXml(cfdi.nombre_emisor)}" RegimenFiscal="${escapeXml(cfdi.regimen_emisor)}" />
  <cfdi:Receptor Rfc="${escapeXml(cfdi.rfc_receptor)}" Nombre="${escapeXml(cfdi.nombre_receptor)}" RegimenFiscalReceptor="${escapeXml(cfdi.regimen_receptor)}" UsoCFDI="${escapeXml(cfdi.uso_cfdi)}" />
  <cfdi:Conceptos>
${conceptosXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${cfdi.iva_trasladado.toFixed(2)}" TotalImpuestosRetenidos="${(cfdi.iva_retenido + cfdi.isr_retenido).toFixed(2)}" />
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${cfdi.uuid}" FechaTimbrado="${cfdi.fecha_timbrado}" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export function downloadSingleCfdiXml(cfdi: Cfdi, conceptos: CfdiConcepto[]): void {
  const xml = buildCfdiXmlString(cfdi, conceptos);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cfdi.uuid}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

// Genera un archivo .zip real con cada CFDI en su archivo <UUID>.xml
export async function downloadMultipleCfdisBundle(
  cfdis: Cfdi[],
  allConceptos: CfdiConcepto[],
  bundleName: string,
): Promise<void> {
  const zip = new JSZip();
  for (const c of cfdis) {
    const cConceptos = allConceptos.filter((item) => item.uuid === c.uuid);
    const folder = c.direccion === 'E' ? 'emitidos' : 'recibidos';
    zip.file(`${folder}/${c.uuid}.xml`, buildCfdiXmlString(c, cConceptos));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bundleName.endsWith('.zip') ? bundleName : `${bundleName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
