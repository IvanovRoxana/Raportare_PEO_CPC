'use client';

import { detectSuggestedTitleFromText } from './title-suggestion';
import { createBoundedOcrSession } from './bounded-ocr-session.ts';

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
  complete?: boolean;
};

type PdfJsModule = typeof import('pdfjs-dist');

const MIN_USEFUL_TEXT_LENGTH = 40;
const MAX_OCR_PDF_PAGES = 3;
const MAX_DOCX_OCR_IMAGES = 60;
const MAX_EMBEDDED_OCR_TEXT_CHARS = 20000;
const PDF_OCR_SCALE = 2;
const EMPTY_IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const DOCX_XML_TEXT_FILE_PATTERNS = [
  /^word\/document\.xml$/,
  /^word\/header\d*\.xml$/,
  /^word\/footer\d*\.xml$/,
  /^word\/footnotes\.xml$/,
  /^word\/endnotes\.xml$/,
  /^docProps\/core\.xml$/,
];

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

async function inflateRawZipEntry(data: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') return null;

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeZipText(data: Uint8Array) {
  return new TextDecoder('utf-8').decode(data);
}

function readUint16(data: Uint8Array, offset: number) {
  return data[offset] | (data[offset + 1] << 8);
}

function readUint32(data: Uint8Array, offset: number) {
  return (
    data[offset]
    | (data[offset + 1] << 8)
    | (data[offset + 2] << 16)
    | (data[offset + 3] << 24)
  ) >>> 0;
}

function findZipEndOfCentralDirectory(data: Uint8Array) {
  const minOffset = Math.max(0, data.length - 65557);
  for (let offset = data.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(data, offset) === 0x06054b50) return offset;
  }
  return -1;
}

async function readDocxZipXmlEntries(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const entries: Array<{ path: string; xml: string }> = [];

  const eocdOffset = findZipEndOfCentralDirectory(data);
  if (eocdOffset < 0) return entries;

  const entryCount = readUint16(data, eocdOffset + 10);
  let centralOffset = readUint32(data, eocdOffset + 16);

  for (let entryIndex = 0; entryIndex < entryCount && centralOffset + 46 <= data.length; entryIndex += 1) {
    if (readUint32(data, centralOffset) !== 0x02014b50) break;

    const compressionMethod = readUint16(data, centralOffset + 10);
    const compressedSize = readUint32(data, centralOffset + 20);
    const fileNameLength = readUint16(data, centralOffset + 28);
    const extraLength = readUint16(data, centralOffset + 30);
    const commentLength = readUint16(data, centralOffset + 32);
    const localHeaderOffset = readUint32(data, centralOffset + 42);
    const nameStart = centralOffset + 46;
    const path = decodeZipText(data.slice(nameStart, nameStart + fileNameLength));

    centralOffset = nameStart + fileNameLength + extraLength + commentLength;

    if (!DOCX_XML_TEXT_FILE_PATTERNS.some((pattern) => pattern.test(path))) continue;
    if (localHeaderOffset + 30 > data.length || readUint32(data, localHeaderOffset) !== 0x04034b50) continue;

    const localFileNameLength = readUint16(data, localHeaderOffset + 26);
    const localExtraLength = readUint16(data, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > data.length || compressedSize < 0) break;

    const compressed = data.slice(dataStart, dataEnd);
    let xmlData: Uint8Array | null = null;
    if (compressionMethod === 0) {
      xmlData = compressed;
    } else if (compressionMethod === 8) {
      xmlData = await inflateRawZipEntry(compressed);
    }
    if (xmlData) entries.push({ path, xml: decodeZipText(xmlData) });
  }

  return entries;
}

function xmlToDocxText(xml: string) {
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const textNodes = [
      ...Array.from(parsed.getElementsByTagName('w:t')),
      ...Array.from(parsed.getElementsByTagName('a:t')),
      ...Array.from(parsed.getElementsByTagName('dc:title')),
      ...Array.from(parsed.getElementsByTagName('dc:subject')),
      ...Array.from(parsed.getElementsByTagName('cp:keywords')),
    ];
    const text = textNodes
      .map((node) => node.textContent || '')
      .join(' ');
    return normalizeExtractedText(text) || null;
  }

  const text = xml
    .replace(/<w:tab\s*\/>/g, ' ')
    .replace(/<w:br\s*\/>|<\/w:p>/g, '\n')
    .replace(/<(?:w:t|a:t|dc:title|dc:subject|cp:keywords)[^>]*>([\s\S]*?)<\/(?:w:t|a:t|dc:title|dc:subject|cp:keywords)>/g, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  return normalizeExtractedText(text) || null;
}

async function extractDocxXmlText(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const entries = await readDocxZipXmlEntries(file);
    const text = joinDistinctTextSegments(entries.map((entry) => xmlToDocxText(entry.xml)));
    return { text: text || null, source: text ? 'native' : undefined };
  } catch (error) {
    console.error('Error extracting DOCX XML text:', error);
    return { text: null };
  }
}

function createDocumentOcrSession() {
  return createBoundedOcrSession<import('tesseract.js').ImageLike, import('tesseract.js').Worker>({
    createWorker: async () => (await import('tesseract.js')).createWorker(['ron', 'eng']),
    initializeWorker: async (worker) => worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: (await import('tesseract.js')).PSM.AUTO,
    }),
  });
}

type DocumentOcrSession = ReturnType<typeof createDocumentOcrSession>;

async function recognizeImageText(image: Blob | HTMLCanvasElement, session?: DocumentOcrSession) {
  const activeSession = session ?? createDocumentOcrSession();
  try {
    const result = await activeSession.recognize(image);
    return { ...result, text: normalizeExtractedText(result.text) || null };
  } finally {
    if (!session) await activeSession.close();
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

async function extractPdfPageTextWithOcr(page: PdfPage, options: {
  forceOcr?: boolean;
  session?: DocumentOcrSession;
  onNativeText?: (text: string) => void;
} = {}) {
  const textContent = await page.getTextContent();
  const nativeText = pdfTextItemsToLines(textContent.items);
  if (nativeText) options.onNativeText?.(nativeText);
  if (hasUsefulText(nativeText) && !options.forceOcr) {
    return { text: nativeText, source: 'native' as const, complete: true };
  }

  let ocrResult = { text: null as string | null, complete: false };
  try {
    const canvas = await renderPdfPageToCanvas(page);
    if (canvas) ocrResult = await recognizeImageText(canvas, options.session);
  } catch (error) {
    console.error('Error extracting PDF page OCR text:', error);
  }
  const text = joinDistinctTextSegments([
    nativeText,
    ocrResult.text ? `Text OCR din imagine/pagina scanata: ${ocrResult.text}` : null,
  ]);
  return {
    text: text || null,
    source: ocrResult.text ? 'ocr' as const : nativeText ? 'native' as const : undefined,
    complete: ocrResult.complete && Boolean(text),
  };
}

export async function extractImageTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  try {
    const result = await recognizeImageText(file);
    return { ...result, source: result.text ? 'ocr' : undefined };
  } catch (error) {
    console.error('Error extracting image text with OCR:', error);
    return { text: null, complete: false };
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
  let rawText: string | null = null;
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    rawText = result.value || null;
  } catch (error) {
    console.error('Error extracting DOCX first page text:', error);
  }

  if (hasUsefulText(rawText)) return rawText?.slice(0, 5000) || null;

  const xmlResult = await extractDocxXmlText(file);
  return (xmlResult.text || rawText || null)?.slice(0, 5000) || null;
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

async function extractDocxEmbeddedImageText(file: File, session = createDocumentOcrSession()): Promise<DocumentTextExtractionResult> {
  const imageTexts: string[] = [];
  let imageIndex = 0;
  let processedImageCount = 0;
  let allImagesComplete = true;
  try {
    const mammoth = await session.runTask(() => import('mammoth')) as unknown as MammothWithImages;
    if (!mammoth.images?.imgElement) return { text: null, complete: false };

    const arrayBuffer = await session.runTask(() => file.arrayBuffer());

    const convertImage = mammoth.images.imgElement(async (image) => {
      imageIndex += 1;
      const currentImageIndex = imageIndex;
      if (imageIndex > MAX_DOCX_OCR_IMAGES || session.isStopped()) {
        allImagesComplete = false;
        return { src: EMPTY_IMAGE_DATA_URL };
      }

      try {
        const { base64, blob } = await session.runTask(async () => {
          const base64 = await image.read('base64');
          const response = await fetch(`data:${image.contentType};base64,${base64}`);
          return { base64, blob: await response.blob() };
        });
        const ocrResult = await recognizeImageText(blob, session);
        if (!ocrResult.complete) allImagesComplete = false;
        else processedImageCount += 1;
        if (ocrResult.text) {
          imageTexts.push(`Text OCR imagine DOCX ${currentImageIndex}: ${ocrResult.text}`);
        }
        return { src: `data:${image.contentType};base64,${base64}` };
      } catch (error) {
        allImagesComplete = false;
        console.error('Error extracting DOCX embedded image:', error);
        return { src: EMPTY_IMAGE_DATA_URL };
      }
    });

    await session.runTask(() => mammoth.convertToHtml({ arrayBuffer }, { convertImage }), 120_000);
    if (session.isStopped()) allImagesComplete = false;
  } catch (error) {
    allImagesComplete = false;
    console.error('Error extracting DOCX embedded image text:', error);
  } finally {
    await session.close();
  }
  const summary = imageIndex > 0
    ? `Documentul DOCX contine ${imageIndex} imagine/imagini incorporate; OCR procesat pentru ${processedImageCount} imagine/imagini.`
    : null;
  const fullText = joinDistinctTextSegments([summary, ...imageTexts]);
  const text = fullText.slice(0, MAX_EMBEDDED_OCR_TEXT_CHARS);
  return { text: text || null, source: text ? 'ocr' : undefined,
    complete: allImagesComplete && imageIndex <= MAX_DOCX_OCR_IMAGES && fullText.length <= MAX_EMBEDDED_OCR_TEXT_CHARS };
}

export async function extractDocxTextWithSource(file: File): Promise<DocumentTextExtractionResult> {
  const session = createDocumentOcrSession();
  let rawText: string | null = null;
  let htmlText: string | null = null;
  let xmlResult: DocumentTextExtractionResult = { text: null };
  let embeddedImageText: DocumentTextExtractionResult = { text: null, complete: false };
  try {
    try {
      await session.runTask(async () => {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        await Promise.all([
          mammoth.extractRawText({ arrayBuffer }).then((result) => { rawText = result.value || null; }),
          mammoth.convertToHtml({ arrayBuffer }).then((result) => { htmlText = htmlToText(result.value); }).catch(() => {}),
        ]);
      });
    } catch (error) {
      console.error('Error extracting DOCX native text:', error);
    }
    xmlResult = await session.runTask(() => extractDocxXmlText(file));
    embeddedImageText = await extractDocxEmbeddedImageText(file, session);
  } catch (error) {
    console.error('Error extracting DOCX text:', error);
  } finally {
    await session.close();
  }
  const text = joinDistinctTextSegments([
    rawText,
    htmlText,
    xmlResult.text,
    embeddedImageText.text ? `Text OCR din screenshot-uri/imagini incorporate:\n${embeddedImageText.text}` : null,
  ]);
  return {
    text: text || null,
    source: embeddedImageText.text ? 'ocr' : text ? 'native' : undefined,
    complete: embeddedImageText.complete !== false,
  };
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
  const session = createDocumentOcrSession();
  let loadingTask: ReturnType<PdfJsModule['getDocument']> | undefined;
  let recoveredNativeText: string | null = null;
  try {
    return await session.runTask(async () => {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      if (session.isStopped()) throw new Error('PDF extraction deadline reached.');
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true } as Parameters<PdfJsModule['getDocument']>[0]);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      return extractPdfPageTextWithOcr(page as unknown as PdfPage, {
        session, onNativeText: (text) => { recoveredNativeText = text; },
      });
    });
  } catch (error) {
    console.error('Error extracting PDF first page text:', error);
    return { text: recoveredNativeText, source: recoveredNativeText ? 'native' : undefined, complete: false };
  } finally {
    await Promise.all([
      session.close(),
      ...(loadingTask ? [session.cleanupTask(() => loadingTask!.destroy())] : []),
    ]);
  }
}

export async function extractPdfFirstPageText(file: File): Promise<string | null> {
  return (await extractPdfFirstPageTextWithSource(file)).text;
}

// Extract text from PDF file, with OCR fallback for scanned pages.
export async function extractPdfTextWithSource(file: File, options: { requireComplete?: boolean } = {}): Promise<DocumentTextExtractionResult> {
  const session = createDocumentOcrSession();
  const pageTexts: string[] = [];
  let usedOcr = false;
  let complete = false;
  let loadingTask: ReturnType<PdfJsModule['getDocument']> | undefined;
  try {
    const pdf = await session.runTask(async () => {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      if (session.isStopped()) throw new Error('PDF extraction deadline reached.');
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true } as Parameters<PdfJsModule['getDocument']>[0]);
      return loadingTask.promise;
    });
    complete = pdf.numPages > 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (session.isStopped()) { complete = false; break; }
      let recoveredNativeText: string | null = null;
      try {
        const pageText = await session.runTask(async () => {
          const page = await pdf.getPage(i);
          return extractPdfPageTextWithOcr(page as unknown as PdfPage, {
            forceOcr: options.requireComplete || i <= MAX_OCR_PDF_PAGES,
            session,
            onNativeText: (text) => { recoveredNativeText = text; },
          });
        });
        if (pageText.text) pageTexts.push(pageText.text);
        if (pageText.source === 'ocr') usedOcr = true;
        if (!pageText.text || pageText.complete === false) complete = false;
      } catch (error) {
        complete = false;
        if (recoveredNativeText) pageTexts.push(recoveredNativeText);
        console.error(`Error extracting PDF page ${i}:`, error);
      }
    }

  } catch (error) {
    complete = false;
    console.error('Error extracting PDF text:', error);
  } finally {
    await Promise.all([
      session.close(),
      ...(loadingTask ? [session.cleanupTask(() => loadingTask!.destroy())] : []),
    ]);
  }
  const fullText = pageTexts.join('\n\n').trim();
  return { text: fullText || null, source: fullText ? (usedOcr ? 'ocr' : 'native') : undefined, complete: complete && Boolean(fullText) };
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
