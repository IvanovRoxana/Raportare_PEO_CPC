import { buildActivityAutofillDeliverablesPayload } from './activity-autofill.ts';
import { getEligibilityAttemptState } from './deliverable-check-state.ts';
import { inferDeliverableStadiuFromEligibility, type DeliverableSlot } from './deliverable-types.ts';
import { mergeEligibilityCheckWithPmUnlockTracking } from './pm-unlock-status.ts';
import type { DeliverableEligibilityCheck } from './types.ts';

function evidenceDocuments(deliverables: DeliverableSlot[]) {
  return deliverables.filter((deliverable) => deliverable.uploaded && !deliverable.isPhoto);
}

export function hasDeliverableGroupEvidenceChanged(previous: DeliverableSlot[], next: DeliverableSlot[]) {
  const previousDocuments = evidenceDocuments(previous);
  const nextDocuments = evidenceDocuments(next);
  if (previousDocuments.length !== nextDocuments.length) return true;
  return nextDocuments.some((document) => {
    const before = previousDocuments.find((item) => item.id === document.id);
    if (!before) return true;
    const identityChanged = before.fileHash || document.fileHash
      ? before.fileHash !== document.fileHash
      : before.fileData !== document.fileData || before.s3Key !== document.s3Key || before.documentId !== document.documentId;
    return identityChanged
      || before.filename !== document.filename
      || before.declaredTitle !== document.declaredTitle
      || before.type !== document.type
      || before.deliverableType !== document.deliverableType
      || before.slotType !== document.slotType
      || before.stadiu !== document.stadiu;
  });
}

export function clearDeliverableGroupChecks(deliverables: DeliverableSlot[]) {
  return deliverables.map((deliverable) => (
    deliverable.eligibilityCheck || deliverable.aiCheck || deliverable.aiStatus
      ? { ...deliverable, eligibilityCheck: null, aiCheck: null, aiStatus: undefined }
      : deliverable
  ));
}

export function reconcileDeliverableGroupEvidence(previous: DeliverableSlot[], next: DeliverableSlot[]) {
  return hasDeliverableGroupEvidenceChanged(previous, next) ? clearDeliverableGroupChecks(next) : next;
}

export function getRelatedDeliverableAssessmentKey(deliverable: DeliverableSlot) {
  return JSON.stringify([deliverable.id, deliverable.fileHash || '', deliverable.documentId || '', deliverable.s3Key || '']);
}

export function mergeRelatedDeliverableAssessment(
  deliverable: DeliverableSlot,
  patches: Record<string, Partial<DeliverableSlot>>,
  invalidated: boolean,
) {
  const base = invalidated ? clearDeliverableGroupChecks([deliverable])[0] : deliverable;
  return { ...base, ...patches[getRelatedDeliverableAssessmentKey(deliverable)] };
}

export function isDeliverableNarrativeBlocked(deliverable: DeliverableSlot) {
  const check = deliverable.eligibilityCheck;
  if (!check) return false;
  const state = getEligibilityAttemptState(check);
  if (state === 'pending' || state === 'technical_error') return true;
  if (check.status !== 'neconcludent') return false;
  // The narrative payload builder verifies this document's ID, hash, completed version and evidence.
  return buildActivityAutofillDeliverablesPayload([{
    id: deliverable.id,
    fileHash: deliverable.fileHash,
    eligibilityCheck: check,
  }]).length === 0;
}

export function buildDeliverableGroupAssessmentPatches(args: {
  deliverables: DeliverableSlot[];
  result: DeliverableEligibilityCheck;
  checkedAt: string;
  checkedBy?: string;
  selectedActivityId?: string;
  saCode: string;
  activityTitle: string;
}) {
  if (args.result.executionStatus !== 'completed') return [];
  return evidenceDocuments(args.deliverables).map((deliverable): { id: string; patch: Partial<DeliverableSlot> } => {
    const check = mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
      ...args.result,
      checkedAt: args.checkedAt,
      checkedBy: args.checkedBy,
      checkedActivityId: args.result.checkedActivityId || args.selectedActivityId || args.saCode,
      checkedSaCode: args.saCode,
      checkedActivityName: args.result.checkedActivityName || args.activityTitle,
      checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    }, args.checkedAt);
    const eligible = check.status === 'eligibil' || check.status === 'eligibil_cu_observatii';
    return {
      id: deliverable.id,
      patch: {
        eligibilityCheck: check,
        stadiu: inferDeliverableStadiuFromEligibility(deliverable.stadiu, check),
        aiStatus: eligible ? 'eligible' : check.status === 'neeligibil' ? 'ineligible' : 'review',
        aiCheck: {
          eligible: eligible ? true : check.status === 'neeligibil' ? false : null,
          reason: check.summary || 'Verificare eligibilitate finalizata.',
          issues: [...(check.missingElements || []), ...(check.riskFlags || [])],
        },
      },
    };
  });
}
