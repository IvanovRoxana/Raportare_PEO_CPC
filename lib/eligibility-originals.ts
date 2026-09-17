import 'server-only';
import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import outputs from '../amplify_outputs.json';
import { extractReferenceDocumentText } from './rag/reference-document-text.ts';
import type { Deliverable } from './types.ts';
import type { DocumentDiagnosticContext } from './eligibility-document-diagnostics.ts';

const client = new S3Client({ region: outputs.auth.aws_region, maxAttempts: 2 });
const bucket = outputs.storage.bucket_name;
const MAX_BYTES = 15 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function archiveRagOriginal(fileName: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Originalul trebuie sa aiba intre 1 byte si 15 MB.');
  const originalFileHash = hash(bytes);
  const extension = fileName.match(/\.[a-z0-9]{1,8}$/i)?.[0]?.toLowerCase() || '.bin';
  const s3Key = `rag-originals/${originalFileHash}${extension}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: bytes, IfNoneMatch: '*', ContentType: 'application/octet-stream' }));
  } catch (error) {
    if (!(error instanceof Error) || !['PreconditionFailed', 'ConditionalRequestConflict'].includes(error.name)) throw error;
    // An existing content-addressed object is reusable only if its bytes agree.
    const previous = await client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
    if (!previous.Body || hash(await previous.Body.transformToByteArray()) !== originalFileHash) throw new Error('Originalul existent are un hash incompatibil.');
  }
  return { s3Key, originalFileHash };
}

/** The storage key comes exclusively from an authorized backend document. */
export async function readEligibilityOriginal(document: Deliverable, context?: DocumentDiagnosticContext): Promise<Deliverable> {
  if (context) context.stage = 'original';
  if (!document.s3Key || !/^(deliverables|deliverable-index|projects|eligibility-private\/originals)\//.test(document.s3Key)) return { ...document, extractionComplete: false };
  if (document.s3Bucket && document.s3Bucket !== bucket) throw new Error('ELIGIBILITY_DOCUMENT_BUCKET_MISMATCH');
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: document.s3Key }), { abortSignal: AbortSignal.timeout(10_000) });
  if (!result.Body || !result.ContentLength || result.ContentLength > MAX_BYTES) throw new Error('ELIGIBILITY_ORIGINAL_TOO_LARGE');
  const bytes = await result.Body.transformToByteArray();
  const fileHash = hash(bytes);
  if (document.fileHash && document.fileHash !== fileHash) throw new Error('ELIGIBILITY_ORIGINAL_HASH_MISMATCH');
  const fileName = document.originalFileName || document.fileName;
  const format = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || 'unknown';
  const extractionKey = `eligibility-private/extractions/v1/${fileHash}.${format}.json`;
  if (context) context.stage = 'extraction_cache';
  try {
    const cached = await client.send(new GetObjectCommand({ Bucket: bucket, Key: extractionKey }), { abortSignal: AbortSignal.timeout(5000) });
    const extraction = JSON.parse(await cached.Body!.transformToString()) as { hash: string; text: string; complete: boolean };
    if (extraction.hash === fileHash && typeof extraction.text === 'string') return { ...document, fileHash, docText: extraction.text, extractionComplete: extraction.complete === true };
  } catch (error) {
    if (!(error instanceof Error) || !['NoSuchKey', 'NotFound'].includes(error.name)) throw error;
  }
  let extraction: { text: string; complete: boolean };
  if (context) context.stage = 'extraction';
  if (/\.(pdf|docx)$/i.test(fileName)) {
    extraction = await extractReferenceDocumentText(fileName, Uint8Array.from(bytes).buffer);
  } else if (/\.(txt|md|csv)$/i.test(fileName)) extraction = { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), complete: true };
  else if (/\.xlsx?$/i.test(fileName)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(bytes, { type: 'array' });
    extraction = { text: workbook.SheetNames.map((name) => `Foaie: ${name}\nInterval: ${workbook.Sheets[name]['!ref'] || 'gol'}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n'), complete: true };
  } else return { ...document, fileHash, extractionComplete: false };
  if (context) context.stage = 'extraction_save';
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: extractionKey,
    Body: JSON.stringify({ hash: fileHash, ...extraction }), ContentType: 'application/json' }));
  return { ...document, fileHash, docText: extraction.text, extractionComplete: extraction.complete };
}
