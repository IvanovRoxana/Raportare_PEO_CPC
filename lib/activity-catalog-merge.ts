import type { ActivityCatalog } from './types.ts';
import { normalizePeoCategory } from './peo-category.ts';

type ActivityCatalogMergeKeyInput = Pick<ActivityCatalog, 'id' | 'category' | 'saCode' | 'activityNumber' | 'activityName'>;
type ActivityCatalogFormTab = 'business_hub' | 'standard' | 'event';

export const EVENT_ACTIVITY_SERVICE_CATEGORY = 'Reprezentare și participare la evenimente';

export function normalizeActivityCatalogSaCode(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toUpperCase();
}

function normalizeActivityCatalogLabel(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isEventActivityCatalogItem(item: Pick<ActivityCatalog, 'serviceCategory'>) {
  return normalizeActivityCatalogLabel(item.serviceCategory) === normalizeActivityCatalogLabel(EVENT_ACTIVITY_SERVICE_CATEGORY);
}

export function isActiveActivityCatalogItem(item: Pick<ActivityCatalog, 'isActive'>) {
  return item.isActive !== false;
}

export function filterActivityCatalogForFormTab(catalog: ActivityCatalog[], tab: ActivityCatalogFormTab) {
  if (tab === 'event') {
    return catalog.filter(isEventActivityCatalogItem);
  }

  if (tab === 'standard') {
    return catalog.filter((item) => !isEventActivityCatalogItem(item));
  }

  return catalog;
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
