'use client';
import { eligibilityRequest } from './eligibility-client';
import type { DeliverableSlot } from './deliverable-types';

/** Upload an immutable original before assessment; saving the activity reuses the same storage reference. */
export async function prepareEligibilityDeliverable(document: DeliverableSlot, expertId: string, saCode: string): Promise<DeliverableSlot> {
  if (document.documentId?.startsWith('draft_')) {
    const revision = await eligibilityRequest('/api/eligibility/documents', { action: 'revise', expertId, saCode, documentId: document.documentId,
      declaredTitle: document.declaredTitle || document.docTitle || '', deliverableType: document.type || document.deliverableType || document.slotType });
    return { ...document, documentId: revision.documentId };
  }
  if (document.s3Key || document.filePath) return document;
  if (!document.fileData) throw new Error('Originalul livrabilului nu este disponibil. Reincarca fisierul.');
  const blob = await (await fetch(document.fileData)).blob();
  const draft = await eligibilityRequest('/api/eligibility/documents', { action: 'create', expertId, saCode,
    fileName: document.filename || document.rawFilename || document.name || '', fileSize: blob.size,
    declaredTitle: document.declaredTitle || document.docTitle || '', deliverableType: document.type || document.deliverableType || document.slotType });
  const upload = await fetch(draft.uploadUrl, { method: 'PUT', body: blob,
    headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' } });
  if (!upload.ok) throw new Error('Originalul nu a fost incarcat. Reincearca verificarea.');
  const verified = await eligibilityRequest('/api/eligibility/documents', { action: 'complete', expertId, documentId: draft.documentId });
  return { ...document, documentId: verified.documentId, fileHash: verified.fileHash, s3Key: verified.s3Key,
    s3Bucket: verified.s3Bucket, filePath: verified.filePath,
    textExtractionScope: verified.extractionComplete ? 'full_document' : 'unknown' };
}
