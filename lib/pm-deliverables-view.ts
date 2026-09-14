import {
  getPmDeliverableStatus,
  PM_DELIVERABLE_STATUS_LABELS,
  type PmDeliverableStatus,
} from './pm-deliverable-status.ts';
import { isClosedSupportTicket } from './support-ticketing.ts';
import type { DocumentMetadata, Expert, PmClarificationThread, SupportTicket } from './types.ts';

export type PmDeliverableFilterId = PmDeliverableStatus | 'all';

export type PmDeliverableActionId =
  | 'open_dossier'
  | 'request_clarification'
  | 'realert_clarification'
  | 'resolve_clarification'
  | 'approve_pm_unlock'
  | 'mark_ineligible'
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

export type PmDocumentClarificationStateId =
  | 'not_requested'
  | 'requested'
  | 'realerted'
  | 'answered'
  | 'ready_to_resolve'
  | 'resolved';

export type PmDocumentClarificationState = {
  id: PmDocumentClarificationStateId;
  label: string;
  detail?: string;
  thread?: PmClarificationThread;
  ticket?: SupportTicket;
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
  documentClarificationStates = new Map<string, PmDocumentClarificationState>(),
}: {
  experts: Expert[];
  documents: DocumentMetadata[];
  filter: PmDeliverableFilterId;
  documentClarificationStates?: Map<string, PmDocumentClarificationState>;
}): PmDeliverablesViewModel {
  const statusCounts = documents.reduce<Record<PmDeliverableFilterId, number>>((counts, document) => {
    const status = getPmDeliverableStatus(document);
    counts.all += 1;
    if (status === 'clarifications' && documentClarificationStates.get(document.id)?.id === 'resolved') {
      return counts;
    }
    counts[status] += 1;
    return counts;
  }, emptyPmDeliverableStatusCounts());

  const filteredDocuments = documents.filter((document) => {
    const status = getPmDeliverableStatus(document);
    if (filter === 'clarifications' && documentClarificationStates.get(document.id)?.id === 'resolved') {
      return false;
    }
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
  const markIneligible: PmDeliverableAction = { id: 'mark_ineligible', label: 'Marchează neeligibil' };
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
        markIneligible,
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
    secondary: [markIneligible],
  };
}

export function buildPmDocumentClarificationState({
  document,
  thread,
  ticket,
}: {
  document: DocumentMetadata;
  thread?: PmClarificationThread;
  ticket?: SupportTicket;
}): PmDocumentClarificationState {
  if (thread?.status === 'resolved' || (ticket && isClosedSupportTicket(ticket))) {
    return {
      id: 'resolved',
      label: 'Rezolvată',
      detail: thread?.resolvedAt || ticket?.resolvedAt || ticket?.updatedAt,
      thread,
      ticket,
    };
  }

  if (!thread && !ticket) {
    return { id: 'not_requested', label: 'Fără cerere PM' };
  }

  if (thread?.status === 'answered') {
    return {
      id: 'answered',
      label: 'Răspuns primit',
      detail: thread.answeredAt,
      thread,
      ticket,
    };
  }

  const requestedAt = thread?.requestedAt || ticket?.createdAt;
  const documentUpdatedAt = document.updatedAt || document.uploadDate;
  const updatedAfterRequest = Boolean(
    requestedAt
    && documentUpdatedAt
    && new Date(documentUpdatedAt).getTime() > new Date(requestedAt).getTime()
  );
  const appearsCorrected = document.titleMatch === true
    || ['matched', 'approved', 'admin_overridden'].includes(String(document.titleCheckStatus || '').toLowerCase())
    || (
      Boolean(document.eligibilityCheck?.status)
      && !['neeligibil'].includes(String(document.eligibilityCheck?.status).toLowerCase())
    );

  if (updatedAfterRequest && appearsCorrected) {
    return {
      id: 'ready_to_resolve',
      label: 'Gata de verificat',
      detail: documentUpdatedAt,
      thread,
      ticket,
    };
  }

  if (updatedAfterRequest || ticket?.status === 'testing') {
    return {
      id: 'answered',
      label: 'Răspuns primit',
      detail: documentUpdatedAt,
      thread,
      ticket,
    };
  }

  if (thread?.realertCount || thread?.lastRealertedAt) {
    return {
      id: 'realerted',
      label: 'Re-alertată',
      detail: thread.lastRealertedAt,
      thread,
      ticket,
    };
  }

  return {
    id: 'requested',
    label: 'Clarificare cerută',
    detail: requestedAt,
    thread,
    ticket,
  };
}

export function buildPmDeliverableActionModelForClarification(
  state: PmDocumentClarificationState,
): PmDeliverableActionModel {
  const openFile: PmDeliverableAction = { id: 'open_file', label: 'Deschide fișier' };
  const openDossier: PmDeliverableAction = { id: 'open_dossier', label: 'Deschide dosar', issueType: 'problems' };

  if (state.id === 'not_requested') {
    return {
      primary: { id: 'request_clarification', label: 'Cere clarificări' },
      secondary: [openDossier, openFile],
    };
  }

  if (state.id === 'requested' || state.id === 'realerted') {
    return {
      primary: { id: 'realert_clarification', label: 'Re-alertare' },
      secondary: [openDossier, openFile],
    };
  }

  if (state.id === 'answered' || state.id === 'ready_to_resolve') {
    return {
      primary: { id: 'open_dossier', label: state.id === 'ready_to_resolve' ? 'Verifică răspuns' : 'Deschide dosar', issueType: 'problems' },
      secondary: [
        { id: 'resolve_clarification', label: 'Marchează rezolvat' },
        { id: 'realert_clarification', label: 'Re-alertare' },
        openFile,
      ],
    };
  }

  return {
    primary: openDossier,
    secondary: [openFile],
  };
}
