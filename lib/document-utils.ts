'use client';

// Extract title from DOCX file (first line or heading)
export async function extractDocxTitle(file: File): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    // Get first non-empty line as title
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      // Take first line, max 200 chars
      return lines[0].substring(0, 200);
    }
    return null;
  } catch (error) {
    console.error('Error extracting DOCX title:', error);
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
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker path
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    // Try to get title from metadata
    const metadata = await pdf.getMetadata();
    if (metadata.info && (metadata.info as Record<string, unknown>).Title) {
      return String((metadata.info as Record<string, unknown>).Title);
    }
    
    // Otherwise get first page text
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(' ')
      .trim();
    
    // Get first line
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length > 5) {
      return firstLine.substring(0, 200);
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting PDF title:', error);
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
      const pageText = textContent.items
        .map((item: unknown) => (item as { str: string }).str)
        .join(' ');
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
