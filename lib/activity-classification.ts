import { normalizeActivityCatalogSaCode } from './activity-catalog-merge.ts';
import type { ActivityCatalog, DeliverableEligibilityCheck } from './types.ts';

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
