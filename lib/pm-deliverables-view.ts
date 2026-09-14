import {
  getPmDeliverableStatus,
  PM_DELIVERABLE_STATUS_LABELS,
  type PmDeliverableStatus,
} from './pm-deliverable-status.ts';
import type { DocumentMetadata, Expert } from './types.ts';

export type PmDeliverableFilterId = PmDeliverableStatus | 'all';

export type PmDeliverableActionId =
  | 'open_dossier'
  | 'request_clarification'
  | 'approve_pm_unlock'
  | 'open_file'
  | 'view_ai_review';

export type PmDeliverableAction = {
  id: PmDeliverableActionId;
  label: string;
  issueType?: string;
};

export type PmDeliverableActionModel = {
  primary: PmDeliverableAction;
  secondary: PmDeliverableAction[];
};

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

export function buildPmDeliverableActionModel(status: PmDeliverableStatus): PmDeliverableActionModel {
  const openFile: PmDeliverableAction = { id: 'open_file', label: 'Deschide fișier' };
  const openDossier: PmDeliverableAction = { id: 'open_dossier', label: 'Deschide dosar', issueType: 'problems' };
  const openEligibilityDossier: PmDeliverableAction = {
    id: 'open_dossier',
    label: 'Deschide dosar',
    issueType: 'pm_unlock_requests',
  };

  if (status === 'ineligible') {
    return {
      primary: openEligibilityDossier,
      secondary: [
        { id: 'request_clarification', label: 'Cere clarificări' },
        { id: 'approve_pm_unlock', label: 'Deblochează PM' },
        openFile,
      ],
    };
  }

  if (status === 'clarifications') {
    return {
      primary: openDossier,
      secondary: [
        { id: 'request_clarification', label: 'Cere clarificări' },
        openFile,
      ],
    };
  }

  if (status === 'pm_unlocked') {
    return {
      primary: openEligibilityDossier,
      secondary: [openFile],
    };
  }

  if (status === 'auto_resolved') {
    return {
      primary: {
        id: 'open_dossier',
        label: 'Deschide dosar',
        issueType: 'eligibility_ai_review',
      },
      secondary: [
        { id: 'view_ai_review', label: 'Vezi verificarea AI', issueType: 'eligibility_ai_review' },
        openFile,
      ],
    };
  }

  return {
    primary: openFile,
    secondary: [],
  };
}
