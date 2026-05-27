'use client';

import { extractDocxText, extractPdfText } from '@/lib/document-utils';
import type { TextExtractionStatus } from './types.ts';

export type ExtractedDocumentText = {
  text: string;
  status: TextExtractionStatus;
  ocrUsed: boolean;
  warnings: string[];
};

async function extractSpreadsheetText(file: File) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return [`# ${sheetName}`, XLSX.utils.sheet_to_csv(sheet)].join('\n');
  }).join('\n\n');
}

async function runPdfOcr(file: File, maxPages = 2) {
  const pdfjsLib = await import('pdfjs-dist');
  const Tesseract = await import('tesseract.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageLimit = Math.min(pdf.numPages, maxPages);
  const parts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const result = await Tesseract.recognize(canvas, 'ron+eng');
    parts.push(result.data.text);
  }

  return parts.join('\n').trim();
}

export async function extractTextWithOcrFallback(file: File): Promise<ExtractedDocumentText> {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const warnings: string[] = [];

  try {
    if (extension === 'pdf' || file.type.includes('pdf')) {
      const text = (await extractPdfText(file)) ?? '';
      if (text.trim().length >= 80) {
        return { text, status: 'text_extracted', ocrUsed: false, warnings };
      }

      warnings.push('PDF fără text extractibil suficient; s-a rulat OCR pe primele pagini.');
      const ocrText = await runPdfOcr(file);
      return {
        text: ocrText || text,
        status: ocrText ? 'ocr_extracted' : 'failed',
        ocrUsed: true,
        warnings: ocrText ? warnings : [...warnings, 'OCR nu a returnat text utilizabil.'],
      };
    }

    if (extension === 'docx' || file.type.includes('wordprocessingml')) {
      return { text: (await extractDocxText(file)) ?? '', status: 'text_extracted', ocrUsed: false, warnings };
    }

    if (['xls', 'xlsx', 'csv'].includes(extension) || file.type.includes('spreadsheet') || file.type.includes('excel')) {
      return { text: await extractSpreadsheetText(file), status: 'text_extracted', ocrUsed: false, warnings };
    }

    if (file.type.startsWith('text/') || ['txt', 'md'].includes(extension)) {
      return { text: await file.text(), status: 'text_extracted', ocrUsed: false, warnings };
    }

    return { text: '', status: 'failed', ocrUsed: false, warnings: ['Tip de fișier fără extractor configurat.'] };
  } catch (error) {
    return {
      text: '',
      status: 'failed',
      ocrUsed: false,
      warnings: [error instanceof Error ? error.message : 'Eroare necunoscută la extragerea textului.'],
    };
  }
}
