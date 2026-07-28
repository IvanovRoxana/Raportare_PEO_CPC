import type { Activity, Deliverable } from './types';
import {
  createActivityPeriodGroupId,
  inferLegacyActivityPeriodGroups,
} from './submit-readiness.ts';
import {
  dedupeDeliverablesBySignature,
  getDeliverableDocumentSignature,
} from './deliverable-deduplication.ts';
import {
  areComCommunicationMultiGroupActivities,
  getComCommunicationMultiGroupKey,
} from './activity-multigroup-rules.ts';

export type ActivityEditScope = 'single' | 'series';

function createGeneratedActivityId() {
  return `activity-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function getActivityEditGroupId(activity: Pick<Activity, 'periodGroupId' | 'workingGroupId'>) {
  return activity.periodGroupId
    || (activity.workingGroupId?.startsWith('activity-period:') ? activity.workingGroupId : undefined);
}

export function getActivityGroupMembers(activity: Activity, activities: Activity[]) {
  const groupId = getActivityEditGroupId(activity);
  const inferredLegacyGroups = groupId ? undefined : inferLegacyActivityPeriodGroups(activities);
  const inferredGroupId = inferredLegacyGroups?.get(activity.id);
  const members = groupId
    ? activities.filter((candidate) => (
        getActivityEditGroupId(candidate) === groupId
        && isSameEditableActivity(activity, candidate)
      ))
    : inferredGroupId
      ? activities.filter((candidate) => (
          inferredLegacyGroups?.get(candidate.id) === inferredGroupId
          && isSameEditableActivity(activity, candidate)
        ))
      : [activity];

  return members.length > 0
    ? [...members].sort((first, second) => first.date.localeCompare(second.date))
    : [activity];
}

function normalizeMatchValue(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

export function isSameEditableActivity(activity: Activity, candidate: Activity) {
  if (activity.id === candidate.id) return true;
  if (activity.expertId && candidate.expertId && activity.expertId !== candidate.expertId) return false;

  if (areComCommunicationMultiGroupActivities(activity, candidate)) return true;

  if (activity.catalogActivityId || candidate.catalogActivityId) {
    return Boolean(activity.catalogActivityId && activity.catalogActivityId === candidate.catalogActivityId);
  }

  return normalizeMatchValue(activity.saCode) === normalizeMatchValue(candidate.saCode)
    && normalizeMatchValue(activity.activityType || activity.title) === normalizeMatchValue(candidate.activityType || candidate.title);
}

export function getActivityGroupMembersForSelectedDates(
  activity: Activity,
  activities: Activity[],
  selectedDates: string[],
) {
  const groupMembers = getActivityGroupMembers(activity, activities);
  const memberIds = new Set(groupMembers.map((member) => member.id));
  const selectedDateSet = new Set(selectedDates);
  const selectedDateMatches = activities.filter((candidate) => (
    selectedDateSet.has(candidate.date)
    && !memberIds.has(candidate.id)
    && isSameEditableActivity(activity, candidate)
  ));

  return [...groupMembers, ...selectedDateMatches].sort((first, second) => first.date.localeCompare(second.date));
}

export function dedupeDeliverables(deliverables: Deliverable[]) {
  return dedupeDeliverablesBySignature(deliverables);
}

function getActivityEditGroupKey(
  activity: Activity,
  inferredLegacyGroups: Map<string, string>,
) {
  const groupId = getActivityEditGroupId(activity)
    ?? inferredLegacyGroups.get(activity.id)
    ?? activity.id;
  const expertKey = normalizeMatchValue(activity.expertId);
  const multiGroupKey = getComCommunicationMultiGroupKey(activity);
  const catalogKey = normalizeMatchValue(activity.catalogActivityId);
  const activityKey = multiGroupKey
    ? multiGroupKey
    : catalogKey
    ? `catalog:${catalogKey}`
    : `manual:${normalizeMatchValue(activity.saCode)}:${normalizeMatchValue(activity.activityType || activity.title)}`;

  return `${groupId}:${expertKey}:${activityKey}`;
}

export function mergeActivityGroupForEdit(activity: Activity, activities: Activity[]) {
  const groupMembers = getActivityGroupMembers(activity, activities);
  const groupId = getActivityEditGroupId(activity)
    ?? (groupMembers.length > 1
      ? createActivityPeriodGroupId(`legacy-${groupMembers[0].id}`)
      : undefined);

  return {
    activity: {
      ...activity,
      periodGroupId: activity.periodGroupId ?? groupId,
      workingGroupId: activity.workingGroupId ?? groupId,
      deliverables: dedupeDeliverables(groupMembers.flatMap((member) => member.deliverables ?? [])),
    },
    groupMembers,
  };
}

export function compileActivitiesByPeriodGroup(activities: Activity[]) {
  const grouped = new Map<string, Activity[]>();
  const order: string[] = [];
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);

  activities.forEach((activity) => {
    const key = getActivityEditGroupKey(activity, inferredLegacyGroups);
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)?.push(activity);
  });

  return order.map((key) => {
    const members = [...(grouped.get(key) ?? [])].sort((first, second) => first.date.localeCompare(second.date));
    const first = members[0];
    if (!first || members.length === 1) {
      return first;
    }

    return {
      ...first,
      date: members.map((activity) => activity.date).join(', '),
      hours: members.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0),
      deliverables: dedupeDeliverables(members.flatMap((activity) => activity.deliverables ?? [])),
    };
  }).filter((activity): activity is Activity => Boolean(activity));
}

export type GroupedActivityDeletionPlan = {
  updateActivities: Activity[];
  previousActivities: Activity[];
};

export function planGroupedActivityDeletion(
  activityToDelete: Activity,
  activities: Activity[],
): GroupedActivityDeletionPlan {
  const groupMembers = getActivityGroupMembers(activityToDelete, activities);
  const remainingMembers = groupMembers.filter((activity) => activity.id !== activityToDelete.id);
  if (remainingMembers.length === 0) {
    return { updateActivities: [], previousActivities: [] };
  }

  const updatesById = new Map<string, Activity>();
  const explicitGroupId = getActivityEditGroupId(activityToDelete);
  const normalizedLegacyGroupId = !explicitGroupId && groupMembers.length > 1 && remainingMembers.length > 1
    ? createActivityPeriodGroupId(`legacy-${groupMembers[0].id}`)
    : undefined;

  if (normalizedLegacyGroupId) {
    remainingMembers.forEach((activity) => {
      updatesById.set(activity.id, {
        ...activity,
        periodGroupId: normalizedLegacyGroupId,
        workingGroupId: normalizedLegacyGroupId,
      });
    });
  }

  const remainingDeliverableSignatures = new Set(
    remainingMembers
      .flatMap((activity) => activity.deliverables ?? [])
      .map(getDeliverableDocumentSignature)
      .filter((signature): signature is string => Boolean(signature)),
  );
  const orphanedDeliverables = (activityToDelete.deliverables ?? []).filter((deliverable) => {
    const signature = getDeliverableDocumentSignature(deliverable);
    return !signature || !remainingDeliverableSignatures.has(signature);
  });

  if (orphanedDeliverables.length > 0) {
    const carrier = remainingMembers[0];
    const currentCarrier = updatesById.get(carrier.id) ?? carrier;
    updatesById.set(carrier.id, {
      ...currentCarrier,
      deliverables: dedupeDeliverables([
        ...(currentCarrier.deliverables ?? []),
        ...orphanedDeliverables,
      ]),
    });
  }

  const updateActivities = [...updatesById.values()];
  const updatedIds = new Set(updateActivities.map((activity) => activity.id));
  return {
    updateActivities,
    previousActivities: remainingMembers.filter((activity) => updatedIds.has(activity.id)),
  };
}

export async function executeGroupedActivityDeletion(
  activityId: string,
  plan: GroupedActivityDeletionPlan,
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<unknown>,
  removeActivity: (id: string) => Promise<unknown>,
) {
  await Promise.all(
    plan.updateActivities.map((activity) => updateActivity(activity.id, activity)),
  );

  try {
    await removeActivity(activityId);
  } catch (error) {
    await Promise.all(
      plan.previousActivities.map((activity) => updateActivity(activity.id, activity)),
    );
    throw error;
  }
}

export function splitActivityEditPayload(
  editingActivity: Pick<Activity, 'id'>,
  submittedActivities: Activity[],
  expertId: string,
): { existingActivity: Activity; newActivities: Activity[] } {
  const existingActivityDraft = submittedActivities.find((activity) => activity.id === editingActivity.id);
  if (!existingActivityDraft) {
    throw new Error('Activitatea editata nu poate fi salvata fara identificatorul existent.');
  }

  return {
    existingActivity: {
      ...existingActivityDraft,
      id: editingActivity.id,
      expertId,
    },
    newActivities: submittedActivities
      .filter((activity) => activity.id !== editingActivity.id)
      .map((activity) => ({
        ...activity,
        expertId,
      })),
  };
}

export function buildSubmittedActivitiesForEdit(
  editingActivity: Activity,
  submittedActivities: Activity[],
  selectedDates: string[],
  selectedHours: Record<string, string>,
  existingGroupMembers: Activity[],
  expertId: string,
  normalizeHours: (value: string | number | undefined, fallback: string) => string,
  editScope?: ActivityEditScope,
) {
  const templateActivity = submittedActivities.find((activity) => activity.id === editingActivity.id)
    ?? submittedActivities[0]
    ?? editingActivity;
  const submittedByDate = new Map(submittedActivities.map((activity) => [activity.date, activity]));
  const existingByDate = new Map(existingGroupMembers.map((activity) => [activity.date, activity]));
  const datesForSave = editScope === 'single' && existingGroupMembers.length > 1
    ? existingGroupMembers.map((activity) => activity.date)
    : selectedDates.length > 0
      ? selectedDates
      : submittedActivities.map((activity) => activity.date);
  const uniqueDates = [...new Set(datesForSave)].sort();
  const existingGroupId = getActivityEditGroupId(editingActivity);
  const periodGroupId = existingGroupId
    ?? (uniqueDates.length > 1 ? createActivityPeriodGroupId(`edit-${editingActivity.id}`) : undefined);
  const detachedActivityGroupId = editScope === 'single' && existingGroupMembers.length > 1
    ? createActivityPeriodGroupId(`single-${editingActivity.id}`)
    : undefined;
  const submittedGroupDeliverables = dedupeDeliverables(submittedActivities.flatMap((activity) => activity.deliverables ?? []));
  const existingGroupDeliverables = dedupeDeliverables(existingGroupMembers.flatMap((activity) => activity.deliverables ?? []));
  const shouldNormalizeGroupDeliverables = editScope !== 'single'
    && existingGroupMembers.length > 1
    && existingGroupMembers.length > 0;
  const groupDeliverables = submittedGroupDeliverables.length > 0
    ? submittedGroupDeliverables
    : existingGroupDeliverables;
  const groupDeliverableCarrierDate = submittedActivities.find((activity) => (activity.deliverables?.length ?? 0) > 0)?.date
    ?? submittedActivities[0]?.date
    ?? uniqueDates[0];
  const submittedActivityDates = new Set(submittedActivities.map((activity) => activity.date));
  const submittedAllDates = uniqueDates.every((date) => submittedActivityDates.has(date));

  const resolveDeliverablesForDate = (date: string, fallback?: Deliverable[]) => {
    if (editScope === 'series') return submittedGroupDeliverables;
    if (!shouldNormalizeGroupDeliverables) return fallback;
    return date === groupDeliverableCarrierDate ? groupDeliverables : [];
  };

  return uniqueDates.map((date) => {
    const existingActivityForDate = existingByDate.get(date);
    const submittedActivityForDate = submittedByDate.get(date);
    const submittedUpdatesExistingActivity = Boolean(
      submittedActivityForDate
      && existingActivityForDate
      && submittedActivityForDate.id === existingActivityForDate.id,
    );
    const preserveExistingActivity = Boolean(existingActivityForDate && !submittedUpdatesExistingActivity);
    const incomingDeliverables = submittedActivityForDate?.deliverables ?? [];
    const seriesSourceActivity = submittedActivityForDate ?? templateActivity;
    const sourceActivity: Activity = editScope === 'series' && existingActivityForDate
      ? {
          ...existingActivityForDate,
          ...seriesSourceActivity,
          id: existingActivityForDate.id,
          date: existingActivityForDate.date,
          hours: existingActivityForDate.hours,
          status: existingActivityForDate.status,
          pmNotes: existingActivityForDate.pmNotes,
          deliverables: resolveDeliverablesForDate(date, existingActivityForDate.deliverables),
          createdAt: existingActivityForDate.createdAt,
        }
      : preserveExistingActivity && existingActivityForDate
        ? {
            ...existingActivityForDate,
            deliverables: resolveDeliverablesForDate(
              date,
              incomingDeliverables.length > 0
                ? dedupeDeliverables([...(existingActivityForDate.deliverables ?? []), ...incomingDeliverables])
                : existingActivityForDate.deliverables,
            ),
          }
        : {
            ...(submittedActivityForDate ?? existingActivityForDate ?? templateActivity),
            deliverables: resolveDeliverablesForDate(
              date,
              (submittedActivityForDate ?? existingActivityForDate ?? templateActivity).deliverables,
            ),
          };
    const activityId = existingActivityForDate?.id
      ?? (submittedActivityForDate?.id === editingActivity.id
        ? editingActivity.id
        : sourceActivity.id !== editingActivity.id
          ? sourceActivity.id
          : createGeneratedActivityId());
    const selectedHoursForDate = Number(normalizeHours(selectedHours[date], editingActivity.hours.toString()));
    const submittedHoursForDate = Number(submittedActivityForDate?.hours);
    const sourceHours = Number(sourceActivity.hours);
    const hasSubmittedHoursForDate = Boolean(
      submittedAllDates
      && editScope === 'series'
      && submittedActivityForDate
      && Number.isFinite(submittedHoursForDate)
      && submittedHoursForDate > 0,
    );
    const hours = editScope === 'series'
      ? hasSubmittedHoursForDate
        ? submittedHoursForDate
        : existingActivityForDate?.hours ?? selectedHoursForDate
      : preserveExistingActivity && existingActivityForDate
        ? existingActivityForDate.hours
      : Number.isFinite(sourceHours) && sourceHours > 0
        ? sourceHours
        : selectedHoursForDate;

    const isDetachedActivity = Boolean(detachedActivityGroupId && date === editingActivity.date);

    return {
      ...sourceActivity,
      id: activityId,
      date,
      expertId,
      hours,
      workingGroupId: isDetachedActivity
        ? detachedActivityGroupId
        : periodGroupId ?? sourceActivity.workingGroupId,
      periodGroupId: isDetachedActivity ? detachedActivityGroupId : periodGroupId,
    };
  });
}

export function planGroupedActivityEdit(
  editingActivity: Pick<Activity, 'id'>,
  submittedActivities: Activity[],
  existingGroupMembers: Activity[],
  expertId: string,
): { updateActivities: Activity[]; newActivities: Activity[]; deleteActivityIds: string[] } {
  const existingIds = new Set(existingGroupMembers.map((activity) => activity.id));
  const submittedIds = new Set(submittedActivities.map((activity) => activity.id));

  if (!submittedIds.has(editingActivity.id) && !submittedActivities.some((activity) => existingIds.has(activity.id))) {
    throw new Error('Activitatea editata nu poate fi salvata fara identificatorul existent.');
  }

  return {
    updateActivities: submittedActivities
      .filter((activity) => existingIds.has(activity.id))
      .map((activity) => ({ ...activity, expertId })),
    newActivities: submittedActivities
      .filter((activity) => !existingIds.has(activity.id))
      .map((activity) => ({ ...activity, expertId })),
    deleteActivityIds: existingGroupMembers
      .filter((activity) => !submittedIds.has(activity.id))
      .map((activity) => activity.id),
  };
}

export function prepareExistingActivityUpdate(
  editingActivity: Pick<Activity, 'id'>,
  submittedActivities: Activity[],
  expertId: string,
): Activity {
  if (submittedActivities.length !== 1) {
    throw new Error('Editarea poate salva o singura activitate existenta.');
  }

  return splitActivityEditPayload(editingActivity, submittedActivities, expertId).existingActivity;
}
