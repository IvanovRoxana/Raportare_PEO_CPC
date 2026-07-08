import type { Deliverable } from './types';
import { dedupeDeliverablesBySignature } from './deliverable-deduplication.ts';

export type DeliverableSyncPlan = {
  toCreate: Deliverable[];
  toUpdate: Deliverable[];
  toDelete: Array<{ id: string }>;
};

export function planDeliverableSync(
  existingDeliverables: Array<Pick<Deliverable, 'id'>>,
  nextDeliverables: Deliverable[],
): DeliverableSyncPlan {
  const dedupedNextDeliverables = dedupeDeliverablesBySignature(nextDeliverables);
  const existingIds = new Set(existingDeliverables.map((deliverable) => deliverable.id).filter(Boolean));
  const nextExistingIds = new Set(dedupedNextDeliverables.map((deliverable) => deliverable.id).filter((id) => existingIds.has(id)));

  return {
    toCreate: dedupedNextDeliverables.filter((deliverable) => !existingIds.has(deliverable.id)),
    toUpdate: dedupedNextDeliverables.filter((deliverable) => existingIds.has(deliverable.id)),
    toDelete: existingDeliverables
      .filter((deliverable) => !nextExistingIds.has(deliverable.id))
      .map((deliverable) => ({ id: deliverable.id })),
  };
}
