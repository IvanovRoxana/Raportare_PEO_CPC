'use client';

import { assertCanLogHoursOnDate, calculateMonthlyNormHours } from './non-working-days.ts';
import type { Activity, Expert } from './types';

export const DAILY_HOURS_LIMIT = 8;
export const MIN_PONTAJ_HOURS = 1;
export const MAX_PONTAJ_HOURS = DAILY_HOURS_LIMIT;

export type NormType = 'calculated' | 'manual_adjusted' | 'project';

export interface ActivityDraftForValidation {
  id?: string;
  expertId: string;
  date: string;
  hours: number;
  status?: string;
  projectCode?: string;
}

export interface MonthlyNormInfo {
  normType: NormType;
  dailyHours: number;
  workingDays: number;
  monthlyNorm: number;
  source: 'calculated' | 'manual' | 'project';
}

export interface PontajValidationResult {
  ok: boolean;
  code?: 'INVALID_HOURS' | 'NON_WORKING_DAY' | 'DAILY_LIMIT_EXCEEDED' | 'MONTHLY_NORM_EXCEEDED' | 'PROJECT_NORM_EXCEEDED';
  message?: string;
  monthlyNorm: number;
  monthlyTotalBefore: number;
  monthlyTotalAfter: number;
  remainingMonthlyHours: number;
  dailyTotalsAfter: Record<string, number>;
}

function normalize(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeNormType(value?: string): NormType {
  const normalized = normalize(value);

  if (normalized === 'manual_adjusted' || normalized.includes('manual') || normalized.includes('ajustata')) {
    return 'manual_adjusted';
  }

  if (normalized === 'project' || normalized.includes('proiect')) {
    return 'project';
  }

  return 'calculated';
}

function getNumericField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return undefined;
}

export function getExpertRole(expert?: Partial<Expert>) {
  return normalize(expert?.role);
}

export function isPmRole(expert?: Partial<Expert>) {
  const role = getExpertRole(expert);
  return role === 'pm' || role === 'expert/pm' || role.includes('pm');
}

export function isExpertRole(expert?: Partial<Expert>) {
  const role = getExpertRole(expert);
  return role === 'expert' || role === 'expert/pm' || !role;
}

export function calculateMonthlyNormInfo(expert: Partial<Expert>, month: number, year: number): MonthlyNormInfo {
  const source = expert as Record<string, unknown>;
  const normType = normalizeNormType(String(source.normType ?? source.tipNorma ?? ''));
  const dailyHours = getNumericField(source, ['oreZi', 'dailyHours', 'norma']) ?? 8;
  const calculatedNorm = calculateMonthlyNormHours({ month, year, dailyHours });
  const workingDays = calculatedNorm.workingDays;

  const manualMonthlyNorm = getNumericField(source, ['manualMonthlyNorm', 'monthlyNormOverride', 'normaLunaraManuala']);
  const projectMonthlyNorm = getNumericField(source, ['projectMonthlyNorm', 'projectNorm', 'normaProiect']);

  if (normType === 'manual_adjusted' && manualMonthlyNorm !== undefined) {
    return {
      normType,
      dailyHours,
      workingDays,
      monthlyNorm: manualMonthlyNorm,
      source: 'manual',
    };
  }

  if (normType === 'manual_adjusted') {
    return {
      normType,
      dailyHours,
      workingDays,
      monthlyNorm: 0,
      source: 'manual',
    };
  }

  if (normType === 'project' && projectMonthlyNorm !== undefined) {
    return {
      normType,
      dailyHours,
      workingDays,
      monthlyNorm: projectMonthlyNorm,
      source: 'project',
    };
  }

  return {
    normType,
    dailyHours,
    workingDays,
    monthlyNorm: calculatedNorm.normHours,
    source: 'calculated',
  };
}

export function totalActivityHours(activities: Pick<ActivityDraftForValidation, 'hours'>[]) {
  return activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
}

export function isValidPontajHours(hours: unknown) {
  const value = typeof hours === 'string' ? Number(hours) : hours;
  return (
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= MIN_PONTAJ_HOURS
    && value <= MAX_PONTAJ_HOURS
  );
}

export function normalizePontajHoursValue(value: unknown, fallback: number | string = MAX_PONTAJ_HOURS) {
  const numericValue = typeof value === 'string' ? Number(value) : value;
  if (isValidPontajHours(numericValue)) return String(numericValue);

  const fallbackValue = typeof fallback === 'string' ? Number(fallback) : fallback;
  return isValidPontajHours(fallbackValue) ? String(fallbackValue) : String(MAX_PONTAJ_HOURS);
}

export function buildSelectedHoursForDates(
  dates: string[],
  baseHours: Record<string, string> = {},
  defaultHours: number | string = MAX_PONTAJ_HOURS,
) {
  const nextHours: Record<string, string> = {};
  [...new Set(dates)].sort().forEach((date) => {
    nextHours[date] = normalizePontajHoursValue(baseHours[date], defaultHours);
  });

  return nextHours;
}

export function validateActivitiesBeforeCreate(args: {
  expert: Partial<Expert>;
  existingActivities: ActivityDraftForValidation[];
  newActivities: ActivityDraftForValidation[];
  month: number;
  year: number;
}): PontajValidationResult {
  const { expert, month, year } = args;
  const existingActivities = args.existingActivities.filter((activity) => activity.status !== 'rejected');
  const newActivities = args.newActivities.filter((activity) => activity.hours > 0);
  const normInfo = calculateMonthlyNormInfo(expert, month, year);
  const monthlyNorm = normInfo.monthlyNorm;
  const monthlyTotalBefore = totalActivityHours(existingActivities);
  const monthlyTotalAfter = monthlyTotalBefore + totalActivityHours(newActivities);

  const dailyTotalsAfter: Record<string, number> = {};
  [...existingActivities, ...newActivities].forEach((activity) => {
    dailyTotalsAfter[activity.date] = (dailyTotalsAfter[activity.date] ?? 0) + (Number(activity.hours) || 0);
  });

  for (const activity of newActivities) {
    if (!isValidPontajHours(activity.hours)) {
      return {
        ok: false,
        code: 'INVALID_HOURS',
        message: `Activitatea nu a fost creată: orele pontate trebuie să fie numere întregi între ${MIN_PONTAJ_HOURS} și ${MAX_PONTAJ_HOURS}.`,
        monthlyNorm,
        monthlyTotalBefore,
        monthlyTotalAfter,
        remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalBefore),
        dailyTotalsAfter,
      };
    }
  }

  for (const activity of newActivities) {
    try {
      assertCanLogHoursOnDate(activity.date);
    } catch (error) {
      return {
        ok: false,
        code: 'NON_WORKING_DAY',
        message:
          error instanceof Error
            ? error.message
            : 'Activitatea nu a fost creată: data selectată este zi nelucrătoare.',
        monthlyNorm,
        monthlyTotalBefore,
        monthlyTotalAfter,
        remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalBefore),
        dailyTotalsAfter,
      };
    }
  }

  for (const [date, total] of Object.entries(dailyTotalsAfter)) {
    if (total > DAILY_HOURS_LIMIT) {
      return {
        ok: false,
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `Activitatea nu a fost creată: totalul pentru ${date} ar ajunge la ${total}h, peste limita de ${DAILY_HOURS_LIMIT}h/zi. Contactează administratorul pentru deblocare sau corecție.`,
        monthlyNorm,
        monthlyTotalBefore,
        monthlyTotalAfter,
        remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalBefore),
        dailyTotalsAfter,
      };
    }
  }

  if (normInfo.normType === 'project' && monthlyTotalAfter > normInfo.monthlyNorm) {
    return {
      ok: false,
      code: 'PROJECT_NORM_EXCEEDED',
      message: `Activitatea nu a fost creată: norma proiectului ar fi depășită (${monthlyTotalAfter}h / ${normInfo.monthlyNorm}h). Contactează administratorul.`,
      monthlyNorm,
      monthlyTotalBefore,
      monthlyTotalAfter,
      remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalBefore),
      dailyTotalsAfter,
    };
  }

  if (monthlyTotalAfter > monthlyNorm) {
    return {
      ok: false,
      code: 'MONTHLY_NORM_EXCEEDED',
      message: `Activitatea nu a fost creată: totalul lunar ar ajunge la ${monthlyTotalAfter}h, peste norma lunară de ${monthlyNorm}h. Ai ${Math.max(0, monthlyNorm - monthlyTotalBefore)}h disponibile. Contactează administratorul.`,
      monthlyNorm,
      monthlyTotalBefore,
      monthlyTotalAfter,
      remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalBefore),
      dailyTotalsAfter,
    };
  }

  return {
    ok: true,
    monthlyNorm,
    monthlyTotalBefore,
    monthlyTotalAfter,
    remainingMonthlyHours: Math.max(0, monthlyNorm - monthlyTotalAfter),
    dailyTotalsAfter,
  };
}

export function getMonthlyBlockingState(args: {
  expert: Partial<Expert>;
  activities: ActivityDraftForValidation[];
  month: number;
  year: number;
}) {
  const normInfo = calculateMonthlyNormInfo(args.expert, args.month, args.year);
  const totalHours = totalActivityHours(args.activities.filter((activity) => activity.status !== 'rejected'));
  const remainingHours = Math.max(0, normInfo.monthlyNorm - totalHours);

  return {
    ...normInfo,
    totalHours,
    remainingHours,
    isBlocked: totalHours >= normInfo.monthlyNorm,
    reason:
      totalHours >= normInfo.monthlyNorm
        ? `Norma lunară de ${normInfo.monthlyNorm}h este atinsă. Pentru modificări sau deblocări contactează administratorul.`
        : '',
  };
}
