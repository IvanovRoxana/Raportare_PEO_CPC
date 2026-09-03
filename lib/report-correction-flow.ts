import type { ReportStatus } from './types';

export type ReportSubmissionMode = 'initial_submit' | 'resubmit_after_correction';

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

export function buildReportReopenStatusUpdate(input: {
  currentStatus?: ReportStatus | null;
  expertId: string;
  month: number;
  year: number;
  note?: string;
}) {
  return {
    expertId: input.expertId,
    year: input.year,
    month: input.month,
    status: 'in_review',
    sentDate: input.currentStatus?.sentDate,
    approvalDate: undefined,
    expertAccessApproved: input.currentStatus?.expertAccessApproved ?? false,
    expertAccessApprovedAt: input.currentStatus?.expertAccessApprovedAt,
    pmNotes: input.note,
  } satisfies Omit<ReportStatus, 'id'>;
}

export function isReportOpenForCorrection(status?: Pick<ReportStatus, 'status' | 'expertAccessApproved'> | null) {
  return status?.status === 'clarifications' && status.expertAccessApproved === true;
}

export function getReportSubmissionMode(status?: Pick<ReportStatus, 'status' | 'expertAccessApproved'> | null): ReportSubmissionMode | null {
  const currentStatus = status?.status || 'draft';
  if (currentStatus === 'draft' || currentStatus === 'rejected') return 'initial_submit';
  if (isReportOpenForCorrection(status)) return 'resubmit_after_correction';
  return null;
}

export function canSubmitReportToPm(status?: Pick<ReportStatus, 'status' | 'expertAccessApproved'> | null) {
  return getReportSubmissionMode(status) !== null;
}

export function buildReportSubmissionStatusUpdate(input: {
  currentStatus?: ReportStatus | null;
  expertId: string;
  month: number;
  year: number;
}) {
  const mode = getReportSubmissionMode(input.currentStatus);
  if (!mode) {
    throw new Error('Raportarea nu poate fi trimisa in statusul curent.');
  }

  const isCorrectionResubmit = mode === 'resubmit_after_correction';
  return {
    expertId: input.expertId,
    year: input.year,
    month: input.month,
    status: 'sent',
    sentDate: new Date().toISOString(),
    approvalDate: undefined,
    expertAccessApproved: isCorrectionResubmit ? false : input.currentStatus?.expertAccessApproved ?? false,
    expertAccessApprovedAt: isCorrectionResubmit ? undefined : input.currentStatus?.expertAccessApprovedAt,
    pmNotes: input.currentStatus?.pmNotes,
  } satisfies Omit<ReportStatus, 'id'>;
}
