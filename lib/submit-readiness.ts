import type { Activity, ActivityCatalog, Deliverable } from './types.ts';
import { isExceptionActivity } from './peo-constants.ts';
import { getBusinessHubMetaMissingFields, parseBusinessHubMetaJson } from './business-hub-reporting.ts';
import { normalizePeoCategory } from './peo-category.ts';

export const ACTIVITY_PERIOD_GROUP_PREFIX = 'activity-period:';
export const NO_DELIVERABLE_CATALOG_MARKER = 'N/A';
const LEGACY_ACTIVITY_PERIOD_GROUP_PREFIX = 'legacy-activity-period:';
const LEGACY_ACTIVITY_PERIOD_WINDOW_MS = 30 * 1000;

export function createActivityPeriodGroupId(id: string) {
  return `${ACTIVITY_PERIOD_GROUP_PREFIX}${id}`;
}

function getActivityPeriodGroupId(activity: Activity) {
  if (activity.periodGroupId) {
    return activity.periodGroupId;
  }

  return activity.workingGroupId?.startsWith(ACTIVITY_PERIOD_GROUP_PREFIX)
    ? activity.workingGroupId
    : undefined;
}

function normalizeSignatureValue(value?: string | number | null) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getActivityCreatedTime(activity: Activity) {
  if (!activity.createdAt) return null;
  const time = Date.parse(activity.createdAt);
  return Number.isFinite(time) ? time : null;
}

function getLegacyActivityPeriodSignature(activity: Activity) {
  if (activity.periodGroupId || activity.workingGroupId) return null;
  if (getActivityCreatedTime(activity) === null) return null;

  return [
    activity.expertId,
    activity.date.slice(0, 7),
    normalizeSignatureValue(activity.saCode),
    normalizeSignatureValue(activity.activityType),
    normalizeSignatureValue(activity.title),
    normalizeSignatureValue(activity.description),
    normalizeSignatureValue(activity.location),
    normalizeSignatureValue(activity.dayType),
  ].join('|');
}

function normalizeTextForMatching(value?: string | number | null) {
  return normalizeSignatureValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isMonthlySocialMediaVisualActivity(activity: Activity) {
  const searchableText = [
    activity.activityType,
    activity.title,
    activity.description,
    activity.activityKeywords,
  ].map(normalizeTextForMatching).join(' ');

  const mentionsSocialMedia = searchableText.includes('some')
    || searchableText.includes('social media')
    || searchableText.includes('retele sociale')
    || searchableText.includes('sociale');
  const mentionsVisualContent = searchableText.includes('content')
    || searchableText.includes('continut')
    || searchableText.includes('vizual')
    || searchableText.includes('visual');

  return mentionsSocialMedia && mentionsVisualContent;
}

function getMonthlySocialMediaDeliverableSignature(activity: Activity) {
  if (!isMonthlySocialMediaVisualActivity(activity)) return null;

  return [
    normalizeSignatureValue(activity.expertId),
    activity.date.slice(0, 7),
    normalizeSignatureValue(activity.projectCode),
    normalizeSignatureValue(activity.saCode),
    normalizeSignatureValue(activity.catalogActivityId),
    normalizeSignatureValue(activity.activityType),
    normalizeSignatureValue(activity.title),
  ].join('|');
}

function inferLegacyActivityPeriodGroups(activities: Activity[]) {
  const groupedBySignature = new Map<string, Activity[]>();

  activities.forEach((activity) => {
    const signature = getLegacyActivityPeriodSignature(activity);
    if (!signature) return;

    const group = groupedBySignature.get(signature) ?? [];
    group.push(activity);
    groupedBySignature.set(signature, group);
  });

  const inferredGroups = new Map<string, string>();

  groupedBySignature.forEach((group, signature) => {
    const sortedGroup = [...group].sort((first, second) =>
      (getActivityCreatedTime(first) ?? 0) - (getActivityCreatedTime(second) ?? 0),
    );
    let cluster: Activity[] = [];
    let clusterStartTime: number | null = null;

    const flushCluster = () => {
      if (cluster.length > 1) {
        const groupId = `${LEGACY_ACTIVITY_PERIOD_GROUP_PREFIX}${signature}:${clusterStartTime}`;
        cluster.forEach((activity) => inferredGroups.set(activity.id, groupId));
      }
      cluster = [];
      clusterStartTime = null;
    };

    sortedGroup.forEach((activity) => {
      const createdTime = getActivityCreatedTime(activity);
      if (createdTime === null) return;

      if (clusterStartTime === null || createdTime - clusterStartTime <= LEGACY_ACTIVITY_PERIOD_WINDOW_MS) {
        cluster.push(activity);
        clusterStartTime ??= createdTime;
        return;
      }

      flushCluster();
      cluster = [activity];
      clusterStartTime = createdTime;
    });

    flushCluster();
  });

  return inferredGroups;
}

function getEffectiveActivityPeriodGroupId(activity: Activity, inferredLegacyGroups: Map<string, string>) {
  return getActivityPeriodGroupId(activity) ?? inferredLegacyGroups.get(activity.id);
}

function getActivityPeriodGroupKey(activity: Activity, inferredLegacyGroups: Map<string, string>) {
  const groupId = getEffectiveActivityPeriodGroupId(activity, inferredLegacyGroups);
  if (!groupId) return null;

  const catalogKey = normalizeSignatureValue(activity.catalogActivityId);
  const activityKey = catalogKey
    ? `catalog:${catalogKey}`
    : `manual:${normalizeSignatureValue(activity.saCode)}:${normalizeSignatureValue(activity.activityType || activity.title)}`;

  return [
    groupId,
    normalizeSignatureValue(activity.expertId),
    activityKey,
  ].join('|');
}

export function isActivityExceptionForSubmit(activity: Activity) {
  return activity.dayType === 'CO'
    || activity.dayType === 'CM'
    || Number(activity.hours) === 0
    || isExceptionActivity(activity.activityType || activity.title || '');
}

export function hasUsableDeliverable(deliverables?: Deliverable[]) {
  return (deliverables ?? []).some((deliverable) =>
    Boolean(deliverable.filePath || deliverable.s3Key || deliverable.fileName || deliverable.documentId),
  );
}

interface GetActivitiesMissingDeliverablesOptions {
  expertCategory?: string;
  activityCatalog?: ActivityCatalog[];
}

export function isCatalogDeliverableNotApplicable(value?: string | null) {
  return normalizeSignatureValue(value).toUpperCase() === NO_DELIVERABLE_CATALOG_MARKER;
}

function createCatalogNoDeliverableResolver(activityCatalog: ActivityCatalog[] = []) {
  const catalogIds = new Set<string>();
  const catalogActivityKeys = new Set<string>();

  activityCatalog.forEach((catalogActivity) => {
    if (!isCatalogDeliverableNotApplicable(catalogActivity.deliverables)) return;

    catalogIds.add(normalizeSignatureValue(catalogActivity.id));
    catalogActivityKeys.add([
      normalizeSignatureValue(catalogActivity.saCode),
      normalizeSignatureValue(catalogActivity.activityName),
    ].join('|'));
  });

  return (activity: Activity) => {
    const catalogActivityId = normalizeSignatureValue(activity.catalogActivityId);
    if (catalogActivityId && catalogIds.has(catalogActivityId)) return true;

    const activityName = normalizeSignatureValue(activity.activityType || activity.title);
    if (!activityName) return false;

    return catalogActivityKeys.has([
      normalizeSignatureValue(activity.saCode),
      activityName,
    ].join('|'));
  };
}

function needsDeliverableValidation(
  activity: Activity,
  expertCategory: string | undefined,
  isCatalogException: (activity: Activity) => boolean,
) {
  if (isCatalogException(activity)) return false;

  if (normalizePeoCategory(expertCategory) === 'bh') {
    const businessHubMeta = parseBusinessHubMetaJson(activity.businessHubMetaJson);
    if (businessHubMeta && getBusinessHubMetaMissingFields(businessHubMeta).length === 0) {
      return false;
    }
  }

  return !isActivityExceptionForSubmit(activity)
    && !(expertCategory === 'gdpr' && activity.gdprTemplateCode);
}

export function createActivityDeliverableAvailabilityResolver(activities: Activity[]) {
  const periodDeliverableAvailability = new Map<string, boolean>();
  const monthlySocialMediaDeliverableAvailability = new Map<string, boolean>();
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);

  activities.forEach((activity) => {
    const groupId = getActivityPeriodGroupKey(activity, inferredLegacyGroups);
    const monthlySocialMediaSignature = getMonthlySocialMediaDeliverableSignature(activity);

    if (groupId) {
      periodDeliverableAvailability.set(
        groupId,
        (periodDeliverableAvailability.get(groupId) ?? false) || hasUsableDeliverable(activity.deliverables),
      );
    }

    if (monthlySocialMediaSignature) {
      monthlySocialMediaDeliverableAvailability.set(
        monthlySocialMediaSignature,
        (monthlySocialMediaDeliverableAvailability.get(monthlySocialMediaSignature) ?? false)
          || hasUsableDeliverable(activity.deliverables),
      );
    }
  });

  return (activity: Activity) => {
    const groupId = getActivityPeriodGroupKey(activity, inferredLegacyGroups);
    const monthlySocialMediaSignature = getMonthlySocialMediaDeliverableSignature(activity);

    return (groupId ? periodDeliverableAvailability.get(groupId) === true : false)
      || (monthlySocialMediaSignature
        ? monthlySocialMediaDeliverableAvailability.get(monthlySocialMediaSignature) === true
        : false)
      || hasUsableDeliverable(activity.deliverables);
  };
}

export function getActivitiesMissingDeliverables(
  activities: Activity[],
  options: GetActivitiesMissingDeliverablesOptions = {},
) {
  const { expertCategory, activityCatalog } = options;
  const groupedActivities = new Map<string, Activity[]>();
  const standaloneActivities: Activity[] = [];
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);
  const hasAvailableDeliverable = createActivityDeliverableAvailabilityResolver(activities);
  const isCatalogException = createCatalogNoDeliverableResolver(activityCatalog);

  activities.forEach((activity) => {
    if (!needsDeliverableValidation(activity, expertCategory, isCatalogException)) return;

    const groupId = getActivityPeriodGroupKey(activity, inferredLegacyGroups);
    if (!groupId) {
      standaloneActivities.push(activity);
      return;
    }

    const group = groupedActivities.get(groupId) ?? [];
    group.push(activity);
    groupedActivities.set(groupId, group);
  });

  const standaloneMissing = standaloneActivities.filter((activity) => !hasAvailableDeliverable(activity));
  const groupedMissing = Array.from(groupedActivities.values()).flatMap((group) => {
    const groupHasDeliverable = group.some((activity) => hasAvailableDeliverable(activity));
    if (groupHasDeliverable) return [];

    return group;
  });

  return [...standaloneMissing, ...groupedMissing];
}
