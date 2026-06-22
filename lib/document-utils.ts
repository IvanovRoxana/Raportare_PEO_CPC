'use client';

import { detectSuggestedTitleFromText } from './title-suggestion';

type PdfTextItem = {
  str: string;
  transform?: number[];
};

type PdfViewport = {
  width: number;
  height: number;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  render: (options: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: PdfViewport }) => { promise: Promise<void> };
};

export type DocumentTextExtractionSource = 'native' | 'ocr';

export type DocumentTextExtractionResult = {
  text: string | null;
  source?: DocumentTextExtractionSource;
};

const MIN_USEFUL_TEXT_LENGTH = 40;
const MAX_OCR_PDF_PAGES = 3;
const PDF_OCR_SCALE = 2;

function pdfTextItemsToLines(items: PdfTextItem[]) {
  const rows = new Map<number, string[]>();

  items.forEach((item) => {
    const y = Math.round(item.transform?.[5] ?? 0);
    const value = (item.str || '').trim();
    if (!value) return;
    rows.set(y, [...(rows.get(y) ?? []), value]);
  });

  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, values]) => values.join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeExtractedText(text: string | null | undefined) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function hasUsefulText(text: string | null | undefined) {
  return normalizeExtractedText(text).length >= MIN_USEFUL_TEXT_LENGTH;
}

async function createOcrWorker() {
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker(['ron', 'eng']);
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
  });
  return worker;
}

async function recognizeCanvasText(canvas: HTMLCanvasElement) {
  const worker = await createOcrWorker();
  try {
    const result = await worker.recognize(canvas);
    return normalizeExtractedText(result.data.text) || null;
  } catch (error) {
    console.error('Error running OCR:', error);
    return null;
  } finally {
    await worker.terminate();
  }
}

async function renderPdfPageToCanvas(page: PdfPage) {
  if (typeof document === 'undefined') return null;

  const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) return null;

  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return canvas;
}

async function extractPdfPageTextWithOcrFallback(page: PdfPage) {
  const textContent = await page.getTextContent();
  const nativeText = pdfTextItemsToLines(textContent.items);
  if (hasUsefulText(nativeText)) {
    return { text: nativeText, source: 'native' as const };
  }

  const canvas = await renderPdfPageToCanvas(page);
  const ocrText = canvas ? await recognizeCanvasText(canvas) : null;
  if (ocrText) {
    return { text: ocrText, source: 'ocr' as const };
  }

  return {
    text: nativeText || null,
    source: nativeText ? 'native' as const : undefined,
  };
}

export async function extractImageTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const worker = await createOcrWorker();
    try {
      const result = await worker.recognize(file);
      const text = normalizeExtractedText(result.data.text) || null;
      return { text, source: text ? 'ocr' : undefined };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error('Error extracting image text with OCR:', error);
    return { text: null };
  }
}

export async function extractImageText(file: File): Promise<string | null> {
  return (await extractImageTextWithSource(file)).text;
}

// Extract title from DOCX file (first line or heading)
export async function extractDocxTitle(file: File): Promise<string | null> {
  try {
    const text = await extractDocxFirstPageText(file);
    return detectSuggestedTitleFromText(text);
  } catch (error) {
    console.error('Error extracting DOCX title:', error);
    return null;
  }
}

// Extract the technical first page / beginning from DOCX.
export async function extractDocxFirstPageText(file: File): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.slice(0, 5000);
  } catch (error) {
    console.error('Error extracting DOCX first page text:', error);
    return null;
  }
}

// Extract full text from DOCX file
export async function extractDocxText(file: File): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('Error extracting DOCX text:', error);
    return null;
  }
}

// Extract title from PDF file
export async function extractPdfTitle(file: File): Promise<string | null> {
  try {
    const text = await extractPdfFirstPageText(file);
    return detectSuggestedTitleFromText(text);
  } catch (error) {
    console.error('Error extracting PDF title:', error);
    return null;
  }
}

// Extract text from the first PDF page only.
export async function extractPdfFirstPageTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    return extractPdfPageTextWithOcrFallback(page as unknown as PdfPage);
  } catch (error) {
    console.error('Error extracting PDF first page text:', error);
    return { text: null };
  }
}

export async function extractPdfFirstPageText(file: File): Promise<string | null> {
  return (await extractPdfFirstPageTextWithSource(file)).text;
}

// Extract text from PDF file
export async function extractPdfText(file: File): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = pdfTextItemsToLines(textContent.items as PdfTextItem[]);
      fullText += pageText + '\n';
    }

    if (hasUsefulText(fullText)) {
      return fullText.trim();
    }

    const ocrPageCount = Math.min(pdf.numPages, MAX_OCR_PDF_PAGES);
    const ocrPages: string[] = [];
    for (let i = 1; i <= ocrPageCount; i++) {
      const page = await pdf.getPage(i);
      const pageText = await extractPdfPageTextWithOcrFallback(page as unknown as PdfPage);
      if (pageText.text) ocrPages.push(pageText.text);
    }

    if (ocrPages.length > 0) {
      return ocrPages.join('\n\n').trim();
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    return null;
  }
}

// Generate DOCX file from title and content
export async function generateDocx(title: string, content: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [new TextRun('')],
        }),
        ...content.split('\n').map(line => 
          new Paragraph({
            children: [new TextRun(line)],
          })
        ),
      ],
    }],
  });
  
  return await Packer.toBlob(doc);
}

// Download a blob as file
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Check if file is an image
export function isImageFile(filename: string): boolean {
  return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename);
}

// Check if file is a document
export function isDocumentFile(filename: string): boolean {
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i.test(filename);
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
