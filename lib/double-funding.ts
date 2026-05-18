import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, ReportStatus } from './types.ts';
import { getWorkingDaysListInMonth } from './working-hours.ts';
import { buildConsolidatedTimesheet, getEntriesForProjectMonth, isAbsenceDayType } from './concurrent-projects.ts';

export type DoubleFundingRiskStatus = 'ok' | 'needs_review' | 'high_risk';

export interface DoubleFundingRiskRow {
  id: string;
  expertId: string;
  expertName: string;
  expertRole?: string;
  projectCode?: string;
  projectName: string;
  fundingSource?: string;
  startDate: string;
  endDate?: string;
  overlapDays: number;
  peoHours: number;
  peoMonthlyNorm: number;
  concurrentEstimatedHours: number;
  totalEstimatedHours: number;
  dailyConcurrentHours: number;
  maxDailyCombinedHours: number;
  status: DoubleFundingRiskStatus;
  reasons: string[];
  reportStatus?: ReportStatus['status'];
  dailyEntryCount: number;
  incompleteTimesheet: boolean;
  exceededDays: number;
  coCmConflicts: number;
}

export interface DoubleFundingSummary {
  totalConcurrentProjects: number;
  expertsWithConcurrentProjects: number;
  highRisk: number;
  needsReview: number;
  ok: number;
  totalEstimatedConcurrentHours: number;
}

export function monthDateRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start, end };
}

export function dateRangesOverlap(
  firstStart: string,
  firstEnd: string | undefined,
  secondStart: Date,
  secondEnd: Date
) {
  const start = parseIsoDate(firstStart);
  const end = firstEnd ? parseIsoDate(firstEnd) : secondEnd;
  if (!start) return false;
  return start <= secondEnd && (end ?? secondEnd) >= secondStart;
}

export function buildDoubleFundingRiskRows(args: {
  experts: Expert[];
  activities: Activity[];
  concurrentProjects: ConcurrentProject[];
  concurrentTimesheetEntries?: ConcurrentProjectTimesheetEntry[];
  reportStatuses?: ReportStatus[];
  month: number;
  year: number;
}): DoubleFundingRiskRow[] {
  const { start, end } = monthDateRange(args.month, args.year);
  const workingDays = getWorkingDaysListInMonth(args.month + 1, args.year);
  const reportStatusByExpert = new Map((args.reportStatuses || []).map((status) => [status.expertId, status.status]));

  return args.concurrentProjects
    .filter((project) => project.isActive !== false)
    .filter((project) => dateRangesOverlap(project.startDate, project.endDate, start, end))
    .map((project) => {
      const expert = args.experts.find((item) => item.id === project.expertId);
      const activeDays = workingDays.filter((day) => {
        const startIso = iso(day);
        return dateRangesOverlap(project.startDate, project.endDate, new Date(`${startIso}T00:00:00Z`), new Date(`${startIso}T00:00:00Z`));
      });
      const expertActivities = args.activities.filter((activity) => activity.expertId === project.expertId);
      const peoHours = sumHours(expertActivities);
      const peoMonthlyNorm = (expert?.dailyHours ?? expert?.oreZi ?? expert?.norma ?? 8) * workingDays.length;
      const projectEntries = getEntriesForProjectMonth(args.concurrentTimesheetEntries || [], project.id, args.month, args.year);
      const hasDailyEntries = projectEntries.length > 0;
      const concurrentEstimatedHours = hasDailyEntries
        ? projectEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
        : Number(project.dailyHours || 0) * activeDays.length;
      const totalEstimatedHours = peoHours + concurrentEstimatedHours;
      const dailyPeoTotals = new Map<string, number>();
      expertActivities.forEach((activity) => {
        dailyPeoTotals.set(activity.date, (dailyPeoTotals.get(activity.date) ?? 0) + (Number(activity.hours) || 0));
      });
      const entryHoursByDate = new Map<string, number>();
      projectEntries.forEach((entry) => {
        entryHoursByDate.set(entry.date, (entryHoursByDate.get(entry.date) ?? 0) + (Number(entry.hours) || 0));
      });
      const maxDailyCombinedHours = activeDays.reduce((max, day) => {
        const date = iso(day);
        const peoDayHours = dailyPeoTotals.get(date) ?? 0;
        const concurrentDayHours = hasDailyEntries ? (entryHoursByDate.get(date) ?? 0) : Number(project.dailyHours || 0);
        return Math.max(max, peoDayHours + concurrentDayHours);
      }, 0);
      const consolidatedRows = buildConsolidatedTimesheet({
        activities: expertActivities,
        concurrentProjects: [project],
        entries: projectEntries,
        month: args.month,
        year: args.year,
      });
      const exceededDays = consolidatedRows.filter((row) => row.totalHours > 8).length;
      const coCmConflicts = consolidatedRows.filter((row) => row.dayTypes.some(isAbsenceDayType) && row.totalHours > 0).length;
      const reasons: string[] = [];

      if (maxDailyCombinedHours > 8) {
        reasons.push('Depășire potențială a limitei de 8 ore/zi');
      }
      if (totalEstimatedHours > peoMonthlyNorm) {
        reasons.push('Ore estimate peste norma lunară disponibilă');
      }
      if (project.fundingSource && project.fundingSource.toLowerCase().includes('ue')) {
        reasons.push('Sursă de finanțare europeană declarată');
      }
      if (!project.endDate) {
        reasons.push('Perioadă fără dată de final');
      }
      if (hasDailyEntries && projectEntries.some((entry) => (Number(entry.hours) || 0) > 0 && (!entry.wp?.trim() || !entry.taskName?.trim()))) {
        reasons.push('Pontaj proiect paralel cu WP sau task name lipsă');
      }
      if (hasDailyEntries && coCmConflicts > 0) {
        reasons.push('Conflict CO/CM/Altele cu ore lucrate în aceeași zi');
      }
      if (!hasDailyEntries && activeDays.length > 0) {
        reasons.push('Pontaj zilnic proiect paralel necompletat; se folosește dailyHours estimativ');
      }

      const status: DoubleFundingRiskStatus =
        maxDailyCombinedHours > 8 || totalEstimatedHours > peoMonthlyNorm
          ? 'high_risk'
          : reasons.length > 0 || concurrentEstimatedHours > 0
            ? 'needs_review'
            : 'ok';

      return {
        id: project.id,
        expertId: project.expertId,
        expertName: expert?.name || project.expertId,
        expertRole: expert?.role,
        projectCode: project.projectCode,
        projectName: project.projectName,
        fundingSource: project.fundingSource,
        startDate: project.startDate,
        endDate: project.endDate,
        overlapDays: activeDays.length,
        peoHours,
        peoMonthlyNorm,
        concurrentEstimatedHours,
        totalEstimatedHours,
        dailyConcurrentHours: Number(project.dailyHours || 0),
        maxDailyCombinedHours,
        status,
        reasons,
        reportStatus: reportStatusByExpert.get(project.expertId),
        dailyEntryCount: projectEntries.length,
        incompleteTimesheet: !hasDailyEntries && activeDays.length > 0,
        exceededDays,
        coCmConflicts,
      };
    })
    .sort((a, b) => statusWeight(b.status) - statusWeight(a.status) || a.expertName.localeCompare(b.expertName));
}

export function buildDoubleFundingSummary(rows: DoubleFundingRiskRow[]): DoubleFundingSummary {
  return {
    totalConcurrentProjects: rows.length,
    expertsWithConcurrentProjects: new Set(rows.map((row) => row.expertId)).size,
    highRisk: rows.filter((row) => row.status === 'high_risk').length,
    needsReview: rows.filter((row) => row.status === 'needs_review').length,
    ok: rows.filter((row) => row.status === 'ok').length,
    totalEstimatedConcurrentHours: rows.reduce((sum, row) => sum + row.concurrentEstimatedHours, 0),
  };
}

export function buildPmExportRows(args: {
  experts: Expert[];
  activities: Activity[];
  concurrentRiskRows: DoubleFundingRiskRow[];
  reportStatuses?: ReportStatus[];
  month: number;
  year: number;
}) {
  const statusByExpert = new Map((args.reportStatuses || []).map((status) => [status.expertId, status.status]));

  return args.experts.map((expert) => {
    const expertActivities = args.activities.filter((activity) => activity.expertId === expert.id);
    const risks = args.concurrentRiskRows.filter((risk) => risk.expertId === expert.id);
    return {
      expertId: expert.id,
      expertName: expert.name,
      role: expert.role,
      category: expert.category || '',
      projectCode: expert.projectCode || '302141',
      month: args.month + 1,
      year: args.year,
      reportStatus: statusByExpert.get(expert.id) || 'draft',
      activityCount: expertActivities.length,
      peoHours: sumHours(expertActivities),
      concurrentProjects: risks.length,
      highRiskConcurrentProjects: risks.filter((risk) => risk.status === 'high_risk').length,
      needsReviewConcurrentProjects: risks.filter((risk) => risk.status === 'needs_review').length,
      concurrentHours: risks.reduce((sum, risk) => sum + risk.concurrentEstimatedHours, 0),
      consolidatedHours: sumHours(expertActivities) + risks.reduce((sum, risk) => sum + risk.concurrentEstimatedHours, 0),
      exceededDays: risks.reduce((sum, risk) => sum + risk.exceededDays, 0),
      coCmConflicts: risks.reduce((sum, risk) => sum + risk.coCmConflicts, 0),
      incompleteTimesheets: risks.filter((risk) => risk.incompleteTimesheet).length,
      riskReasons: risks.flatMap((risk) => risk.reasons).join(' | '),
    };
  });
}

export function buildCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n');
}

function parseIsoDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sumHours(activities: Pick<Activity, 'hours'>[]) {
  return activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
}

function statusWeight(status: DoubleFundingRiskStatus) {
  if (status === 'high_risk') return 3;
  if (status === 'needs_review') return 2;
  return 1;
}
