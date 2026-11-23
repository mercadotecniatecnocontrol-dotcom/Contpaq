// Extractor real de texto de documentos PDF en navegador mediante pdfjs-dist (lazy-loaded)
// Funciona tanto en Vite dev como en build de producción / GitHub Pages (base: './')

export interface PdfExtractionResult {
  text: string;
  pages: string[];
  pageCount: number;
  isScannedLikely: boolean;
}

let workerConfigured = false;

export async function extractPdfTextFromBuffer(
  buffer: ArrayBuffer,
): Promise<PdfExtractionResult> {
  const pdfjsLib = await import('pdfjs-dist');

  if (!workerConfigured && typeof window !== 'undefined') {
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
      workerConfigured = true;
    } catch {
      // Respaldo: intentar ruta estática relativa si el entorno no soporta ?url
      pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
      workerConfigured = true;
    }
  }

  const data = new Uint8Array(buffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Agrupar fragmentos de texto respetando saltos de línea según coordenada vertical Y
    const lineBuckets: Array<{
      y: number;
      parts: Array<{ x: number; width: number; str: string }>;
    }> = [];

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str || '';
      if (!str.trim()) continue;
      const x = Array.isArray(item.transform) ? Number(item.transform[4] || 0) : 0;
      const y = Array.isArray(item.transform) ? Number(item.transform[5] || 0) : 0;
      const width = 'width' in item ? Number(item.width || 0) : 0;

      const existing = lineBuckets.find((b) => Math.abs(b.y - y) <= 3.5);
      if (existing) {
        existing.parts.push({ x, width, str });
      } else {
        lineBuckets.push({ y, parts: [{ x, width, str }] });
      }
    }

    lineBuckets.sort((a, b) => b.y - a.y);
    const pageLines = lineBuckets
      .map((b) => {
        const sorted = b.parts.sort((p1, p2) => p1.x - p2.x);
        let line = '';
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i];
          if (i > 0) {
            const prev = sorted[i - 1];
            const gap = cur.x - (prev.x + prev.width);
            // Insertar espacio cuando hay separación real entre palabras/columnas
            if (gap > 2 && !line.endsWith(' ') && !cur.str.startsWith(' ')) {
              line += gap > 22 ? '  ' : ' ';
            }
          }
          line += cur.str;
        }
        return line.replace(/[ \t]+/g, ' ').trim();
      })
      .filter(Boolean);

    pages.push(pageLines.join('\n'));
  }

  const fullText = pages.join('\n\n').trim();
  const isScannedLikely = fullText.replace(/\s+/g, '').length < 25;

  return {
    text: fullText,
    pages,
    pageCount: pdf.numPages,
    isScannedLikely,
  };
}
