import type { DashboardComplianceRow, ReportStatus } from '@/lib/types';

export type PmKpiTone = 'primary' | 'neutral' | 'danger' | 'info' | 'success' | 'warning';

export type PmKpiMetricId =
  | 'reporting_on_time'
  | 'verified_pm'
  | 'late'
  | 'approved_pm'
  | 'finalized'
  | 'action_needed';

export type PmKpiMetric = {
  id: PmKpiMetricId;
  label: string;
  value: number;
  helper: string;
  tone: PmKpiTone;
};

type PmKpiStatusCounts = Record<ReportStatus['status'], number>;

export function isPmReportOnTime(row: DashboardComplianceRow, reportStatus?: ReportStatus['status']) {
  return (
    row.utilizationPercent >= 100 &&
    row.missingActivityDays.length === 0 &&
    row.blockedDays.length === 0 &&
    reportStatus !== 'clarifications' &&
    reportStatus !== 'rejected'
  );
}

export function isPmReportLate(row: DashboardComplianceRow) {
  return row.missingActivityDays.length > 0 || row.remainingHours > 0;
}

export function isPmReportFinalized(row: DashboardComplianceRow, reportStatus?: ReportStatus['status']) {
  return reportStatus === 'approved' && row.remainingHours <= 0 && row.missingDeliverableActivityCount === 0;
}

export function buildPmKpiMetrics(args: {
  dashboardRows: DashboardComplianceRow[];
  reportStatusByExpertId: Map<string, Pick<ReportStatus, 'status'>>;
  statusCounts: PmKpiStatusCounts;
  problemCount: number;
}): PmKpiMetric[] {
  const onTime = args.dashboardRows.filter((row) =>
    isPmReportOnTime(row, args.reportStatusByExpertId.get(row.expertId)?.status),
  ).length;
  const verified = args.statusCounts.in_review + args.statusCounts.approved;
  const late = args.dashboardRows.filter(isPmReportLate).length;
  const approved = args.statusCounts.approved;
  const finalized = args.dashboardRows.filter((row) =>
    isPmReportFinalized(row, args.reportStatusByExpertId.get(row.expertId)?.status),
  ).length;

  return [
    {
      id: 'reporting_on_time',
      label: 'Raportare la zi',
      value: onTime,
      helper: 'din experți',
      tone: 'primary',
    },
    {
      id: 'verified_pm',
      label: 'Verificate PM',
      value: verified,
      helper: `din ${args.statusCounts.sent} trimise`,
      tone: 'neutral',
    },
    {
      id: 'late',
      label: 'Cu întârzieri',
      value: late,
      helper: 'raportări neîncheiate',
      tone: 'danger',
    },
    {
      id: 'approved_pm',
      label: 'Aprobate PM',
      value: approved,
      helper: `${args.statusCounts.sent} trimise, în așteptare`,
      tone: 'info',
    },
    {
      id: 'finalized',
      label: 'Finalizate',
      value: finalized,
      helper: 'normă completă',
      tone: 'success',
    },
    {
      id: 'action_needed',
      label: 'Necesită acțiune',
      value: args.problemCount,
      helper: 'neconformități',
      tone: 'warning',
    },
  ];
}
