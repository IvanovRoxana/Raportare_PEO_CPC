import type { ActivityCatalog } from './types.ts';
import { normalizePeoCategory } from './peo-category.ts';

type ActivityCatalogMergeKeyInput = Pick<ActivityCatalog, 'id' | 'category' | 'saCode' | 'activityNumber' | 'activityName'>;

export function activityCatalogMergeKey(item: ActivityCatalogMergeKeyInput) {
  const category = item.category?.trim().toLowerCase();
  const saCode = item.saCode?.trim().toUpperCase();
  const activityNumber = Number(item.activityNumber || 0);
  const activityName = item.activityName?.trim().toLowerCase();

  if (category && saCode) {
    return `${category}|${saCode}|${activityNumber > 0 ? activityNumber : activityName || item.id}`;
  }

  return item.id;
}

export function sortActivityCatalog(catalog: ActivityCatalog[]) {
  return [...catalog].sort((a, b) =>
    `${a.category}-${a.saCode}-${a.activityNumber}-${a.activityName}`.localeCompare(
      `${b.category}-${b.saCode}-${b.activityNumber}-${b.activityName}`,
    ),
  );
}

export function mergeActivityCatalogs(...catalogs: ActivityCatalog[][]) {
  const byKey = new Map<string, ActivityCatalog>();

  catalogs.forEach((catalog) => {
    catalog.forEach((item) => byKey.set(activityCatalogMergeKey(item), item));
  });

  return sortActivityCatalog(Array.from(byKey.values()));
}

export function resolveExpertActivityCatalog({
  fallbackCatalog,
  backendCatalog,
  expertCategory,
}: {
  fallbackCatalog: ActivityCatalog[];
  backendCatalog: ActivityCatalog[];
  expertCategory?: string;
}) {
  const normalizedCategory = normalizePeoCategory(expertCategory);

  if (!normalizedCategory) {
    return mergeActivityCatalogs(fallbackCatalog, backendCatalog);
  }

  const backendHasExpertCatalog = backendCatalog.some(
    (item) => normalizePeoCategory(item.category) === normalizedCategory,
  );

  if (backendHasExpertCatalog) {
    return sortActivityCatalog(backendCatalog);
  }

  return mergeActivityCatalogs(fallbackCatalog, backendCatalog);
}
