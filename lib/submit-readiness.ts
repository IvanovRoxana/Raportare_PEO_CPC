import type { Activity, Deliverable } from './types.ts';
import { isExceptionActivity } from './peo-constants.ts';

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

export function getActivitiesMissingDeliverables(
  activities: Activity[],
  options: GetActivitiesMissingDeliverablesOptions = {},
) {
  const { expertCategory } = options;
  const groupedActivities = new Map<string, Activity[]>();
  const standaloneActivities: Activity[] = [];

  activities.forEach((activity) => {
    if (!needsDeliverableValidation(activity, expertCategory)) return;

    if (!activity.periodGroupId) {
      standaloneActivities.push(activity);
      return;
    }

    const group = groupedActivities.get(activity.periodGroupId) ?? [];
    group.push(activity);
    groupedActivities.set(activity.periodGroupId, group);
  });

  const standaloneMissing = standaloneActivities.filter((activity) => !hasUsableDeliverable(activity.deliverables));
  const groupedMissing = Array.from(groupedActivities.values()).flatMap((group) => {
    const groupHasDeliverable = group.some((activity) => hasUsableDeliverable(activity.deliverables));
    if (groupHasDeliverable) return [];

    return group;
  });

  return [...standaloneMissing, ...groupedMissing];
}
