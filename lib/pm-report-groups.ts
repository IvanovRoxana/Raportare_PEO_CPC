import type { Expert, ReportStatus } from './types.ts';

export type PmReportGroupRow = {
  expert: Expert;
  status: ReportStatus;
  totalHours: number;
  totalDeliverables: number;
  issuesCount: number;
  utilizationPercent: number;
};

export type PmReportGroup = {
  id: 'verified_clean' | 'waiting_review' | 'open_clarifications';
  title: string;
  tone: 'emerald' | 'blue' | 'amber';
  rows: PmReportGroupRow[];
};

export function isPmVerifiedWithoutIssues(row: PmReportGroupRow) {
  return row.status.status === 'approved' && row.issuesCount === 0;
}

export function isPmWaitingForReview(row: PmReportGroupRow) {
  return row.status.status === 'sent' || row.status.status === 'in_review';
}

export function isPmOpenClarification(row: PmReportGroupRow) {
  return row.status.status === 'clarifications';
}

export function buildPmReportGroups(rows: PmReportGroupRow[]): PmReportGroup[] {
  return [
    {
      id: 'verified_clean',
      title: 'Verificate - fără neconformități',
      tone: 'emerald',
      rows: rows.filter(isPmVerifiedWithoutIssues),
    },
    {
      id: 'waiting_review',
      title: 'Trimise - în așteptarea verificării PM',
      tone: 'blue',
      rows: rows.filter(isPmWaitingForReview),
    },
    {
      id: 'open_clarifications',
      title: 'Verificate - cu clarificări deschise',
      tone: 'amber',
      rows: rows.filter(isPmOpenClarification),
    },
  ];
}
