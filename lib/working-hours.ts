'use client';

import {
  calculateMonthlyNormHours,
  getLegalHolidayDates,
  getNonWorkingDayInfo,
  isLegalHolidayDate,
  type NonWorkingDayInfo,
} from './non-working-days.ts';

// Monthly working hour norms for full-time (8h/day), derived from the audited
// local Romanian legal-holiday calendar.
export const MONTH_NORMS_2026: Record<number, number> = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [
    index + 1,
    calculateMonthlyNormHours({ month: index, year: 2026, dailyHours: 8 }).normHours,
  ]),
);

/**
 * Get all unique Romanian public-holiday dates for a given year.
 */
export function getRomanianHolidays(year: number): Date[] {
  return getLegalHolidayDates(year);
}

/**
 * Check if a date is a Romanian public holiday.
 */
export function isRomanianHoliday(date: Date): boolean {
  return isLegalHolidayDate(date);
}

/**
 * Check if a date is a working day (not weekend, not legal holiday).
 */
export function isWorkingDay(date: Date): boolean {
  return !getNonWorkingDayInfo(date).isNonWorkingDay;
}

/**
 * Get the number of working days in a month.
 * @param month Month as 1-12.
 */
export function getWorkingDaysInMonth(month: number, year: number): number {
  return calculateMonthlyNormHours({ month: month - 1, year, dailyHours: 1 }).workingDays;
}

/**
 * Get list of working days in a month (as Date objects).
 * @param month Month as 1-12.
 */
export function getWorkingDaysListInMonth(month: number, year: number): Date[] {
  const workingDays: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    if (isWorkingDay(date)) {
      workingDays.push(date);
    }
  }

  return workingDays;
}

/**
 * Calculate maximum allowed hours for an expert in a given month.
 * @param norma Daily hours (4, 6, or 8).
 * @param month Month as 1-12.
 * @param year Year.
 */
export function getMaxHoursForMonth(norma: number, month: number, year: number): number {
  return calculateMonthlyNormHours({ month: month - 1, year, dailyHours: norma }).normHours;
}

/**
 * Calculate maximum allowed hours considering concurrent projects.
 * Legal limit: 12 hours/day maximum across all projects.
 */
export function getMaxHoursWithConcurrentProjects(
  normaThisProject: number,
  normaConcurrentProjects: number,
  month: number,
  year: number,
): { maxHours: number; limitedByLaw: boolean; legalLimit: number } {
  const workingDays = getWorkingDaysInMonth(month, year);
  const totalDailyHours = normaThisProject + normaConcurrentProjects;
  const legalDailyLimit = 12;

  if (totalDailyHours > legalDailyLimit) {
    const allowedDailyHours = Math.max(0, legalDailyLimit - normaConcurrentProjects);
    return {
      maxHours: workingDays * allowedDailyHours,
      limitedByLaw: true,
      legalLimit: workingDays * legalDailyLimit,
    };
  }

  return {
    maxHours: workingDays * normaThisProject,
    limitedByLaw: false,
    legalLimit: workingDays * legalDailyLimit,
  };
}

/**
 * Get expert norm description.
 */
export function getNormaDescription(norma: number): string {
  switch (norma) {
    case 8:
      return 'Full-time (8h/zi)';
    case 6:
      return '75% norma (6h/zi)';
    case 4:
      return '50% norma (4h/zi)';
    case 2:
      return '25% norma (2h/zi)';
    default:
      return `${norma}h/zi`;
  }
}

/**
 * Get day type for a given date.
 */
export function getDayType(date: Date): 'lucratoare' | 'weekend' | 'sarbatoare' {
  const info = getNonWorkingDayInfo(date);

  if (info.isWeekend) {
    return 'weekend';
  }

  if (info.isLegalHoliday) {
    return 'sarbatoare';
  }

  return 'lucratoare';
}

/**
 * Format date as Romanian string.
 */
export function formatDateRomanian(date: Date): string {
  const months = [
    'ianuarie',
    'februarie',
    'martie',
    'aprilie',
    'mai',
    'iunie',
    'iulie',
    'august',
    'septembrie',
    'octombrie',
    'noiembrie',
    'decembrie',
  ];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Get month name in Romanian.
 */
export function getMonthNameRomanian(month: number): string {
  const months = [
    'Ianuarie',
    'Februarie',
    'Martie',
    'Aprilie',
    'Mai',
    'Iunie',
    'Iulie',
    'August',
    'Septembrie',
    'Octombrie',
    'Noiembrie',
    'Decembrie',
  ];
  return months[month - 1] || '';
}

/**
 * Get working hours info for a month (used by calendar).
 */
export interface WorkingHoursInfo {
  workingDays: number;
  maxHoursFullTime: number;
  maxHoursWithNorma: number;
  maxHours: number;
  totalHours: number;
  remaining: number;
  holidays: Date[];
  nonWorkingDays: NonWorkingDayInfo[];
}

interface ActivityWithHours {
  hours?: number;
}

export function getWorkingHoursInfo(
  month: number,
  year: number,
  norma: number = 8,
  activities?: ActivityWithHours[],
): WorkingHoursInfo {
  const norm = calculateMonthlyNormHours({ month, year, dailyHours: norma });
  const holidays = getRomanianHolidays(year).filter((holiday) => holiday.getMonth() === month);
  const totalHours = activities?.reduce((sum, activity) => sum + (activity.hours || 0), 0) || 0;
  const remaining = norm.normHours - totalHours;

  return {
    workingDays: norm.workingDays,
    maxHoursFullTime: calculateMonthlyNormHours({ month, year, dailyHours: 8 }).normHours,
    maxHoursWithNorma: norm.normHours,
    maxHours: norm.normHours,
    totalHours,
    remaining,
    holidays,
    nonWorkingDays: norm.nonWorkingDays,
  };
}

/**
 * Calculate hours summary for an expert in a month.
 */
export interface MonthlyHoursSummary {
  expertId: string;
  month: number;
  year: number;
  norma: number;
  workingDays: number;
  maxHours: number;
  loggedHours: number;
  remainingHours: number;
  percentComplete: number;
  isOverLimit: boolean;
}

export function calculateMonthlyHoursSummary(
  expertId: string,
  norma: number,
  month: number,
  year: number,
  loggedHours: number,
): MonthlyHoursSummary {
  const norm = calculateMonthlyNormHours({ month: month - 1, year, dailyHours: norma });
  const remainingHours = Math.max(0, norm.normHours - loggedHours);
  const percentComplete = norm.normHours > 0 ? Math.min(100, (loggedHours / norm.normHours) * 100) : 0;

  return {
    expertId,
    month,
    year,
    norma,
    workingDays: norm.workingDays,
    maxHours: norm.normHours,
    loggedHours,
    remainingHours,
    percentComplete,
    isOverLimit: loggedHours > norm.normHours,
  };
}
