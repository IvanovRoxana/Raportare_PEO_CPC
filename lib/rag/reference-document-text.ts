import { extractPdfTextFromBuffer } from './pdf-text.ts';

export function classifyDocxExtractionMessages(messages: Array<{ type?: string; message?: string }>) {
  const warnings = messages.map((message) => message.message || 'Avertisment necunoscut la extragerea DOCX.');
  const blockingMessages = messages.filter((message) => message.type !== 'warning');
  return {
    warnings,
    complete: blockingMessages.length === 0,
    failedSections: blockingMessages.length ? ['document:extraction-errors'] : [],
  };
}

export async function extractReferenceDocumentText(fileName: string, buffer: ArrayBuffer) {
  if (/\.docx$/i.test(fileName)) {
    const { extractRawText } = await import('mammoth');
    const result = await extractRawText({ buffer: Buffer.from(buffer) });
    const classification = classifyDocxExtractionMessages(result.messages);
    return { text: result.value.trim(), pageCount: undefined, ...classification,
      processedSections: ['document'] };
  }
  if (!/\.pdf$/i.test(fileName)) throw new Error('Sunt acceptate doar PDF si DOCX.');
  const result = await extractPdfTextFromBuffer(buffer);
  return { ...result, warnings: [] as string[] };
}
