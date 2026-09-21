import 'server-only';
import outputs from '../amplify_outputs.json';
import referenceCatalog from '../data/import/activity-catalog.json';
import { peoUsersAsExperts } from './peo-users.ts';
import { createEligibilityCatalogLoader } from './eligibility-catalog.ts';
import type { ActivityCatalog } from './types.ts';

export type {
  EligibilityCatalogExpert,
  EligibilityCatalogOptions,
  EligibilityCatalogRequest,
  EligibilityCatalogResult,
} from './eligibility-catalog.ts';

export const loadEligibilityCatalog = createEligibilityCatalogLoader({
  endpoint: outputs.data?.url ?? '',
  referenceCatalog: referenceCatalog as ActivityCatalog[],
  referenceExperts: peoUsersAsExperts(),
});

// IAM worker path uses the same reference merge and scoping as the authenticated HTTP loader.
export async function loadEligibilityWorkerCatalog(expert: import('./types').Expert, allowedCandidateIds?: string[]) {
  const { eligibilityStore } = await import('./eligibility-server-store');
  const { mergeActivityCatalogs } = await import('./activity-catalog-merge');
  const { scopeEligibilityCatalog } = await import('./eligibility-catalog');
  const rows = await eligibilityStore.list<ActivityCatalog>('ActivityCatalog');
  const ids = new Set(rows.map((row) => row.id));
  const candidates = scopeEligibilityCatalog(mergeActivityCatalogs((referenceCatalog as ActivityCatalog[]).filter((r) => !ids.has(r.id)), rows), expert, allowedCandidateIds);
  return { expert, candidates, source: 'backend' as const, warnings: [] as string[] };
}
