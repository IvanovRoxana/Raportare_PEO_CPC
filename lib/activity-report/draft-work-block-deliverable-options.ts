import type { Activity, Deliverable } from '../types.ts';
import type { ReportingWorkBlockBundle } from './work-blocks.ts';

export interface DraftWorkBlockDeliverableOption {
  deliverableId: string;
  title: string;
  fileName: string;
  saCode?: string;
  activityId?: string;
  activityDate?: string;
  isAlreadyAssociated: boolean;
  associatedWorkBlockIds: string[];
}

export function buildDraftWorkBlockDeliverableOptions({
  activities,
  existingBundles = [],
  editingWorkBlockId,
}: {
  activities: Activity[];
  existingBundles?: ReportingWorkBlockBundle[];
  editingWorkBlockId?: string;
}): DraftWorkBlockDeliverableOption[] {
  const deliverables = collectActivityDeliverables(activities);
  const associatedWorkBlockIdsByDeliverable = getAssociatedWorkBlockIdsByDeliverable(
    existingBundles,
    editingWorkBlockId,
  );

  return deliverables
    .map((deliverable) => {
      const associatedWorkBlockIds = associatedWorkBlockIdsByDeliverable.get(deliverable.id) ?? [];
      return {
        deliverableId: deliverable.id,
        title: getDeliverableTitle(deliverable),
        fileName: deliverable.fileName,
        saCode: deliverable.saCode,
        activityId: deliverable.activityId ?? deliverable.sourceActivityId,
        activityDate: deliverable.activityDate,
        isAlreadyAssociated: associatedWorkBlockIds.length > 0,
        associatedWorkBlockIds,
      };
    })
    .sort(compareDeliverableOptions);
}

export function getUnassociatedDeliverableCount(options: DraftWorkBlockDeliverableOption[]) {
  return options.filter((option) => !option.isAlreadyAssociated).length;
}

function collectActivityDeliverables(activities: Activity[]) {
  const deliverablesById = new Map<string, Deliverable>();

  for (const activity of activities) {
    for (const deliverable of activity.deliverables ?? []) {
      const deliverableId = deliverable.id || deliverable.documentId || deliverable.s3Key || deliverable.fileName;
      deliverablesById.set(deliverableId, {
        ...deliverable,
        id: deliverableId,
        activityId: deliverable.activityId ?? activity.id,
        activityDate: deliverable.activityDate ?? activity.date,
        saCode: deliverable.saCode ?? activity.saCode,
      });
    }
  }

  return [...deliverablesById.values()];
}

function getAssociatedWorkBlockIdsByDeliverable(
  existingBundles: ReportingWorkBlockBundle[],
  editingWorkBlockId?: string,
) {
  const associatedWorkBlockIdsByDeliverable = new Map<string, string[]>();

  for (const bundle of existingBundles) {
    if (editingWorkBlockId && bundle.workBlock.id === editingWorkBlockId) continue;

    for (const link of bundle.deliverableLinks) {
      associatedWorkBlockIdsByDeliverable.set(link.deliverableId, [
        ...(associatedWorkBlockIdsByDeliverable.get(link.deliverableId) ?? []),
        bundle.workBlock.id,
      ]);
    }
  }

  return associatedWorkBlockIdsByDeliverable;
}

function getDeliverableTitle(deliverable: Deliverable) {
  return deliverable.declaredTitle
    || deliverable.docTitle
    || deliverable.suggestedTitle
    || deliverable.originalFileName
    || deliverable.fileName;
}

function compareDeliverableOptions(
  first: DraftWorkBlockDeliverableOption,
  second: DraftWorkBlockDeliverableOption,
) {
  return (first.activityDate ?? '').localeCompare(second.activityDate ?? '')
    || first.title.localeCompare(second.title)
    || first.deliverableId.localeCompare(second.deliverableId);
}
