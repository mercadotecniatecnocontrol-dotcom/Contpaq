import JSZip from 'jszip';
import type {
  Cfdi,
  CfdiConcepto,
  CfdiPago,
  CfdiRelacion,
  Empresa,
} from '../types/fiscal';
import { parseCfdiXml } from './xmlParser';
import {
  isSafeZipEntryPath,
  MAX_UPLOAD_FILE_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from './security';

export interface ImportedCfdiBundle {
  cfdi: Cfdi;
  conceptos: CfdiConcepto[];
  relaciones: CfdiRelacion[];
  pagos: CfdiPago[];
}

export interface FileImportEntry {
  file: string;
  status: 'imported' | 'duplicate' | 'rfc_mismatch' | 'error';
  message: string;
}

export interface SuggestedRfcMatch {
  rfc: string;
  razonSocial: string;
  regimen: string;
  count: number;
}

export interface BatchImportSummary {
  totalXmlScanned: number;
  imported: ImportedCfdiBundle[];
  emitidosCount: number;
  recibidosCount: number;
  pagosRepCount: number;
  nominasCount: number;
  cartaPorteCount: number;
  duplicatesCount: number;
  rfcMismatchCount: number;
  errorsCount: number;
  entries: FileImportEntry[];
  suggestedRfc?: SuggestedRfcMatch;
  rawXmlTexts: Array<{ name: string; xml: string }>;
}

export async function extractXmlTextsFromFiles(
  files: File[],
): Promise<Array<{ name: string; xml: string }>> {
  const xmlEntries: Array<{ name: string; xml: string }> = [];
  let totalUncompressed = 0;

  for (const file of files) {
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`El archivo ${file.name} excede el límite seguro de 25 MB.`);
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xml')) {
      const text = await file.text();
      totalUncompressed += text.length;
      if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error('El volumen total de XML excede el límite seguro de 50 MB.');
      }
      xmlEntries.push({ name: file.name, xml: text });
    } else if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const validEntries: Array<{ relativePath: string; entry: JSZip.JSZipObject }> = [];

      zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        if (!isSafeZipEntryPath(relativePath)) return; // Protección anti Zip Slip
        const cleanPath = relativePath.toLowerCase();
        if (cleanPath.includes('__macosx/') || cleanPath.startsWith('.')) return;
        if (!cleanPath.endsWith('.xml')) return;
        validEntries.push({ relativePath, entry });
      });

      if (validEntries.length > MAX_ZIP_ENTRIES) {
        throw new Error(`El paquete ZIP supera el máximo seguro de ${MAX_ZIP_ENTRIES} archivos XML.`);
      }

      for (const item of validEntries) {
        const text = await item.entry.async('string');
        totalUncompressed += text.length;
        if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new Error('El contenido descomprimido del ZIP excede el límite seguro de 50 MB.');
        }
        xmlEntries.push({ name: `${file.name}/${item.relativePath}`, xml: text });
      }
    }
  }

  return xmlEntries;
}

export async function processXmlBatchForEmpresa(
  xmlEntries: Array<{ name: string; xml: string }>,
  empresa: Empresa,
  existingUuidsSeed: Set<string>,
  onProgress?: (processed: number, total: number) => void,
): Promise<BatchImportSummary> {
  const existing = new Set(existingUuidsSeed);
  const imported: ImportedCfdiBundle[] = [];
  const entries: FileImportEntry[] = [];

  let emitidosCount = 0;
  let recibidosCount = 0;
  let pagosRepCount = 0;
  let nominasCount = 0;
  let cartaPorteCount = 0;
  let duplicatesCount = 0;
  let rfcMismatchCount = 0;
  let errorsCount = 0;

  // Frecuencia de RFCs cuando hay mismatch para detectar automáticamente el RFC real del ZIP
  const mismatchRfcFreq = new Map<string, { nombre: string; regimen: string; count: number }>();

  const total = xmlEntries.length;
  const CHUNK_SIZE = 40;

  for (let i = 0; i < total; i++) {
    const item = xmlEntries[i];
    const parsed = parseCfdiXml(item.xml, empresa, existing);

    if (parsed.ok && parsed.cfdi) {
      existing.add(parsed.cfdi.uuid);
      const pagosList = parsed.pagos || [];
      imported.push({
        cfdi: parsed.cfdi,
        conceptos: parsed.conceptos || [],
        relaciones: parsed.relaciones || [],
        pagos: pagosList,
      });

      if (parsed.cfdi.direccion === 'E') emitidosCount++;
      else recibidosCount++;
      if (parsed.cfdi.tipo === 'P') pagosRepCount++;
      if (parsed.cfdi.tipo === 'N' || parsed.cfdi.nomina_info) nominasCount++;
      if (parsed.cfdi.carta_porte_info) cartaPorteCount++;

      const extras = [
        pagosList.length > 0 ? `${pagosList.length} docto(s) REP` : '',
        parsed.cfdi.nomina_info ? 'Nómina 1.2' : '',
        parsed.cfdi.carta_porte_info ? `Carta Porte ${parsed.cfdi.carta_porte_info.version}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      entries.push({
        file: item.name,
        status: 'imported',
        message: `${parsed.cfdi.direccion === 'E' ? 'Emitido' : 'Recibido'} (${parsed.cfdi.tipo}) · ${parsed.cfdi.serie}-${parsed.cfdi.folio}${extras ? ` · ${extras}` : ''}`,
      });
    } else if (parsed.errorCode === 'duplicate') {
      duplicatesCount++;
      entries.push({
        file: item.name,
        status: 'duplicate',
        message: parsed.error || 'UUID duplicado',
      });
    } else if (parsed.errorCode === 'rfc_mismatch') {
      rfcMismatchCount++;
      if (parsed.detectedRfcs) {
        const parties = [
          {
            rfc: parsed.detectedRfcs.emisor,
            nombre: parsed.detectedRfcs.emisorNombre,
            regimen: parsed.detectedRfcs.emisorRegimen,
          },
          {
            rfc: parsed.detectedRfcs.receptor,
            nombre: parsed.detectedRfcs.receptorNombre,
            regimen: parsed.detectedRfcs.receptorRegimen,
          },
        ];
        for (const p of parties) {
          if (!p.rfc || p.rfc === 'XAXX010101000' || p.rfc === 'XEXX010101000') continue;
          const prev = mismatchRfcFreq.get(p.rfc);
          mismatchRfcFreq.set(p.rfc, {
            nombre: prev?.nombre || p.nombre,
            regimen: prev?.regimen || p.regimen,
            count: (prev?.count || 0) + 1,
          });
        }
      }
      entries.push({
        file: item.name,
        status: 'rfc_mismatch',
        message: parsed.error || 'RFC no coincide con la empresa activa',
      });
    } else {
      errorsCount++;
      entries.push({
        file: item.name,
        status: 'error',
        message: parsed.error || 'Archivo XML no válido',
      });
    }

    if (onProgress && (i % CHUNK_SIZE === 0 || i === total - 1)) {
      onProgress(i + 1, total);
      // Ceder el hilo para mantener 60fps en archivos grandes
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  let suggestedRfc: SuggestedRfcMatch | undefined;
  if (rfcMismatchCount > 0 && mismatchRfcFreq.size > 0) {
    const sorted = Array.from(mismatchRfcFreq.entries()).sort((a, b) => b[1].count - a[1].count);
    const [topRfc, info] = sorted[0];
    if (info.count >= Math.max(1, Math.ceil(rfcMismatchCount * 0.5))) {
      suggestedRfc = {
        rfc: topRfc,
        razonSocial: info.nombre,
        regimen: info.regimen || '601',
        count: info.count,
      };
    }
  }

  return {
    totalXmlScanned: total,
    imported,
    emitidosCount,
    recibidosCount,
    pagosRepCount,
    nominasCount,
    cartaPorteCount,
    duplicatesCount,
    rfcMismatchCount,
    errorsCount,
    entries,
    suggestedRfc,
    rawXmlTexts: xmlEntries,
  };
}
