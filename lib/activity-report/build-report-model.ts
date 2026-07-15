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
  saCode: string;
  period: string;
  activityTitle: string;
  resultsAndDeliverables: string[];
  hours: number;
  flowType: string;
};

export type Anexa10SaSection = {
  saCode: string;
  title?: string;
  paragraphs: string[];
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
  expert: Pick<Expert, 'id' | 'name' | 'positionInProject' | 'role' | 'contractNumber' | 'contractType' | 'category' | 'projectCode' | 'projectTitle' | 'beneficiary'>;
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
  const tableRows = filteredBundles.map((bundle) => buildTableRow(bundle, activityById, sentenceMonthName, year));
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
      category: expert.category,
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
  monthName: string,
  year: number,
): Anexa10TableRow {
  const activities = getBundleActivities(bundle, activityById);
  const deliverables = getBundleDeliverableTitles(activities);
  const hours = calculateWorkBlockHours(bundle.activityLinks);

  return {
    workBlockId: bundle.workBlock.id,
    saCode: bundle.workBlock.saCode,
    period: formatDayCluster(activities.map((activity) => ({ date: activity.date, hours: Number(activity.hours) || 0 })), monthName, year),
    activityTitle: bundle.workBlock.title,
    resultsAndDeliverables: deliverables.length > 0 ? deliverables : [getResultWithoutDeliverable(bundle)],
    hours,
    flowType: bundle.workBlock.reportingFlowType,
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
    paragraphs: saBundles.map((bundle) => {
      const activities = getBundleActivities(bundle, activityById);
      const days = formatDayCluster(activities.map((activity) => ({ date: activity.date, hours: Number(activity.hours) || 0 })), monthName, year);
      const deliverables = getBundleDeliverableTitles(activities);
      const deliverableText = deliverables.length > 0
        ? ` Livrabile asociate: ${deliverables.join('; ')}.`
        : ` Rezultat raportabil fara fisier: ${getResultWithoutDeliverable(bundle)}.`;
      return `${days}, am realizat activitatea "${bundle.workBlock.title}" in cadrul ${saCode}.${deliverableText}`;
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
