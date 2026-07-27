import { Output, stepCountIs } from 'ai';
import { governedGenerateText } from '../ai-governance.ts';
import { getActivityAgentModelName, openaiModel } from '../openai.ts';
import type { RagAuthContext } from '../rag/types.ts';
import { buildActivityAgentPrompt, buildActivityAgentSystemPrompt } from './activity-agent-prompt.ts';
import {
  activityAgentGenerationSchema,
  type ActivityAgentGeneration,
  type ActivityAgentRequest,
  type ActivityAgentResponse,
} from './activity-agent-schema.ts';
import {
  createActivityAgentToolContext,
  createActivityAgentTools,
} from './activity-agent-tools.ts';

function uniqueMessages(messages: string[]) {
  return Array.from(new Set(messages.map((message) => message.trim()).filter(Boolean)));
}

function trimText(value: unknown, maxChars = 900) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function splitSentences(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360);
}

function formatActivityDates(request: ActivityAgentRequest) {
  const dates = (request.selectedDates?.length ? request.selectedDates : request.date ? [request.date] : [])
    .map((date) => {
      const parsed = new Date(`${date}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return String(date);
      const months = [
        'ianuarie',
        'februarie',
        'martie',
        'aprilie',
        'mai',
        'iunie',
        'iulie',
        'august',
        'septembrie',
        'octombrie',
        'noiembrie',
        'decembrie',
      ];
      return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
    });

  if (dates.length === 0) return '';
  if (dates.length === 1) return `În data de ${dates[0]}`;
  if (dates.length === 2) return `În zilele de ${dates.join(' si ')}`;
  return `În zilele de ${dates.slice(0, -1).join(', ')} si ${dates.at(-1)}`;
}

function lowerFirst(value: string) {
  return value ? `${value.charAt(0).toLocaleLowerCase('ro-RO')}${value.slice(1)}` : value;
}

function normalizePolicyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasForbiddenDescriptionContent(value: string) {
  const forbiddenPatterns = [
    /\bformular(?:ul)?\b/,
    /\bactivitatea selectat[ae]\b/,
    /\bagent(?:ul)?\s+(?:ai|peo)\b/,
    /\bocr\b/,
    /\brag\b/,
    /\bcontext(?:ul)?\s+disponibil\b/,
    /\b(?:am\s+)?(?:citit|extras|procesat|parcurs)\s+(?:livrabilul|documentul|textul)\b/,
    /\blivrabil(?:ul|e|ele|ului)?\b/,
    /\bdocument(?:ul)?\s+atasat\b/,
    /\bsurse?(?:le)?\s+(?:folosite|utilizate|disponibile|consultate)\b/,
    /\bam urmarit sa pastrez\b/,
    /\b(?:necesita\s+)?verificare\s+pm\b/,
    /\bvalidare(?:a)?\s+(?:de catre\s+)?pm\b/,
    /\braportarea lunara\b/,
    /\bpregatit(?:a)?\s+formularea\b/,
  ];
  const normalized = normalizePolicyText(value);
  return forbiddenPatterns.some((pattern) => pattern.test(normalized));
}

function buildMinimalFinalDescription(request: ActivityAgentRequest) {
  const activity = request.activityName || request.title || 'activitatea raportata';
  const sa = request.saCode ? ` in cadrul ${request.saCode}` : '';
  const firstSentence = `am realizat activitati de ${activity}${sa}, prin analiza, structurarea si formularea elementelor relevante pentru obiectivele proiectului`;
  const resultSentence = 'Activitatea a contribuit la documentarea rezultatelor obtinute si la fundamentarea unei raportari coerente, proportionale cu informatiile confirmate.';
  const prefix = formatActivityDates(request);

  if (prefix) {
    return `${prefix}, ${firstSentence}. ${resultSentence}`;
  }

  return `Am realizat activitati de ${activity}${sa}, prin analiza, structurarea si formularea elementelor relevante pentru obiectivele proiectului. ${resultSentence}`;
}

function cleanFinalDescription(value: unknown, request: ActivityAgentRequest) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-zăâîșțĂÂÎȘȚ])-\s+([A-Za-zăâîșțĂÂÎȘȚ])\b/g, '$1$2')
    .trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => !hasForbiddenDescriptionContent(sentence));
  const cleaned = sentences.join(' ').trim();
  const safeCleaned = cleaned || buildMinimalFinalDescription(request);
  const prefix = formatActivityDates(request);

  if (!prefix || /^În (data|zilele) de\b/i.test(safeCleaned)) {
    return safeCleaned;
  }

  return `${prefix}, ${lowerFirst(safeCleaned).replace(/^\s*în\s+data\s+de\s+/i, '')}`;
}

function shortSummaryFromDescription(description: string, request: ActivityAgentRequest) {
  const firstSentence = splitSentences(description)[0] || description.slice(0, 240);
  if (firstSentence.length >= 20 && firstSentence.length <= 360) return firstSentence;
  return fallbackShortSummary(request);
}

function extractFallbackEvidence(request: ActivityAgentRequest) {
  const titleTerms = [request.activityName, request.currentDescription]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 5);
  const preferred = request.deliverables
    .flatMap((deliverable) => splitSentences(deliverable.extractedText))
    .map((sentence, index) => ({
      sentence,
      index,
      score: titleTerms.reduce((total, term) => (
        sentence.toLowerCase().includes(term) ? total + 1 : total
      ), 0),
    }))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))
    .slice(0, 5)
    .map((item) => item.sentence);

  return preferred.length > 0
    ? preferred
    : request.deliverables.flatMap((deliverable) => splitSentences(deliverable.extractedText)).slice(0, 4);
}

function fallbackDeliverableInterpretation(request: ActivityAgentRequest) {
  const evidence = extractFallbackEvidence(request);
  const deliverableNames = request.deliverables
    .map((deliverable) => deliverable.documentTitle)
    .filter(Boolean);
  return {
    summary: evidence[0] || (deliverableNames.length > 0
      ? `Livrabil(e) analizate: ${deliverableNames.join('; ')}.`
      : 'Livrabilul nu are suficient text extras pentru interpretare detaliata.'),
    workPerformed: evidence.slice(0, 3),
    keyFacts: evidence.slice(0, 4),
    documentSignals: request.deliverables
      .flatMap((deliverable) => [
        deliverable.documentTitle ? `Titlu: ${deliverable.documentTitle}` : '',
        deliverable.deliverableType ? `Tip: ${deliverable.deliverableType}` : '',
        deliverable.eligibilitySummary ? `Eligibilitate: ${deliverable.eligibilitySummary}` : '',
      ])
      .filter(Boolean)
      .slice(0, 8),
    unsupportedGaps: evidence.length === 0
      ? ['Nu exista suficiente propozitii extrase din livrabil pentru interpretare aprofundata.']
      : [],
  };
}

function fallbackDescription(request: ActivityAgentRequest) {
  const activity = request.activityName || request.title || 'activitatea raportata';
  const sa = request.saCode ? ` pentru ${request.saCode}` : '';
  const evidence = extractFallbackEvidence(request);
  const factualContext = evidence.length > 0
    ? `Am analizat si sintetizat elementele factuale disponibile privind ${evidence.slice(0, 3).join(' ')}`
    : `Am analizat informatiile disponibile si am formulat o descriere prudenta a activitatii de ${activity}.`;
  const result = `Activitatea a contribuit la documentarea si fundamentarea rezultatelor aferente${sa}, prin structurarea unei descrieri coerente si relevante pentru raportarea tehnica a proiectului.`;

  return cleanFinalDescription([
    request.currentDescription || `Am realizat activitati de ${activity}.`,
    factualContext,
    result,
  ].filter(Boolean).join(' '), request);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function scoreFromCheck(value: boolean | null | undefined, positive = 0.85, unknown = 0.45, negative = 0.2) {
  if (value === true) return positive;
  if (value === false) return negative;
  return unknown;
}

function buildDeterministicExplainableScores(
  request: ActivityAgentRequest,
  context: Awaited<ReturnType<typeof createActivityAgentToolContext>>,
  changedSelectedActivity = false,
) {
  const hasDeliverableText = request.deliverables.some((deliverable) => deliverable.extractedText?.trim());
  const ragChunks = context.approvedReports.chunks.length;
  const targetImpactScore = context.targetGroupImpact.impactType === 'direct'
    ? 0.9
    : context.targetGroupImpact.impactType === 'indirect'
      ? 0.7
      : context.targetGroupImpact.impactType === 'none'
        ? 0.15
        : 0.35;

  return [
    {
      id: 'deliverable-text',
      label: 'Text livrabil disponibil',
      score: hasDeliverableText ? 0.9 : 0.1,
      reason: hasDeliverableText
        ? 'Cel putin un livrabil atasat are text extras/OCR disponibil pentru agent.'
        : 'Nu exista text extras suficient din livrabile.',
      evidence: request.deliverables.map((deliverable) => deliverable.documentTitle).filter(Boolean).slice(0, 3),
    },
    {
      id: 'selected-activity-fit',
      label: 'Potrivire cu activitatea selectata',
      score: changedSelectedActivity ? 0.2 : clampScore(context.classification.confidence),
      reason: changedSelectedActivity
        ? 'Modelul a indicat o alta incadrare; sistemul a pastrat activitatea selectata si cere verificare PM.'
        : context.classification.justification,
      evidence: [
        request.saCode ? `SA selectata: ${request.saCode}` : '',
        request.activityName ? `Activitate: ${request.activityName}` : '',
      ].filter(Boolean),
    },
    {
      id: 'sa-purpose',
      label: 'Context scop SA',
      score: context.saPurpose.found ? 0.85 : 0.35,
      reason: context.saPurpose.found
        ? 'Scopul oficial al subactivitatii a fost gasit in baza RAG.'
        : 'Scopul oficial al subactivitatii nu a fost gasit sau nu a putut fi citit.',
      evidence: [context.saPurpose.context?.title || '', context.saPurpose.context?.sourceType || ''].filter(Boolean),
    },
    {
      id: 'approved-rag',
      label: 'Raportari aprobate similare',
      score: ragChunks > 0 ? clampScore(0.45 + Math.min(ragChunks, 6) * 0.08) : 0.25,
      reason: ragChunks > 0
        ? `${ragChunks} fragmente RAG au fost disponibile pentru stil/context istoric.`
        : 'Nu au fost gasite raportari aprobate similare pentru context.',
      evidence: context.approvedReports.chunks
        .slice(0, 3)
        .map(({ chunk }) => [chunk.sourceType, chunk.activityName, chunk.expertName].filter(Boolean).join(' / ')),
    },
    {
      id: 'target-group-impact',
      label: 'Impact grup tinta',
      score: targetImpactScore,
      reason: context.targetGroupImpact.justification,
      evidence: context.targetGroupImpact.beneficiaries.slice(0, 5),
    },
    {
      id: 'hours-plausible',
      label: 'Pontaj plauzibil',
      score: scoreFromCheck(context.hours.valid, 0.8, 0.45, 0.15),
      reason: context.hours.valid
        ? 'Orele transmise respecta regula de pontaj verificata determinist.'
        : [...context.hours.errors, ...context.hours.warnings].join(' ') || 'Orele nu au putut fi validate complet.',
      evidence: [
        request.hours !== undefined ? `Ore: ${request.hours}` : '',
        request.selectedDates?.length ? `Date selectate: ${request.selectedDates.join(', ')}` : '',
      ].filter(Boolean),
    },
  ];
}

function mergeExplainableScores(
  modelScores: ActivityAgentResponse['explainableScores'],
  deterministicScores: ActivityAgentResponse['explainableScores'],
) {
  const byId = new Map<string, ActivityAgentResponse['explainableScores'][number]>();
  deterministicScores.forEach((score) => byId.set(score.id, score));
  modelScores.forEach((score) => byId.set(score.id, {
    ...score,
    score: clampScore(score.score),
    evidence: score.evidence.slice(0, 6),
  }));
  return Array.from(byId.values()).slice(0, 10);
}

function fallbackShortSummary(request: ActivityAgentRequest) {
  const activity = request.activityName || request.title || 'activitatea selectata';
  const sa = request.saCode ? ` (${request.saCode})` : '';
  const collaboratorNames = request.collaborationContext?.isCommonActivity
    ? request.collaborationContext.collaborators.map((collaborator) => collaborator.name).filter(Boolean)
    : [];
  const collaboration = collaboratorNames.length > 0
    ? `, in colaborare cu ${collaboratorNames.join(', ')}`
    : '';

  return `Am realizat ${activity}${sa}${collaboration}.`;
}

function buildEvidenceUsed(request: ActivityAgentRequest, generated: ActivityAgentGeneration) {
  const facts = generated.usedFacts.length > 0 ? generated.usedFacts : extractFallbackEvidence(request);
  return request.deliverables.flatMap((deliverable) => (
    facts.slice(0, 6).map((fact) => ({
      sourceType: 'livrabil_curent',
      title: deliverable.documentTitle,
      chunkId: deliverable.id,
      relevantExcerpt: trimText(fact, 500),
    }))
  )).slice(0, 8);
}

function buildActivityAgentAuditRequest(
  request: ActivityAgentRequest,
  context: Awaited<ReturnType<typeof createActivityAgentToolContext>>,
) {
  return {
    expertId: request.expertId,
    expertName: request.expertName,
    projectCode: request.projectCode,
    category: request.category,
    month: request.month,
    year: request.year,
    saCode: request.saCode,
    activityName: request.activityName,
    selectedActivityId: request.selectedActivityId,
    deliverableCount: request.deliverables.length,
    selectedDatesCount: request.selectedDates?.length ?? 0,
    collaboration: {
      isCommonActivity: Boolean(request.collaborationContext?.isCommonActivity),
      collaboratorCount: request.collaborationContext?.collaborators.length ?? 0,
    },
    expertInstructions: {
      found: context.expertAiInstructions.found,
      active: context.expertAiInstructions.active,
      updatedAt: context.expertAiInstructions.updatedAt,
      conflicts: context.expertAiInstructions.conflicts,
    },
    prechecks: {
      ragEnabled: context.approvedReports.enabled,
      ragChunks: context.approvedReports.chunks.length,
      saPurposeFound: context.saPurpose.found,
      saPurposeSourceType: context.saPurpose.context?.sourceType,
      saPurposeDocumentId: context.saPurpose.context?.documentId,
      hoursValid: context.hours.valid,
      classificationConfidence: context.classification.confidence,
    },
  };
}

export function buildControlledFallbackActivityAgentResponse(
  request: ActivityAgentRequest,
  warnings: string[],
): ActivityAgentResponse {
  const deliverableSummary = request.deliverables
    .map((deliverable) => deliverable.documentTitle)
    .filter(Boolean)
    .join('; ') || 'Nu exista livrabile cu titlu disponibil.';

  return {
    description: fallbackDescription(request),
    usedFacts: extractFallbackEvidence(request),
    shortSummary: fallbackShortSummary(request),
    proposedSaCode: request.saCode,
    proposedActivityName: request.activityName,
    deliverableSummary,
    deliverableInterpretation: fallbackDeliverableInterpretation(request),
    resultSummary: 'Rezultat formulat prudent pe baza datelor disponibile; necesita verificare PM.',
    beneficiaries: [],
    targetGroupImpact: {
      type: 'unclear',
      justification: 'Impactul asupra grupului tinta nu a putut fi confirmat complet din datele disponibile.',
    },
    evidenceUsed: request.deliverables.map((deliverable) => ({
      sourceType: 'livrabil_curent',
      title: deliverable.documentTitle,
      chunkId: deliverable.id,
      relevantExcerpt: deliverable.extractedText?.slice(0, 500),
    })),
    explainableScores: [
      {
        id: 'fallback-confidence',
        label: 'Nivel fallback',
        score: 0.25,
        reason: 'Analiza completa nu a fost finalizata, astfel scorurile complete necesita verificare PM.',
        evidence: warnings.slice(0, 3),
      },
      {
        id: 'deliverable-text',
        label: 'Text livrabil disponibil',
        score: request.deliverables.some((deliverable) => deliverable.extractedText?.trim()) ? 0.75 : 0.1,
        reason: 'Au existat informatii textuale disponibile pentru formularea prudenta a descrierii.',
        evidence: request.deliverables.map((deliverable) => deliverable.documentTitle).filter(Boolean).slice(0, 3),
      },
    ],
    warnings: uniqueMessages([
      ...warnings,
      'Descriere formulata prudent pe baza datelor disponibile; incadrarea necesita verificare interna.',
    ]),
    expertInstructionAudit: {
      found: Boolean(request.expertReportingInstructions?.trim()),
      active: Boolean(request.expertReportingInstructions?.trim()),
      updatedAt: request.expertReportingInstructionsUpdatedAt,
      conflicts: [],
    },
    confidence: 'low',
    requiresPmReview: true,
    checks: {
      jobDescriptionAligned: null,
      saPurposeFound: null,
      subactivityAligned: null,
      deliverableSupported: request.deliverables.length > 0 ? true : null,
      hoursPlausible: null,
      targetGroupImpactSupported: null,
    },
  };
}

export async function runActivityAgent(
  request: ActivityAgentRequest,
  options: RagAuthContext = {},
) {
  const context = await createActivityAgentToolContext(request, options);
  const tools = createActivityAgentTools(request, context, options);
  const result = await governedGenerateText({
    endpoint: '/api/ai/activity-agent',
    operation: 'activity-peo-agent',
    request: buildActivityAgentAuditRequest(request, context),
    actorId: request.expertId,
    actorName: request.expertName,
    projectCode: request.projectCode,
    month: request.month,
    year: request.year,
    model: openaiModel(getActivityAgentModelName()),
    system: buildActivityAgentSystemPrompt(),
    prompt: buildActivityAgentPrompt(request),
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1800,
    output: Output.object({ schema: activityAgentGenerationSchema }),
  });
  const generated = activityAgentGenerationSchema.parse(result.output);
  const description = cleanFinalDescription(generated.description, request);
  const changedSelectedActivity = false;
  const warnings = uniqueMessages([
    ...generated.warnings,
    ...context.approvedReports.warnings,
    ...context.saPurpose.warnings,
    ...context.deliverableInspection.warnings,
    ...context.hours.warnings,
    ...context.hours.errors,
    ...context.targetGroupImpact.warnings,
    ...context.classification.warnings,
    ...context.expertAiInstructions.warnings,
  ]);
  const interpretation = fallbackDeliverableInterpretation(request);
  const evidenceUsed = buildEvidenceUsed(request, generated);

  return {
    description,
    usedFacts: generated.usedFacts,
    shortSummary: shortSummaryFromDescription(description, request),
    proposedSaCode: request.saCode,
    proposedActivityName: request.activityName,
    deliverableSummary: request.deliverables.map((deliverable) => deliverable.documentTitle).filter(Boolean).join('; ')
      || 'Nu exista livrabile cu titlu disponibil.',
    deliverableInterpretation: {
      ...interpretation,
      keyFacts: uniqueMessages([
        ...generated.usedFacts,
        ...interpretation.keyFacts,
      ]).slice(0, 8),
      unsupportedGaps: uniqueMessages([
        ...interpretation.unsupportedGaps,
        ...context.deliverableInspection.warnings,
      ]),
    },
    resultSummary: splitSentences(description).at(-1) || shortSummaryFromDescription(description, request),
    beneficiaries: context.targetGroupImpact.beneficiaries,
    targetGroupImpact: {
      type: context.targetGroupImpact.impactType,
      justification: context.targetGroupImpact.justification,
    },
    evidenceUsed,
    warnings,
    expertInstructionAudit: {
      found: context.expertAiInstructions.found,
      active: context.expertAiInstructions.active,
      updatedAt: context.expertAiInstructions.updatedAt,
      conflicts: uniqueMessages(context.expertAiInstructions.conflicts),
    },
    auditId: result.auditId,
    explainableScores: mergeExplainableScores([], buildDeterministicExplainableScores(request, context, changedSelectedActivity)),
    confidence: context.classification.confidence >= 0.75 && warnings.length === 0
      ? 'high'
      : context.classification.confidence >= 0.55
        ? 'medium'
        : 'low',
    requiresPmReview: warnings.length > 0 || context.classification.confidence < 0.55,
    checks: {
      jobDescriptionAligned: null,
      saPurposeFound: context.saPurpose.found,
      subactivityAligned: context.classification.confidence >= 0.55,
      deliverableSupported: request.deliverables.length > 0 && request.deliverables.some((deliverable) => deliverable.extractedText?.trim()),
      hoursPlausible: context.hours.valid,
      targetGroupImpactSupported: context.targetGroupImpact.impactType !== 'unclear',
    },
  } satisfies ActivityAgentResponse;
}

export function mapActivityAgentResponseToAutofillSuggestion(response: ActivityAgentResponse) {
  return {
    description: response.description,
    shortSummary: response.shortSummary,
    confidence: response.confidence,
    fieldInstructions: {
      description: response.requiresPmReview
        ? 'Revizuieste incadrarea si informatiile lipsa inainte de aplicare.'
        : 'Descriere pregatita pentru Anexa 10.',
    },
    evidence: response.evidenceUsed
      .map((evidence) => [
        evidence.sourceType,
        evidence.title,
        evidence.relevantExcerpt,
      ].filter(Boolean).join(' - '))
      .slice(0, 6),
    warnings: response.warnings,
    modelAuditId: response.auditId,
    agent: response,
  };
}
