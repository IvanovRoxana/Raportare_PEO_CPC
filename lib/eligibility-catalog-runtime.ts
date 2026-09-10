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
