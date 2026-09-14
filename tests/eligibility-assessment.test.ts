import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEligibilityAssessmentPrompt,
  EligibilityAssessmentInputError,
  finalizeEligibilityAssessment,
  MAX_ELIGIBILITY_ANALYSIS_DOCUMENT_CHARS,
  limitEligibilityDocumentText,
  MAX_ELIGIBILITY_PROMPT_CHARS,
  scopeEligibilityAssessmentCandidates,
  validateEligibilityAssessmentInput,
  type EligibilityAssessmentInput,
} from '../lib/eligibility-assessment.ts';
import type { EligibilityContextResult } from '../lib/rag/eligibility-context.ts';

const documentText = 'La consultarea regionala au participat membrii proiectului. Au fost documentate nevoile beneficiarilor si recomandarile pentru activitatile urmatoare.';
const context: EligibilityContextResult = {
  promptContext: 'Fragmente oficiale ale proiectului, subactivitatii si fisei postului.',
  sources: [
    { documentId: 'project-doc', chunkId: 'project-chunk', sourceType: 'cerere_finantare', coverage: 'project', text: 'Proiectul sustine consultarea membrilor si dezvoltarea capacitatii organizationale.' },
    { documentId: 'sa-doc', chunkId: 'sa-chunk', sourceType: 'scop_sa', coverage: 'subactivity', text: 'Subactivitatea include consultari regionale si documentarea nevoilor beneficiarilor.' },
    { documentId: 'job-doc', chunkId: 'job-chunk', sourceType: 'fisa_post', coverage: 'job_description', text: 'Coordonatorul regional organizeaza consultarile si sintetizeaza recomandarile membrilor.' },
  ],
  coverage: { project: true, subactivity: true, job_description: true },
  missingRequiredSources: [], warnings: [],
};

function input(overrides: Partial<EligibilityAssessmentInput> = {}): EligibilityAssessmentInput {
  return {
    documents: [{ id: 'doc-1', extractedText: documentText, fileName: 'consultare.docx', isPrimary: true, textScope: 'Text integral extras', fileHash: 'hash-1' }],
    candidates: [
      { id: 'same-sa', category: 'cr', saCode: 'SA3.4', activityName: 'Consultare regionala', description: 'Consultari cu membrii.' },
      { id: 'other-sa', category: 'cr', saCode: 'SA3.5', activityName: 'Analiza teritoriala' },
      { id: 'foreign-category', category: 'com', saCode: 'SA3.4', activityName: 'Comunicare publica' },
      { id: 'unscoped-category', saCode: 'SA3.4', activityName: 'Activitate fara categorie' },
    ],
    category: 'cr', saCode: 'SA3.4', projectCode: 'PEO', expertId: 'expert-1',
    selectedActivityId: 'same-sa', classificationMode: 'automatic', ...overrides,
  };
}

function output() {
  return {
    status: 'eligibil' as const, score: 87.5, summary: 'Livrabilul documenteaza activitatea de consultare regionala.',
    checks: [{ criterion: 'Corelarea activitatii', status: 'pass' as const, explanation: 'Consultarile sunt prevazute in documentele oficiale.' }],
    missingElements: [], recommendations: [], riskFlags: [],
    suggestedSettings: { hasSuggestion: false, saCode: '', activityName: '', selectedActivityId: '', deliverableType: '', confidence: 'high' as const, reason: '', changes: [] as Array<'activity' | 'deliverableType'> },
    classification: { activityId: 'same-sa', confidence: 'high' as 'high' | 'medium' | 'low', reason: 'Documentul sustine consultarile regionale.', alternatives: [] as Array<{ activityId: string; reason: string }> },
    documentSummaries: [{ id: 'doc-1', summary: 'Consultarea a documentat nevoile membrilor si recomandarile lor.', evidence: ['La consultarea regionala au participat membrii proiectului.'] }],
    sourceEvidence: context.sources.map((source) => ({ chunkId: source.chunkId, quote: source.text, criterion: source.coverage })),
  };
}

test('positive verdicts without explained criteria or with failed criteria cannot approve', () => {
  const empty = output();
  empty.checks = [];
  assert.equal(finalizeEligibilityAssessment(input(), context, empty).status, 'neconcludent');
  const failed = { ...output(), checks: [{ criterion: 'Fisa postului', status: 'fail', explanation: 'Atributia nu este prevazuta.' }] };
  const result = finalizeEligibilityAssessment(input(), context, failed);
  assert.equal(result.status, 'neconcludent');
  assert.equal(result.classification.autoApply, true);
  assert.equal(result.score, failed.score);
});

test('a clearly classified ineligible deliverable is assigned without approving eligibility', () => {
  const raw = { ...output(), status: 'neeligibil', score: 24,
    checks: [{ criterion: 'Rezultatul cerut', status: 'fail', explanation: 'Documentul identifica activitatea, dar lipseste rezultatul cerut.' }] };
  const result = finalizeEligibilityAssessment(input(), context, raw);
  assert.equal(result.classification.autoApply, true);
  assert.equal(result.classification.activityId, 'same-sa');
  assert.equal(result.status, 'neeligibil');
  assert.equal(result.score, 24);
});

test('missing official sources block eligibility but preserve supported catalog classification', () => {
  const incompleteContext = { ...context, sources: [], coverage: { project: false, subactivity: false, job_description: false },
    missingRequiredSources: ['project', 'subactivity', 'job_description'] as EligibilityContextResult['missingRequiredSources'] };
  const result = finalizeEligibilityAssessment(input({ catalogSource: 'backend' }), incompleteContext, output());
  assert.equal(result.classification.autoApply, true);
  assert.equal(result.status, 'neconcludent');
  assert.equal(result.sourceEvidence.length, 0);
  assert.equal(result.fallbackFlags.length, 3);
});

test('catalog failures, unverified document summaries, or missing rationale cannot assign activity', () => {
  assert.equal(finalizeEligibilityAssessment(input({ catalogWarnings: ['Catalog indisponibil'] }), context, output()).classification.autoApply, false);
  const noSummary = { ...output(), documentSummaries: [] };
  assert.equal(finalizeEligibilityAssessment(input(), context, noSummary).classification.autoApply, false);
  const noReason = output();
  noReason.classification.reason = ' ';
  assert.equal(finalizeEligibilityAssessment(input(), context, noReason).classification.autoApply, false);
});

test('medium-confidence automatic classification remains visible and requires applying the candidate', () => {
  const modelResult = output();
  modelResult.classification.confidence = 'medium';
  const result = finalizeEligibilityAssessment(input({ selectedActivityId: undefined }), context, modelResult);
  assert.equal(result.status, 'eligibil');
  assert.equal(result.classification.activityId, 'same-sa');
  assert.equal(result.classification.autoApply, false);
  assert.equal(result.classification.requiresSaConfirmation, false);
  assert.equal(result.suggestedSettings?.selectedActivityId, 'same-sa');
  assert.deepEqual(result.suggestedSettings?.changes, ['activity']);
});

test('unknown extraction completeness and reference fallback never produce automatic approval', () => {
  const partial = input();
  partial.documents[0].textScope = 'Text partial / completitudine necunoscuta';
  assert.equal(finalizeEligibilityAssessment(partial, context, output()).status, 'neconcludent');
  assert.equal(finalizeEligibilityAssessment(input({ catalogSource: 'reference_fallback' }), context, output()).classification.autoApply, false);
});

test('assessment prompt retains the exact full document including content after 12000 characters', () => {
  const fullText = `${'Introducere si dovezi. '.repeat(800)}FINAL_UNIC_18342: recomandarile participantilor sunt documentate aici.`;
  const request = input({ documents: [{ id: 'doc-long', extractedText: fullText }] });
  const built = buildEligibilityAssessmentPrompt(request, context);
  const prompt = JSON.parse(built.prompt);
  assert.ok(fullText.length > 12000);
  assert.equal(prompt.documents[0].extractedText, fullText);
  assert.match(built.prompt, /FINAL_UNIC_18342/);
  assert.match(built.system, /nu din potrivirea de cuvinte sau titluri/);
});

test('oversized document text is explicitly limited before evaluation while full prompt limits remain enforced', () => {
  const oversized = 'x'.repeat(MAX_ELIGIBILITY_ANALYSIS_DOCUMENT_CHARS + 1);
  assert.equal(limitEligibilityDocumentText(oversized).length, MAX_ELIGIBILITY_ANALYSIS_DOCUMENT_CHARS);
  assert.doesNotThrow(() => buildEligibilityAssessmentPrompt(input({ documents: [
    { id: 'too-long', extractedText: limitEligibilityDocumentText(oversized), textScope: 'Primele 18000 caractere analizate; restul documentului nu a fost transmis evaluatorului.' },
  ] }), context));
  assert.throws(() => buildEligibilityAssessmentPrompt(input({ rulesContext: 'r'.repeat(MAX_ELIGIBILITY_PROMPT_CHARS) }), context), /nu a fost trunchiat/);
});

test('candidate scope admits category aliases and excludes foreign or unscoped catalog entries', () => {
  const scoped = scopeEligibilityAssessmentCandidates(input({ category: 'centre regionale' }));
  assert.deepEqual(scoped.map((candidate) => candidate.id), ['same-sa', 'other-sa']);
  const prompt = JSON.parse(buildEligibilityAssessmentPrompt(input(), context).prompt);
  assert.deepEqual(prompt.activitiesInSelectedSa.map((candidate: { id: string }) => candidate.id), ['same-sa']);
  assert.deepEqual(prompt.alternativeActivitiesInOtherAllowedSa.map((candidate: { id: string }) => candidate.id), ['other-sa']);
  assert.throws(() => validateEligibilityAssessmentInput(input({ category: 'ap' })), /nu contine activitati permise/);
});

test('same-SA automatic classification is applicable and preserves the exact LLM score', () => {
  const result = finalizeEligibilityAssessment(input(), context, output());
  assert.equal(result.status, 'eligibil');
  assert.equal(result.classification.activityId, 'same-sa');
  assert.equal(result.classification.autoApply, true);
  assert.equal(result.classification.requiresSaConfirmation, false);
  assert.equal(result.score, 87.5);
  assert.equal(result.aiScore, 87.5);
  assert.equal(result.normalizedScore, 87.5);
  assert.equal(result.documentSummaries[0].extractedTextLength, documentText.length);
});

test('another allowed SA always requires confirmation and reevaluation before eligibility approval', () => {
  const raw = output();
  raw.classification.activityId = 'other-sa';
  const result = finalizeEligibilityAssessment(input(), context, raw);
  assert.equal(result.classification.autoApply, false);
  assert.equal(result.classification.requiresSaConfirmation, true);
  assert.equal(result.status, 'neconcludent');
  assert.equal(result.suggestedSettings?.selectedActivityId, 'other-sa');
  assert.equal(result.suggestedSettings?.saCode, 'SA3.5');
  assert.equal(result.score, 87.5);
});

test('manual choice is never automatically replaced by the model', () => {
  const request = input({ classificationMode: 'manual' });
  const matching = finalizeEligibilityAssessment(request, context, output());
  assert.equal(matching.classification.activityId, 'same-sa');
  assert.equal(matching.classification.autoApply, false);
  const raw = output();
  raw.classification.activityId = 'other-sa';
  const conflicting = finalizeEligibilityAssessment(request, context, raw);
  assert.equal(conflicting.classification.autoApply, false);
  assert.notEqual(conflicting.classification.activityId, 'other-sa');
  assert.equal(conflicting.status, 'neconcludent');
  assert.throws(() => validateEligibilityAssessmentInput(input({ classificationMode: 'manual', selectedActivityId: 'foreign-category' })), /corectata manual/);
});

test('invented or foreign-category activity IDs cannot approve or apply an assessment', () => {
  for (const activityId of ['invented-activity', 'foreign-category', 'unscoped-category']) {
    const raw = output();
    raw.classification.activityId = activityId;
    const result = finalizeEligibilityAssessment(input(), context, raw);
    assert.equal(result.status, 'neconcludent');
    assert.equal(result.classification.autoApply, false);
    assert.equal(result.classification.activityId, '');
  }
});

test('invented source IDs and fabricated quotes are discarded and cannot support approval', () => {
  for (const kind of ['chunk-id', 'quote']) {
    const raw = output();
    if (kind === 'chunk-id') raw.sourceEvidence[2].chunkId = 'invented-job-source';
    else raw.sourceEvidence[2].quote = 'Fisa postului confirma orice document incarcat de expert.';
    const result = finalizeEligibilityAssessment(input(), context, raw);
    assert.equal(result.status, 'neconcludent');
    assert.equal(result.sourceEvidence.length, 2);
    assert.match(result.summary, /citate verificabile/);
  }
});

test('missing official documents cannot be concealed by otherwise valid model citations', () => {
  const result = finalizeEligibilityAssessment(input(), { ...context, missingRequiredSources: ['job_description'], coverage: { ...context.coverage, job_description: false } }, output());
  assert.equal(result.status, 'neconcludent');
  assert.match(result.summary, /Lipseste sursa oficiala: job_description/);
  assert.ok(result.fallbackFlags.includes('missing_job_description'));
});

test('low classification confidence and missing document summaries cannot approve', () => {
  const uncertain = output();
  uncertain.classification.confidence = 'low';
  const lowResult = finalizeEligibilityAssessment(input(), context, uncertain);
  assert.equal(lowResult.status, 'neconcludent');
  assert.equal(lowResult.classification.autoApply, false);
  const missingSummary = output();
  missingSummary.documentSummaries = [];
  assert.equal(finalizeEligibilityAssessment(input(), context, missingSummary).status, 'neconcludent');
});

test('summary evidence is validated against its own original document and unknown summary IDs are omitted', () => {
  const raw = output();
  raw.documentSummaries[0].evidence.push('Acest citat inventat nu exista in document.');
  raw.documentSummaries.push({ id: 'unknown-doc', summary: 'Document inexistent.', evidence: [documentText] });
  const result = finalizeEligibilityAssessment(input(), context, raw);
  assert.equal(result.documentSummaries.length, 1);
  assert.deepEqual(result.documentSummaries[0].evidence, ['La consultarea regionala au participat membrii proiectului.']);
  assert.equal(result.documentSummaries[0].fileHash, 'hash-1');
});

test('a document summary without any valid original-document evidence cannot support approval', () => {
  for (const evidence of [[], ['Citat fabricat care nu se regaseste in textul livrabilului.']]) {
    const raw = output();
    raw.documentSummaries[0].evidence = evidence;
    const result = finalizeEligibilityAssessment(input(), context, raw);
    assert.equal(result.status, 'neconcludent');
  }
});

test('hallucinated activity and deliverable suggestions are removed even when classification is valid', () => {
  const raw = output();
  raw.suggestedSettings = {
    hasSuggestion: true, saCode: 'SA99', activityName: 'Activitate inventata',
    selectedActivityId: 'invented-id', deliverableType: 'Tip inventat', confidence: 'high', reason: 'Propunere model',
    changes: ['activity', 'deliverableType'],
  };
  const result = finalizeEligibilityAssessment(input({ deliverableOptions: ['Minute intalnire'] }), context, raw);
  assert.notEqual(result.suggestedSettings?.selectedActivityId, 'invented-id');
  assert.notEqual(result.suggestedSettings?.deliverableType, 'Tip inventat');
});

test('partial or unknown text completeness cannot classify or approve, including Romanian diacritics', () => {
  for (const textScope of [undefined, '', 'Prima pagina', 'Numai prima pagină', 'Inceputul documentului']) {
    const request = input({ documents: [{ ...input().documents[0], textScope }] });
    const result = finalizeEligibilityAssessment(request, context, output());
    assert.equal(result.status, 'neconcludent');
    assert.equal(result.classification.autoApply, false);
    assert.ok(result.fallbackFlags.includes('partial_document_text'));
  }
});
