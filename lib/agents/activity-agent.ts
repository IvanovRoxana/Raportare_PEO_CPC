import { Output, stepCountIs } from 'ai';
import { governedGenerateText } from '../ai-governance.ts';
import { getActivityAgentModelName, openaiModel } from '../openai.ts';
import type { RagAuthContext } from '../rag/types.ts';
import { buildActivityAgentPrompt, buildActivityAgentSystemPrompt } from './activity-agent-prompt.ts';
import {
  activityAgentResponseSchema,
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
  const deliverableNames = request.deliverables
    .map((deliverable) => deliverable.documentTitle)
    .filter(Boolean)
    .slice(0, 3)
    .join('; ');
  const activity = request.activityName || 'activitatea selectata';
  const sa = request.saCode || 'subactivitatea selectata';
  const evidence = extractFallbackEvidence(request);
  const evidenceText = evidence.length > 0
    ? `Din continutul livrabilului reiese urmatorul context de lucru: ${evidence.join(' ')}`
    : '';

  return [
    request.currentDescription,
    `Am lucrat la ${activity} (${sa}) pe baza livrabilului${deliverableNames ? ` ${deliverableNames}` : ' atasat'}, urmarind sa pastrez descrierea aliniata cu activitatea selectata in formular.`,
    evidenceText,
    'Am extras si structurat informatiile relevante, am verificat coerenta continutului fata de obiectivul activitatii si am pregatit formularea pentru raportarea lunara, fara a schimba incadrarea selectata.',
    'Descrierea trebuie revizuita de PM deoarece agentul AI complet nu a putut valida toate sursele necesare.',
  ].filter(Boolean).join(' ');
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
  const deliverableNames = request.deliverables
    .map((deliverable) => deliverable.documentTitle)
    .filter(Boolean)
    .slice(0, 2)
    .join('; ');
  const activity = request.activityName || request.title || 'activitatea selectata';
  const sa = request.saCode ? ` (${request.saCode})` : '';
  const collaboratorNames = request.collaborationContext?.isCommonActivity
    ? request.collaborationContext.collaborators.map((collaborator) => collaborator.name).filter(Boolean)
    : [];
  const collaboration = collaboratorNames.length > 0
    ? `, in colaborare cu ${collaboratorNames.join(', ')}`
    : '';

  return `Am realizat ${activity}${sa}${collaboration}${deliverableNames ? `, pe baza livrabilului ${deliverableNames}` : ''}.`;
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
    shortSummary: fallbackShortSummary(request),
    proposedSaCode: request.saCode,
    proposedActivityName: request.activityName,
    deliverableSummary,
    deliverableInterpretation: fallbackDeliverableInterpretation(request),
    resultSummary: 'Rezultat formulat prudent pe baza datelor disponibile; necesita verificare PM.',
    beneficiaries: [],
    targetGroupImpact: {
      type: 'unclear',
      justification: 'Agentul complet nu a putut confirma impactul asupra grupului tinta.',
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
        reason: 'Agentul complet nu a finalizat analiza, astfel scorurile complete necesita verificare PM.',
        evidence: warnings.slice(0, 3),
      },
      {
        id: 'deliverable-text',
        label: 'Text livrabil disponibil',
        score: request.deliverables.some((deliverable) => deliverable.extractedText?.trim()) ? 0.75 : 0.1,
        reason: 'Fallback-ul a folosit textul extras disponibil din livrabile.',
        evidence: request.deliverables.map((deliverable) => deliverable.documentTitle).filter(Boolean).slice(0, 3),
      },
    ],
    warnings: uniqueMessages([
      ...warnings,
      'Fallback controlat: descrierea nu trebuie considerata validare completa a incadrarii.',
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
    output: Output.object({ schema: activityAgentResponseSchema }),
  });
  const parsed = activityAgentResponseSchema.parse(result.output);
  const changedSelectedActivity = Boolean(
    (request.saCode && parsed.proposedSaCode && parsed.proposedSaCode !== request.saCode)
    || (request.activityName && parsed.proposedActivityName && parsed.proposedActivityName !== request.activityName),
  );
  const warnings = uniqueMessages([
    ...parsed.warnings,
    changedSelectedActivity
      ? 'Agentul a detectat o posibila alta incadrare, dar optimizarea a pastrat activitatea selectata in formular.'
      : '',
    ...context.approvedReports.warnings,
    ...context.saPurpose.warnings,
    ...context.deliverableInspection.warnings,
    ...context.hours.warnings,
    ...context.hours.errors,
    ...context.targetGroupImpact.warnings,
    ...context.classification.warnings,
    ...context.expertAiInstructions.warnings,
  ]);

  return {
    ...parsed,
    proposedSaCode: request.saCode || parsed.proposedSaCode,
    proposedActivityName: request.activityName || parsed.proposedActivityName,
    warnings,
    expertInstructionAudit: {
      found: context.expertAiInstructions.found,
      active: context.expertAiInstructions.active,
      updatedAt: context.expertAiInstructions.updatedAt,
      conflicts: uniqueMessages([
        ...(parsed.expertInstructionAudit?.conflicts ?? []),
        ...context.expertAiInstructions.conflicts,
      ]),
    },
    auditId: result.auditId,
    deliverableInterpretation: {
      ...parsed.deliverableInterpretation,
      unsupportedGaps: uniqueMessages([
        ...parsed.deliverableInterpretation.unsupportedGaps,
        ...context.deliverableInspection.warnings,
      ]),
    },
    explainableScores: mergeExplainableScores(
      parsed.explainableScores,
      buildDeterministicExplainableScores(request, context, changedSelectedActivity),
    ),
    checks: {
      ...parsed.checks,
      saPurposeFound: context.saPurpose.found,
      hoursPlausible: context.hours.valid,
      deliverableSupported: request.deliverables.length > 0 && request.deliverables.some((deliverable) => deliverable.extractedText?.trim()),
      subactivityAligned: changedSelectedActivity ? false : parsed.checks.subactivityAligned ?? context.classification.confidence >= 0.55,
      targetGroupImpactSupported: parsed.checks.targetGroupImpactSupported ?? context.targetGroupImpact.impactType !== 'unclear',
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
        ? 'Revizuieste descrierea inainte de aplicare; agentul a marcat verificare PM.'
        : 'Descriere optimizata de Agentul PEO pe baza livrabilelor si contextului disponibil.',
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
