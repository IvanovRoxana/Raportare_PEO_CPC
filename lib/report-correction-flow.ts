import type { ReportStatus } from './types';

export function buildReportCorrectionStatusUpdate(input: {
  currentStatus?: ReportStatus | null;
  expertId: string;
  month: number;
  year: number;
  note: string;
}) {
  const now = new Date().toISOString();

  return {
    expertId: input.expertId,
    year: input.year,
    month: input.month,
    status: 'clarifications',
    sentDate: input.currentStatus?.sentDate,
    approvalDate: undefined,
    expertAccessApproved: true,
    expertAccessApprovedAt: now,
    pmNotes: input.note,
  } satisfies Omit<ReportStatus, 'id'>;
}

export function isReportOpenForCorrection(status?: Pick<ReportStatus, 'status' | 'expertAccessApproved'> | null) {
  return status?.status === 'clarifications' && status.expertAccessApproved === true;
}
