import { tool } from 'ai';
import { z } from 'zod';
import { buildCompactActivityAutofillRagContext } from '../rag/activity-autofill-rag.ts';
import { retrieveActivityAutofillContext, retrieveSaPurposeContext } from '../rag/retrieval.ts';
import type { RagAuthContext } from '../rag/types.ts';
import type { KnowledgeChunk } from '../types.ts';
import type {
  ActivityAgentCatalogCandidate,
  ActivityAgentDeliverable,
  ActivityAgentFactSheet,
  ActivityAgentRequest,
} from './activity-agent-schema.ts';

const MAX_EXCERPT_CHARS = 700;

function trimText(value: unknown, maxChars = MAX_EXCERPT_CHARS) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isValidActivityAgentPontajHours(hours: unknown) {
  const value = Number(hours);
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

function splitTerms(value: string) {
  return value
    .split(/[,;\n]/)
    .map((term) => term.replace(/^[-*]\s*/, '').trim())
    .filter((term) => term.length > 1)
    .slice(0, 20);
}

export function getExpertAiInstructionsValue(request: Pick<ActivityAgentRequest, 'expertId' | 'expertReportingInstructions' | 'expertReportingInstructionsUpdatedAt'>) {
  const instructions = trimText(request.expertReportingInstructions, 3000);
  const normalized = normalize(instructions);
  const conflicts = unique([
    /ignora|omite|ocoleste/.test(normalized) && /peo|eligibil|pontaj|dovez|oir|pm/.test(normalized)
      ? 'Instructiunea pare sa ceara ignorarea unor reguli obligatorii PEO/PM/OIR.'
      : '',
    /inventeaza|adauga fictiv|presupune/.test(normalized)
      ? 'Instructiunea pare sa permita inventarea de informatii.'
      : '',
    /fara verificare pm|nu necesita pm|nu marca warning/.test(normalized)
      ? 'Instructiunea pare sa ceara eliminarea verificarilor PM/warning obligatorii.'
      : '',
  ]);
  const forbiddenMatch = instructions.match(/(?:termeni interzisi|evita|nu folosi)\s*[:\-]\s*([\s\S]*?)(?:\n\s*\n|$)/i);
  const preferredMatch = instructions.match(/(?:termeni preferati|foloseste|prefer)\s*[:\-]\s*([\s\S]*?)(?:\n\s*\n|$)/i);
  const detailLevel = /detaliat|amplu|dezvoltat/.test(normalized)
    ? 'detailed'
    : /concis|scurt|succint/.test(normalized)
      ? 'concise'
      : 'standard';
  const tone = /formal|institutional|oficial/.test(normalized) ? 'formal' : 'neutral';

  return {
    found: Boolean(instructions),
    active: Boolean(instructions),
    instructions: instructions || undefined,
    preferredDetailLevel: detailLevel as 'concise' | 'standard' | 'detailed',
    preferredTone: tone as 'formal' | 'neutral',
    forbiddenTerms: forbiddenMatch ? splitTerms(forbiddenMatch[1]) : [],
    preferredTerms: preferredMatch ? splitTerms(preferredMatch[1]) : [],
    updatedAt: request.expertReportingInstructionsUpdatedAt,
    conflicts,
    warnings: conflicts.map((conflict) => `Instructiune AI expert ignorata partial: ${conflict}`),
  };
}

function firstSelectedCandidate(request: ActivityAgentRequest) {
  return request.catalogCandidates.find((candidate) => (
    candidate.id && candidate.id === request.selectedActivityId
  )) || request.catalogCandidates.find((candidate) => (
    candidate.saCode === request.saCode && candidate.activityName === request.activityName
  )) || null;
}

function toRagRequest(request: ActivityAgentRequest) {
  return {
    deliverables: request.deliverables
      .map((deliverable) => ({
        id: deliverable.id,
        documentTitle: deliverable.documentTitle,
        deliverableType: deliverable.deliverableType,
        eligibilitySummary: deliverable.eligibilitySummary,
        extractedText: trimText(deliverable.extractedText, 6000) || deliverable.documentTitle,
      }))
      .filter((deliverable) => deliverable.extractedText),
    catalogCandidates: request.catalogCandidates.map((candidate) => ({
      id: candidate.id || `${candidate.saCode || 'sa'}-${candidate.activityName}`,
      category: candidate.category,
      saCode: candidate.saCode || request.saCode || 'SA',
      serviceCategory: candidate.serviceCategory,
      activityNumber: candidate.activityNumber,
      activityName: candidate.activityName,
      description: candidate.description,
      objectives: candidate.objectives,
      serviceComponent: candidate.serviceComponent,
      beneficiaries: candidate.beneficiaries,
      expectedResults: candidate.expectedResults,
      deliverables: candidate.deliverables,
      indicators: candidate.indicators,
    })),
    selectedActivityId: request.selectedActivityId,
    saCode: request.saCode || firstSelectedCandidate(request)?.saCode || '',
    activityName: request.activityName || firstSelectedCandidate(request)?.activityName || '',
    currentDescription: request.currentDescription || '',
    expertId: request.expertId,
    expertName: request.expertName,
    expertRole: request.expertRole,
    category: request.category || firstSelectedCandidate(request)?.category,
    projectCode: request.projectCode,
    month: request.month,
    year: request.year,
    selectedDates: request.selectedDates,
  };
}

function chunkSource(chunk: KnowledgeChunk, score?: number, rank?: number) {
  return {
    sourceType: chunk.sourceType,
    title: [chunk.expertName, chunk.activityName, chunk.saCode].filter(Boolean).join(' / ') || undefined,
    chunkId: chunk.id,
    score,
    rank,
    relevantExcerpt: trimText(chunk.text),
  };
}

export function inspectDeliverablesValue(deliverables: ActivityAgentDeliverable[]) {
  const combinedText = deliverables.map((deliverable) => [
    deliverable.documentTitle,
    deliverable.deliverableType,
    deliverable.eligibilitySummary,
    deliverable.extractedText,
  ].filter(Boolean).join(' ')).join(' ');
  const normalized = normalize(combinedText);
  const actionDictionary = [
    'analiza',
    'redactare',
    'monitorizare',
    'informare',
    'consultare',
    'revizuire',
    'centralizare',
    'pregatire',
    'transmitere',
    'organizare',
  ];
  const topics = unique([
    ...actionDictionary.filter((word) => normalized.includes(word)),
    ...deliverables.map((deliverable) => deliverable.deliverableType || ''),
  ]).slice(0, 12);
  const organizationMatches = Array.from(combinedText.matchAll(/\b[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){1,4}\b/g))
    .map((match) => match[0])
    .filter((value) => value.length > 4 && !/Raport|Nota|Document|Anexa/.test(value));

  return {
    deliverableNames: unique(deliverables.map((deliverable) => deliverable.documentTitle)).slice(0, 10),
    detectedTopics: topics,
    detectedOrganizations: unique(organizationMatches).slice(0, 10),
    detectedActions: actionDictionary.filter((word) => normalized.includes(word)).slice(0, 10),
    possibleResults: unique(deliverables.flatMap((deliverable) => [
      deliverable.eligibilitySummary || '',
      deliverable.documentTitle ? `Livrabil analizat: ${deliverable.documentTitle}` : '',
    ])).slice(0, 8),
    warnings: deliverables.some((deliverable) => !trimText(deliverable.extractedText, 80))
      ? ['Cel putin un livrabil nu are text extras suficient pentru verificare.']
      : [],
  };
}

const RISKY_FACTUAL_ACTIONS = [
  'analiza',
  'comparatie',
  'sinteza',
  'recomandari',
  'participare',
  'consultare',
  'transmitere',
  'validare',
  'amendamente',
  'observatii',
  'redactare',
  'revizuire',
  'centralizare',
  'pregatire',
  'monitorizare',
  'informare',
  'organizare',
];

function detectActionSignals(text: string) {
  const normalized = normalize(text);
  const patterns: Array<[string, RegExp]> = [
    ['analiza', /\banaliz/],
    ['comparatie', /\bcompar/],
    ['sinteza', /\bsintez/],
    ['recomandari', /\brecomand/],
    ['participare', /\bparticip/],
    ['consultare', /\bconsult/],
    ['transmitere', /\btransmi|transmis|transmit/],
    ['validare', /\bvalid/],
    ['amendamente', /\bamend/],
    ['observatii', /\bobserv/],
    ['redactare', /\bredact/],
    ['revizuire', /\breviz/],
    ['centralizare', /\bcentraliz/],
    ['pregatire', /\bpregat/],
    ['monitorizare', /\bmonitoriz/],
    ['informare', /\binform/],
    ['organizare', /\borganiz/],
  ];
  return unique(patterns.filter(([, pattern]) => pattern.test(normalized)).map(([action]) => action));
}

function buildFactualText(request: ActivityAgentRequest) {
  return [
    request.currentDescription,
    request.selectedDates?.join(' '),
    request.date,
    request.hours,
    ...request.deliverables.map((deliverable) => [
      deliverable.documentTitle,
      deliverable.deliverableType,
      deliverable.eligibilitySummary,
      deliverable.extractedText,
    ].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ');
}

function buildTaxonomyText(request: ActivityAgentRequest, subactivityText?: string, jobDescriptionResponsibilities: string[] = []) {
  return [
    request.saCode,
    request.activityName,
    request.title,
    request.category,
    request.expertRole,
    subactivityText,
    jobDescriptionResponsibilities.join(' '),
    ...request.catalogCandidates.map((candidate) => [
      candidate.saCode,
      candidate.activityName,
      candidate.description,
      candidate.objectives,
      candidate.serviceComponent,
      candidate.beneficiaries,
      candidate.expectedResults,
      candidate.deliverables,
      candidate.indicators,
    ].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ');
}

export function buildActivityFactSheetValue(input: {
  request: ActivityAgentRequest;
  deliverableInspection: ReturnType<typeof inspectDeliverablesValue>;
  subactivityText?: string;
  jobDescriptionResponsibilities?: string[];
}): ActivityAgentFactSheet {
  const { request, deliverableInspection } = input;
  const dates = request.selectedDates?.length ? request.selectedDates : request.date ? [request.date] : [];
  const deliverableNames = unique(request.deliverables.map((deliverable) => deliverable.documentTitle));
  const factualText = buildFactualText(request);
  const taxonomyText = buildTaxonomyText(request, input.subactivityText, input.jobDescriptionResponsibilities);
  const demonstratedActions = unique([
    ...deliverableInspection.detectedActions,
    ...detectActionSignals(factualText),
  ]);
  const taxonomyActions = detectActionSignals(taxonomyText);
  const taxonomyOnlyActions = taxonomyActions.filter((action) => !demonstratedActions.includes(action));

  return {
    dateRows: dates.map((date) => ({
      date,
      hours: request.hours,
      deliverables: deliverableNames,
    })),
    factualEvidence: unique([
      request.currentDescription ? `Descriere curenta: ${trimText(request.currentDescription)}` : '',
      request.hours !== undefined && request.hours !== '' ? `Ore pontaj: ${request.hours}` : '',
      dates.length > 0 ? `Date pontaj: ${dates.join(', ')}` : '',
      ...request.deliverables.flatMap((deliverable) => [
        deliverable.documentTitle ? `Livrabil: ${deliverable.documentTitle}` : '',
        deliverable.deliverableType ? `Tip livrabil: ${deliverable.deliverableType}` : '',
        deliverable.eligibilitySummary ? `Eligibilitate: ${trimText(deliverable.eligibilitySummary)}` : '',
        deliverable.extractedText ? `Text livrabil: ${trimText(deliverable.extractedText)}` : '',
      ]),
    ]).slice(0, 16),
    taxonomyContext: unique([
      request.saCode ? `SA selectata: ${request.saCode}` : '',
      request.activityName ? `Activitate selectata: ${request.activityName}` : '',
      input.subactivityText ? `Scop SA: ${trimText(input.subactivityText)}` : '',
      ...(input.jobDescriptionResponsibilities ?? []).map((item) => `Fisa postului: ${trimText(item)}`),
      ...request.catalogCandidates.slice(0, 4).map((candidate) => [
        candidate.saCode,
        candidate.activityName,
        candidate.description,
        candidate.serviceComponent,
      ].filter(Boolean).join(' - ')),
    ]).slice(0, 12),
    demonstratedActions,
    taxonomyOnlyActions,
    unsupportedRiskyActions: RISKY_FACTUAL_ACTIONS.filter((action) => taxonomyOnlyActions.includes(action)),
    deliverableNames,
  };
}

export function validateActivityHoursValue(request: Pick<ActivityAgentRequest, 'hours' | 'selectedDates'>) {
  const hours = request.hours === undefined || request.hours === ''
    ? undefined
    : Number(request.hours);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (hours === undefined || !Number.isFinite(hours)) {
    warnings.push('Numarul de ore nu a fost transmis agentului.');
  } else if (!isValidActivityAgentPontajHours(hours)) {
    errors.push('Orele trebuie sa fie intregi si intre 1 si 8 pe zi.');
  }

  if ((request.selectedDates?.length ?? 0) > 1 && hours && hours > 8) {
    errors.push('Orele pe zi nu pot depasi limita de 8 ore.');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function evaluateTargetGroupImpactValue(input: {
  request: ActivityAgentRequest;
  deliverableInspection: ReturnType<typeof inspectDeliverablesValue>;
  subactivityText?: string;
}) {
  const candidate = firstSelectedCandidate(input.request);
  const text = normalize([
    candidate?.beneficiaries,
    candidate?.expectedResults,
    input.subactivityText,
    input.deliverableInspection.possibleResults.join(' '),
    input.request.currentDescription,
  ].join(' '));
  const beneficiaries = unique([
    candidate?.beneficiaries || '',
    ...input.deliverableInspection.detectedOrganizations,
  ]).slice(0, 10);
  const hasMemberSignal = /membr|beneficiar|grup tinta|organizati|cpc|patron/.test(text);
  const hasProjectSignal = /dialog social|informare|capacitat|rezultat|indicator|structur/.test(text);
  const type = hasMemberSignal ? 'direct' : hasProjectSignal ? 'indirect' : 'unclear';

  return {
    impactType: type as 'direct' | 'indirect' | 'unclear' | 'none',
    beneficiaries,
    justification: type === 'unclear'
      ? 'Sursele nu indica suficient de clar beneficiarii sau impactul asupra grupului tinta.'
      : 'Impactul reiese din beneficiarii/rezultatele activitatii selectate si din livrabil.',
    warnings: type === 'unclear' ? ['Impactul asupra grupului tinta trebuie verificat de PM.'] : [],
  };
}

export function validateSubactivityClassificationValue(input: {
  request: ActivityAgentRequest;
  subactivityText?: string;
}) {
  const selected = firstSelectedCandidate(input.request);
  const selectedSa = input.request.saCode || selected?.saCode;
  const requestText = normalize([
    input.request.activityName,
    input.request.currentDescription,
    input.request.deliverables.map((deliverable) => `${deliverable.documentTitle} ${deliverable.extractedText}`).join(' '),
    input.subactivityText,
  ].join(' '));
  const alternatives = input.request.catalogCandidates
    .map((candidate) => {
      const candidateText = normalize([
        candidate.saCode,
        candidate.activityName,
        candidate.description,
        candidate.objectives,
        candidate.deliverables,
        candidate.indicators,
      ].join(' '));
      const candidateTokens = candidateText.split(' ').filter((token) => token.length > 4);
      const hits = candidateTokens.filter((token) => requestText.includes(token)).length;
      return {
        saCode: candidate.saCode || '',
        activityName: candidate.activityName,
        confidence: Math.min(1, hits / Math.max(8, candidateTokens.length)),
        reason: hits > 0 ? 'Are termeni comuni cu livrabilul/contextul.' : 'Potrivire slaba pe termeni.',
      };
    })
    .filter((candidate) => candidate.saCode)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
  const best = alternatives[0];
  const selectedMatches = Boolean(selected && selectedSa && selected.saCode === selectedSa);
  const proposed = selectedMatches ? selected : best;

  return {
    proposedSaCode: proposed?.saCode || selectedSa,
    proposedActivityName: proposed?.activityName || input.request.activityName,
    confidence: selectedMatches ? Math.max(0.65, best?.confidence ?? 0.65) : best?.confidence ?? 0.35,
    justification: selectedMatches
      ? 'Activitatea selectata exista in catalog pentru SA curenta.'
      : 'Agentul nu a gasit o potrivire clara intre selectia curenta si catalog.',
    alternatives,
    warnings: selectedMatches ? [] : ['Incadrarea SA/activitate trebuie verificata de PM.'],
  };
}

export async function createActivityAgentToolContext(request: ActivityAgentRequest, auth: RagAuthContext) {
  const ragRequest = toRagRequest(request);
  const [approvedReports, saPurpose] = await Promise.all([
    retrieveActivityAutofillContext(ragRequest, { ...auth, topK: 6 }),
    retrieveSaPurposeContext(ragRequest, auth),
  ]);
  const ragContext = buildCompactActivityAutofillRagContext(approvedReports);
  const deliverableInspection = inspectDeliverablesValue(request.deliverables);
  const hours = validateActivityHoursValue(request);
  const subactivityText = saPurpose.context?.text;
  const targetGroupImpact = evaluateTargetGroupImpactValue({ request, deliverableInspection, subactivityText });
  const classification = validateSubactivityClassificationValue({ request, subactivityText });
  const expertAiInstructions = getExpertAiInstructionsValue(request);
  const factSheet = buildActivityFactSheetValue({
    request,
    deliverableInspection,
    subactivityText,
  });

  return {
    ragRequest,
    approvedReports,
    ragContext,
    saPurpose,
    deliverableInspection,
    hours,
    targetGroupImpact,
    classification,
    expertAiInstructions,
    factSheet,
  };
}

export function createActivityAgentTools(
  request: ActivityAgentRequest,
  context: Awaited<ReturnType<typeof createActivityAgentToolContext>>,
  auth: RagAuthContext,
) {
  return {
    inspectDeliverables: tool({
      description: 'Analizeaza livrabilele atasate si returneaza subiecte, actiuni, rezultate posibile si warning-uri.',
      inputSchema: z.object({}),
      execute: async () => context.deliverableInspection,
    }),
    searchApprovedReports: tool({
      description: 'Cauta raportari aprobate OIR si exemple similare prin RAG-ul existent.',
      inputSchema: z.object({}),
      execute: async () => ({
        enabled: context.approvedReports.enabled,
        skippedReason: context.approvedReports.skippedReason,
        warnings: context.approvedReports.warnings,
        sources: context.approvedReports.chunks.slice(0, 6).map(({ chunk, score, rank }) => chunkSource(chunk, Number(score.toFixed(4)), rank)),
        promptContext: context.ragContext?.promptContext,
      }),
    }),
    getExpertJobDescription: tool({
      description: 'Cauta fisa postului expertului in KnowledgeChunk.',
      inputSchema: z.object({}),
      execute: async () => {
        const store = await import('../rag/store.ts');
        const chunks = request.expertId
          ? await store.listKnowledgeChunksByExpertId(
              request.expertId,
              { status: { eq: 'active' }, sourceType: { eq: 'fisa_post' } },
              { ...auth, limit: 50, maxItems: 100 },
            )
          : [];
        const fallbackChunks = chunks.length > 0 || !request.category
          ? []
          : await store.listKnowledgeChunksByCategoryAndSourceType(
              request.category,
              'fisa_post',
              { status: { eq: 'active' }, ...(request.expertName ? { expertName: { eq: request.expertName } } : {}) },
              { ...auth, limit: 50, maxItems: 100 },
            );
        const allChunks = [...chunks, ...fallbackChunks];
        return {
          found: allChunks.length > 0,
          responsibilities: unique(allChunks.flatMap((chunk) => trimText(chunk.text, 1200).split(/[.;]\s+/)).filter((item) => item.length > 25)).slice(0, 8),
          relevantExcerpts: allChunks.slice(0, 4).map((chunk) => trimText(chunk.text)),
          sources: allChunks.slice(0, 4).map((chunk) => chunkSource(chunk)),
        };
      },
    }),
    getSubactivityContext: tool({
      description: 'Returneaza scopul oficial SA si contextul catalogului activitatii.',
      inputSchema: z.object({}),
      execute: async () => {
        const selected = firstSelectedCandidate(request);
        return {
          found: context.saPurpose.found,
          saCode: request.saCode || selected?.saCode,
          purpose: context.saPurpose.context?.text,
          title: context.saPurpose.context?.title,
          allowedActivities: request.catalogCandidates
            .filter((candidate) => !request.saCode || candidate.saCode === request.saCode)
            .map((candidate) => candidate.activityName),
          beneficiaries: selected?.beneficiaries,
          expectedResults: selected?.expectedResults,
          deliverables: selected?.deliverables,
          indicators: selected?.indicators,
          sources: context.saPurpose.context?.chunkIds.map((chunkId) => ({
            sourceType: context.saPurpose.context?.sourceType || 'scop_sa',
            chunkId,
          })) ?? [],
          warnings: context.saPurpose.warnings,
        };
      },
    }),
    getExpertAiInstructions: tool({
      description: 'Returneaza instructiunile AI active ale expertului ca preferinte controlate, nu ca surse factuale.',
      inputSchema: z.object({}),
      execute: async () => context.expertAiInstructions,
    }),
    validateActivityHours: tool({
      description: 'Verifica determinist regulile de pontaj pentru orele transmise.',
      inputSchema: z.object({}),
      execute: async () => context.hours,
    }),
    evaluateTargetGroupImpact: tool({
      description: 'Evalueaza impactul asupra grupului tinta, fara a presupune automat impact.',
      inputSchema: z.object({}),
      execute: async () => context.targetGroupImpact,
    }),
    validateSubactivityClassification: tool({
      description: 'Compara activitatea, livrabilul, SA, catalogul si sursele pentru incadrare.',
      inputSchema: z.object({}),
      execute: async () => context.classification,
    }),
  };
}
