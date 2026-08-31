import {
  formatReportingPeriodLabel,
  reportingPeriodIncludesMonth,
  resolveDefaultReportingPeriod,
  resolveReportingPeriods,
} from './reporting-periods.ts';
import type { ReportingPeriod } from './types.ts';

export type PmReportingPeriodOption = {
  id: string;
  label: string;
  period: ReportingPeriod;
  includesSelectedMonth: boolean;
};

export type PmReportingPeriodSelection = {
  reportingPeriods: ReportingPeriod[];
  options: PmReportingPeriodOption[];
  activeReportingPeriod: ReportingPeriod | null;
  selectedReportId: string;
};

export type PmReportingPeriodChange = {
  selectedReportId: string;
  nextMonth?: number;
  nextYear?: number;
};

export function buildPmReportingPeriodSelection({
  reportingPeriods,
  selectedReportId,
  selectedMonth,
  selectedYear,
}: {
  reportingPeriods: ReportingPeriod[];
  selectedReportId?: string;
  selectedMonth: number;
  selectedYear: number;
}): PmReportingPeriodSelection {
  const resolvedPeriods = resolveReportingPeriods(reportingPeriods);
  const defaultPeriod = resolveDefaultReportingPeriod(resolvedPeriods, selectedMonth, selectedYear);
  const activeReportingPeriod =
    resolvedPeriods.find((period) => period.id === selectedReportId) ||
    defaultPeriod ||
    resolvedPeriods[0] ||
    null;

  return {
    reportingPeriods: resolvedPeriods,
    options: resolvedPeriods.map((period) => ({
      id: period.id,
      label: formatReportingPeriodLabel(period),
      period,
      includesSelectedMonth: reportingPeriodIncludesMonth(period, selectedMonth, selectedYear),
    })),
    activeReportingPeriod,
    selectedReportId: activeReportingPeriod?.id ?? '',
  };
}

export function resolvePmReportingPeriodChange({
  reportingPeriods,
  periodId,
  selectedMonth,
  selectedYear,
}: {
  reportingPeriods: ReportingPeriod[];
  periodId: string;
  selectedMonth: number;
  selectedYear: number;
}): PmReportingPeriodChange {
  const period = reportingPeriods.find((item) => item.id === periodId);
  if (!period || reportingPeriodIncludesMonth(period, selectedMonth, selectedYear)) {
    return { selectedReportId: periodId };
  }

  return {
    selectedReportId: periodId,
    nextMonth: period.endMonth,
    nextYear: period.endYear,
  };
}
