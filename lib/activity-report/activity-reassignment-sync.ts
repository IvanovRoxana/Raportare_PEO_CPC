import type { Activity, PersistedReportingWorkBlock, PersistedWorkBlockActivityLink } from '../types.ts';
import { isActivityClassificationPending } from '../activity-classification.ts';
import { areComCommunicationMultiGroupActivities } from '../activity-multigroup-rules.ts';
import { buildWorkBlocks, hasStaleCatalogClassification, type ReportingWorkBlockBundle } from './work-blocks.ts';

type Classification = Pick<Activity, 'saCode' | 'catalogActivityId' | 'activityType' | 'title'>;
const clean = (value?: string | null) => (value || '').trim();

export function hasActivityClassificationChanged(previous: Classification, current: Classification) {
  return (['saCode', 'catalogActivityId', 'activityType', 'title'] as const)
    .some((field) => clean(previous[field]) !== clean(current[field]));
}

function sameClassification(first: Classification, second: Classification) {
  return clean(first.saCode) === clean(second.saCode)
    && (areComCommunicationMultiGroupActivities(first, second) || (first.catalogActivityId || second.catalogActivityId
      ? Boolean(first.catalogActivityId && first.catalogActivityId === second.catalogActivityId)
      : clean(first.activityType || first.title) === clean(second.activityType || second.title)));
}

export type ReassignedWorkBlockPatch = {
  id: string;
  title: string;
  saCode: string;
  activityCode: string | null;
  activityCategory: string | null;
  cleanedActivitySummary: null;
  generatedTableSummary: null;
  generatedNarrative: null;
  generationInputsHash: null;
  aiConsolidationStatus: 'stale' | 'classification_review_required';
  aiConsolidationUpdatedAt: string;
  status: 'draft';
};

// Reassignment changes classification, never sibling activities or their allocated hours.
export function planActivityReassignmentWorkBlockSync(input: {
  previous: Activity;
  current: Activity;
  activities: Activity[];
  workBlocks: PersistedReportingWorkBlock[];
  activityLinks: PersistedWorkBlockActivityLink[];
  now: string;
}) {
  const { previous, current, workBlocks, activityLinks, now } = input;
  const activities = new Map(input.activities.map((activity) => [activity.id, activity]));
  activities.set(current.id, current);
  const affectedIds = new Set(activityLinks.filter((link) => link.activityId === current.id).map((link) => link.workBlockId));
  const updates: ReassignedWorkBlockPatch[] = [];
  const appendActivityLinks: PersistedWorkBlockActivityLink[] = [];
  const createBundles: ReportingWorkBlockBundle[] = [];
  const warnings: string[] = [];

  if (affectedIds.size === 0 && current.catalogActivityId && !isActivityClassificationPending(current)) {
    const groupId = current.periodGroupId || current.workingGroupId;
    const expectedBlockId = groupId ? `work-block:${groupId}` : `work-block:activity:${current.id}`;
    const groupBlock = workBlocks.find((block) => block.id === expectedBlockId);
    const sameScope = groupBlock && groupBlock.expertId === current.expertId
      && groupBlock.projectCode === (current.projectCode || '302141')
      && groupBlock.year === Number(current.date.slice(0, 4))
      && groupBlock.month === Number(current.date.slice(5, 7)) - 1;
    const groupMembers = groupBlock
      ? activityLinks.filter((link) => link.workBlockId === groupBlock.id).map((link) => activities.get(link.activityId))
      : [];
    if (groupBlock && sameScope && groupMembers.every((member) => member && sameClassification(member, current))) {
      affectedIds.add(groupBlock.id);
      appendActivityLinks.push({
        id: `${groupBlock.id}:activity:${current.id}`, workBlockId: groupBlock.id,
        activityId: current.id, allocatedHours: Number(current.hours) || 0,
      });
    } else {
      // A conflicting group already has its own allocation; keep this day's scope explicit.
      const isolated = groupBlock ? { ...current, periodGroupId: undefined, workingGroupId: undefined } : current;
      createBundles.push(...buildWorkBlocks([isolated]));
    }
  }

  for (const workBlock of workBlocks.filter((block) => affectedIds.has(block.id))) {
    const links = [...activityLinks, ...appendActivityLinks].filter((link) => link.workBlockId === workBlock.id);
    const members = links.map((link) => activities.get(link.activityId));
    const first = members[0];
    const coherent = Boolean(first && members.every((member) => member
      && !isActivityClassificationPending(member)
      && member.expertId === workBlock.expertId
      && (member.projectCode || '302141') === workBlock.projectCode
      && Number(member.date.slice(0, 4)) === workBlock.year
      && Number(member.date.slice(5, 7)) - 1 === workBlock.month
      && clean(member.saCode) && sameClassification(first, member)));
    const title = coherent && first ? first.title || first.activityType : 'Încadrare de reconciliat';
    const saCode = coherent && first ? clean(first.saCode) : 'SA neprecizata';
    const activityCode = coherent && first ? first.catalogActivityId || null : null;
    const activityCategory = coherent && first ? first.activityType || null : null;
    const changed = hasActivityClassificationChanged(previous, current)
      || appendActivityLinks.some((link) => link.workBlockId === workBlock.id)
      || workBlock.saCode !== saCode
      || Boolean(first && hasStaleCatalogClassification(first, workBlock))
      || Boolean(workBlock.activityCode && (workBlock.title !== title || clean(workBlock.activityCode) !== clean(activityCode)))
      || workBlock.aiConsolidationStatus === 'classification_review_required'
      || workBlock.aiConsolidationStatus === 'stale';
    if (!changed) continue;
    updates.push({
      id: workBlock.id, title, saCode, activityCode, activityCategory,
      cleanedActivitySummary: null, generatedTableSummary: null, generatedNarrative: null,
      generationInputsHash: null, aiConsolidationStatus: coherent ? 'stale' : 'classification_review_required',
      aiConsolidationUpdatedAt: now, status: 'draft',
    });
    if (!coherent) warnings.push(`Blocul „${workBlock.title}” conține încadrări diferite sau activități indisponibile. Reconciliază zilele înainte de raportare.`);
  }
  return { updates, appendActivityLinks, createBundles, warnings };
}
