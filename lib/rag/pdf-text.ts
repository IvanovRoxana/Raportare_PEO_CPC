export interface ExtractPdfTextResult {
  text: string;
  pageCount: number;
}

export function joinPdfTextItems(items: unknown[]) {
  // PDF.js already emits spaces and line boundaries; adding spaces splits font-run words.
  return items.map((item) => {
    if (!item || typeof item !== 'object' || !('str' in item)) return '';
    const textItem = item as { str?: unknown; hasEOL?: boolean };
    return String(textItem.str || '') + (textItem.hasEOL ? '\n' : '');
  }).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfTextFromBuffer(buffer: ArrayBuffer): Promise<ExtractPdfTextResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = joinPdfTextItems(content.items);
      if (pageText) pages.push(pageText);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return {
    text: pages.join('\n\n').trim(),
    pageCount,
  };
}
