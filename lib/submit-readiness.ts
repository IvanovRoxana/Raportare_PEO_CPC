import type { Activity, Deliverable } from './types.ts';
import { isExceptionActivity } from './peo-constants.ts';

export const ACTIVITY_PERIOD_GROUP_PREFIX = 'activity-period:';
const LEGACY_ACTIVITY_PERIOD_GROUP_PREFIX = 'legacy-activity-period:';
const LEGACY_ACTIVITY_PERIOD_WINDOW_MS = 30 * 1000;

export function createActivityPeriodGroupId(id: string) {
  return `${ACTIVITY_PERIOD_GROUP_PREFIX}${id}`;
}

function getActivityPeriodGroupId(activity: Activity) {
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
  if (activity.workingGroupId) return null;
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
}

function needsDeliverableValidation(activity: Activity, expertCategory?: string) {
  return !isActivityExceptionForSubmit(activity)
    && !(expertCategory === 'gdpr' && activity.gdprTemplateCode);
}

export function createActivityDeliverableAvailabilityResolver(activities: Activity[]) {
  const periodDeliverableAvailability = new Map<string, boolean>();
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);

  activities.forEach((activity) => {
    const groupId = getEffectiveActivityPeriodGroupId(activity, inferredLegacyGroups);
    if (!groupId) return;

    periodDeliverableAvailability.set(
      groupId,
      (periodDeliverableAvailability.get(groupId) ?? false) || hasUsableDeliverable(activity.deliverables),
    );
  });

  return (activity: Activity) => {
    const groupId = getEffectiveActivityPeriodGroupId(activity, inferredLegacyGroups);
    return groupId
      ? periodDeliverableAvailability.get(groupId) === true
      : hasUsableDeliverable(activity.deliverables);
  };
}

export function getActivitiesMissingDeliverables(
  activities: Activity[],
  options: GetActivitiesMissingDeliverablesOptions = {},
) {
  const { expertCategory } = options;
  const groupedActivities = new Map<string, Activity[]>();
  const standaloneActivities: Activity[] = [];
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);

  activities.forEach((activity) => {
    if (!needsDeliverableValidation(activity, expertCategory)) return;

    const groupId = getEffectiveActivityPeriodGroupId(activity, inferredLegacyGroups);
    if (!groupId) {
      standaloneActivities.push(activity);
      return;
    }

    const group = groupedActivities.get(groupId) ?? [];
    group.push(activity);
    groupedActivities.set(groupId, group);
  });

  const standaloneMissing = standaloneActivities.filter((activity) => !hasUsableDeliverable(activity.deliverables));
  const groupedMissing = Array.from(groupedActivities.values()).flatMap((group) => {
    const groupHasDeliverable = group.some((activity) => hasUsableDeliverable(activity.deliverables));
    if (groupHasDeliverable) return [];

    return group;
  });

  return [...standaloneMissing, ...groupedMissing];
}
