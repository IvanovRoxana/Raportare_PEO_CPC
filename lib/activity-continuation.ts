import { normalizeActivityCatalogSaCode } from './activity-catalog-merge.ts';
import { isActivityClassificationPending } from './activity-classification.ts';
import { hasSameDeliverableDocument } from './deliverable-deduplication.ts';
import { normalizePeoCategory } from './peo-category.ts';
import type { Activity, ActivityCatalog } from './types.ts';

type DocumentIdentity = Parameters<typeof hasSameDeliverableDocument>[0];

/** Continue a known activity only when every current evidence document belongs to that source. */
export function resolveKnownActivityContinuation(args: {
  sourceActivityId?: string;
  activities: Activity[];
  documents: DocumentIdentity[];
  catalog: ActivityCatalog[];
  expertId: string;
  expertCategory?: string;
  projectCode?: string;
  month: number;
  year: number;
}) {
  if (!args.sourceActivityId || !args.documents.length || !args.expertCategory) return null;
  const source = args.activities.find((activity) => activity.id === args.sourceActivityId);
  if (!source || source.expertId !== args.expertId || isActivityClassificationPending(source)) return null;
  if (source.date.slice(0, 7) !== `${args.year}-${String(args.month + 1).padStart(2, '0')}`) return null;
  if (args.projectCode && source.projectCode && args.projectCode.trim() !== source.projectCode.trim()) return null;
  const catalogItem = args.catalog.find((item) => item.id === source.catalogActivityId
    && item.isActive !== false
    && normalizePeoCategory(item.category) === normalizePeoCategory(args.expertCategory)
    && normalizeActivityCatalogSaCode(item.saCode) === normalizeActivityCatalogSaCode(source.saCode));
  if (!catalogItem) return null;
  if (!args.documents.every((document) => source.deliverables?.some((existing) => hasSameDeliverableDocument(document, existing)))) return null;
  return source;
}
