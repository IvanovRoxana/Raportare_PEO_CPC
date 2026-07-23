import type { Activity } from '../types.ts';
import { buildWorkBlocks, type ReportingWorkBlockBundle } from './work-blocks.ts';
import type { DraftWorkBlockInput } from './draft-work-blocks.ts';
import type { ActivityEditScope } from '../activity-edit.ts';

type BuildActivitySaveWorkBlockInputArgs = {
  savedActivities: Activity[];
  sourceActivityId?: string;
  editScope?: ActivityEditScope;
  expertId: string;
  projectCode: string;
  month: number;
  year: number;
  existingBundles?: ReportingWorkBlockBundle[];
};

export function buildActivitySaveWorkBlockInput({
  savedActivities,
  sourceActivityId,
  editScope,
  expertId,
  projectCode,
  month,
  year,
  existingBundles = [],
}: BuildActivitySaveWorkBlockInputArgs): DraftWorkBlockInput | null {
  const targetActivities = getTargetActivities(savedActivities, sourceActivityId, editScope)
    .filter((activity) => activity.expertId === expertId)
    .filter((activity) => getActivityMonth(activity) === month && getActivityYear(activity) === year)
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  if (targetActivities.length === 0) return null;

  const bundle = buildWorkBlocks(targetActivities)[0];
  if (!bundle) return null;

  return {
    id: bundle.workBlock.id,
    expertId,
    projectCode,
    month,
    year,
    title: bundle.workBlock.title,
    saCode: bundle.workBlock.saCode,
    reportingFlowType: bundle.workBlock.reportingFlowType,
    activityIds: bundle.activityLinks.map((link) => link.activityId),
    allocatedHoursByActivityId: Object.fromEntries(
      bundle.activityLinks.map((link) => [link.activityId, link.allocatedHours]),
    ),
    deliverableIds: bundle.deliverableLinks.map((link) => link.deliverableId),
    existingBundles,
  };
}

function getTargetActivities(
  savedActivities: Activity[],
  sourceActivityId?: string,
  editScope?: ActivityEditScope,
) {
  if (editScope !== 'single' || !sourceActivityId) return savedActivities;
  return savedActivities.filter((activity) => activity.id === sourceActivityId);
}

function getActivityMonth(activity: Activity) {
  const dateMonth = Number(activity.date.slice(5, 7));
  return Number.isFinite(dateMonth) && dateMonth > 0 ? dateMonth - 1 : 0;
}

function getActivityYear(activity: Activity) {
  const dateYear = Number(activity.date.slice(0, 4));
  return Number.isFinite(dateYear) ? dateYear : new Date().getFullYear();
}
