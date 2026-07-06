import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry } from './types.ts';
import { getWorkingDaysListInMonth } from './working-hours.ts';

export type ConsolidatedDayStatus = 'OK' | 'depășire' | 'conflict CO-CM' | 'necesită verificare';

export interface ConsolidatedDayRow {
  date: string;
  peoHours: number;
  concurrentHoursByProject: Record<string, number>;
  totalHours: number;
  dayTypes: string[];
  status: ConsolidatedDayStatus;
  observations: string[];
}

export interface ConcurrentProjectMonthlyTotal {
  projectId: string;
  projectName: string;
  projectCode?: string;
  totalHours: number;
  totalByWp: Record<string, number>;
  hasDailyEntries: boolean;
  isIncomplete: boolean;
}

export function getEntriesForProjectMonth(
  entries: ConcurrentProjectTimesheetEntry[],
  projectId: string,
  month: number,
  year: number
) {
  return entries.filter((entry) => entry.concurrentProjectId === projectId && entry.month === month && entry.year === year);
}

export function getConcurrentProjectMonthlyTotal(args: {
  project: ConcurrentProject;
  entries: ConcurrentProjectTimesheetEntry[];
  month: number;
  year: number;
}): ConcurrentProjectMonthlyTotal {
  const projectEntries = getEntriesForProjectMonth(args.entries, args.project.id, args.month, args.year);
  const totalByWp: Record<string, number> = {};

  projectEntries.forEach((entry) => {
    const hours = Number(entry.hours) || 0;
    if (!hours) return;
    const wp = entry.wp?.trim() || 'Fără WP';
    totalByWp[wp] = (totalByWp[wp] || 0) + hours;
  });

  const hasDailyEntries = projectEntries.length > 0;
  const totalHours = hasDailyEntries
    ? projectEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
    : estimateConcurrentHours(args.project, args.month, args.year);

  return {
    projectId: args.project.id,
    projectName: args.project.projectName,
    projectCode: args.project.projectCode,
    totalHours,
    totalByWp,
    hasDailyEntries,
    isIncomplete: isActiveInMonth(args.project, args.month, args.year) && !hasDailyEntries,
  };
}

export function buildConsolidatedTimesheet(args: {
  activities: Activity[];
  concurrentProjects: ConcurrentProject[];
  entries: ConcurrentProjectTimesheetEntry[];
  month: number;
  year: number;
}): ConsolidatedDayRow[] {
  const daysInMonth = new Date(args.year, args.month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${args.year}-${String(args.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayActivities = args.activities.filter((activity) => activity.date === date);
    const dayEntries = args.entries.filter((entry) => entry.date === date);
    const peoHours = dayActivities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
    const concurrentHoursByProject: Record<string, number> = {};
    dayEntries.forEach((entry) => {
      concurrentHoursByProject[entry.concurrentProjectId] =
        (concurrentHoursByProject[entry.concurrentProjectId] || 0) + (Number(entry.hours) || 0);
    });
    const concurrentHours = Object.values(concurrentHoursByProject).reduce((sum, hours) => sum + hours, 0);
    const totalHours = peoHours + concurrentHours;
    const dayTypes = Array.from(new Set([
      ...dayActivities.map((activity) => activity.dayType).filter(Boolean),
      ...dayEntries.map((entry) => entry.dayType).filter(Boolean),
    ] as string[]));
    const hasAbsence = dayTypes.some(isAbsenceDayType);
    const hasWorkedHours = totalHours > 0;
    const observations: string[] = [];
    dayEntries.forEach((entry) => {
      if ((Number(entry.hours) || 0) > 0 && !entry.wp?.trim()) observations.push('WP lipsă pentru zi cu ore');
      if ((Number(entry.hours) || 0) > 0 && !entry.taskName?.trim()) observations.push('Task name lipsă pentru zi cu ore');
    });
    if (totalHours > 8) observations.push(`Total zilnic ${totalHours}h peste limita de 8h`);
    if (hasAbsence && hasWorkedHours) observations.push('CO/CM/Altele suprapus cu ore lucrate');

    return {
      date,
      peoHours,
      concurrentHoursByProject,
      totalHours,
      dayTypes,
      status: totalHours > 8 ? 'depășire' : hasAbsence && hasWorkedHours ? 'conflict CO-CM' : observations.length ? 'necesită verificare' : 'OK',
      observations: Array.from(new Set(observations)),
    };
  });
}

export function getConsolidatedWarnings(rows: ConsolidatedDayRow[]) {
  return {
    exceededDays: rows.filter((row) => row.totalHours > 8).length,
    coCmConflicts: rows.filter((row) => row.dayTypes.some(isAbsenceDayType) && row.totalHours > 0).length,
    missingDetailsDays: rows.filter((row) => row.observations.some((note) => note.includes('lipsă'))).length,
  };
}

export function filterActiveConcurrentProjectsForMonth(projects: ConcurrentProject[], month: number, year: number) {
  return projects.filter((project) => project.isActive !== false && isConcurrentProjectValidated(project) && isActiveInMonth(project, month, year));
}

export function isConcurrentProjectValidated(project: Pick<ConcurrentProject, 'status'>) {
  return !project.status || project.status === 'validated';
}

export function isAbsenceDayType(dayType?: string) {
  const normalized = String(dayType || '').trim().toUpperCase();
  return normalized === 'CO' || normalized === 'CM' || normalized === 'ALTELE';
}

export function isActiveInMonth(project: ConcurrentProject, month: number, year: number) {
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const start = parseIsoDate(project.startDate);
  const end = project.endDate ? parseIsoDate(project.endDate) : monthEnd;
  return Boolean(start && start <= monthEnd && (end ?? monthEnd) >= monthStart);
}

function estimateConcurrentHours(project: ConcurrentProject, month: number, year: number) {
  const workingDays = getWorkingDaysListInMonth(month + 1, year).filter((day) => {
    const date = day.toISOString().slice(0, 10);
    return isDateWithinProject(project, date);
  });
  return (Number(project.dailyHours) || 0) * workingDays.length;
}

function isDateWithinProject(project: ConcurrentProject, date: string) {
  const day = parseIsoDate(date);
  const start = parseIsoDate(project.startDate);
  const end = project.endDate ? parseIsoDate(project.endDate) : day;
  return Boolean(day && start && start <= day && (end ?? day) >= day);
}

function parseIsoDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
