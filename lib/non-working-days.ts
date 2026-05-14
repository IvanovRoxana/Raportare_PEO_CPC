import legalHolidaysRo2026 from '../data/reference/legal-holidays-ro-2026.json' with { type: 'json' };

export interface LegalHoliday {
  id: string;
  countryCode: string;
  date: string;
  year: number;
  name: string;
  type: 'fixed' | 'orthodox' | string;
  source?: string;
  sourceUrl?: string;
  notes?: string;
}

export interface NonWorkingDayReason {
  type: 'weekend' | 'legal_holiday';
  label: string;
  holiday?: LegalHoliday;
}

export interface NonWorkingDayInfo {
  date: string;
  isWeekend: boolean;
  isLegalHoliday: boolean;
  isNonWorkingDay: boolean;
  reasons: NonWorkingDayReason[];
  badgeLabels: string[];
  holidayNames: string[];
}

export interface MonthlyNormHoursResult {
  month: number;
  year: number;
  dailyHours: number;
  workingDays: number;
  normHours: number;
  nonWorkingDays: NonWorkingDayInfo[];
}

const LEGAL_HOLIDAYS = legalHolidaysRo2026 as LegalHoliday[];
const MIN_OVERRIDE_JUSTIFICATION_LENGTH = 10;

const HOLIDAYS_BY_DATE = LEGAL_HOLIDAYS.reduce<Record<string, LegalHoliday[]>>((acc, holiday) => {
  acc[holiday.date] = [...(acc[holiday.date] ?? []), holiday];
  return acc;
}, {});

function normalizeActorRole(role?: string) {
  return (role || 'expert')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isPmOrAdminRole(role?: string) {
  const tokens = normalizeActorRole(role).split(/[\s,/]+/).filter(Boolean);
  return tokens.includes('pm') || tokens.includes('admin');
}

export function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getLegalHolidaysForYear(year: number): LegalHoliday[] {
  return LEGAL_HOLIDAYS.filter((holiday) => holiday.year === year);
}

export function getLegalHolidaysForDate(value: Date | string): LegalHoliday[] {
  return HOLIDAYS_BY_DATE[toDateKey(value)] ?? [];
}

export function getLegalHolidayDates(year: number): Date[] {
  const uniqueDates = new Set(getLegalHolidaysForYear(year).map((holiday) => holiday.date));
  return [...uniqueDates].sort().map(dateKeyToLocalDate);
}

export function isWeekendDate(value: Date | string): boolean {
  const date = typeof value === 'string' ? dateKeyToLocalDate(value.slice(0, 10)) : value;
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isLegalHolidayDate(value: Date | string): boolean {
  return getLegalHolidaysForDate(value).length > 0;
}

export function getNonWorkingDayInfo(value: Date | string): NonWorkingDayInfo {
  const date = toDateKey(value);
  const holidays = getLegalHolidaysForDate(date);
  const isWeekend = isWeekendDate(date);
  const reasons: NonWorkingDayReason[] = [];

  if (isWeekend) {
    reasons.push({ type: 'weekend', label: 'Weekend' });
  }

  holidays.forEach((holiday) => {
    reasons.push({ type: 'legal_holiday', label: holiday.name, holiday });
  });

  return {
    date,
    isWeekend,
    isLegalHoliday: holidays.length > 0,
    isNonWorkingDay: isWeekend || holidays.length > 0,
    reasons,
    badgeLabels: [
      ...(isWeekend ? ['Weekend'] : []),
      ...(holidays.length > 0 ? ['Sărbătoare legală'] : []),
    ],
    holidayNames: holidays.map((holiday) => holiday.name),
  };
}

export function getNonWorkingReasonText(info: NonWorkingDayInfo): string {
  const parts = [
    ...(info.isWeekend ? ['Weekend'] : []),
    ...info.holidayNames,
  ];
  return parts.join(', ');
}

export function assertCanLogHoursOnDate(
  value: Date | string,
  options: {
    actorRole?: string;
    force?: boolean;
    justification?: string;
  } = {},
): NonWorkingDayInfo {
  const info = getNonWorkingDayInfo(value);

  if (!info.isNonWorkingDay) {
    return info;
  }

  if (options.force) {
    if (!isPmOrAdminRole(options.actorRole)) {
      throw new Error('Exceptia pentru pontaj in zi nelucratoare este permisa doar pentru PM sau Admin.');
    }

    if (!options.justification || options.justification.trim().length < MIN_OVERRIDE_JUSTIFICATION_LENGTH) {
      throw new Error('Justificarea este obligatorie pentru pontajul exceptional in zi nelucratoare.');
    }

    return info;
  }

  throw new Error(
    `Nu se poate ponta in zi nelucratoare (${info.date}: ${getNonWorkingReasonText(info)}). ` +
      'Pentru exceptii este necesara interventie PM/Admin cu justificare si audit.',
  );
}

export function calculateMonthlyNormHours(args: {
  month: number;
  year: number;
  dailyHours?: number;
}): MonthlyNormHoursResult {
  const dailyHours = args.dailyHours ?? 8;
  const daysInMonth = new Date(args.year, args.month + 1, 0).getDate();
  const nonWorkingDays: NonWorkingDayInfo[] = [];
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const info = getNonWorkingDayInfo(new Date(args.year, args.month, day));
    if (info.isNonWorkingDay) {
      nonWorkingDays.push(info);
    } else {
      workingDays += 1;
    }
  }

  return {
    month: args.month,
    year: args.year,
    dailyHours,
    workingDays,
    normHours: workingDays * dailyHours,
    nonWorkingDays,
  };
}
