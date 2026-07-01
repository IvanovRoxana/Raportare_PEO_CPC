import type { Activity, Deliverable } from './types.ts';

export interface MonthlyEvidenceInput {
  id: string;
  fileName: string;
  text?: string | null;
  confirmedDates?: string[];
}

export interface MonthlyEvidenceCoverageRow {
  date: string;
  activities: Activity[];
  evidence: MonthlyEvidenceInput[];
  status: 'covered' | 'missing_activity' | 'missing_evidence';
}

const RO_MONTHS: Record<string, number> = {
  ianuarie: 0,
  ian: 0,
  februarie: 1,
  feb: 1,
  martie: 2,
  mar: 2,
  aprilie: 3,
  apr: 3,
  mai: 4,
  iunie: 5,
  iun: 5,
  iulie: 6,
  iul: 6,
  august: 7,
  aug: 7,
  septembrie: 8,
  sep: 8,
  sept: 8,
  octombrie: 9,
  oct: 9,
  noiembrie: 10,
  noi: 10,
  decembrie: 11,
  dec: 11,
};

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidDayForMonth(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || day < 1) return false;
  return day <= new Date(year, month + 1, 0).getDate();
}

function addDate(dates: Set<string>, day: number, month: number, year: number, expectedMonth: number, expectedYear: number) {
  if (month !== expectedMonth || year !== expectedYear) return;
  if (!isValidDayForMonth(day, month, year)) return;
  dates.add(toIsoDate(year, month, day));
}

export function extractMonthlyEvidenceDates(input: string, month: number, year: number) {
  const dates = new Set<string>();
  const normalized = stripDiacritics(input.toLowerCase());

  for (const match of normalized.matchAll(/(^|[^0-9])(20\d{2})[-_.\/](0?[1-9]|1[0-2])[-_.\/](0?[1-9]|[12]\d|3[01])(?=$|[^0-9])/g)) {
    addDate(dates, Number(match[4]), Number(match[3]) - 1, Number(match[2]), month, year);
  }

  for (const match of normalized.matchAll(/(^|[^0-9])(0?[1-9]|[12]\d|3[01])[-_.\/](0?[1-9]|1[0-2])(?:[-_.\/](20\d{2}))?(?=$|[^0-9])/g)) {
    addDate(dates, Number(match[2]), Number(match[3]) - 1, match[4] ? Number(match[4]) : year, month, year);
  }

  const monthNames = Object.keys(RO_MONTHS).join('|');
  const roDatePattern = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])\\s+(${monthNames})(?:\\s+(20\\d{2}))?\\b`, 'g');
  for (const match of normalized.matchAll(roDatePattern)) {
    addDate(dates, Number(match[1]), RO_MONTHS[match[2]], match[3] ? Number(match[3]) : year, month, year);
  }

  return [...dates].sort();
}

export function getEvidenceDates(evidence: MonthlyEvidenceInput, month: number, year: number) {
  const confirmed = [...new Set(evidence.confirmedDates?.filter(Boolean) ?? [])].sort();
  if (confirmed.length > 0) return confirmed;
  return extractMonthlyEvidenceDates([evidence.fileName, evidence.text].filter(Boolean).join('\n'), month, year);
}

function hasDeliverable(activity: Activity) {
  return (activity.deliverables ?? []).some((deliverable: Deliverable) =>
    Boolean(deliverable.fileName || deliverable.filePath || deliverable.s3Key || deliverable.documentId),
  );
}

function isReportableActivity(activity: Activity) {
  return Number(activity.hours) > 0 && activity.dayType !== 'CO' && activity.dayType !== 'CM';
}

export function buildMonthlyEvidenceCoverage(args: {
  activities: Activity[];
  evidence: MonthlyEvidenceInput[];
  month: number;
  year: number;
}) {
  const activitiesByDate = new Map<string, Activity[]>();
  const evidenceByDate = new Map<string, MonthlyEvidenceInput[]>();

  args.activities.filter(isReportableActivity).forEach((activity) => {
    activitiesByDate.set(activity.date, [...(activitiesByDate.get(activity.date) ?? []), activity]);
    if (hasDeliverable(activity)) {
      evidenceByDate.set(activity.date, [...(evidenceByDate.get(activity.date) ?? [])]);
    }
  });

  args.evidence.forEach((item) => {
    getEvidenceDates(item, args.month, args.year).forEach((date) => {
      evidenceByDate.set(date, [...(evidenceByDate.get(date) ?? []), item]);
    });
  });

  const allDates = [...new Set([...activitiesByDate.keys(), ...evidenceByDate.keys()])].sort();

  return allDates.map((date): MonthlyEvidenceCoverageRow => {
    const activities = activitiesByDate.get(date) ?? [];
    const evidence = evidenceByDate.get(date) ?? [];
    return {
      date,
      activities,
      evidence,
      status: activities.length === 0
        ? 'missing_activity'
        : evidence.length > 0 || activities.some(hasDeliverable)
          ? 'covered'
          : 'missing_evidence',
    };
  });
}
