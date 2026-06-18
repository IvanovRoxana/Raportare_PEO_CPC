import type { ActivityCatalog } from './types.ts';

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
