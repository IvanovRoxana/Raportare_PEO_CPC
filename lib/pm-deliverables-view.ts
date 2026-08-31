import {
  getPmDeliverableStatus,
  PM_DELIVERABLE_STATUS_LABELS,
  type PmDeliverableStatus,
} from './pm-deliverable-status.ts';
import type { DocumentMetadata, Expert } from './types.ts';

export type PmDeliverableFilterId = PmDeliverableStatus | 'all';

export type PmDeliverableFilter = {
  id: PmDeliverableFilterId;
  label: string;
  count: number;
};

export type PmDeliverableGroup = {
  expert: Expert;
  documents: DocumentMetadata[];
};

export type PmDeliverablesViewModel = {
  filters: PmDeliverableFilter[];
  statusCounts: Record<PmDeliverableFilterId, number>;
  filteredDocuments: DocumentMetadata[];
  groups: PmDeliverableGroup[];
};

const filterOrder: PmDeliverableFilterId[] = [
  'all',
  'approved',
  'sent',
  'clarifications',
  'ineligible',
  'pm_unlocked',
  'auto_resolved',
  'draft',
];

export function emptyPmDeliverableStatusCounts(): Record<PmDeliverableFilterId, number> {
  return {
    all: 0,
    approved: 0,
    sent: 0,
    clarifications: 0,
    draft: 0,
    ineligible: 0,
    pm_unlocked: 0,
    auto_resolved: 0,
  };
}

export function buildPmDeliverablesViewModel({
  experts,
  documents,
  filter,
}: {
  experts: Expert[];
  documents: DocumentMetadata[];
  filter: PmDeliverableFilterId;
}): PmDeliverablesViewModel {
  const statusCounts = documents.reduce<Record<PmDeliverableFilterId, number>>((counts, document) => {
    const status = getPmDeliverableStatus(document);
    counts.all += 1;
    counts[status] += 1;
    return counts;
  }, emptyPmDeliverableStatusCounts());

  const filteredDocuments = documents.filter((document) => {
    const status = getPmDeliverableStatus(document);
    return filter === 'all' || status === filter;
  });

  const groups = experts
    .map((expert) => ({
      expert,
      documents: filteredDocuments.filter((document) => document.uploadedByExpertId === expert.id),
    }))
    .filter((group) => group.documents.length > 0);

  const filters = filterOrder.map((id) => ({
    id,
    label: id === 'all' ? 'Toate' : PM_DELIVERABLE_STATUS_LABELS[id],
    count: statusCounts[id],
  }));

  return {
    filters,
    statusCounts,
    filteredDocuments,
    groups,
  };
}
