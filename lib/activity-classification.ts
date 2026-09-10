import { normalizeActivityCatalogSaCode } from './activity-catalog-merge.ts';
import type { ActivityCatalog, DeliverableEligibilityCheck } from './types.ts';

// Persist in existing Activity fields so drafts need no schema migration.
// A legacy activity without a catalog ID is not necessarily unclassified.
export const PENDING_ACTIVITY_CLASSIFICATION_TYPE = 'pending_classification';
export const PENDING_ACTIVITY_CLASSIFICATION_TITLE = 'Încadrare în așteptare';

export function isActivityClassificationPending(activity: { activityType?: string | null }) {
  return activity.activityType === PENDING_ACTIVITY_CLASSIFICATION_TYPE;
}

export function resolveAutomaticActivityClassification(args: {
  check?: DeliverableEligibilityCheck | null;
  automatic: boolean;
  allowed: boolean;
  saCode: string;
  catalog: ActivityCatalog[];
}) {
  const classification = args.check?.classification;
  if (!args.allowed || !args.automatic || args.check?.executionStatus !== 'completed') return null;
  if (!classification?.autoApply || classification.confidence !== 'high' || classification.requiresSaConfirmation) return null;
  const currentSaCode = normalizeActivityCatalogSaCode(args.saCode);
  if (!currentSaCode || normalizeActivityCatalogSaCode(args.check.checkedSaCode) !== currentSaCode) return null;
  if (normalizeActivityCatalogSaCode(classification.saCode) !== currentSaCode) return null;

  return args.catalog.find((item) => (
    item.id === classification.activityId
    && item.isActive !== false
    && normalizeActivityCatalogSaCode(item.saCode) === currentSaCode
  )) ?? null;
}
