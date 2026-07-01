import type { ReportStatus } from './types';

const ACCESS_REQUEST_PREFIX = '[PEO_MONTH_ACCESS_REQUEST]';

function getMonthAccessRequestToken(month: number, year: number) {
  return `${ACCESS_REQUEST_PREFIX}:${year}-${String(month + 1).padStart(2, '0')}`;
}

export function hasMonthAccessRequest(status?: Pick<ReportStatus, 'month' | 'year' | 'pmNotes' | 'expertAccessApproved'> | null) {
  if (!status || status.expertAccessApproved === true) return false;
  return Boolean(status.pmNotes?.includes(getMonthAccessRequestToken(status.month, status.year)));
}

export function addMonthAccessRequestNote(
  existingNotes: string | undefined,
  request: { month: number; year: number; expertName?: string; requestedAt?: string },
) {
  const token = getMonthAccessRequestToken(request.month, request.year);
  const existing = existingNotes?.trim();
  if (existing?.includes(token)) return existing;

  const expert = request.expertName ? `${request.expertName} solicita` : 'Expertul solicita';
  const timestamp = request.requestedAt ? ` (${request.requestedAt})` : '';
  const requestLine = `${token} ${expert} acces pentru luna ${String(request.month + 1).padStart(2, '0')}/${request.year}${timestamp}.`;
  return [requestLine, existing].filter(Boolean).join('\n');
}

export function clearMonthAccessRequestNote(
  existingNotes: string | undefined,
  request: { month: number; year: number },
) {
  const token = getMonthAccessRequestToken(request.month, request.year);
  const remaining = (existingNotes || '')
    .split(/\r?\n/)
    .filter((line) => !line.includes(token))
    .join('\n')
    .trim();

  return remaining || undefined;
}
