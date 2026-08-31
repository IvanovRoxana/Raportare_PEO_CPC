import type { DashboardComplianceRow, Expert, ReportStatus } from './types.ts';

export type PmReportSituationSubmittedRow = {
  expert: Expert;
  status: ReportStatus;
  totalHours: number;
  totalDeliverables: number;
  issuesCount: number;
  utilizationPercent: number;
};

export type PmReportSituationCard = {
  id: 'experts' | 'finished' | 'in_progress' | 'action_needed';
  label: string;
  value: number;
  helper: string;
};

export type PmReportSituation = {
  proactiveRows: PmReportSituationSubmittedRow[];
  actionRows: DashboardComplianceRow[];
  finishedRows: PmReportSituationSubmittedRow[];
  inProgressRows: PmReportSituationSubmittedRow[];
  cards: PmReportSituationCard[];
};

export function buildPmReportSituation({
  experts,
  submittedReportRows,
  dashboardRows,
}: {
  experts: Expert[];
  submittedReportRows: PmReportSituationSubmittedRow[];
  dashboardRows: DashboardComplianceRow[];
}): PmReportSituation {
  const proactiveRows = submittedReportRows.filter((row) => row.status.status === 'approved' || row.status.status === 'sent');
  const finishedRows = submittedReportRows.filter((row) => row.status.status === 'approved');
  const inProgressRows = submittedReportRows.filter((row) => row.status.status === 'sent' || row.status.status === 'in_review');
  const actionRows = dashboardRows.filter((row) =>
    row.remainingHours > 0
    || row.missingDeliverableActivityCount > 0
    || row.hasDailyLimitIssue
    || row.hasMonthlyNormIssue
    || row.hasProjectNormIssue
  );

  return {
    proactiveRows,
    actionRows,
    finishedRows,
    inProgressRows,
    cards: [
      {
        id: 'experts',
        label: 'Experți implicați',
        value: experts.length,
        helper: 'raportează livrabile',
      },
      {
        id: 'finished',
        label: 'Finalizate complet',
        value: finishedRows.length,
        helper: 'raport + livrabile OK',
      },
      {
        id: 'in_progress',
        label: 'În curs / proactivi',
        value: inProgressRows.length,
        helper: 'au trimis raportarea',
      },
      {
        id: 'action_needed',
        label: 'În urmă',
        value: actionRows.length,
        helper: 'necesită acțiune',
      },
    ],
  };
}
