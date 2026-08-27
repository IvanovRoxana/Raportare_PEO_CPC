import type { ReportingPeriod, ReportingPeriodCreateInput } from './types.ts';

export const DEFAULT_REPORTING_PROJECT_CODE = '302141';
const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

type PeriodSeed = {
  code: string;
  startMonth: number;
  startYear: number;
  monthCount: number;
};

const DEFAULT_PERIOD_SEEDS: PeriodSeed[] = [
  { code: 'RP 9', startMonth: 10, startYear: 2025, monthCount: 3 },
  { code: 'RP 10', startMonth: 1, startYear: 2026, monthCount: 3 },
  { code: 'RP 12', startMonth: 4, startYear: 2026, monthCount: 3 },
  { code: 'RP 13', startMonth: 7, startYear: 2026, monthCount: 3 },
  { code: 'RP 14', startMonth: 10, startYear: 2026, monthCount: 3 },
  { code: 'RP 15', startMonth: 1, startYear: 2027, monthCount: 3 },
  { code: 'RP 16', startMonth: 4, startYear: 2027, monthCount: 3 },
  { code: 'RP 17', startMonth: 7, startYear: 2027, monthCount: 3 },
  { code: 'RP 18', startMonth: 10, startYear: 2027, monthCount: 3 },
  { code: 'RP 19', startMonth: 1, startYear: 2028, monthCount: 3 },
  { code: 'RP 20', startMonth: 4, startYear: 2028, monthCount: 3 },
  { code: 'RP 21', startMonth: 7, startYear: 2028, monthCount: 3 },
  { code: 'RP 22', startMonth: 10, startYear: 2028, monthCount: 3 },
];

function monthIndex(month: number, year: number) {
  return year * 12 + month;
}

export function addMonths(month: number, year: number, offset: number) {
  const index = monthIndex(month, year) + offset;
  return {
    month: ((index % 12) + 12) % 12,
    year: Math.floor(index / 12),
  };
}

export function buildReportingPeriod(input: Omit<ReportingPeriodCreateInput, 'endMonth' | 'endYear'>): ReportingPeriodCreateInput {
  const end = addMonths(input.startMonth, input.startYear, Math.max(1, input.monthCount) - 1);
  return {
    ...input,
    code: input.code.trim(),
    projectCode: input.projectCode.trim() || DEFAULT_REPORTING_PROJECT_CODE,
    endMonth: end.month,
    endYear: end.year,
  };
}

export function getDefaultReportingPeriods(): ReportingPeriod[] {
  return DEFAULT_PERIOD_SEEDS.map((seed) => ({
    id: `default-${seed.code.toLowerCase().replace(/\s+/g, '-')}`,
    ...buildReportingPeriod({
      projectCode: DEFAULT_REPORTING_PROJECT_CODE,
      code: seed.code,
      startMonth: seed.startMonth,
      startYear: seed.startYear,
      monthCount: seed.monthCount,
      status: 'published',
      notes: 'Perioada implicita folosita pana la configurarea din Admin.',
    }),
  }));
}

export function sortReportingPeriods(periods: ReportingPeriod[]) {
  return [...periods].sort((a, b) => {
    const startCompare = monthIndex(a.startMonth, a.startYear) - monthIndex(b.startMonth, b.startYear);
    if (startCompare !== 0) return startCompare;
    return a.code.localeCompare(b.code);
  });
}

export function formatReportingPeriodLabel(period: Pick<ReportingPeriod, 'code' | 'startMonth' | 'startYear' | 'endMonth' | 'endYear'>) {
  const start = `${MONTHS[period.startMonth]} ${period.startYear}`;
  const end = `${MONTHS[period.endMonth]} ${period.endYear}`;
  return `${period.code} - ${start} / ${end}`;
}

export function reportingPeriodIncludesMonth(period: Pick<ReportingPeriod, 'startMonth' | 'startYear' | 'endMonth' | 'endYear'>, month: number, year: number) {
  const current = monthIndex(month, year);
  return current >= monthIndex(period.startMonth, period.startYear) && current <= monthIndex(period.endMonth, period.endYear);
}

export function getReportingPeriodMonthRefs(period: Pick<ReportingPeriod, 'startMonth' | 'startYear' | 'monthCount'>) {
  return Array.from({ length: period.monthCount }, (_, index) => addMonths(period.startMonth, period.startYear, index));
}

export function resolveReportingPeriods(periods: ReportingPeriod[]) {
  const usable = periods.length > 0 ? periods : getDefaultReportingPeriods();
  return sortReportingPeriods(usable.filter((period) => period.status !== 'archived'));
}

export function resolveDefaultReportingPeriod(periods: ReportingPeriod[], month: number, year: number) {
  const usable = resolveReportingPeriods(periods);
  const published = usable.filter((period) => period.status === 'published');
  return published.find((period) => reportingPeriodIncludesMonth(period, month, year))
    ?? published[published.length - 1]
    ?? usable[usable.length - 1]
    ?? null;
}

export function validateReportingPeriod(input: ReportingPeriodCreateInput, existingPeriods: ReportingPeriod[], currentId?: string) {
  const errors: string[] = [];
  const code = input.code.trim().toLowerCase();
  const projectCode = input.projectCode.trim();

  if (!input.code.trim()) errors.push('Codul raportului este obligatoriu.');
  if (!projectCode) errors.push('Codul proiectului este obligatoriu.');
  if (![2, 3].includes(Number(input.monthCount))) errors.push('Durata permisa este 2 sau 3 luni.');

  const duplicate = existingPeriods.some((period) =>
    period.id !== currentId
    && period.projectCode === projectCode
    && period.code.trim().toLowerCase() === code
  );
  if (duplicate) errors.push('Exista deja o perioada cu acest cod pentru proiect.');

  if (input.status === 'published') {
    const start = monthIndex(input.startMonth, input.startYear);
    const end = monthIndex(input.endMonth, input.endYear);
    const overlap = existingPeriods.some((period) => {
      if (period.id === currentId || period.projectCode !== projectCode || period.status !== 'published') return false;
      const otherStart = monthIndex(period.startMonth, period.startYear);
      const otherEnd = monthIndex(period.endMonth, period.endYear);
      return start <= otherEnd && end >= otherStart;
    });
    if (overlap) errors.push('Perioadele publicate nu se pot suprapune pentru acelasi proiect.');
  }

  return errors;
}
