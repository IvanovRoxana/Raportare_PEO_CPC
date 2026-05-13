'use client';

import { detectSuggestedTitleFromText } from './title-suggestion';

type PdfTextItem = {
  str: string;
  transform?: number[];
};

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
export async function extractPdfFirstPageText(file: File): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    return pdfTextItemsToLines(textContent.items as PdfTextItem[]);
  } catch (error) {
    console.error('Error extracting PDF first page text:', error);
    return null;
  }
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
