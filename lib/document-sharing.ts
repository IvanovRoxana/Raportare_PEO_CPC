import { normalizeTitleForMatch } from './title-suggestion.ts';
import type { Activity, Deliverable, DocumentMetadata, Expert, SharedDeliverable } from './types';

export type SharedDeliverableStatus =
  | 'pending_registration'
  | 'registered'
  | 'ignored_by_admin'
  | 'removed'
  | 'confirmed_not_relevant'
  | 'ignored_by_target';

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

export function getDocumentAuditTitle(input: {
  declaredTitle?: string | null;
  suggestedTitle?: string | null;
  filename?: string | null;
  fileName?: string | null;
  name?: string | null;
  originalFileName?: string | null;
  extractedTitle?: string | null;
  docTitle?: string | null;
}) {
  const candidates = [
    input.declaredTitle,
    input.suggestedTitle,
    input.extractedTitle,
    input.docTitle,
    input.originalFileName,
    input.fileName,
    input.filename,
    input.name,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim()
    || 'Document fara titlu confirmat';
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

export function buildIdentityDocumentS3Key(args: {
  identityId: string;
  documentId: string;
  originalFileName: string;
}) {
  const identityId = args.identityId.replace(/[^a-zA-Z0-9._:-]/g, '_');
  const documentId = args.documentId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = args.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `deliverables/${identityId}/documents/${documentId}/${fileName}`;
}

export function isActivitySuggestionRelation(relation: Pick<SharedDeliverable, 'documentId'>) {
  return relation.documentId.startsWith('activity:');
}

function getSharedRelationSourceActivityId(relation: Pick<SharedDeliverable, 'documentId' | 'sourceActivityId'>) {
  return relation.sourceActivityId || (isActivitySuggestionRelation(relation)
    ? relation.documentId.replace(/^activity:/, '')
    : undefined);
}

export function getSharedRelationReciprocalStatus(
  relation: Pick<SharedDeliverable, 'sourceExpertId' | 'targetExpertId' | 'sourceActivityId' | 'documentId' | 'status'>,
  allRelations: Array<Pick<SharedDeliverable, 'sourceExpertId' | 'targetExpertId' | 'sourceActivityId' | 'documentId' | 'status'>>,
) {
  if (relation.status === 'registered') return 'reciprocated' as const;
  if (relation.status === 'removed' || relation.status === 'ignored_by_admin' || relation.status === 'confirmed_not_relevant') return 'closed' as const;
  if (relation.status === 'ignored_by_target') return 'ignored_by_target' as const;
  const sourceActivityId = getSharedRelationSourceActivityId(relation);
  const reverse = allRelations.find((candidate) => {
    if (candidate.sourceExpertId !== relation.targetExpertId || candidate.targetExpertId !== relation.sourceExpertId) return false;
    if (sourceActivityId) {
      return getSharedRelationSourceActivityId(candidate) === sourceActivityId || candidate.status === 'registered';
    }
    return candidate.documentId === relation.documentId || candidate.status === 'registered';
  });

  if (reverse?.status === 'registered') return 'reciprocated' as const;
  return 'pending_confirmation' as const;
}

export function isSharedRelationPendingPmReciprocity(
  relation: Pick<SharedDeliverable, 'sourceExpertId' | 'targetExpertId' | 'sourceActivityId' | 'documentId' | 'status'>,
  allRelations: Array<Pick<SharedDeliverable, 'sourceExpertId' | 'targetExpertId' | 'sourceActivityId' | 'documentId' | 'status'>>,
) {
  const status = getSharedRelationReciprocalStatus(relation, allRelations);
  return status === 'pending_confirmation' || status === 'ignored_by_target';
}

export function getPendingSharedActivitySourceIdsForExpert(args: {
  expertId: string;
  sharedDeliverables: SharedDeliverable[];
}) {
  return new Set(args.sharedDeliverables
    .filter((relation) => (
      relation.targetExpertId === args.expertId
      && relation.status === 'pending_registration'
      && isActivitySuggestionRelation(relation)
    ))
    .map(getSharedRelationSourceActivityId)
    .filter((sourceActivityId): sourceActivityId is string => Boolean(sourceActivityId)));
}

export function isSharedDeliverableCoveredByPendingActivity(args: {
  relation: SharedDeliverable;
  coveredSourceActivityIds: Set<string>;
}) {
  if (isActivitySuggestionRelation(args.relation)) return false;
  const sourceActivityId = getSharedRelationSourceActivityId(args.relation);
  return Boolean(sourceActivityId && args.coveredSourceActivityIds.has(sourceActivityId));
}

export function filterPendingSharedDeliverablesNotCoveredByActivity(args: {
  expertId: string;
  sharedDeliverables: SharedDeliverable[];
}) {
  const coveredSourceActivityIds = getPendingSharedActivitySourceIdsForExpert(args);
  return args.sharedDeliverables.filter((relation) => (
    relation.targetExpertId === args.expertId
    && relation.status === 'pending_registration'
    && !isActivitySuggestionRelation(relation)
    && !isSharedDeliverableCoveredByPendingActivity({ relation, coveredSourceActivityIds })
  ));
}

export type SharedRelationMonth = {
  month: number;
  year: number;
};

function getRelationDate(relation: Pick<SharedDeliverable, 'sourceActivityDate'>, document?: Pick<DocumentMetadata, 'activityDate'>) {
  return relation.sourceActivityDate || document?.activityDate;
}

export function isSharedRelationInMonth(
  relation: Pick<SharedDeliverable, 'sourceActivityDate'>,
  month: SharedRelationMonth,
  document?: Pick<DocumentMetadata, 'activityDate'>,
) {
  const date = getRelationDate(relation, document);
  if (!date) return true;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return true;

  return parsed.getMonth() === month.month && parsed.getFullYear() === month.year;
}

export function filterSharedRelationsForMonths(args: {
  sharedDeliverables: SharedDeliverable[];
  allowedMonths: SharedRelationMonth[];
  documents?: DocumentMetadata[];
}) {
  if (args.allowedMonths.length === 0) return [];

  return args.sharedDeliverables.filter((relation) => {
    const document = args.documents?.find((item) => item.id === relation.documentId);
    return args.allowedMonths.some((month) => isSharedRelationInMonth(relation, month, document));
  });
}

export function buildSharedActivitySnapshot(activity?: Partial<Activity>) {
  if (!activity) return {};

  return {
    sourceExpertName: activity.expertName,
    sourceActivityDate: activity.date,
    sourceActivityHours: activity.hours,
    sourceActivityType: activity.activityType,
    sourceActivityTitle: activity.title,
    sourceActivityDescription: activity.activitySummary || activity.description,
    sourceActivityLocation: activity.location,
    sourceActivityDayType: activity.dayType,
    sourceActivitySaCode: activity.saCode,
    sourceActivityCatalogActivityId: activity.catalogActivityId,
    sourceActivityProjectCode: activity.projectCode,
    sourceActivityEventDurationHours: activity.eventDurationHours,
    sourceActivityEventExtendedDescription: activity.eventExtendedDescription,
  };
}

export function buildSharedActivitySuggestions(args: {
  sourceActivityId: string;
  sourceExpertId: string;
  targetExpertIds: string[];
  projectId?: string;
  sourceActivity?: Partial<Activity>;
}) {
  const createdAt = new Date().toISOString();
  const documentId = `activity:${args.sourceActivityId}`;
  const sourceSnapshot = buildSharedActivitySnapshot(args.sourceActivity);
  return [...new Set(args.targetExpertIds)]
    .filter((targetExpertId) => targetExpertId && targetExpertId !== args.sourceExpertId)
    .map((targetExpertId): SharedDeliverable => ({
      id: `shared_activity_${args.sourceActivityId}_${targetExpertId}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
      documentId,
      sourceExpertId: args.sourceExpertId,
      targetExpertId,
      projectId: args.projectId,
      sourceActivityId: args.sourceActivityId,
      ...sourceSnapshot,
      status: 'pending_registration',
      notifiedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    }));
}

export function buildSharedDeliverables(args: {
  documentId: string;
  sourceExpertId: string;
  targetExpertIds: string[];
  projectId?: string;
  sourceActivityId?: string;
  sourceActivity?: Partial<Activity>;
}) {
  const createdAt = new Date().toISOString();
  const sourceSnapshot = buildSharedActivitySnapshot(args.sourceActivity);
  return [...new Set(args.targetExpertIds)]
    .filter((targetExpertId) => targetExpertId && targetExpertId !== args.sourceExpertId)
    .map((targetExpertId): SharedDeliverable => ({
      id: `shared_${args.documentId}_${targetExpertId}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
      documentId: args.documentId,
      sourceExpertId: args.sourceExpertId,
      targetExpertId,
      projectId: args.projectId,
      sourceActivityId: args.sourceActivityId,
      ...sourceSnapshot,
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
  return filterPendingSharedDeliverablesNotCoveredByActivity({
    expertId: args.expert.id,
    sharedDeliverables: args.sharedDeliverables,
  })
    .map((relation) => {
      const document = args.documents.find((item) => item.id === relation.documentId);
      return {
        relationId: relation.id,
        documentId: relation.documentId,
        fileName: document?.originalFileName ?? 'Document comun',
        title: document ? getDocumentAuditTitle(document) : undefined,
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

function findSharedActivitySource(
  relation: SharedDeliverable,
  sourceActivities?: Activity[],
) {
  const sourceActivityId = getSharedRelationSourceActivityId(relation);
  if (!sourceActivityId) return undefined;
  return sourceActivities?.find((activity) => activity.id === sourceActivityId);
}

function buildSharedActivityAlertSnapshot(relation: SharedDeliverable, sourceActivity?: Activity) {
  return {
    sourceActivityDate: relation.sourceActivityDate || sourceActivity?.date,
    sourceActivityHours: relation.sourceActivityHours ?? sourceActivity?.hours,
    sourceActivityTitle: relation.sourceActivityTitle || relation.sourceActivityType || sourceActivity?.title || sourceActivity?.activityType,
    sourceActivityDescription: relation.sourceActivityDescription || sourceActivity?.activitySummary || sourceActivity?.description,
    sourceActivityLocation: relation.sourceActivityLocation || sourceActivity?.location,
    sourceActivityDayType: relation.sourceActivityDayType || sourceActivity?.dayType,
    sourceActivitySaCode: relation.sourceActivitySaCode || sourceActivity?.saCode,
    sourceActivityProjectCode: relation.sourceActivityProjectCode || sourceActivity?.projectCode,
    sourceActivityEventDurationHours: relation.sourceActivityEventDurationHours ?? sourceActivity?.eventDurationHours,
    sourceActivityEventExtendedDescription: relation.sourceActivityEventExtendedDescription || sourceActivity?.eventExtendedDescription,
    projectId: relation.projectId || sourceActivity?.projectCode,
    status: relation.status,
  };
}

export function buildPendingSharedActivityAlerts(args: {
  expert: Expert;
  experts: Expert[];
  sharedDeliverables: SharedDeliverable[];
  sourceActivities?: Activity[];
}) {
  return args.sharedDeliverables
    .filter((relation) => relation.targetExpertId === args.expert.id && relation.status === 'pending_registration' && isActivitySuggestionRelation(relation))
    .map((relation) => {
      const sourceExpert = args.experts.find((expert) => expert.id === relation.sourceExpertId);
      const sourceActivity = findSharedActivitySource(relation, args.sourceActivities);
      return {
        relationId: relation.id,
        sourceActivityId: getSharedRelationSourceActivityId(relation),
        sourceExpertName: relation.sourceExpertName || sourceActivity?.expertName || sourceExpert?.name || relation.sourceExpertId,
        ...buildSharedActivityAlertSnapshot(relation, sourceActivity),
        message: `${relation.sourceExpertName || sourceExpert?.name || 'Un alt expert'} te-a sugerat ca participant la o activitate comuna. Poti adauga activitatea in pontajul tau sau o poti ignora.`,
      };
    });
}

export function buildReturnedSharedActivityAlerts(args: {
  expert: Expert;
  experts: Expert[];
  sharedDeliverables: SharedDeliverable[];
  sourceActivities?: Activity[];
}) {
  return args.sharedDeliverables
    .filter((relation) => relation.sourceExpertId === args.expert.id && relation.status === 'ignored_by_target' && isActivitySuggestionRelation(relation))
    .map((relation) => {
      const targetExpert = args.experts.find((expert) => expert.id === relation.targetExpertId);
      const sourceActivity = findSharedActivitySource(relation, args.sourceActivities);
      return {
        relationId: relation.id,
        targetExpertName: targetExpert?.name || relation.targetExpertId,
        ...buildSharedActivityAlertSnapshot(relation, sourceActivity),
        message: `${targetExpert?.name || 'Expertul selectat'} a ignorat sugestia de activitate comuna. Avertizarea ramane vizibila si pentru PM.`,
      };
    });
}

export function buildIgnoredSharedActivityAlerts(args: {
  expert: Expert;
  experts: Expert[];
  sharedDeliverables: SharedDeliverable[];
  sourceActivities?: Activity[];
}) {
  return args.sharedDeliverables
    .filter((relation) => relation.targetExpertId === args.expert.id && relation.status === 'ignored_by_target' && isActivitySuggestionRelation(relation))
    .map((relation) => {
      const sourceExpert = args.experts.find((expert) => expert.id === relation.sourceExpertId);
      const sourceActivity = findSharedActivitySource(relation, args.sourceActivities);
      return {
        relationId: relation.id,
        sourceExpertName: relation.sourceExpertName || sourceActivity?.expertName || sourceExpert?.name || relation.sourceExpertId,
        ...buildSharedActivityAlertSnapshot(relation, sourceActivity),
        message: `Ai ignorat sugestia de activitate comuna de la ${relation.sourceExpertName || sourceExpert?.name || 'alt expert'}.`,
      };
    });
}
