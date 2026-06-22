import type { Activity, Deliverable } from './types.ts';
import { isExceptionActivity } from './peo-constants.ts';

export const ACTIVITY_PERIOD_GROUP_PREFIX = 'activity-period:';

export function createActivityPeriodGroupId(id: string) {
  return `${ACTIVITY_PERIOD_GROUP_PREFIX}${id}`;
}

function getActivityPeriodGroupId(activity: Activity) {
  return activity.workingGroupId?.startsWith(ACTIVITY_PERIOD_GROUP_PREFIX)
    ? activity.workingGroupId
    : undefined;
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

  activities.forEach((activity) => {
    const groupId = getActivityPeriodGroupId(activity);
    if (!groupId) return;

    periodDeliverableAvailability.set(
      groupId,
      (periodDeliverableAvailability.get(groupId) ?? false) || hasUsableDeliverable(activity.deliverables),
    );
  });

  return (activity: Activity) => {
    const groupId = getActivityPeriodGroupId(activity);
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

  activities.forEach((activity) => {
    if (!needsDeliverableValidation(activity, expertCategory)) return;

    const groupId = getActivityPeriodGroupId(activity);
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
