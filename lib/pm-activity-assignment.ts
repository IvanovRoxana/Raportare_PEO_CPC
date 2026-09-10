import type { Activity, ActivityCatalog, DeliverableEligibilityCheck } from './types.ts';

export function buildPmReassignmentCheck(catalog: ActivityCatalog, deliverableType: string, now: string, note?: string): DeliverableEligibilityCheck {
  return {
    assessmentVersion: 'pm-reassignment', executionStatus: 'not_started', status: 'neconcludent', score: 0,
    summary: note?.trim() || 'Încadrarea a fost corectată de PM. Eligibilitatea trebuie reevaluată pentru noua activitate.',
    checks: [], missingElements: [], recommendations: ['Reevaluează eligibilitatea pentru încadrarea confirmată de PM.'],
    riskFlags: ['eligibility_reassessment_required'], checkedAt: now, checkedBy: 'PM',
    checkedActivityId: catalog.id, checkedActivityName: catalog.activityName,
    checkedSaCode: catalog.saCode, checkedDeliverableType: deliverableType,
    classification: {
      activityId: catalog.id, activityName: catalog.activityName, saCode: catalog.saCode,
      confidence: 'high', reason: 'Încadrare confirmată de PM.', autoApply: false,
      requiresSaConfirmation: false, appliedBy: 'pm', appliedAt: now, alternatives: [],
    },
  };
}

export function buildPmActivityAssignmentPatch(activity: Activity, catalog: ActivityCatalog, now: string): Partial<Activity> {
  return {
    saCode: catalog.saCode, catalogActivityId: catalog.id, activityType: catalog.activityName, title: catalog.activityName,
    // Classification does not approve the activity or its evidence.
    status: 'draft',
    activitySummary: '', activitySummaryGeneratedAt: '', activitySummaryAuditId: '',
    deliverables: (activity.deliverables || []).map((deliverable) => ({
      ...deliverable, saCode: catalog.saCode, category: catalog.category, aiCheck: undefined, aiStatus: 'review',
      aiReason: 'Eligibilitatea trebuie reevaluată după încadrarea PM.',
      eligibilityCheck: buildPmReassignmentCheck(catalog, deliverable.deliverableType || '', now),
    })),
  };
}
