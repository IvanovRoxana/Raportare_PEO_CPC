import type { ActivityInput, ActivityTotals, NormalizedActivity, ReportModelSelection } from './types.ts';

const UNSPECIFIED_SA = 'SA neprecizată';
const UNSPECIFIED_LOCATION = 'locație neprecizată';
const MIN_DESCRIPTION_LENGTH = 20;

export function normalizeActivities(activities: unknown): NormalizedActivity[] {
  if (!Array.isArray(activities) || activities.length === 0) {
    throw new Error('Nu există activități pentru raport');
  }

  return activities.map((activity, index) => normalizeActivity(activity, index));
}

export function groupActivitiesBySA(activities: NormalizedActivity[]): Record<string, NormalizedActivity[]> {
  return activities.reduce<Record<string, NormalizedActivity[]>>((groups, activity) => {
    groups[activity.saCode] ??= [];
    groups[activity.saCode].push(activity);
    return groups;
  }, {});
}

export function sortGroupedActivitiesChronologically(groups: Record<string, NormalizedActivity[]>) {
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'ro'))
      .map(([saCode, activities]) => [
        saCode,
        [...activities].sort((a, b) => compareActivityDates(a, b)),
      ]),
  );
}

export function calculateActivityTotals(activities: NormalizedActivity[]): ActivityTotals {
  const warnings: string[] = [];
  const totalsBySA: Record<string, number> = {};
  const totalsByDate: Record<string, number> = {};

  for (const activity of activities) {
    totalsBySA[activity.saCode] = roundHours((totalsBySA[activity.saCode] ?? 0) + activity.hours);
    totalsByDate[activity.date] = roundHours((totalsByDate[activity.date] ?? 0) + activity.hours);

    if (activity.saCode === UNSPECIFIED_SA) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} nu are saCode.`);
    }
    if (activity.location === UNSPECIFIED_LOCATION) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} nu are locație.`);
    }
    if (activity.deliverables.length === 0) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} nu are livrabile.`);
    }
    if (activity.beneficiaries.length === 0) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} nu are beneficiari.`);
    }
    if (activity.hours <= 0) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} are ore <= 0.`);
    }
    if (activity.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      warnings.push(`Activitatea „${activity.title}” din ${activity.date} nu are descriere suficientă.`);
    }
  }

  return {
    totalHours: roundHours(activities.reduce((sum, activity) => sum + activity.hours, 0)),
    totalsBySA,
    totalsByDate: Object.fromEntries(Object.entries(totalsByDate).sort(([a], [b]) => a.localeCompare(b))),
    warnings,
  };
}

export function normalizeAndGroupActivities(activities: unknown) {
  const normalizedActivities = normalizeActivities(activities);
  const groupedActivities = sortGroupedActivitiesChronologically(groupActivitiesBySA(normalizedActivities));
  const sortedActivities = Object.values(groupedActivities).flat();
  const totals = calculateActivityTotals(sortedActivities);

  return { normalizedActivities: sortedActivities, groupedActivities, totals };
}

export function selectReportModel(useFineTunedModel?: boolean): ReportModelSelection {
  const standardModel = process.env.OPENAI_STANDARD_REPORT_MODEL || 'openai/gpt-4o-mini';
  const fineTunedModel = process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;
  const usedFineTunedModel = Boolean(useFineTunedModel && fineTunedModel);
  const warnings: string[] = [];

  if (useFineTunedModel && !fineTunedModel) {
    warnings.push('Modelul fine-tuned a fost solicitat, dar OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL nu este configurat. A fost folosit modelul standard.');
  }

  return {
    model: usedFineTunedModel ? String(fineTunedModel) : standardModel,
    usedFineTunedModel,
    warnings,
  };
}

function normalizeActivity(activity: unknown, originalIndex: number): NormalizedActivity {
  if (!activity || typeof activity !== 'object') {
    throw new Error(`Activitatea #${originalIndex + 1} este invalidă`);
  }

  const record = activity as Record<string, unknown>;
  const date = requiredString(record.date, `Activitatea #${originalIndex + 1} nu are date`);
  const hours = requiredNumber(record.hours, `Activitatea #${originalIndex + 1} nu are hours valid`);
  const title = requiredString(record.title ?? record.activityTitle ?? record.taskName, `Activitatea #${originalIndex + 1} nu are title`);
  const description = requiredString(record.gdprGeneratedText ?? record.description ?? record.notes ?? record.context, `Activitatea #${originalIndex + 1} nu are description`);

  return {
    date,
    hours,
    title,
    description,
    saCode: normalizeOptionalString(record.saCode ?? record.activityCode ?? record.wp) || UNSPECIFIED_SA,
    activityType: normalizeOptionalString(record.activityType ?? record.type),
    location: normalizeOptionalString(record.location) || UNSPECIFIED_LOCATION,
    collaborators: normalizeStringArray(record.collaborators ?? record.takenByExperts),
    deliverables: normalizeStringArray(record.deliverables ?? record.relevantDeliverable),
    beneficiaries: normalizeStringArray(record.beneficiaries),
    indicatorImpact: normalizeOptionalString(record.indicatorImpact),
    gdprTemplateCode: normalizeOptionalString(record.gdprTemplateCode),
    gdprGeneratedText: normalizeOptionalString(record.gdprGeneratedText),
    gdprConclusionCode: normalizeOptionalString(record.gdprConclusionCode),
    originalIndex,
  };
}

function requiredString(value: unknown, message: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function requiredNumber(value: unknown, message: string) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) throw new Error(message);
  return numberValue;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return normalizeOptionalString(record.title ?? record.name ?? record.fileName ?? record.value ?? record.id);
        }
        return normalizeOptionalString(item);
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function compareActivityDates(a: NormalizedActivity, b: NormalizedActivity) {
  const dateCompare = a.date.localeCompare(b.date);
  return dateCompare === 0 ? a.originalIndex - b.originalIndex : dateCompare;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
