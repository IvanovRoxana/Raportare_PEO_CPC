import type {
  Activity,
  PersistedReportingWorkBlock,
  PersistedWorkBlockActivityLink,
  PersistedWorkBlockDeliverableLink,
} from '../types.ts';
import {
  sortWorkBlocks,
  type ReportingFlowType,
  type ReportingWorkBlockBundle,
  type ReportingWorkBlockStatus,
  type WorkBlockDeliverableLink,
} from './work-blocks.ts';

const REPORTING_FLOW_TYPES = new Set<ReportingFlowType>([
  'deliverable',
  'meeting',
  'event',
  'consultation',
  'project_coordination',
  'administrative',
  'leave',
  'report_preparation',
  'other',
]);

const WORK_BLOCK_STATUSES = new Set<ReportingWorkBlockStatus>([
  'draft',
  'ready',
  'generated',
  'expert_validated',
  'pm_validated',
]);

const DELIVERABLE_CONTRIBUTION_TYPES = new Set<NonNullable<WorkBlockDeliverableLink['contributionType']>>([
  'created',
  'analysed',
  'reviewed',
  'consolidated',
  'updated',
  'presented',
  'supported',
]);

export function buildPersistedWorkBlockBundles({
  workBlocks,
  activityLinks,
  deliverableLinks,
  activities,
}: {
  workBlocks: PersistedReportingWorkBlock[];
  activityLinks: PersistedWorkBlockActivityLink[];
  deliverableLinks: PersistedWorkBlockDeliverableLink[];
  activities: Activity[];
}): ReportingWorkBlockBundle[] {
  const activityDateById = new Map(activities.map((activity) => [activity.id, activity.date]));

  return sortWorkBlocks(workBlocks.map((workBlock) => ({
    workBlock: {
      id: workBlock.id,
      expertId: workBlock.expertId,
      projectCode: workBlock.projectCode,
      month: workBlock.month,
      year: workBlock.year,
      title: workBlock.title,
      saCode: workBlock.saCode,
      activityCode: workBlock.activityCode,
      activityCategory: workBlock.activityCategory,
      reportingFlowType: normalizeReportingFlowType(workBlock.reportingFlowType),
      status: normalizeWorkBlockStatus(workBlock.status),
      expertContribution: workBlock.expertContribution,
      beneficiaries: workBlock.beneficiaries,
      indicatorContribution: workBlock.indicatorContribution,
      generatedTableSummary: workBlock.generatedTableSummary,
      generatedNarrative: workBlock.generatedNarrative,
      createdAt: workBlock.createdAt,
      updatedAt: workBlock.updatedAt,
    },
    activityLinks: activityLinks
      .filter((link) => link.workBlockId === workBlock.id)
      .filter((link, index, links) => links.findIndex((item) => item.activityId === link.activityId) === index)
      .map((link) => ({
        id: link.id,
        workBlockId: link.workBlockId,
        activityId: link.activityId,
        allocatedHours: Number(link.allocatedHours) || 0,
        activityDate: activityDateById.get(link.activityId),
      })),
    deliverableLinks: deliverableLinks
      .filter((link) => link.workBlockId === workBlock.id)
      .filter((link, index, links) => links.findIndex((item) => item.deliverableId === link.deliverableId) === index)
      .map((link) => ({
        id: link.id,
        workBlockId: link.workBlockId,
        deliverableId: link.deliverableId,
        isPrimary: link.isPrimary ?? false,
        contributionType: normalizeDeliverableContributionType(link.contributionType),
      })),
  })));
}

function normalizeReportingFlowType(value: string): ReportingFlowType {
  return REPORTING_FLOW_TYPES.has(value as ReportingFlowType) ? value as ReportingFlowType : 'other';
}

function normalizeWorkBlockStatus(value?: string): ReportingWorkBlockStatus {
  return WORK_BLOCK_STATUSES.has(value as ReportingWorkBlockStatus) ? value as ReportingWorkBlockStatus : 'draft';
}

function normalizeDeliverableContributionType(value?: string) {
  return DELIVERABLE_CONTRIBUTION_TYPES.has(value as NonNullable<WorkBlockDeliverableLink['contributionType']>)
    ? value as NonNullable<WorkBlockDeliverableLink['contributionType']>
    : undefined;
}
