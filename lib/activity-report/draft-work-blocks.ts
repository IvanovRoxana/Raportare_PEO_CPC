import type { Activity } from '../types.ts';
import { isActivityClassificationPending } from '../activity-classification.ts';
import {
  validateWorkBlockAllocation,
  type ReportingFlowType,
  type ReportingWorkBlockBundle,
} from './work-blocks.ts';

export type DraftWorkBlockValidationIssue = {
  code:
    | 'missing_activity_selection'
    | 'missing_activity'
    | 'activity_outside_period'
    | 'activity_expert_mismatch'
    | 'pending_classification'
    | 'missing_title'
    | 'missing_sa'
    | 'invalid_allocated_hours'
    | 'over_allocated_activity';
  message: string;
  activityId?: string;
};

export interface DraftWorkBlockInput {
  id?: string;
  expertId: string;
  projectCode: string;
  month: number;
  year: number;
  title: string;
  saCode: string;
  reportingFlowType: ReportingFlowType;
  activityIds: string[];
  allocatedHoursByActivityId?: Record<string, number>;
  deliverableIds?: string[];
  existingBundles?: ReportingWorkBlockBundle[];
  cleanedActivitySummary?: string;
  generatedTableSummary?: string;
  generatedNarrative?: string;
  generationInputsHash?: string;
  aiConsolidationStatus?: string;
  aiConsolidationUpdatedAt?: string;
}

export interface PreparedDraftWorkBlock {
  bundle: ReportingWorkBlockBundle | null;
  issues: DraftWorkBlockValidationIssue[];
}

export interface PreparedDraftWorkBlockSave extends PreparedDraftWorkBlock {
  canSave: boolean;
}

export function prepareDraftWorkBlockBundle(
  input: DraftWorkBlockInput,
  activities: Activity[],
): PreparedDraftWorkBlock {
  const selectedActivities = getSelectedActivities(input, activities);
  const bundle = selectedActivities.length > 0 ? buildDraftBundle(input, selectedActivities) : null;
  const issues = validateDraftWorkBlockInput(input, activities, bundle);

  return {
    bundle: issues.length === 0 ? bundle : null,
    issues,
  };
}

export function prepareDraftWorkBlockSave(
  input: DraftWorkBlockInput,
  activities: Activity[],
): PreparedDraftWorkBlockSave {
  const preparedDraft = prepareDraftWorkBlockBundle(input, activities);

  return {
    ...preparedDraft,
    canSave: preparedDraft.bundle !== null && preparedDraft.issues.length === 0,
  };
}

export function validateDraftWorkBlockInput(
  input: DraftWorkBlockInput,
  activities: Activity[],
  draftBundle = getSelectedActivities(input, activities).length > 0
    ? buildDraftBundle(input, getSelectedActivities(input, activities))
    : null,
): DraftWorkBlockValidationIssue[] {
  const issues: DraftWorkBlockValidationIssue[] = [];
  const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
  const selectedIds = [...new Set(input.activityIds)];

  if (selectedIds.length === 0) {
    issues.push({
      code: 'missing_activity_selection',
      message: 'Selecteaza cel putin o activitate pentru work block.',
    });
  }

  if (!input.title.trim()) {
    issues.push({
      code: 'missing_title',
      message: 'Completeaza titlul work block-ului.',
    });
  }

  if (!input.saCode.trim()) {
    issues.push({
      code: 'missing_sa',
      message: 'Selecteaza SA pentru work block.',
    });
  }

  for (const activityId of selectedIds) {
    const activity = activitiesById.get(activityId);
    if (!activity) {
      issues.push({
        code: 'missing_activity',
        message: `Activitatea ${activityId} nu exista in luna curenta.`,
        activityId,
      });
      continue;
    }

    if (activity.expertId !== input.expertId) {
      issues.push({
        code: 'activity_expert_mismatch',
        message: `Activitatea ${activityId} apartine altui expert.`,
        activityId,
      });
    }

    if (isActivityClassificationPending(activity)) {
      issues.push({
        code: 'pending_classification',
        message: `Activitatea din ${activity.date} așteaptă încadrarea de către PM și nu poate fi inclusă în Anexa 10.`,
        activityId,
      });
    }

    if (getActivityMonth(activity) !== input.month || getActivityYear(activity) !== input.year) {
      issues.push({
        code: 'activity_outside_period',
        message: `Activitatea ${activityId} nu apartine lunii raportate.`,
        activityId,
      });
    }

    const allocatedHours = getAllocatedHours(input, activity);
    if (allocatedHours <= 0 || allocatedHours > Number(activity.hours || 0)) {
      issues.push({
        code: 'invalid_allocated_hours',
        message: `Activitatea ${activityId} are ore alocate invalide.`,
        activityId,
      });
    }
  }

  if (draftBundle) {
    const allocationProblems = validateWorkBlockAllocation(
      activities,
      [
        ...(input.existingBundles ?? []).filter((bundle) => bundle.workBlock.id !== draftBundle.workBlock.id),
        draftBundle,
      ],
    );

    for (const problem of allocationProblems) {
      if (problem.code !== 'over_allocated_activity') continue;
      issues.push({
        code: 'over_allocated_activity',
        message: problem.message,
        activityId: problem.activityId,
      });
    }
  }

  return issues;
}

function buildDraftBundle(input: DraftWorkBlockInput, activities: Activity[]): ReportingWorkBlockBundle {
  const workBlockId = input.id ?? buildDraftWorkBlockId(input);
  const selectedActivities = [...activities].sort((first, second) => first.date.localeCompare(second.date));
  const deliverableIds = [...new Set(input.deliverableIds ?? [])];

  return {
    workBlock: {
      id: workBlockId,
      expertId: input.expertId,
      projectCode: input.projectCode,
      month: input.month,
      year: input.year,
      title: input.title.trim(),
      saCode: input.saCode.trim(),
      reportingFlowType: input.reportingFlowType,
      status: 'draft',
      cleanedActivitySummary: input.cleanedActivitySummary,
      generatedTableSummary: input.generatedTableSummary,
      generatedNarrative: input.generatedNarrative,
      generationInputsHash: input.generationInputsHash,
      aiConsolidationStatus: input.aiConsolidationStatus,
      aiConsolidationUpdatedAt: input.aiConsolidationUpdatedAt,
    },
    activityLinks: selectedActivities.map((activity) => ({
      id: `${workBlockId}:activity:${activity.id}`,
      workBlockId,
      activityId: activity.id,
      allocatedHours: getAllocatedHours(input, activity),
      activityDate: activity.date,
    })),
    deliverableLinks: deliverableIds.map((deliverableId, index) => ({
      id: `${workBlockId}:deliverable:${deliverableId}`,
      workBlockId,
      deliverableId,
      isPrimary: index === 0,
    })),
  };
}

function getSelectedActivities(input: DraftWorkBlockInput, activities: Activity[]) {
  const selectedIds = new Set(input.activityIds);
  return activities.filter((activity) => selectedIds.has(activity.id));
}

function getAllocatedHours(input: DraftWorkBlockInput, activity: Activity) {
  const explicitHours = input.allocatedHoursByActivityId?.[activity.id];
  return roundHours(explicitHours ?? Number(activity.hours || 0));
}

function buildDraftWorkBlockId(input: DraftWorkBlockInput) {
  const activityKey = [...new Set(input.activityIds)].sort().join('-') || 'empty';
  return `draft-work-block:${input.expertId}:${input.year}-${input.month}:${slugify(input.title)}:${activityKey}`;
}

function getActivityMonth(activity: Activity) {
  return Number(activity.date.slice(5, 7)) - 1;
}

function getActivityYear(activity: Activity) {
  return Number(activity.date.slice(0, 4));
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
}
