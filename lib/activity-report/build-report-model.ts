import { getMonthName } from '../app-utils.ts';
import { getDocumentAuditTitle } from '../document-sharing.ts';
import type { Activity, Expert } from '../types.ts';
import { formatDayCluster } from './day-cluster.ts';
import {
  buildWorkBlocks,
  calculateWorkBlockHours,
  groupWorkBlocksBySA,
  validateWorkBlockAllocation,
  type ReportingWorkBlockBundle,
  type WorkBlockAllocationProblem,
} from './work-blocks.ts';

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
      return {
        heading: `${getPerformedActivity(bundle, activities)} (${days}, ${calculateWorkBlockHours(bundle.activityLinks)} ore lucrate)`,
        body: normalizeAnexa10ReportText(
          bundle.workBlock.generatedNarrative
          || bundle.workBlock.cleanedActivitySummary
          || bundle.workBlock.expertContribution
          || activities.map((activity) => activity.activitySummary).filter(Boolean).join(' ')
          || activities.map((activity) => activity.description).filter(Boolean).join(' ')
          || `Am realizat activitatea "${bundle.workBlock.title}" in cadrul ${saCode}.${deliverableText}`,
        ),
      };
    }),
    totalHours: calculateIncludedTotalHours(saBundles, {}),
  }));
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

    const deliverableIds = bundle.deliverableLinks.map((link) => link.deliverableId);
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
  return normalizeAnexa10ReportText(
    bundle.workBlock.generatedTableSummary
    || bundle.workBlock.cleanedActivitySummary
    || bundle.workBlock.expertContribution
    || activities.map((activity) => activity.activitySummary).filter(Boolean).join(' ')
    || activities.map((activity) => activity.description).filter(Boolean).join(' ')
    || bundle.workBlock.title,
  );
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
