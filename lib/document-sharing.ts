import { normalizeTitleForMatch } from './title-suggestion.ts';
import type { Deliverable, DocumentMetadata, Expert, SharedDeliverable } from './types';

export type SharedDeliverableStatus =
  | 'pending_registration'
  | 'registered'
  | 'ignored_by_admin'
  | 'removed'
  | 'confirmed_not_relevant';

export type DuplicateIssueType =
  | 'duplicate_detected'
  | 'possible_duplicate'
  | 'possible_common_unmarked'
  | 'same_file_hash'
  | 'same_first_page_hash'
  | 'similar_extracted_title'
  | 'similar_content_fingerprint';

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: ArrayBuffer | string) {
  const data = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

export function normalizeDocumentTextForFingerprint(text?: string | null) {
  return normalizeTitleForMatch(text || '');
}

export async function hashFirstPageText(text?: string | null) {
  const normalized = normalizeDocumentTextForFingerprint(text);
  return normalized ? sha256Hex(normalized) : undefined;
}

export function buildDocumentS3Key(args: {
  projectId?: string | null;
  documentId: string;
  originalFileName: string;
}) {
  const projectId = (args.projectId || 'peo').replace(/[^a-zA-Z0-9._-]/g, '_');
  const documentId = args.documentId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = args.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `projects/${projectId}/documents/${documentId}/${fileName}`;
}

export function buildSharedDeliverables(args: {
  documentId: string;
  sourceExpertId: string;
  targetExpertIds: string[];
  projectId?: string;
  sourceActivityId?: string;
}) {
  const createdAt = new Date().toISOString();
  return [...new Set(args.targetExpertIds)]
    .filter((targetExpertId) => targetExpertId && targetExpertId !== args.sourceExpertId)
    .map((targetExpertId): SharedDeliverable => ({
      id: `shared_${args.documentId}_${targetExpertId}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
      documentId: args.documentId,
      sourceExpertId: args.sourceExpertId,
      targetExpertId,
      projectId: args.projectId,
      sourceActivityId: args.sourceActivityId,
      status: 'pending_registration',
      createdAt,
      updatedAt: createdAt,
    }));
}

export function markSharedDeliverableRegistered(args: {
  relation: SharedDeliverable;
  targetActivityId: string;
}) {
  const registeredAt = new Date().toISOString();
  return {
    ...args.relation,
    status: 'registered' as const,
    targetActivityId: args.targetActivityId,
    registeredAt,
    updatedAt: registeredAt,
  };
}

export function findDuplicateCandidates(
  existingDocuments: DocumentMetadata[],
  candidate: Pick<DocumentMetadata, 'id' | 'fileHash' | 'firstPageTextHash' | 'extractedTitleNormalized' | 'contentFingerprint' | 'fileSize' | 'mimeType'>,
) {
  return existingDocuments
    .filter((document) => document.id !== candidate.id)
    .map((document) => {
      const issues: DuplicateIssueType[] = [];
      if (candidate.fileHash && document.fileHash === candidate.fileHash) {
        issues.push('duplicate_detected', 'same_file_hash');
      }
      if (candidate.firstPageTextHash && document.firstPageTextHash === candidate.firstPageTextHash) {
        issues.push('possible_duplicate', 'same_first_page_hash');
      }
      if (
        candidate.extractedTitleNormalized
        && document.extractedTitleNormalized
        && candidate.extractedTitleNormalized === document.extractedTitleNormalized
      ) {
        issues.push('possible_common_unmarked', 'similar_extracted_title');
      }
      if (
        candidate.contentFingerprint
        && document.contentFingerprint
        && candidate.contentFingerprint === document.contentFingerprint
      ) {
        issues.push('possible_duplicate', 'similar_content_fingerprint');
      }

      return {
        document,
        issues: [...new Set(issues)],
      };
    })
    .filter((candidateMatch) => candidateMatch.issues.length > 0);
}

export function isDeliverableIncludedInExpertExport(args: {
  deliverable: Pick<Deliverable, 'uploadedByExpertId' | 'documentId' | 'isCommonDeliverable'>;
  expertId: string;
  sharedDeliverables?: Pick<SharedDeliverable, 'documentId' | 'targetExpertId' | 'targetActivityId' | 'status'>[];
}) {
  if (args.deliverable.uploadedByExpertId === args.expertId) return true;
  if (!args.deliverable.isCommonDeliverable || !args.deliverable.documentId) return false;

  return Boolean(args.sharedDeliverables?.some((relation) => (
    relation.documentId === args.deliverable.documentId
    && relation.targetExpertId === args.expertId
    && relation.status === 'registered'
    && Boolean(relation.targetActivityId)
  )));
}

export function buildPendingSharedDeliverableAlerts(args: {
  expert: Expert;
  documents: DocumentMetadata[];
  sharedDeliverables: SharedDeliverable[];
}) {
  return args.sharedDeliverables
    .filter((relation) => relation.targetExpertId === args.expert.id && relation.status === 'pending_registration')
    .map((relation) => {
      const document = args.documents.find((item) => item.id === relation.documentId);
      return {
        relationId: relation.id,
        documentId: relation.documentId,
        fileName: document?.originalFileName ?? 'Document comun',
        title: document?.declaredTitle || document?.suggestedTitle || document?.extractedTitle || document?.originalFileName,
        uploadedByExpertName: document?.uploadedByExpertName,
        projectId: relation.projectId || document?.projectId,
        saCode: document?.saCode,
        activityDate: document?.activityDate,
        deliverableType: document?.deliverableType,
        status: relation.status,
        message: `Exista un livrabil comun incarcat de ${document?.uploadedByExpertName || 'alt expert'} pentru ${document?.saCode || 'SA/activitate'}, dar nu a fost inca inregistrat in pontajul tau.`,
      };
    });
}
