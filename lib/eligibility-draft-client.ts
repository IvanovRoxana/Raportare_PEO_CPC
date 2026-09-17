'use client';
import { eligibilityRequest } from './eligibility-client';
import type { DeliverableSlot } from './deliverable-types';
import { EligibilityDocumentRequestError, type DocumentStage } from './eligibility-document-diagnostics';

/** Upload an immutable original before assessment; saving the activity reuses the same storage reference. */
export async function prepareEligibilityDeliverable(document: DeliverableSlot, expertId: string, saCode: string): Promise<DeliverableSlot> {
  const context: { stage: DocumentStage } = { stage: 'request' };
  try {
    return await prepareDocument(document, expertId, saCode, context);
  } catch (error) {
    const failure = error instanceof EligibilityDocumentRequestError ? error : new EligibilityDocumentRequestError(
      'Pregatirea documentului a fost intrerupta in browser; cauza exacta nu poate fi stabilita din raspunsul disponibil.',
      { stage: context.stage, code: 'DOCUMENT_CLIENT_ERROR', action: 'Verifica sesiunea si conexiunea, apoi reincearca. Daca persista, transmite codul administratorului.' });
    failure.message = `${document.filename || document.rawFilename || document.name || 'Document'}: ${failure.message}`;
    throw failure;
  }
}

async function prepareDocument(document: DeliverableSlot, expertId: string, saCode: string, context: { stage: DocumentStage }): Promise<DeliverableSlot> {
  if (document.documentId?.startsWith('draft_')) {
    const revision = await eligibilityRequest('/api/eligibility/documents', { action: 'revise', expertId, saCode, documentId: document.documentId,
      declaredTitle: document.declaredTitle || document.docTitle || '', deliverableType: document.type || document.deliverableType || document.slotType });
    return { ...document, documentId: revision.documentId };
  }
  if (document.s3Key || document.filePath) return document;
  context.stage = 'original';
  if (!document.fileData) throw new EligibilityDocumentRequestError('Originalul livrabilului nu este disponibil in browser.',
    { stage: 'original', code: 'LOCAL_ORIGINAL_MISSING', action: 'Reincarca fisierul.' });
  const blob = await (await fetch(document.fileData)).blob();
  context.stage = 'request';
  const draft = await eligibilityRequest('/api/eligibility/documents', { action: 'create', expertId, saCode,
    fileName: document.filename || document.rawFilename || document.name || '', fileSize: blob.size,
    declaredTitle: document.declaredTitle || document.docTitle || '', deliverableType: document.type || document.deliverableType || document.slotType });
  context.stage = 'upload';
  const upload = await fetch(draft.uploadUrl, { method: 'PUT', body: blob,
    headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' } });
  if (!upload.ok) throw new EligibilityDocumentRequestError(`Serviciul de stocare a refuzat incarcarea (HTTP ${upload.status}).`,
    { stage: 'upload', code: `UPLOAD_HTTP_${upload.status}`, action: upload.status === 403
      ? 'Reincearca pentru a obtine o autorizare noua. Daca eroarea persista, administratorul trebuie sa verifice permisiunile de incarcare.'
      : 'Reincearca incarcarea. Daca eroarea persista, transmite codul administratorului.' });
  context.stage = 'confirmation';
  const verified = await eligibilityRequest('/api/eligibility/documents', { action: 'complete', expertId, documentId: draft.documentId });
  return { ...document, documentId: verified.documentId, fileHash: verified.fileHash, s3Key: verified.s3Key,
    s3Bucket: verified.s3Bucket, filePath: verified.filePath,
    textExtractionScope: verified.extractionComplete ? 'full_document' : 'unknown' };
}
