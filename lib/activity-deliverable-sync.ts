import type { Deliverable } from './types';

export type DeliverableSyncPlan = {
  toCreate: Deliverable[];
  toUpdate: Deliverable[];
  toDelete: Array<{ id: string }>;
};

export function planDeliverableSync(
  existingDeliverables: Array<Pick<Deliverable, 'id'>>,
  nextDeliverables: Deliverable[],
): DeliverableSyncPlan {
  const existingIds = new Set(existingDeliverables.map((deliverable) => deliverable.id).filter(Boolean));
  const nextExistingIds = new Set(nextDeliverables.map((deliverable) => deliverable.id).filter((id) => existingIds.has(id)));

  return {
    toCreate: nextDeliverables.filter((deliverable) => !existingIds.has(deliverable.id)),
    toUpdate: nextDeliverables.filter((deliverable) => existingIds.has(deliverable.id)),
    toDelete: existingDeliverables
      .filter((deliverable) => !nextExistingIds.has(deliverable.id))
      .map((deliverable) => ({ id: deliverable.id })),
  };
}
