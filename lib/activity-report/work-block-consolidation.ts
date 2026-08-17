import type { Activity, Deliverable, DeliverableEligibilityCheck } from '../types.ts';
import type { ReportingWorkBlockBundle } from './work-blocks.ts';

export type WorkBlockConsolidationStatus = 'ai_generated' | 'deterministic_fallback' | 'disabled' | 'failed';

export interface WorkBlockConsolidationResult {
  cleanedActivitySummary: string;
  generatedTableSummary: string;
  generatedNarrative: string;
  generationInputsHash: string;
  aiConsolidationStatus: WorkBlockConsolidationStatus;
  aiConsolidationUpdatedAt: string;
}

export interface WorkBlockConsolidationActivity {
  id: string;
  date: string;
  hours: number;
  title?: string;
  summary?: string;
  description?: string;
  activityType?: string;
  saCode?: string;
  deliverables?: WorkBlockConsolidationDeliverable[];
}

export interface WorkBlockConsolidationDeliverable {
  id?: string;
  documentId?: string;
  fileName?: string;
  documentTitle?: string;
  deliverableType?: string;
  extractedText?: string;
  firstPageText?: string;
  extractedSummary?: unknown;
  confirmedReportingData?: unknown;
  eligibilityCheck?: DeliverableEligibilityCheck | null;
}

export interface WorkBlockConsolidationRequest {
  workBlock: {
    id?: string;
    projectCode?: string;
    title: string;
    saCode: string;
    reportingFlowType: string;
  };
  activities: WorkBlockConsolidationActivity[];
}

export function buildWorkBlockConsolidationRequest(
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
): WorkBlockConsolidationRequest {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  return {
    workBlock: {
      id: bundle.workBlock.id,
      projectCode: bundle.workBlock.projectCode,
      title: bundle.workBlock.title,
      saCode: bundle.workBlock.saCode,
      reportingFlowType: bundle.workBlock.reportingFlowType,
    },
    activities: bundle.activityLinks
      .map((link) => activityById.get(link.activityId))
      .filter((activity): activity is Activity => Boolean(activity))
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((activity) => ({
        id: activity.id,
        date: activity.date,
        hours: Number(activity.hours) || 0,
        title: activity.title,
        summary: activity.activitySummary,
        description: activity.description,
        activityType: activity.activityType,
        saCode: activity.saCode,
        deliverables: activity.deliverables?.map(toConsolidationDeliverable).filter(hasDeliverableSignal),
      })),
  };
}

export function buildConsolidationInputsHash(request: WorkBlockConsolidationRequest) {
  return stableHash(JSON.stringify({
    workBlock: request.workBlock,
    activities: request.activities.map((activity) => ({
      date: activity.date,
      hours: activity.hours,
      title: normalizeWhitespace(activity.title),
      summary: normalizeWhitespace(activity.summary),
      description: normalizeWhitespace(activity.description),
      activityType: normalizeWhitespace(activity.activityType),
      deliverables: (activity.deliverables ?? []).map((deliverable) => ({
        id: normalizeWhitespace(deliverable.id),
        documentId: normalizeWhitespace(deliverable.documentId),
        fileName: normalizeWhitespace(deliverable.fileName),
        documentTitle: normalizeWhitespace(deliverable.documentTitle),
        deliverableType: normalizeWhitespace(deliverable.deliverableType),
        extractedText: normalizeWhitespace(deliverable.extractedText),
        firstPageText: normalizeWhitespace(deliverable.firstPageText),
        extractedSummary: deliverable.extractedSummary ?? null,
        confirmedReportingData: deliverable.confirmedReportingData ?? null,
        eligibilityStatus: deliverable.eligibilityCheck?.status,
        eligibilitySummary: normalizeWhitespace(deliverable.eligibilityCheck?.summary),
      })),
    })),
  }));
}

export function buildDeterministicWorkBlockConsolidation(
  request: WorkBlockConsolidationRequest,
  status: WorkBlockConsolidationStatus = 'deterministic_fallback',
): WorkBlockConsolidationResult {
  const uniqueDescriptions = uniqueNormalized(
    request.activities.map((activity) => activity.summary || activity.description || activity.title || '').filter(Boolean),
  );
  const uniqueTitles = uniqueNormalized(request.activities.map((activity) => activity.title || '').filter(Boolean));
  const uniqueDeliverableFacts = uniqueNormalized(
    request.activities.flatMap((activity) => (activity.deliverables ?? [])
      .filter(canUseDeliverableAsResult)
      .map(formatDeliverableFact)
      .filter(Boolean)),
  );
  const sourceSentences = uniqueDescriptions.length > 0
    ? uniqueDescriptions
    : uniqueDeliverableFacts.length > 0
      ? uniqueDeliverableFacts
      : uniqueTitles;
  const cleanedActivitySummary = sourceSentences.join(' ');
  const tableSummary = buildCompactTableSummary(cleanedActivitySummary || request.workBlock.title);
  const totalHours = roundHours(request.activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0));
  const dateSummary = summarizeDates(request.activities.map((activity) => activity.date));
  const narrativeBase = cleanedActivitySummary || `Am realizat activitatea ${request.workBlock.title}.`;

  return {
    cleanedActivitySummary: narrativeBase,
    generatedTableSummary: tableSummary,
    generatedNarrative: `${narrativeBase} Activitatea a fost realizata ${dateSummary}, cu un total de ${totalHours} ore lucrate.`,
    generationInputsHash: buildConsolidationInputsHash(request),
    aiConsolidationStatus: status,
    aiConsolidationUpdatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkBlockConsolidationResult(
  value: Partial<WorkBlockConsolidationResult>,
  request: WorkBlockConsolidationRequest,
  status: WorkBlockConsolidationStatus,
): WorkBlockConsolidationResult {
  const fallback = buildDeterministicWorkBlockConsolidation(request, status);
  return {
    cleanedActivitySummary: normalizeWhitespace(value.cleanedActivitySummary) || fallback.cleanedActivitySummary,
    generatedTableSummary: normalizeWhitespace(value.generatedTableSummary) || fallback.generatedTableSummary,
    generatedNarrative: normalizeWhitespace(value.generatedNarrative) || fallback.generatedNarrative,
    generationInputsHash: buildConsolidationInputsHash(request),
    aiConsolidationStatus: status,
    aiConsolidationUpdatedAt: new Date().toISOString(),
  };
}

export function buildWorkBlockConsolidationPrompt(request: WorkBlockConsolidationRequest) {
  return `Consolideaza textele brute pentru un work block din Anexa 10.

Reguli stricte:
- Nu repeta aceeasi descriere daca apare in mai multe zile.
- Integreaza activitatile similare intr-un singur paragraf cursiv, natural si auditabil.
- Descrierea introdusa de expert este sursa principala despre munca efectuata. O cureti si o dezvolti, nu o ignori.
- Continutul livrabilelor este sursa de context si rezultat concret: titlu, subiect, act normativ, institutie, material elaborat.
- Foloseste fragmentele din livrabile pentru a face textul specific, dar nu copia blocuri lungi din document.
- Foloseste eligibilityCheck ca guardrail: 
  * status "eligibil": livrabilul poate fi prezentat ca rezultat valid;
  * status "eligibil_cu_observatii": livrabilul poate fi folosit, dar evita afirmatii absolute si include doar fapte sustinute;
  * status "neeligibil": nu prezenta livrabilul ca rezultat valid al activitatii;
  * status "neconcludent": foloseste doar fapte neutre si prudente, fara concluzie de eligibilitate.
- Daca eligibilityCheck.suggestedSettings indica alta activitate, SA sau tip de livrabil, nu forta potrivirea; redacteaza prudent si fara concluzii nejustificate.
- Pastreaza doar informatia concreta despre ce s-a facut, rezultatele si livrabilele eligibile sau prudente.
- Nu inventa livrabile, institutii, date sau rezultate.
- Nu lista fiecare zi separat decat daca descrierile sunt diferite si relevante.
- Foloseste prioritar campul summary al activitatilor cand construiesti cleanedActivitySummary, generatedTableSummary si generatedNarrative.
- Nu duplica descrierea lunga cand summary contine deja sinteza activitatii.
- generatedTableSummary este pentru coloana "Activitate prestata": maxim 1-2 propozitii, fara enumerari lungi si fara repetarea detaliilor din generatedNarrative.
- generatedNarrative este pentru sectiunea narativa: un paragraf complet, la persoana I singular, cu date concrete, rezultat si context auditabil.
- cleanedActivitySummary este fallback neutru: sinteza curata, fara repetitii, utilizabila daca lipsesc celelalte campuri.
- Returneaza exclusiv JSON valid cu cheile: cleanedActivitySummary, generatedTableSummary, generatedNarrative.

Work block:
${JSON.stringify(request.workBlock, null, 2)}

Activitati brute:
${JSON.stringify(request.activities, null, 2)}`;
}

function uniqueNormalized(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLocaleLowerCase('ro');
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function summarizeDates(dates: string[]) {
  const uniqueDates = [...new Set(dates.filter(Boolean))].sort();
  if (uniqueDates.length === 0) return 'in luna raportata';
  if (uniqueDates.length === 1) return `in data de ${uniqueDates[0]}`;
  return `in ${uniqueDates.length} zile din luna raportata`;
}

function buildCompactTableSummary(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ])/u).slice(0, 2);
  const summary = normalizeWhitespace(sentences.join(' ')) || normalized;
  if (summary.length <= 360) return summary;
  const clipped = summary.slice(0, 360).replace(/\s+\S*$/, '').trim();
  return clipped ? `${clipped}.` : summary.slice(0, 360).trim();
}

function toConsolidationDeliverable(deliverable: Deliverable): WorkBlockConsolidationDeliverable {
  return {
    id: deliverable.id,
    documentId: deliverable.documentId,
    fileName: deliverable.fileName || deliverable.originalFileName,
    documentTitle: deliverable.declaredTitle || deliverable.docTitle || deliverable.suggestedTitle,
    deliverableType: deliverable.deliverableType,
    extractedText: clipText(deliverable.docText || deliverable.contentFingerprint),
    firstPageText: clipText(deliverable.firstPageText),
    extractedSummary: deliverable.extractedSummary,
    confirmedReportingData: deliverable.confirmedReportingData,
    eligibilityCheck: deliverable.eligibilityCheck ?? null,
  };
}

function hasDeliverableSignal(deliverable: WorkBlockConsolidationDeliverable) {
  return Boolean(
    normalizeWhitespace(deliverable.fileName)
    || normalizeWhitespace(deliverable.documentTitle)
    || normalizeWhitespace(deliverable.deliverableType)
    || normalizeWhitespace(deliverable.extractedText)
    || normalizeWhitespace(deliverable.firstPageText)
    || deliverable.extractedSummary
    || deliverable.confirmedReportingData,
  );
}

function canUseDeliverableAsResult(deliverable: WorkBlockConsolidationDeliverable) {
  return deliverable.eligibilityCheck?.status !== 'neeligibil';
}

function formatDeliverableFact(deliverable: WorkBlockConsolidationDeliverable) {
  const title = normalizeWhitespace(deliverable.documentTitle || deliverable.fileName);
  const type = normalizeWhitespace(deliverable.deliverableType);
  const summary = normalizeWhitespace(
    stringifyCompact(deliverable.confirmedReportingData)
    || stringifyCompact(deliverable.extractedSummary)
    || deliverable.firstPageText
    || deliverable.extractedText,
  );
  const parts = [type, title, summary].filter(Boolean);
  return parts.length > 0 ? parts.join(': ') : '';
}

function stringifyCompact(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function clipText(value?: string) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= 1800) return normalized || undefined;
  return `${normalized.slice(0, 1800).replace(/\s+\S*$/, '').trim()}...`;
}

function normalizeWhitespace(value?: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
