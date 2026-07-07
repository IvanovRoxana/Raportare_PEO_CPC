import type { Activity } from './types';

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
