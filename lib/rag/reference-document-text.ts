import { extractPdfTextFromBuffer } from './pdf-text.ts';

export async function extractReferenceDocumentText(fileName: string, buffer: ArrayBuffer) {
  if (/\.docx$/i.test(fileName)) {
    const { extractRawText } = await import('mammoth');
    const result = await extractRawText({ buffer: Buffer.from(buffer) });
    return { text: result.value.trim(), pageCount: undefined, warnings: result.messages.map((message) => message.message) };
  }
  if (!/\.pdf$/i.test(fileName)) throw new Error('Sunt acceptate doar PDF si DOCX.');
  const result = await extractPdfTextFromBuffer(buffer);
  return { ...result, warnings: [] as string[] };
}
