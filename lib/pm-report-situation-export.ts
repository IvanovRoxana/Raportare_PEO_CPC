import * as XLSX from 'xlsx';
import { getMonthName } from './app-utils.ts';
import { buildPmReportSituation, type PmReportSituationSubmittedRow } from './pm-report-situation.ts';
import type { DashboardComplianceRow, Expert, ReportStatus } from './types.ts';

export type PmReportSituationExportInput = {
  experts: Expert[];
  submittedReportRows: PmReportSituationSubmittedRow[];
  dashboardRows: DashboardComplianceRow[];
  reportStatusByExpertId: Map<string, ReportStatus>;
  statusLabels: Record<ReportStatus['status'], { label: string }>;
  month: number;
  year: number;
  projectCode?: string;
};

function statusLabel(
  status: ReportStatus['status'],
  labels: PmReportSituationExportInput['statusLabels'],
) {
  return labels[status]?.label || status;
}

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : '';
}

function buildIssueSummary(row: DashboardComplianceRow) {
  const issues: string[] = [];
  if (row.remainingHours > 0) issues.push(`${row.remainingHours}h ramase`);
  if (row.missingActivityDays.length > 0) issues.push(`${row.missingActivityDays.length} zile fara pontaj`);
  if (row.blockedDays.length > 0) issues.push(`${row.blockedDays.length} zile blocate`);
  if (row.missingDeliverableActivityCount > 0) issues.push(`${row.missingDeliverableActivityCount} livrabile lipsa`);
  if (row.hasDailyLimitIssue) issues.push('depasire limita zilnica');
  if (row.hasMonthlyNormIssue) issues.push('abatere norma lunara');
  if (row.hasProjectNormIssue) issues.push('abatere norma proiect');
  return issues.join('; ');
}

export function buildPmReportSituationWorkbookRows(input: PmReportSituationExportInput) {
  const situation = buildPmReportSituation({
    experts: input.experts,
    submittedReportRows: input.submittedReportRows,
    dashboardRows: input.dashboardRows,
  });
  const submittedByExpertId = new Map(input.submittedReportRows.map((row) => [row.expert.id, row]));
  const period = `${getMonthName(input.month)} ${input.year}`;

  const summaryRows = [
    { Indicator: 'Proiect', Valoare: input.projectCode || '302141', Observatii: '' },
    { Indicator: 'Luna raportare', Valoare: period, Observatii: '' },
    ...situation.cards.map((card) => ({
      Indicator: card.label,
      Valoare: card.value,
      Observatii: card.helper,
    })),
  ];

  const statusRows = input.dashboardRows.map((row, index) => {
    const expert = input.experts.find((item) => item.id === row.expertId);
    const submitted = submittedByExpertId.get(row.expertId);
    const reportStatus = input.reportStatusByExpertId.get(row.expertId) || submitted?.status;
    const status = reportStatus?.status || 'draft';

    return {
      Nr: index + 1,
      Expert: expert?.name || row.expertName,
      Rol: expert?.role || row.role || '',
      Categorie: expert?.category || '',
      Luna: period,
      'Status raportare': statusLabel(status, input.statusLabels),
      'Ore pontate': row.totalHours,
      'Norma calculata': row.monthlyNorm,
      'Progres %': row.utilizationPercent,
      'Livrabile atasate': submitted?.totalDeliverables ?? '',
      'Livrabile lipsa': row.missingDeliverableActivityCount,
      'Observatii deschise': submitted?.issuesCount ?? 0,
      'Data trimiterii': formatDate(reportStatus?.sentDate),
      'Data aprobarii': formatDate(reportStatus?.approvalDate),
      'Observatii PM': reportStatus?.pmNotes || '',
      'Semnale PM': buildIssueSummary(row),
    };
  });

  const actionRows = situation.actionRows.map((row, index) => {
    const expert = input.experts.find((item) => item.id === row.expertId);
    const reportStatus = input.reportStatusByExpertId.get(row.expertId);
    return {
      Nr: index + 1,
      Expert: expert?.name || row.expertName,
      Rol: expert?.role || row.role || '',
      'Status raportare': statusLabel(reportStatus?.status || 'draft', input.statusLabels),
      'Ore ramase': row.remainingHours,
      'Zile fara pontaj': row.missingActivityDays.join(', '),
      'Zile blocate': row.blockedDays.join(', '),
      'Livrabile lipsa': row.missingDeliverableActivityCount,
      Motiv: buildIssueSummary(row),
    };
  });

  return { summaryRows, statusRows, actionRows };
}

export function buildPmReportSituationXlsxBuffer(input: PmReportSituationExportInput) {
  const workbook = XLSX.utils.book_new();
  const rows = buildPmReportSituationWorkbookRows(input);

  const summarySheet = XLSX.utils.json_to_sheet(rows.summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Sumar');

  const statusSheet = XLSX.utils.json_to_sheet(rows.statusRows);
  statusSheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 42 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, statusSheet, 'Status experti');

  const actionSheet = XLSX.utils.json_to_sheet(rows.actionRows.length > 0 ? rows.actionRows : [{
    Nr: '',
    Expert: 'Nu exista actiuni necesare pentru perioada selectata',
  }]);
  actionSheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 28 },
    { wch: 24 },
    { wch: 12 },
    { wch: 28 },
    { wch: 28 },
    { wch: 16 },
    { wch: 54 },
  ];
  XLSX.utils.book_append_sheet(workbook, actionSheet, 'Actiuni necesare');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
}

export function buildPmReportSituationXlsxBlob(input: PmReportSituationExportInput) {
  const buffer = buildPmReportSituationXlsxBuffer(input);
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildPmReportSituationXlsxFilename(month: number, year: number) {
  return `Situatie_raportare_PEO_${getMonthName(month)}_${year}.xlsx`.replace(/[\\/:*?"<>|]+/g, '_');
}
