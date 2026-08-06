import { getMonthName } from '../app-utils.ts';
import { getDocumentAuditTitle } from '../document-sharing.ts';
import activityCatalogSeed from '../../data/import/activity-catalog.json' with { type: 'json' };
import type { Activity, ActivityCatalog, Expert } from '../types.ts';
import { formatDayCluster } from './day-cluster.ts';
import {
  buildWorkBlocks,
  calculateWorkBlockHours,
  groupWorkBlocksBySA,
  validateWorkBlockAllocation,
  type ReportingWorkBlockBundle,
  type WorkBlockAllocationProblem,
} from './work-blocks.ts';

const ADMIN_ACTIVITY_CATALOG = activityCatalogSeed as ActivityCatalog[];

export type ProjectReportingSettings = {
  includeLeaveInTable?: boolean;
  includeLeaveInTotal?: boolean;
  includeReportPreparationHours?: boolean;
  signatureDateRule?: 'last_worked_day' | 'last_calendar_day';
  requireDeliverableForMaterialWork?: boolean;
};

export type Anexa10TableRow = {
  workBlockId: string;
  officialActivityTitle: string;
  responsibilities: string;
  performedActivity: string;
  resultsAndDeliverables: string[];
  commonDeliverable: string;
  hours: number;
};

export type Anexa10SaSection = {
  saCode: string;
  title?: string;
  items: {
    heading: string;
    body: string;
  }[];
  totalHours: number;
};

export type Anexa10ReportModel = {
  header: {
    month: string;
    monthIndex: number;
    year: number;
    expertName: string;
    position?: string;
    contract?: string;
    category?: string;
    projectCode: string;
    projectTitle?: string;
    beneficiary?: string;
  };
  tableRows: Anexa10TableRow[];
  saSections: Anexa10SaSection[];
  totalHours: number;
  problems: WorkBlockAllocationProblem[];
  warnings: string[];
  signature: {
    expertName: string;
    date?: string;
  };
};

export function buildAnexa10ReportModel({
  expert,
  activities,
  month,
  year,
  workBlockBundles,
  settings = {},
}: {
  expert: Pick<Expert, 'id' | 'name' | 'positionInProject' | 'role' | 'contractNumber' | 'contractType' | 'category' | 'expertExperienceCategory' | 'jobDescriptionText' | 'projectCode' | 'projectTitle' | 'beneficiary'>;
  activities: Activity[];
  month: number;
  year: number;
  workBlockBundles?: ReportingWorkBlockBundle[];
  settings?: ProjectReportingSettings;
}): Anexa10ReportModel {
  const monthName = getMonthName(month);
  const sentenceMonthName = monthName.toLocaleLowerCase('ro');
  const bundles = workBlockBundles ?? buildWorkBlocks(activities);
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const filteredBundles = bundles.filter((bundle) => shouldIncludeBundle(bundle, settings));
  const problems = validateWorkBlockAllocation(activities, filteredBundles);
  const warnings = buildReportWarnings(filteredBundles, activityById, settings);
  const tableRows = filteredBundles.map((bundle) => buildTableRow(bundle, activityById, expert));
  const saSections = buildSaSections(filteredBundles, activityById, sentenceMonthName, year);
  const projectCode = expert.projectCode || activities.find((activity) => activity.projectCode)?.projectCode || '302141';

  return {
    header: {
      month: monthName,
      monthIndex: month,
      year,
      expertName: expert.name,
      position: expert.positionInProject || expert.role,
      contract: formatContract(expert.contractNumber, expert.contractType),
      category: expert.expertExperienceCategory,
      projectCode,
      projectTitle: expert.projectTitle,
      beneficiary: expert.beneficiary,
    },
    tableRows,
    saSections,
    totalHours: calculateIncludedTotalHours(filteredBundles, settings),
    problems,
    warnings,
    signature: {
      expertName: expert.name,
      date: getSignatureDate(activities, settings),
    },
  };
}

function buildTableRow(
  bundle: ReportingWorkBlockBundle,
  activityById: Map<string, Activity>,
  expert: Pick<Expert, 'jobDescriptionText'>,
): Anexa10TableRow {
  const activities = getBundleActivities(bundle, activityById);
  const deliverables = getBundleDeliverableTitles(activities);
  const hours = calculateWorkBlockHours(bundle.activityLinks);

  return {
    workBlockId: bundle.workBlock.id,
    officialActivityTitle: getOfficialActivityTitle(bundle, activities),
    responsibilities: expert.jobDescriptionText || bundle.workBlock.expertContribution || '-',
    performedActivity: getPerformedActivity(bundle, activities),
    resultsAndDeliverables: deliverables.length > 0 ? deliverables : [getResultWithoutDeliverable(bundle)],
    commonDeliverable: getCommonDeliverableLabel(activities),
    hours,
  };
}

function buildSaSections(
  bundles: ReportingWorkBlockBundle[],
  activityById: Map<string, Activity>,
  monthName: string,
  year: number,
): Anexa10SaSection[] {
  const grouped = groupWorkBlocksBySA(bundles);

  return Object.entries(grouped).map(([saCode, saBundles]) => ({
    saCode,
    title: getSaSectionTitle(saCode, saBundles),
    items: saBundles.map((bundle) => {
      const activities = getBundleActivities(bundle, activityById);
      const days = formatDayCluster(activities.map((activity) => ({ date: activity.date, hours: Number(activity.hours) || 0 })), monthName, year);
      const deliverables = getBundleDeliverableTitles(activities);
      const deliverableText = deliverables.length > 0
        ? ` Rezultatele obtinute / livrabilele elaborate: ${deliverables.join('; ')}.`
        : ` Rezultat raportabil fara fisier: ${getResultWithoutDeliverable(bundle)}.`;
      const hours = calculateWorkBlockHours(bundle.activityLinks);
      return {
        heading: `${getNarrativeHeading(bundle, activities)} (${formatNarrativeTiming(days, hours)})`,
        body: getNarrativeBody(bundle, activities, saCode, deliverableText),
      };
    }),
    totalHours: calculateIncludedTotalHours(saBundles, {}),
  }));
}

function getNarrativeBody(
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
  saCode: string,
  deliverableText: string,
) {
  const activityDescriptions = getActivityDescriptionsText(activities);
  const fallback = `Am realizat activitatea "${bundle.workBlock.title}" in cadrul ${saCode}.${deliverableText}`;
  const candidates = [
    bundle.workBlock.generatedNarrative,
    bundle.workBlock.cleanedActivitySummary,
    bundle.workBlock.expertContribution,
    getActivitySummariesText(activities),
  ];
  let shouldPreferActivityDescription = false;

  for (const candidate of candidates) {
    if (isUsefulNarrativeText(candidate, bundle, activities, activityDescriptions)) {
      return normalizeAnexa10ReportText(candidate || '');
    }
    shouldPreferActivityDescription ||= shouldUseActivityDescriptionInstead(candidate, bundle, activities, activityDescriptions);
  }

  return normalizeAnexa10ReportText(
    (shouldPreferActivityDescription ? activityDescriptions : '')
    || activityDescriptions
    || fallback,
  );
}

function isUsefulNarrativeText(
  value: string | undefined,
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
  activityDescriptions: string,
) {
  const normalized = normalizeWhitespace(value || '');
  if (!normalized) return false;
  return !shouldUseActivityDescriptionInstead(normalized, bundle, activities, activityDescriptions);
}

function formatNarrativeTiming(days: string, hours: number) {
  if (!days) return `${hours} ore lucrate`;
  if (/\bc(?:a|â)te\b|\bdistribu/i.test(days)) return `${days}, ${hours} ore lucrate`;
  return days;
}

function shouldIncludeBundle(bundle: ReportingWorkBlockBundle, settings: ProjectReportingSettings) {
  if (bundle.workBlock.reportingFlowType === 'leave') {
    return settings.includeLeaveInTable === true || settings.includeLeaveInTotal === true;
  }
  if (bundle.workBlock.reportingFlowType === 'report_preparation') {
    return settings.includeReportPreparationHours !== false;
  }
  return true;
}

function calculateIncludedTotalHours(bundles: ReportingWorkBlockBundle[], settings: ProjectReportingSettings) {
  return roundHours(bundles.reduce((sum, bundle) => {
    if (bundle.workBlock.reportingFlowType === 'leave' && settings.includeLeaveInTotal !== true) return sum;
    if (bundle.workBlock.reportingFlowType === 'report_preparation' && settings.includeReportPreparationHours === false) return sum;
    return sum + calculateWorkBlockHours(bundle.activityLinks);
  }, 0));
}

function buildReportWarnings(
  bundles: ReportingWorkBlockBundle[],
  activityById: Map<string, Activity>,
  settings: ProjectReportingSettings,
) {
  const warnings: string[] = [];
  const reportedDeliverables = new Map<string, string>();

  for (const bundle of bundles) {
    if (bundle.workBlock.saCode === 'SA neprecizata') {
      warnings.push(`Work block-ul "${bundle.workBlock.title}" nu are SA confirmat.`);
    }

    const deliverableIds = (bundle.deliverableLinks ?? []).map((link) => link.deliverableId);
    if (settings.requireDeliverableForMaterialWork && bundle.workBlock.reportingFlowType === 'deliverable' && deliverableIds.length === 0) {
      warnings.push(`Work block-ul material "${bundle.workBlock.title}" nu are livrabil asociat.`);
    }

    for (const deliverableId of deliverableIds) {
      const previousBlockId = reportedDeliverables.get(deliverableId);
      if (previousBlockId && previousBlockId !== bundle.workBlock.id) {
        warnings.push(`Livrabilul ${deliverableId} este asociat in mai multe work block-uri.`);
      }
      reportedDeliverables.set(deliverableId, bundle.workBlock.id);
    }

    const activities = getBundleActivities(bundle, activityById);
    const bundleDeliverables = activities.flatMap((activity) => activity.deliverables ?? [])
      .filter((deliverable) => deliverableIds.includes(deliverable.id || deliverable.documentId || deliverable.s3Key || deliverable.fileName));
    for (const deliverable of bundleDeliverables) {
      const deliverableTitle = getDocumentAuditTitle(deliverable) || deliverable.id || deliverable.fileName;
      const eligibilityStatus = deliverable.eligibilityCheck?.status;
      if (!eligibilityStatus) {
        warnings.push(`Livrabilul "${deliverableTitle}" din work block-ul "${bundle.workBlock.title}" nu are eligibilitatea verificata.`);
      } else if (eligibilityStatus === 'neeligibil') {
        warnings.push(`Livrabilul "${deliverableTitle}" din work block-ul "${bundle.workBlock.title}" este marcat neeligibil.`);
      } else if (eligibilityStatus === 'neconcludent') {
        warnings.push(`Livrabilul "${deliverableTitle}" din work block-ul "${bundle.workBlock.title}" are eligibilitate neconcludenta.`);
      } else if (eligibilityStatus === 'eligibil_cu_observatii') {
        warnings.push(`Livrabilul "${deliverableTitle}" din work block-ul "${bundle.workBlock.title}" este eligibil cu observatii.`);
      }
    }

    if (activities.some((activity) => !activity.saCode) && bundle.workBlock.reportingFlowType === 'administrative') {
      warnings.push(`Activitatea administrativa "${bundle.workBlock.title}" nu are SA.`);
    }
  }

  return warnings;
}

function getBundleActivities(bundle: ReportingWorkBlockBundle, activityById: Map<string, Activity>) {
  return bundle.activityLinks
    .map((link) => activityById.get(link.activityId))
    .filter((activity): activity is Activity => Boolean(activity))
    .sort((first, second) => first.date.localeCompare(second.date));
}

function getBundleDeliverableTitles(activities: Activity[]) {
  return [...new Set(activities.flatMap((activity) => (
    activity.deliverables?.map((deliverable) => getDocumentAuditTitle(deliverable)).filter(Boolean) ?? []
  )))];
}

function getOfficialActivityTitle(bundle: ReportingWorkBlockBundle, activities: Activity[]) {
  return bundle.workBlock.activityCategory
    || activities.find((activity) => activity.activityType)?.activityType
    || bundle.workBlock.saCode
    || '-';
}

function getPerformedActivity(bundle: ReportingWorkBlockBundle, activities: Activity[]) {
  return normalizeAnexa10ReportText(selectPerformedActivityText(bundle, activities));
}

function selectPerformedActivityText(bundle: ReportingWorkBlockBundle, activities: Activity[]) {
  const activityDescriptions = getActivityDescriptionsText(activities);
  const candidates = [
    bundle.workBlock.generatedTableSummary,
    getActivitySummariesText(activities),
  ];
  let shouldPreferActivityDescription = false;

  for (const candidate of candidates) {
    if (isUsefulPerformedActivityText(candidate, bundle, activities, activityDescriptions)) {
      return candidate || '';
    }
    shouldPreferActivityDescription ||= shouldUseActivityDescriptionInstead(candidate, bundle, activities, activityDescriptions);
  }

  return (shouldPreferActivityDescription ? activityDescriptions : '')
    || bundle.workBlock.cleanedActivitySummary
    || bundle.workBlock.expertContribution
    || activityDescriptions
    || bundle.workBlock.title;
}

function isUsefulPerformedActivityText(
  value: string | undefined,
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
  activityDescriptions: string,
) {
  const normalized = normalizeWhitespace(value || '');
  if (!normalized) return false;
  return !shouldUseActivityDescriptionInstead(normalized, bundle, activities, activityDescriptions);
}

function shouldUseActivityDescriptionInstead(
  value: string | undefined,
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
  activityDescriptions: string,
) {
  const normalized = normalizeWhitespace(value || '');
  if (!normalized || !activityDescriptions || normalized.length >= 90) return false;

  const genericTargets = [
    bundle.workBlock.title,
    bundle.workBlock.activityCategory,
    ...activities.flatMap((activity) => [activity.title, activity.activityType]),
  ]
    .filter(Boolean)
    .map((target) => normalizeForActivityFallback(String(target)));
  const candidate = normalizeForActivityFallback(normalized);

  if (/^am realizat\b/i.test(normalized) && genericTargets.some((target) => target && candidate.includes(target))) {
    return true;
  }

  return false;
}

function getNarrativeHeading(bundle: ReportingWorkBlockBundle, activities: Activity[]) {
  return normalizeWhitespace(
    bundle.workBlock.title
    || bundle.workBlock.activityCategory
    || activities.find((activity) => activity.title)?.title
    || activities.find((activity) => activity.activityType)?.activityType
    || bundle.workBlock.saCode
    || 'Activitate raportabila',
  );
}

function getActivitySummariesText(activities: Activity[]) {
  return activities
    .map((activity) => activity.activitySummary)
    .filter(Boolean)
    .join(' ');
}

function getActivityDescriptionsText(activities: Activity[]) {
  return activities
    .map((activity) => getActivityDescriptionForReport(activity))
    .filter(Boolean)
    .filter((description, index, descriptions) => {
      const key = normalizeForActivityFallback(description || '');
      return descriptions.findIndex((item) => normalizeForActivityFallback(item || '') === key) === index;
    })
    .join(' ');
}

function getActivityDescriptionForReport(activity: Activity) {
  const activityDescription = normalizeWhitespace(activity.description || '');
  if (activityDescription.length >= 90) return activityDescription;

  return getAdminCatalogDescription(activity) || activityDescription;
}

function getAdminCatalogDescription(activity: Activity) {
  const catalogId = normalizeWhitespace(activity.catalogActivityId || '');
  const byId = catalogId
    ? ADMIN_ACTIVITY_CATALOG.find((item) => item.id === catalogId)
    : undefined;
  const matchedItem = byId || findAdminCatalogItemByActivity(activity);
  return normalizeWhitespace(matchedItem?.description || '');
}

function findAdminCatalogItemByActivity(activity: Activity) {
  const saCode = normalizeWhitespace(activity.saCode || '');
  const activityNames = [activity.title, activity.activityType]
    .map((value) => normalizeForActivityFallback(value || ''))
    .filter(Boolean);

  if (activityNames.length === 0) return undefined;

  return ADMIN_ACTIVITY_CATALOG.find((item) => {
    if (saCode && item.saCode !== saCode) return false;
    return activityNames.includes(normalizeForActivityFallback(item.activityName || ''));
  });
}

function getCommonDeliverableLabel(activities: Activity[]) {
  const hasCommonDeliverable = activities.some((activity) => (
    activity.deliverables?.some((deliverable) => deliverable.isCommonDeliverable)
  ));
  return hasCommonDeliverable ? 'Da' : 'Nu';
}

function getSaSectionTitle(saCode: string, bundles: ReportingWorkBlockBundle[]) {
  const category = bundles.find((bundle) => bundle.workBlock.activityCategory)?.workBlock.activityCategory;
  return category ? `${saCode} - ${category}` : saCode;
}

function getResultWithoutDeliverable(bundle: ReportingWorkBlockBundle) {
  if (bundle.workBlock.reportingFlowType === 'meeting') return 'participare, concluzii si actiuni de urmarire';
  if (bundle.workBlock.reportingFlowType === 'event') return 'participare si rezultat raportabil al evenimentului';
  if (bundle.workBlock.reportingFlowType === 'consultation') return 'interventie, concluzii si directii de actiune';
  return 'rezultat raportabil de confirmat';
}

function getSignatureDate(activities: Activity[], settings: ProjectReportingSettings) {
  const eligibleActivities = activities
    .filter((activity) => Number(activity.hours) > 0)
    .filter((activity) => settings.signatureDateRule === 'last_calendar_day' || (activity.dayType !== 'CO' && activity.dayType !== 'CM'))
    .sort((first, second) => first.date.localeCompare(second.date));

  return eligibleActivities[eligibleActivities.length - 1]?.date;
}

function formatContract(contractNumber?: string, contractType?: string) {
  return [contractType, contractNumber].filter(Boolean).join(' ').trim() || undefined;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeAnexa10ReportText(value: string) {
  return enforceFirstPersonReportText(dedupeRepeatedReportText(value));
}

function dedupeRepeatedReportText(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return normalized;

  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ])/u);
  const uniqueSentences: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const cleanSentence = normalizeWhitespace(sentence);
    if (!cleanSentence) continue;

    const key = normalizeForDedupe(cleanSentence);
    if (seen.has(key)) continue;

    seen.add(key);
    uniqueSentences.push(cleanSentence);
  }

  return uniqueSentences.join(' ');
}

function enforceFirstPersonReportText(value: string) {
  return normalizeWhitespace(value
    .replace(/\bActivitatea const[ăa] în\s+/giu, 'Am realizat ')
    .replace(/\bActivitatea presupune\s+/giu, 'Am realizat ')
    .replace(/\bActivitatea urmărește\s+/giu, 'Am urmărit ')
    .replace(/\bActivitatea reprezintă\s+/giu, 'Am realizat ')
    .replace(/\bProcesul presupune\s+/giu, 'În acest proces, am realizat ')
    .replace(/\bSunt elaborate\b/giu, 'Am elaborat')
    .replace(/\bSunt integrate\b/giu, 'Am integrat')
    .replace(/\bSunt formulate\b/giu, 'Am formulat')
    .replace(/\bSunt propuse\b/giu, 'Am propus')
    .replace(/\bSunt urmărite\b/giu, 'Am urmărit')
    .replace(/\bDocumentele elaborate sunt transmise\b/giu, 'Am transmis documentele elaborate'));
}

function normalizeForDedupe(value: string) {
  return value
    .toLocaleLowerCase('ro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForActivityFallback(value: string) {
  return normalizeForDedupe(value)
    .replace(/\bsa\s*\d+(?:\s*\.\s*\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
