import type { ActivityCatalog } from './types.ts';
import { normalizePeoCategory } from './peo-category.ts';

type ActivityCatalogMergeKeyInput = Pick<ActivityCatalog, 'id' | 'category' | 'saCode' | 'activityNumber' | 'activityName'>;

export function normalizeActivityCatalogSaCode(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toUpperCase();
}

export function activityCatalogMergeKey(item: ActivityCatalogMergeKeyInput) {
  const category = normalizePeoCategory(item.category) || item.category?.trim().toLowerCase();
  const saCode = normalizeActivityCatalogSaCode(item.saCode);
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
}: {
  fallbackCatalog: ActivityCatalog[];
  backendCatalog: ActivityCatalog[];
  expertCategory?: string;
}) {
  return mergeActivityCatalogs(fallbackCatalog, backendCatalog);
}
