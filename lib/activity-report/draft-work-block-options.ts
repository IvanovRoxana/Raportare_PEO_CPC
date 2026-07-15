import type { Activity } from '../types.ts';
import type { ReportingWorkBlockBundle } from './work-blocks.ts';

export interface DraftWorkBlockActivityOption {
  activityId: string;
  date: string;
  title: string;
  saCode: string;
  totalHours: number;
  allocatedHours: number;
  remainingHours: number;
  isFullyAllocated: boolean;
}

export function buildDraftWorkBlockActivityOptions({
  activities,
  existingBundles = [],
  editingWorkBlockId,
}: {
  activities: Activity[];
  existingBundles?: ReportingWorkBlockBundle[];
  editingWorkBlockId?: string;
}): DraftWorkBlockActivityOption[] {
  const allocatedByActivity = getAllocatedHoursByActivity(existingBundles, editingWorkBlockId);

  return [...activities]
    .sort((first, second) => first.date.localeCompare(second.date) || first.title.localeCompare(second.title))
    .map((activity) => {
      const totalHours = roundHours(Number(activity.hours) || 0);
      const allocatedHours = roundHours(allocatedByActivity.get(activity.id) ?? 0);
      const remainingHours = roundHours(Math.max(0, totalHours - allocatedHours));

      return {
        activityId: activity.id,
        date: activity.date,
        title: activity.title,
        saCode: activity.saCode || 'SA neprecizata',
        totalHours,
        allocatedHours,
        remainingHours,
        isFullyAllocated: remainingHours <= 0,
      };
    });
}

export function getUnallocatedActivityCount(options: DraftWorkBlockActivityOption[]) {
  return options.filter((option) => option.remainingHours > 0).length;
}

export function getUnallocatedHoursTotal(options: DraftWorkBlockActivityOption[]) {
  return roundHours(options.reduce((sum, option) => sum + option.remainingHours, 0));
}

function getAllocatedHoursByActivity(
  existingBundles: ReportingWorkBlockBundle[],
  editingWorkBlockId?: string,
) {
  const allocatedByActivity = new Map<string, number>();

  for (const bundle of existingBundles) {
    if (editingWorkBlockId && bundle.workBlock.id === editingWorkBlockId) continue;

    for (const link of bundle.activityLinks) {
      allocatedByActivity.set(
        link.activityId,
        roundHours((allocatedByActivity.get(link.activityId) ?? 0) + (Number(link.allocatedHours) || 0)),
      );
    }
  }

  return allocatedByActivity;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
