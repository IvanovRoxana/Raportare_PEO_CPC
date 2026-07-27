export interface EventDocumentationDeliverable {
  uploaded?: boolean;
  filePath?: string;
  s3Key?: string;
  fileName?: string;
  filename?: string;
  documentId?: string;
  category?: string;
  deliverableType?: string;
  slotType?: string;
  type?: string;
  isPendingConfirm?: boolean;
  isCommonDeliverable?: boolean;
  uploadedByExpertId?: string;
  requiresEventProof?: boolean;
}

export interface EventDocumentationStatus {
  complete: boolean;
  hasMomOrReport: boolean;
  requiresProof: boolean;
  hasProof: boolean;
  missing: Array<'mom_or_report' | 'proof'>;
}

function getEventDeliverableKind(deliverable: EventDocumentationDeliverable) {
  return deliverable.category || deliverable.deliverableType || deliverable.slotType || deliverable.type || '';
}

function isEventDeliverableUploaded(deliverable: EventDocumentationDeliverable) {
  return Boolean(
    deliverable.uploaded
    || deliverable.filePath
    || deliverable.s3Key
    || deliverable.fileName
    || deliverable.filename
    || deliverable.documentId
  );
}

export function getEventDocumentationStatus(
  deliverables: EventDocumentationDeliverable[] = [],
): EventDocumentationStatus {
  const uploadedMomOrReport = deliverables.filter((deliverable) => {
    const kind = getEventDeliverableKind(deliverable);
    return kind === 'event_mom' && isEventDeliverableUploaded(deliverable) && !deliverable.isPendingConfirm;
  });
  const hasMomOrReport = uploadedMomOrReport.length > 0;
  const requiresProof = uploadedMomOrReport.some((deliverable) => deliverable.requiresEventProof);
  const hasProof = deliverables.some((deliverable) => {
    const kind = getEventDeliverableKind(deliverable);
    return (
      kind === 'event_proof'
      && (
        isEventDeliverableUploaded(deliverable)
        || Boolean(deliverable.isCommonDeliverable && deliverable.uploadedByExpertId)
      )
    );
  });

  const proofRequired = !hasMomOrReport || requiresProof;
  const complete = hasMomOrReport && (!proofRequired || hasProof);
  const missing: EventDocumentationStatus['missing'] = [];
  if (!hasMomOrReport) missing.push('mom_or_report');
  if (proofRequired && !hasProof) missing.push('proof');

  return {
    complete,
    hasMomOrReport,
    requiresProof,
    hasProof,
    missing,
  };
}
