import type { Activity, Deliverable } from '../types.ts';

export type ReportingFlowType =
  | 'deliverable'
  | 'meeting'
  | 'event'
  | 'consultation'
  | 'project_coordination'
  | 'administrative'
  | 'leave'
  | 'report_preparation'
  | 'other';

export type ReportingWorkBlockStatus =
  | 'draft'
  | 'ready'
  | 'generated'
  | 'expert_validated'
  | 'pm_validated';

export interface ReportingWorkBlock {
  id: string;
  expertId: string;
  projectCode: string;
  month: number;
  year: number;
  title: string;
  saCode: string;
  activityCode?: string;
  activityCategory?: string;
  reportingFlowType: ReportingFlowType;
  status: ReportingWorkBlockStatus;
  expertContribution?: string;
  beneficiaries?: string[];
  indicatorContribution?: string;
  cleanedActivitySummary?: string;
  generatedTableSummary?: string;
  generatedNarrative?: string;
  generationInputsHash?: string;
  aiConsolidationStatus?: string;
  aiConsolidationUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkBlockActivityLink {
  id: string;
  workBlockId: string;
  activityId: string;
  allocatedHours: number;
  activityDate?: string;
}

export interface WorkBlockDeliverableLink {
  id: string;
  workBlockId: string;
  deliverableId: string;
  isPrimary: boolean;
  contributionType?:
    | 'created'
    | 'analysed'
    | 'reviewed'
    | 'consolidated'
    | 'updated'
    | 'presented'
    | 'supported';
}

export interface ReportingWorkBlockBundle {
  workBlock: ReportingWorkBlock;
  activityLinks: WorkBlockActivityLink[];
  deliverableLinks: WorkBlockDeliverableLink[];
}

export type WorkBlockAllocationProblem = {
  code:
    | 'missing_activity'
    | 'over_allocated_activity'
    | 'negative_allocated_hours'
    | 'zero_hour_work_block'
    | 'missing_sa';
  message: string;
  activityId?: string;
  workBlockId?: string;
};

export function buildWorkBlocks(activities: Activity[]): ReportingWorkBlockBundle[] {
  const groups = new Map<string, Activity[]>();

  for (const activity of activities) {
    const key = getWorkBlockGroupKey(activity);
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  }

  return [...groups.values()]
    .map((items) => buildWorkBlockBundle(items))
    .sort((first, second) => compareWorkBlockBundles(first, second));
}

export function calculateWorkBlockHours(activityLinks: Pick<WorkBlockActivityLink, 'allocatedHours'>[]) {
  return roundHours(activityLinks.reduce((sum, link) => sum + (Number(link.allocatedHours) || 0), 0));
}

export function sortWorkBlocks<T extends ReportingWorkBlockBundle>(bundles: T[]): T[] {
  return [...bundles].sort((first, second) => compareWorkBlockBundles(first, second));
}

export function groupWorkBlocksBySA<T extends ReportingWorkBlockBundle>(bundles: T[]) {
  return sortWorkBlocks(bundles).reduce<Record<string, T[]>>((groups, bundle) => {
    const key = bundle.workBlock.saCode || 'SA neprecizata';
    groups[key] = [...(groups[key] ?? []), bundle];
    return groups;
  }, {});
}

export function validateWorkBlockAllocation(
  activities: Activity[],
  bundles: ReportingWorkBlockBundle[],
): WorkBlockAllocationProblem[] {
  const problems: WorkBlockAllocationProblem[] = [];
  const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
  const allocatedByActivity = new Map<string, number>();

  for (const bundle of bundles) {
    if (!bundle.workBlock.saCode || bundle.workBlock.saCode === 'SA neprecizata') {
      problems.push({
        code: 'missing_sa',
        message: `Work block-ul "${bundle.workBlock.title}" nu are SA.`,
        workBlockId: bundle.workBlock.id,
      });
    }

    if (calculateWorkBlockHours(bundle.activityLinks) <= 0) {
      problems.push({
        code: 'zero_hour_work_block',
        message: `Work block-ul "${bundle.workBlock.title}" nu are ore alocate.`,
        workBlockId: bundle.workBlock.id,
      });
    }

    for (const link of bundle.activityLinks) {
      const activity = activitiesById.get(link.activityId);
      if (!activity) {
        problems.push({
          code: 'missing_activity',
          message: `Legatura ${link.id} refera o activitate inexistenta.`,
          activityId: link.activityId,
          workBlockId: link.workBlockId,
        });
      }

      if (link.allocatedHours < 0) {
        problems.push({
          code: 'negative_allocated_hours',
          message: `Legatura ${link.id} are ore negative.`,
          activityId: link.activityId,
          workBlockId: link.workBlockId,
        });
      }

      allocatedByActivity.set(
        link.activityId,
        roundHours((allocatedByActivity.get(link.activityId) ?? 0) + (Number(link.allocatedHours) || 0)),
      );
    }
  }

  for (const [activityId, allocatedHours] of allocatedByActivity) {
    const activity = activitiesById.get(activityId);
    if (!activity) continue;
    if (allocatedHours > roundHours(Number(activity.hours) || 0)) {
      problems.push({
        code: 'over_allocated_activity',
        message: `Activitatea "${activity.title}" are ${allocatedHours} ore alocate din ${activity.hours} ore pontate.`,
        activityId,
      });
    }
  }

  return problems;
}

function buildWorkBlockBundle(activities: Activity[]): ReportingWorkBlockBundle {
  const sortedActivities = [...activities].sort(compareActivities);
  const firstActivity = sortedActivities[0];
  const workBlockId = getStableWorkBlockId(sortedActivities);
  const deliverables = collectDeliverables(sortedActivities);

  return {
    workBlock: {
      id: workBlockId,
      expertId: firstActivity.expertId,
      projectCode: firstActivity.projectCode || '302141',
      month: getActivityMonth(firstActivity),
      year: getActivityYear(firstActivity),
      title: firstActivity.title || firstActivity.activityType || 'Activitate raportabila',
      saCode: firstActivity.saCode || 'SA neprecizata',
      activityCode: firstActivity.catalogActivityId,
      activityCategory: firstActivity.activityType,
      reportingFlowType: inferReportingFlowType(sortedActivities, deliverables),
      status: 'draft',
    },
    activityLinks: sortedActivities.map((activity) => ({
      id: `${workBlockId}:activity:${activity.id}`,
      workBlockId,
      activityId: activity.id,
      allocatedHours: roundHours(Number(activity.hours) || 0),
      activityDate: activity.date,
    })),
    deliverableLinks: deliverables.map((deliverable, index) => ({
      id: `${workBlockId}:deliverable:${getDeliverableId(deliverable)}`,
      workBlockId,
      deliverableId: getDeliverableId(deliverable),
      isPrimary: index === 0,
    })),
  };
}

function getWorkBlockGroupKey(activity: Activity) {
  if (activity.periodGroupId) return `period:${activity.periodGroupId}`;
  if (activity.workingGroupId) return `working:${activity.workingGroupId}`;
  return `activity:${activity.id}`;
}

function getStableWorkBlockId(activities: Activity[]) {
  const firstActivity = activities[0];
  const groupId = firstActivity.periodGroupId || firstActivity.workingGroupId;
  if (groupId) return `work-block:${groupId}`;
  return `work-block:activity:${firstActivity.id}`;
}

function collectDeliverables(activities: Activity[]) {
  const deliverablesById = new Map<string, Deliverable>();
  for (const activity of activities) {
    for (const deliverable of activity.deliverables ?? []) {
      deliverablesById.set(getDeliverableId(deliverable), deliverable);
    }
  }
  return [...deliverablesById.values()];
}

function inferReportingFlowType(activities: Activity[], deliverables: Deliverable[]): ReportingFlowType {
  if (activities.some((activity) => activity.dayType === 'CO' || activity.dayType === 'CM')) return 'leave';
  const text = activities
    .map((activity) => `${activity.activityType} ${activity.title} ${activity.description ?? ''}`)
    .join(' ')
    .toLowerCase();
  if (isReportPreparationText(text)) return 'report_preparation';
  if (/eveniment|event/.test(text)) return 'event';
  if (/consult/.test(text)) return 'consultation';
  if (/sedinta|ședință|reuniune|meeting/.test(text)) return 'meeting';
  if (/coordon/.test(text)) return 'project_coordination';
  if (deliverables.length > 0) return 'deliverable';
  return 'other';
}

function isReportPreparationText(text: string) {
  return /\belabor(?:are|area|at)?\b.*\b(?:ra|raport(?:ul|ului)?\s+de\s+activitate)\b/.test(text)
    || /\b(?:ra|raport(?:ul|ului)?\s+de\s+activitate)\b.*\bopis\b/.test(text)
    || /\bopis(?:-ului)?\b.*\blivrabile/i.test(text);
}

function compareWorkBlockBundles(first: ReportingWorkBlockBundle, second: ReportingWorkBlockBundle) {
  const firstDate = getFirstActivityDate(first);
  const secondDate = getFirstActivityDate(second);
  return first.workBlock.saCode.localeCompare(second.workBlock.saCode, 'ro')
    || firstDate.localeCompare(secondDate)
    || first.workBlock.title.localeCompare(second.workBlock.title, 'ro');
}

function getFirstActivityDate(bundle: ReportingWorkBlockBundle) {
  return bundle.activityLinks
    .map((link) => link.activityDate || '')
    .filter(Boolean)
    .sort()[0] ?? '';
}

function compareActivities(first: Activity, second: Activity) {
  return first.date.localeCompare(second.date) || first.id.localeCompare(second.id);
}

function getActivityMonth(activity: Activity) {
  const dateMonth = Number(activity.date.slice(5, 7));
  return Number.isFinite(dateMonth) && dateMonth > 0 ? dateMonth - 1 : 0;
}

function getActivityYear(activity: Activity) {
  const dateYear = Number(activity.date.slice(0, 4));
  return Number.isFinite(dateYear) ? dateYear : new Date().getFullYear();
}

function getDeliverableId(deliverable: Deliverable) {
  return deliverable.id || deliverable.documentId || deliverable.fileHash || deliverable.fileName;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
