import type { Activity, Deliverable, DocumentMetadata, DeliverableEligibilityCheck } from './types.ts';

export function matchesPmUnlockDocument(deliverable: Pick<Deliverable, 'documentId' | 'id' | 's3Key' | 'fileHash' | 'firstPageTextHash' | 'contentFingerprint'>, document: DocumentMetadata) {
  return (
    deliverable.documentId === document.id
    || deliverable.id === document.id
    || Boolean(document.s3Key && deliverable.s3Key === document.s3Key)
    || Boolean(document.fileHash && deliverable.fileHash === document.fileHash)
    || Boolean(document.firstPageTextHash && deliverable.firstPageTextHash === document.firstPageTextHash)
    || Boolean(document.contentFingerprint && deliverable.contentFingerprint === document.contentFingerprint)
  );
}

export function resolvePmUnlockActivityContext(document: DocumentMetadata, activities: Activity[]) {
  const activityWithMatchingDeliverable = activities.find((activity) => (
    (activity.deliverables ?? []).some((deliverable) => matchesPmUnlockDocument(deliverable, document))
  ));

  const sourceActivity = activityWithMatchingDeliverable
    || (document.sourceActivityId
      ? activities.find((activity) => activity.id === document.sourceActivityId)
      : undefined)
    || activities.find((activity) => (
      activity.expertId === document.uploadedByExpertId
      && Boolean(document.activityDate)
      && activity.date === document.activityDate
      && (!document.saCode || activity.activityType === document.saCode || activity.saCode === document.saCode)
    ));

  return {
    sourceActivity,
    sourceDeliverable: sourceActivity?.deliverables?.find((deliverable) => matchesPmUnlockDocument(deliverable, document)),
  };
}

export function buildPmUnlockedDeliverableFromDocument(
  document: DocumentMetadata,
  activity: Pick<Activity, 'id' | 'expertId' | 'expertName' | 'projectCode' | 'date' | 'activityType' | 'saCode'>,
  approvedCheck: DeliverableEligibilityCheck,
): Deliverable {
  return {
    id: `pm_unlock_${document.id}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
    activityId: activity.id,
    fileName: document.originalFileName,
    originalFileName: document.originalFileName,
    fileType: document.mimeType,
    fileSize: document.fileSize,
    documentId: document.id,
    s3Bucket: document.s3Bucket,
    s3Key: document.s3Key,
    fileHash: document.fileHash,
    firstPageTextHash: document.firstPageTextHash,
    contentFingerprint: document.contentFingerprint,
    uploadedByExpertId: document.uploadedByExpertId,
    uploadedByExpertName: document.uploadedByExpertName,
    expertId: activity.expertId || document.uploadedByExpertId,
    projectId: document.projectId,
    projectCode: activity.projectCode,
    projectName: document.projectName,
    month: document.activityDate ? Number(document.activityDate.slice(5, 7)) - 1 : undefined,
    year: document.activityDate ? Number(document.activityDate.slice(0, 4)) : undefined,
    sourceActivityId: document.sourceActivityId || activity.id,
    activityDate: document.activityDate || activity.date,
    saCode: document.saCode || activity.saCode || activity.activityType,
    deliverableType: document.deliverableType,
    stadiu: document.stadiu || 'final',
    uploaded: true,
    isCommonDeliverable: document.isCommonDeliverable,
    possibleDuplicateOfDocumentId: document.possibleDuplicateOfDocumentId,
    duplicateStatus: document.duplicateStatus,
    uploadedAt: document.uploadDate,
    declaredTitle: document.declaredTitle,
    docTitle: document.extractedTitle,
    docText: document.docText,
    suggestedTitle: document.suggestedTitle,
    titleSuggestionConfidence: document.titleSuggestionConfidence,
    titleSuggestionAlternatives: document.titleSuggestionAlternatives,
    titleSuggestionReason: document.titleSuggestionReason,
    firstPageText: document.firstPageText,
    titleSource: document.titleSource,
    titleMatch: document.titleMatch,
    titleConfirmed: true,
    titleCheckStatus: document.titleCheckStatus || 'admin_overridden',
    titleCheckMessage: document.titleCheckMessage,
    aiStatus: 'eligible',
    aiReason: 'Livrabil aprobat manual de PM.',
    eligibilityCheck: approvedCheck,
  };
}
