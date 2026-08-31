import type { Expert, PmClarificationThread } from './types.ts';

export type PmClarificationRealertItem = {
  thread: PmClarificationThread;
  expert?: Expert;
  statusLabel: string;
  lastInteractionAt?: string;
};

function getThreadSortDate(thread: PmClarificationThread) {
  return thread.lastRealertedAt || thread.answeredAt || thread.requestedAt || thread.resolvedAt || '';
}

export function buildPmClarificationRealertItems({
  threads,
  experts,
  limit = 5,
}: {
  threads: PmClarificationThread[];
  experts: Expert[];
  limit?: number;
}): PmClarificationRealertItem[] {
  return threads
    .filter((thread) => thread.status !== 'resolved')
    .sort((a, b) => String(getThreadSortDate(b)).localeCompare(String(getThreadSortDate(a))))
    .slice(0, limit)
    .map((thread) => ({
      thread,
      expert: experts.find((expert) => expert.id === thread.expertId),
      statusLabel: thread.status === 'answered' ? 'Răspuns' : thread.status === 'rejected' ? 'Revenire' : 'Cerută',
      lastInteractionAt: getThreadSortDate(thread) || undefined,
    }));
}
