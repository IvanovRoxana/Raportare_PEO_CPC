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

export function isEventActivityCatalogItem(item: Pick<ActivityCatalog, 'serviceCategory' | 'eventCategory'>) {
  return Boolean(item.eventCategory?.trim())
    || normalizeActivityCatalogLabel(item.serviceCategory) === normalizeActivityCatalogLabel(EVENT_ACTIVITY_SERVICE_CATEGORY);
}

export function requiresSameDayForSharedEventActivity(
  item: Pick<ActivityCatalog, 'serviceCategory' | 'eventCategory' | 'requiresSameDayForSharedDeliverable'>,
) {
  return item.requiresSameDayForSharedDeliverable ?? isEventActivityCatalogItem(item);
}

export function isActiveActivityCatalogItem(item: Pick<ActivityCatalog, 'isActive'>) {
  return item.isActive !== false;
}

export function isActivityCatalogItemAvailableForForm(
  item: Pick<ActivityCatalog, 'id' | 'isActive'>,
  currentCatalogActivityId?: string,
) {
  return isActiveActivityCatalogItem(item) || item.id === currentCatalogActivityId;
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

export function resolveActivityDeliverableOptions(
  catalogDeliverables: string | undefined,
  fallbackOptions: string[],
  currentOptions: Array<string | undefined> = [],
) {
  const configuredOptions = (catalogDeliverables || '')
    .split(/\s*\|\s*|\r?\n|\s*;\s*/)
    .map((option) => option.replace(/^[-*\u2022]\s*/, '').trim())
    .filter(Boolean);
  const preservedOptions = currentOptions
    .map((option) => option?.trim())
    .filter((option): option is string => Boolean(option));

  const baseOptions = configuredOptions.length > 0 ? configuredOptions : fallbackOptions;
  return Array.from(new Set([...baseOptions, ...preservedOptions]));
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
  return [...catalog].sort((a, b) => {
    const categoryComparison = a.category.toLowerCase().localeCompare(b.category.toLowerCase());
    if (categoryComparison !== 0) return categoryComparison;
    const saCodeComparison = a.saCode.localeCompare(b.saCode, undefined, { numeric: true });
    if (saCodeComparison !== 0) return saCodeComparison;
    const activityNumberComparison = (a.activityNumber ?? 0) - (b.activityNumber ?? 0);
    if (activityNumberComparison !== 0) return activityNumberComparison;
    return a.activityName.localeCompare(b.activityName);
  });
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

export function getActiveGdprActivityCatalog(
  catalog: ActivityCatalog[],
  allowedSaCodes: string[] = [],
) {
  const allowed = new Set(allowedSaCodes.map(normalizeActivityCatalogSaCode).filter(Boolean));
  return sortActivityCatalog(catalog.filter((item) =>
    item.category.trim().toLowerCase() === 'gdpr'
    && isActiveActivityCatalogItem(item)
    && (allowed.size === 0 || allowed.has(normalizeActivityCatalogSaCode(item.saCode)))
  ));
}
