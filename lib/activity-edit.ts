import type { Activity } from './types';

export function prepareExistingActivityUpdate(
  editingActivity: Pick<Activity, 'id'>,
  submittedActivities: Activity[],
  expertId: string,
): Activity {
  if (submittedActivities.length !== 1) {
    throw new Error('Editarea poate salva o singura activitate existenta.');
  }

  const [activity] = submittedActivities;
  if (!activity?.id || activity.id !== editingActivity.id) {
    throw new Error('Activitatea editata nu poate fi salvata fara identificatorul existent.');
  }

  return {
    ...activity,
    id: editingActivity.id,
    expertId,
  };
}
