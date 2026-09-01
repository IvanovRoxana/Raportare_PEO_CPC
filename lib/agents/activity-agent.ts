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
  buildActivityFactSheetValue,
  inspectDeliverablesValue,
} from './activity-agent-tools.ts';
import {
  clampScore,
  classifyDeliverableKind,
  evaluateFinalActivityDescription,
  hasForbiddenDescriptionContent,
  hasFirstPersonSingularDescription,
  splitSentences,
  trimText,
  uniqueMessages,
} from './activity-agent-quality.ts';

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

function firstPersonCurrentDescription(request: ActivityAgentRequest) {
  const current = trimText(request.currentDescription, 700);
  if (!current) return '';
  if (hasFirstPersonSingularDescription(current)) return current;

  const activity = request.activityName || request.title || 'activitatea raportata';
  const cleanedCurrent = current
    .replace(/^activitatea\s+(?:reprezinta|presupune|consta\s+in)\s+/i, '')
    .replace(/[.;]\s*$/, '');
  return `Am realizat ${activity}, prin ${lowerFirst(cleanedCurrent)}.`;
}

function normalizeDescriptionText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeEvidenceText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasRepeatedSentenceContent(value: string) {
  const sentences = splitSentences(value)
    .map((sentence) => normalizeEvidenceText(sentence))
    .filter(Boolean);
  if (sentences.length < 3) return false;
  return new Set(sentences).size <= Math.ceil(sentences.length / 2);
}

function hasRawDeliverableLeak(value: string) {
  const normalized = normalizeEvidenceText(value);
  return [
    /\b(?:sedinta|intalnire)\s+ref\b/,
    /\bdata\s+\d{1,2}[./]\d{1,2}[./]\d{4}\s+locatia\b/,
    /\blista\s+de\s+participanti\b/,
    /\bnr\s+nume\s+si\s+prenume\s+organizatia\s+functia\b/,
    /\badresa\s+de\s+email\b/,
    /\bmeeting\s+notes\b/,
  ].some((pattern) => pattern.test(normalized));
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

function isMetadataLikeEvidence(sentence: string) {
  const normalized = normalizeEvidenceText(sentence);
  return !normalized
    || /\b(?:sedinta|intalnire)\s+ref\b/.test(normalized)
    || /\bdata\s+\d{1,2}[./]\d{1,2}[./]\d{4}\s+locatia\b/.test(normalized)
    || /\blista\s+de\s+participanti\b/.test(normalized)
    || /\bnr\s+nume\s+si\s+prenume\s+organizatia\s+functia\b/.test(normalized)
    || /\badresa\s+de\s+email\b/.test(normalized)
    || /\binterval\s+orar\b/.test(normalized)
    || /\bsemnatura\b/.test(normalized)
    || /\bmeeting\s+notes\b/.test(normalized)
    || /@/.test(sentence);
}

function cleanEvidenceSentences(sentences: string[]) {
  return uniqueMessages(sentences
    .map((sentence) => normalizeDescriptionText(sentence))
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360)
    .filter((sentence) => !isMetadataLikeEvidence(sentence))
    .filter((sentence) => !hasForbiddenDescriptionContent(sentence)))
    .slice(0, 6);
}

function getDeliverableCorpus(request: ActivityAgentRequest) {
  return request.deliverables.map((deliverable) => [
    deliverable.documentTitle,
    deliverable.deliverableType,
    deliverable.eligibilitySummary,
    deliverable.extractedText,
  ].filter(Boolean).join('\n')).join('\n');
}

function isMeetingMinuteRequest(request: ActivityAgentRequest) {
  const normalized = normalizeEvidenceText(getDeliverableCorpus(request));
  return /\bminuta\b/.test(normalized)
    || /\b(?:sedinta|intalnire)\b/.test(normalized)
    || /\bmeeting\s+notes\b/.test(normalized)
    || /\bpanel\b/.test(normalized);
}

function extractMeetingSubject(request: ActivityAgentRequest) {
  const corpus = getDeliverableCorpus(request);
  const explicitSubject = corpus.match(/(?:Ședință|Sedinta|Întâlnire|Intalnire)\s*:\s*([^\n]+)/i)?.[1]
    || request.deliverables.map((deliverable) => deliverable.documentTitle).find(Boolean)
    || request.activityName
    || 'activitatea raportata';
  return normalizeDescriptionText(explicitSubject)
    .replace(/^Ref\.\s*/i, '')
    .replace(/\s+[-–]\s*\d{1,2}[./]\d{1,2}[./]\d{4}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeetingTopics(request: ActivityAgentRequest) {
  const normalized = normalizeEvidenceText(getDeliverableCorpus(request));
  return uniqueMessages([
    /\bpanel\b/.test(normalized) || /\bagenda\b/.test(normalized)
      ? 'structura agendei si a panelurilor'
      : '',
    /\bspeaker/.test(normalized) || /\bmoderator/.test(normalized)
      ? 'alinierea speakerilor si a rolurilor de moderare'
      : '',
    /\btema\b/.test(normalized) || /\bdirectii\s+tematice\b/.test(normalized)
      ? 'principalele directii tematice ale evenimentului'
      : '',
    /\bobservatii\b/.test(normalized) || /\bclarific/.test(normalized)
      ? 'observatiile si clarificarile necesare pentru organizare'
      : '',
    /\bfurnizor\b/.test(normalized) || /\bprestator\b/.test(normalized)
      ? 'cerintele care urmau sa fie transmise prestatorului'
      : '',
  ]).slice(0, 4);
}

function buildMeetingMinuteFallbackDescription(request: ActivityAgentRequest) {
  const subject = extractMeetingSubject(request);
  const topics = extractMeetingTopics(request);
  const prefix = formatActivityDates(request);
  const topicText = topics.length > 0
    ? topics.join(', ')
    : 'obiectivele, structura generala si elementele de continut ale intalnirii';
  const currentDescription = firstPersonCurrentDescription(request);
  const selectedActivity = request.activityName ? `, in cadrul activitatii "${request.activityName}"` : '';
  const sa = request.saCode ? ` aferente ${request.saCode}` : '';
  const firstSentence = `${prefix || 'Am participat'} la o intalnire interna de lucru pentru ${lowerFirst(subject)}${selectedActivity}, in cadrul careia am analizat ${topicText}.`;
  const secondSentence = 'Am centralizat elementele de continut discutate, cerintele operationale si aspectele care necesitau clarificare pentru dezvoltarea si operationalizarea agendei.';
  const thirdSentence = `Prin aceasta activitate am contribuit la pregatirea coerenta a evenimentului si la documentarea rezultatelor${sa} pentru raportarea tehnica a proiectului.`;

  return cleanFinalDescription([
    currentDescription && currentDescription.length > 80 ? currentDescription : '',
    firstSentence,
    secondSentence,
    thirdSentence,
  ].filter(Boolean).join(' '), request);
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

  const fallback = request.deliverables.flatMap((deliverable) => splitSentences(deliverable.extractedText));
  return cleanEvidenceSentences(preferred.length > 0 ? preferred : fallback);
}

function fallbackDeliverableInterpretation(request: ActivityAgentRequest) {
  const evidence = extractFallbackEvidence(request);
  const deliverableKind = classifyDeliverableKind(request);
  const deliverableNames = request.deliverables
    .map((deliverable) => deliverable.documentTitle)
    .filter(Boolean);
  return {
    summary: evidence[0] || (deliverableNames.length > 0
      ? `Livrabil(e) analizate: ${deliverableNames.join('; ')}.`
      : 'Livrabilul nu are suficient text extras pentru interpretare detaliata.'),
    workPerformed: evidence.slice(0, 3),
    keyFacts: evidence.slice(0, 4),
    documentSignals: [
      `Tip detectat: ${deliverableKind.label}`,
      deliverableKind.signals.length > 0 ? `Semnale tip: ${deliverableKind.signals.join(', ')}` : '',
      ...request.deliverables.flatMap((deliverable) => [
        deliverable.documentTitle ? `Titlu: ${deliverable.documentTitle}` : '',
        deliverable.deliverableType ? `Tip: ${deliverable.deliverableType}` : '',
        deliverable.eligibilitySummary ? `Eligibilitate: ${deliverable.eligibilitySummary}` : '',
      ]),
    ].filter(Boolean).slice(0, 8),
    unsupportedGaps: evidence.length === 0
      ? ['Nu exista suficiente propozitii extrase din livrabil pentru interpretare aprofundata.']
      : [],
  };
}

function fallbackDescription(request: ActivityAgentRequest) {
  if (isMeetingMinuteRequest(request)) {
    return buildMeetingMinuteFallbackDescription(request);
  }

  const activity = request.activityName || request.title || 'activitatea raportata';
  const sa = request.saCode ? ` pentru ${request.saCode}` : '';
  const evidence = extractFallbackEvidence(request);
  const currentDescription = firstPersonCurrentDescription(request);
  const factualContext = evidence.length > 0
    ? `Am analizat si sintetizat elementele factuale disponibile privind ${evidence.slice(0, 3).join(' ')}`
    : `Am analizat informatiile disponibile si am formulat o descriere prudenta a activitatii de ${activity}.`;
  const result = `Activitatea a contribuit la documentarea si fundamentarea rezultatelor aferente${sa}, prin structurarea unei descrieri coerente si relevante pentru raportarea tehnica a proiectului.`;

  return cleanFinalDescription([
    currentDescription || `Am realizat activitati de ${activity}.`,
    factualContext,
    result,
  ].filter(Boolean).join(' '), request);
}

function selectDisplaySafeDescription(generatedDescription: string, request: ActivityAgentRequest, factSheet?: Awaited<ReturnType<typeof createActivityAgentToolContext>>['factSheet']) {
  const generatedQuality = evaluateFinalActivityDescription(generatedDescription, request, factSheet);
  const shouldUseFallback = generatedQuality.evidenceSupport.score < 0.55
    || !hasFirstPersonSingularDescription(generatedDescription)
    || hasRawDeliverableLeak(generatedDescription)
    || hasRepeatedSentenceContent(generatedDescription)
    || generatedQuality.evidenceSupport.unsupportedNumbers.length > 0
    || generatedQuality.evidenceSupport.unsupportedRiskyClaims.length > 0
    || generatedQuality.evidenceSupport.unsupportedTerms.length >= 8;
  if (!shouldUseFallback) {
    return {
      description: generatedDescription,
      quality: generatedQuality,
      warnings: generatedQuality.warnings,
      replaced: false,
    };
  }

  const fallback = fallbackDescription(request);
  const fallbackQuality = evaluateFinalActivityDescription(fallback, request, factSheet);
  const hasEvidenceGroundingIssue = generatedQuality.evidenceSupport.score < 0.55
    || generatedQuality.evidenceSupport.unsupportedNumbers.length > 0
    || generatedQuality.evidenceSupport.unsupportedRiskyClaims.length > 0
    || generatedQuality.evidenceSupport.unsupportedTerms.length >= 8;
  return {
    description: fallback,
    quality: fallbackQuality,
    warnings: uniqueMessages([
      ...generatedQuality.warnings,
      !hasFirstPersonSingularDescription(generatedDescription)
        ? 'Descrierea generata initial a fost inlocuita deoarece nu respecta persoana I singular.'
        : '',
      hasEvidenceGroundingIssue
        ? 'Descrierea generata initial a fost inlocuita cu fallback prudent deoarece continea teme sau cifre nesustinute de date.'
        : '',
      ...fallbackQuality.warnings,
    ]),
    replaced: true,
  };
}

function buildActivityAgentValidation(
  description: string,
  request: ActivityAgentRequest,
  context: Awaited<ReturnType<typeof createActivityAgentToolContext>>,
  replacedDescription: boolean,
) {
  const quality = evaluateFinalActivityDescription(description, request, context.factSheet);
  const unsupportedClaims = uniqueMessages([
    ...quality.evidenceSupport.unsupportedRiskyClaims,
    ...quality.evidenceSupport.unsupportedNumbers.map((value) => `cifra nesustinuta: ${value}`),
  ]);
  const administrativeIssues = uniqueMessages([
    context.hours.valid ? '' : [...context.hours.errors, ...context.hours.warnings].join(' '),
    context.classification.confidence >= 0.55 ? '' : context.classification.justification,
    context.saPurpose.found ? '' : context.saPurpose.warnings.join(' '),
  ]);

  return {
    hoursOk: context.hours.valid,
    datesOk: (request.selectedDates?.length ?? 0) > 0 || Boolean(request.date),
    saOk: context.classification.confidence >= 0.55,
    deliverablesOk: request.deliverables.length === 0
      ? null
      : request.deliverables.some((deliverable) => deliverable.extractedText?.trim()),
    unsupportedClaims,
    administrativeIssues,
    canUseDescription: unsupportedClaims.length === 0 && !replacedDescription && quality.score >= 0.55,
    warnings: uniqueMessages([
      ...quality.warnings,
      replacedDescription ? 'Descrierea initiala a fost inlocuita cu fallback prudent; raportarea nu este blocata.' : '',
    ]),
  };
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
  finalDescription?: string,
) {
  const hasDeliverableText = request.deliverables.some((deliverable) => deliverable.extractedText?.trim());
  const ragChunks = context.approvedReports.chunks.length;
  const deliverableKind = classifyDeliverableKind(request);
  const descriptionQuality = finalDescription
    ? evaluateFinalActivityDescription(finalDescription, request, context.factSheet)
    : null;
  const targetImpactScore = context.targetGroupImpact.impactType === 'direct'
    ? 0.9
    : context.targetGroupImpact.impactType === 'indirect'
      ? 0.7
      : context.targetGroupImpact.impactType === 'none'
        ? 0.15
        : 0.35;

  return [
    ...(descriptionQuality ? [{
      id: 'annex10-description-quality',
      label: 'Calitate text Anexa 10',
      score: descriptionQuality.score,
      reason: descriptionQuality.warnings.length > 0
        ? descriptionQuality.warnings.slice(0, 2).join(' ')
        : 'Descrierea respecta structura de baza: data, persoana I, obiect concret si rezultat pentru proiect.',
      evidence: descriptionQuality.evidence,
    }] : []),
    ...(descriptionQuality ? [{
      id: 'evidence-grounding',
      label: 'Sustinere in livrabil/context',
      score: descriptionQuality.evidenceSupport.score,
      reason: descriptionQuality.evidenceSupport.warnings.length > 0
        ? descriptionQuality.evidenceSupport.warnings.slice(0, 2).join(' ')
        : 'Termenii si cifrele din descriere sunt sustinute de datele disponibile.',
      evidence: descriptionQuality.evidenceSupport.evidence,
    }] : []),
    {
      id: 'deliverable-kind',
      label: 'Tip livrabil detectat',
      score: deliverableKind.confidence,
      reason: deliverableKind.kind === 'unknown'
        ? 'Tipul livrabilului nu a putut fi clasificat clar din titlu, tip si text extras.'
        : `Livrabilul pare a fi: ${deliverableKind.label}.`,
      evidence: deliverableKind.signals,
    },
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

  const description = fallbackDescription(request);
  const fallbackFactSheet = buildActivityFactSheetValue({
    request,
    deliverableInspection: inspectDeliverablesValue(request.deliverables),
  });
  const descriptionQuality = evaluateFinalActivityDescription(description, request, fallbackFactSheet);
  const deliverableKind = classifyDeliverableKind(request);
  const validation = {
    hoursOk: null,
    datesOk: (request.selectedDates?.length ?? 0) > 0 || Boolean(request.date),
    saOk: request.saCode ? true : null,
    deliverablesOk: request.deliverables.length === 0
      ? null
      : request.deliverables.some((deliverable) => deliverable.extractedText?.trim()),
    unsupportedClaims: uniqueMessages([
      ...descriptionQuality.evidenceSupport.unsupportedRiskyClaims,
      ...descriptionQuality.evidenceSupport.unsupportedNumbers.map((value) => `cifra nesustinuta: ${value}`),
    ]),
    administrativeIssues: [],
    canUseDescription: false,
    warnings: uniqueMessages([
      ...descriptionQuality.warnings,
      'Fallback prudent returnat fara blocarea raportarii.',
    ]),
  };

  return {
    description,
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
        id: 'annex10-description-quality',
        label: 'Calitate text Anexa 10',
        score: descriptionQuality.score,
        reason: descriptionQuality.warnings.length > 0
          ? descriptionQuality.warnings.slice(0, 2).join(' ')
          : 'Descrierea respecta structura de baza pentru Anexa 10.',
        evidence: descriptionQuality.evidence,
      },
      {
        id: 'evidence-grounding',
        label: 'Sustinere in livrabil/context',
        score: descriptionQuality.evidenceSupport.score,
        reason: descriptionQuality.evidenceSupport.warnings.length > 0
          ? descriptionQuality.evidenceSupport.warnings.slice(0, 2).join(' ')
          : 'Termenii si cifrele din descriere sunt sustinute de datele disponibile.',
        evidence: descriptionQuality.evidenceSupport.evidence,
      },
      {
        id: 'deliverable-kind',
        label: 'Tip livrabil detectat',
        score: deliverableKind.confidence,
        reason: deliverableKind.kind === 'unknown'
          ? 'Tipul livrabilului nu a putut fi clasificat clar din datele disponibile.'
          : `Livrabilul pare a fi: ${deliverableKind.label}.`,
        evidence: deliverableKind.signals,
      },
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
      ...descriptionQuality.warnings,
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
    factSheet: fallbackFactSheet,
    validation,
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
    prompt: buildActivityAgentPrompt(request, context.factSheet),
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1800,
    output: Output.object({ schema: activityAgentGenerationSchema }),
  });
  const generated = activityAgentGenerationSchema.parse(result.output);
  const safeDescription = selectDisplaySafeDescription(cleanFinalDescription(generated.description, request), request, context.factSheet);
  const description = safeDescription.description;
  const descriptionQuality = safeDescription.quality;
  const validation = buildActivityAgentValidation(description, request, context, safeDescription.replaced);
  const changedSelectedActivity = false;
  const warnings = uniqueMessages([
    ...generated.warnings,
    ...safeDescription.warnings,
    ...context.approvedReports.warnings,
    ...context.saPurpose.warnings,
    ...context.deliverableInspection.warnings,
    ...context.hours.warnings,
    ...context.hours.errors,
    ...context.targetGroupImpact.warnings,
    ...context.classification.warnings,
    ...context.expertAiInstructions.warnings,
    ...validation.warnings,
    ...validation.unsupportedClaims.map((claim) => `Afirmatie nesustinuta eliminata sau marcata pentru verificare: ${claim}`),
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
    explainableScores: mergeExplainableScores([], buildDeterministicExplainableScores(request, context, changedSelectedActivity, description)),
    confidence: context.classification.confidence >= 0.75 && descriptionQuality.score >= 0.75 && warnings.length === 0
      ? 'high'
      : context.classification.confidence >= 0.55 && descriptionQuality.score >= 0.55
        ? 'medium'
        : 'low',
    requiresPmReview: warnings.length > 0 || !validation.canUseDescription || context.classification.confidence < 0.55 || descriptionQuality.score < 0.55,
    checks: {
      jobDescriptionAligned: null,
      saPurposeFound: context.saPurpose.found,
      subactivityAligned: context.classification.confidence >= 0.55,
      deliverableSupported: request.deliverables.length > 0 && request.deliverables.some((deliverable) => deliverable.extractedText?.trim()),
      hoursPlausible: context.hours.valid,
      targetGroupImpactSupported: context.targetGroupImpact.impactType !== 'unclear',
    },
    factSheet: context.factSheet,
    validation,
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
