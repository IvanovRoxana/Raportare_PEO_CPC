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

type PdfJsModule = typeof import('pdfjs-dist');

const MIN_USEFUL_TEXT_LENGTH = 40;
const MAX_OCR_PDF_PAGES = 3;
const MAX_DOCX_OCR_IMAGES = 60;
const MAX_EMBEDDED_OCR_TEXT_CHARS = 20000;
const PDF_OCR_SCALE = 2;
const EMPTY_IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs() {
  pdfJsModulePromise ??= import('pdfjs-dist').then((pdfjsLib) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();
    return pdfjsLib;
  });

  return pdfJsModulePromise;
}

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

function joinDistinctTextSegments(segments: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return segments
    .map((segment) => (segment || '').trim())
    .filter(Boolean)
    .filter((segment) => {
      const key = normalizeExtractedText(segment).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n\n')
    .trim();
}

function htmlToText(html: string | null | undefined) {
  if (!html) return null;

  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return normalizeExtractedText(parsed.body?.textContent || '') || null;
  }

  return normalizeExtractedText(html.replace(/<[^>]+>/g, ' ')) || null;
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

async function recognizeBlobText(blob: Blob) {
  const worker = await createOcrWorker();
  try {
    const result = await worker.recognize(blob);
    return normalizeExtractedText(result.data.text) || null;
  } catch (error) {
    console.error('Error running image OCR:', error);
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

async function extractPdfPageTextWithOcr(page: PdfPage, options: { forceOcr?: boolean } = {}) {
  const textContent = await page.getTextContent();
  const nativeText = pdfTextItemsToLines(textContent.items);
  if (hasUsefulText(nativeText) && !options.forceOcr) {
    return { text: nativeText, source: 'native' as const };
  }

  const canvas = await renderPdfPageToCanvas(page);
  const ocrText = canvas ? await recognizeCanvasText(canvas) : null;
  if (ocrText) {
    return {
      text: joinDistinctTextSegments([nativeText, `Text OCR din imagine/pagina scanata: ${ocrText}`]),
      source: 'ocr' as const,
    };
  }

  return {
    text: nativeText || null,
    source: nativeText ? 'native' as const : undefined,
  };
}

async function extractPdfPageTextWithOcrFallback(page: PdfPage) {
  return extractPdfPageTextWithOcr(page);
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
  return (await extractDocxTextWithSource(file)).text;
}

export async function extractHtmlTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const html = await file.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('script, style, noscript, svg').forEach((node) => node.remove());
    const text = normalizeExtractedText(parsed.body?.textContent || parsed.documentElement.textContent || html);
    return { text: text || null, source: text ? 'native' : undefined };
  } catch (error) {
    console.error('Error extracting HTML text:', error);
    return { text: null };
  }
}

export async function extractXlsxTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const xlsx = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: 'array' });
    const sheetTexts = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return [];
      const csv = xlsx.utils.sheet_to_csv(sheet, { FS: ' ', RS: '\n', blankrows: false });
      return csv.trim() ? [`[${sheetName}]\n${csv}`] : [];
    });
    const text = joinDistinctTextSegments(sheetTexts);
    return { text: text || null, source: text ? 'native' : undefined };
  } catch (error) {
    console.error('Error extracting XLSX text:', error);
    return { text: null };
  }
}

type MammothImage = {
  contentType: string;
  read: (encoding: 'base64') => Promise<string>;
};

type MammothWithImages = {
  convertToHtml: (
    input: { arrayBuffer: ArrayBuffer },
    options?: { convertImage?: unknown },
  ) => Promise<unknown>;
  images?: {
    imgElement: (
      converter: (image: MammothImage) => Promise<{ src: string }>,
    ) => unknown;
  };
};

async function extractDocxEmbeddedImageText(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const mammoth = await import('mammoth') as unknown as MammothWithImages;
    if (!mammoth.images?.imgElement) return { text: null };

    const arrayBuffer = await file.arrayBuffer();
    const imageTexts: string[] = [];
    let imageIndex = 0;
    let processedImageCount = 0;

    const convertImage = mammoth.images.imgElement(async (image) => {
      imageIndex += 1;
      if (imageIndex > MAX_DOCX_OCR_IMAGES) return { src: EMPTY_IMAGE_DATA_URL };

      processedImageCount += 1;
      const base64 = await image.read('base64');
      const response = await fetch(`data:${image.contentType};base64,${base64}`);
      const blob = await response.blob();
      const ocrText = await recognizeBlobText(blob);
      if (ocrText) {
        imageTexts.push(`Text OCR imagine DOCX ${imageIndex}: ${ocrText}`);
      }
      return { src: `data:${image.contentType};base64,${base64}` };
    });

    await mammoth.convertToHtml({ arrayBuffer }, { convertImage });

    const summary = imageIndex > 0
      ? `Documentul DOCX contine ${imageIndex} imagine/imagini incorporate; OCR procesat pentru ${processedImageCount} imagine/imagini.`
      : null;
    const text = joinDistinctTextSegments([summary, ...imageTexts]).slice(0, MAX_EMBEDDED_OCR_TEXT_CHARS);
    return { text: text || null, source: text ? 'ocr' : undefined };
  } catch (error) {
    console.error('Error extracting DOCX embedded image text:', error);
    return { text: null };
  }
}

export async function extractDocxTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const [rawResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer }),
      mammoth.convertToHtml({ arrayBuffer }).catch(() => ({ value: '' })),
    ]);
    const embeddedImageText = await extractDocxEmbeddedImageText(file);
    const text = joinDistinctTextSegments([
      rawResult.value,
      htmlToText(htmlResult.value),
      embeddedImageText.text ? `Text OCR din screenshot-uri/imagini incorporate:\n${embeddedImageText.text}` : null,
    ]);
    return {
      text: text || null,
      source: embeddedImageText.text ? 'ocr' : text ? 'native' : undefined,
    };
  } catch (error) {
    console.error('Error extracting DOCX text:', error);
    return { text: null };
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
    const pdfjsLib = await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
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

// Extract text from PDF file, with OCR fallback for scanned pages.
export async function extractPdfTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const pdfjsLib = await loadPdfJs();
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    
    const pageTexts: string[] = [];
    let usedOcr = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const pageText = i <= MAX_OCR_PDF_PAGES
        ? await extractPdfPageTextWithOcr(page as unknown as PdfPage, { forceOcr: true })
        : await extractPdfPageTextWithOcrFallback(page as unknown as PdfPage);
      if (pageText.text) pageTexts.push(pageText.text);
      if (pageText.source === 'ocr') usedOcr = true;
    }

    const fullText = pageTexts.join('\n\n').trim();
    if (hasUsefulText(fullText)) {
      return { text: fullText, source: usedOcr ? 'ocr' : 'native' };
    }
    
    return { text: fullText || null, source: fullText ? (usedOcr ? 'ocr' : 'native') : undefined };
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    return { text: null };
  }
}

export async function extractPdfText(file: File): Promise<string | null> {
  return (await extractPdfTextWithSource(file)).text;
}

export interface DocxImageAttachment {
  dataUrl: string;
  filename?: string;
  altText?: string;
}

export interface GenerateDocxOptions {
  images?: DocxImageAttachment[];
}

function parseDocxImage(dataUrl: string): { data: Uint8Array; type: 'jpg' | 'png' | 'gif' | 'bmp' } | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|gif|bmp));base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const binary = atob(match[2]);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    data[i] = binary.charCodeAt(i);
  }

  return {
    data,
    type: mimeType.includes('png')
      ? 'png'
      : mimeType.includes('gif')
        ? 'gif'
        : mimeType.includes('bmp')
          ? 'bmp'
          : 'jpg',
  };
}

// Generate DOCX file from title and content
export async function generateDocx(title: string, content: string, options: GenerateDocxOptions = {}): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import('docx');
  const imageParagraphs = (options.images || []).flatMap((image, index) => {
    const parsed = parseDocxImage(image.dataUrl);
    if (!parsed) return [];

    return [
      new Paragraph({
        children: [new TextRun({ text: image.filename || `Fotografie eveniment ${index + 1}`, bold: true })],
      }),
      new Paragraph({
        children: [
          new ImageRun({
            data: parsed.data,
            type: parsed.type,
            transformation: {
              width: 520,
              height: 360,
            },
            altText: {
              title: image.altText || image.filename || `Fotografie eveniment ${index + 1}`,
              description: image.altText || image.filename || `Fotografie eveniment ${index + 1}`,
              name: image.filename || `fotografie-eveniment-${index + 1}`,
            },
          }),
        ],
      }),
      new Paragraph({ children: [new TextRun('')] }),
    ];
  });
  
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
        ...(imageParagraphs.length > 0
          ? [
              new Paragraph({
                children: [new TextRun('')],
              }),
              new Paragraph({
                text: 'Anexe foto eveniment',
                heading: HeadingLevel.HEADING_2,
              }),
              ...imageParagraphs,
            ]
          : []),
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
