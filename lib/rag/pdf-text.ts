export interface ExtractPdfTextResult {
  text: string;
  pageCount: number;
}

export async function extractPdfTextFromBuffer(buffer: ArrayBuffer): Promise<ExtractPdfTextResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: unknown) => {
          if (item && typeof item === 'object' && 'str' in item) {
            return String((item as { str?: unknown }).str || '');
          }
          return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) pages.push(pageText);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return {
    text: pages.join('\n\n').trim(),
    pageCount: pdf.numPages,
  };
}
