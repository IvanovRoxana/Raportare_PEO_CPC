import 'server-only';
import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import outputs from '../amplify_outputs.json';
import { extractReferenceDocumentText } from './rag/reference-document-text.ts';
import type { Deliverable } from './types.ts';

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
export async function readEligibilityOriginal(document: Deliverable): Promise<Deliverable> {
  if (!document.s3Key || !/^(deliverables|deliverable-index|projects)\//.test(document.s3Key)) return { ...document, extractionComplete: false };
  if (document.s3Bucket && document.s3Bucket !== bucket) throw new Error('ELIGIBILITY_DOCUMENT_BUCKET_MISMATCH');
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: document.s3Key }), { abortSignal: AbortSignal.timeout(10_000) });
  if (!result.Body || !result.ContentLength || result.ContentLength > MAX_BYTES) throw new Error('ELIGIBILITY_ORIGINAL_TOO_LARGE');
  const bytes = await result.Body.transformToByteArray();
  const fileHash = hash(bytes);
  if (document.fileHash && document.fileHash !== fileHash) throw new Error('ELIGIBILITY_ORIGINAL_HASH_MISMATCH');
  const fileName = document.originalFileName || document.fileName;
  if (/\.(pdf|docx)$/i.test(fileName)) {
    const extracted = await extractReferenceDocumentText(fileName, Uint8Array.from(bytes).buffer);
    return { ...document, fileHash, docText: extracted.text, extractionComplete: extracted.complete };
  }
  if (/\.(txt|md|csv)$/i.test(fileName)) return { ...document, fileHash, docText: new TextDecoder('utf-8', { fatal: true }).decode(bytes), extractionComplete: true };
  return { ...document, fileHash, extractionComplete: false };
}
