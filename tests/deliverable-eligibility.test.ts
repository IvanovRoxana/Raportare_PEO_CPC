import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNonConclusiveAiFailure,
  CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES,
  deliverableEligibilityAiSchema,
  deliverableEligibilitySchema,
  normalizeDeliverableEligibilityAiOutput,
  protectConcordiaPublicationEligibility,
  validateEligibilitySuggestedSettings,
} from '../lib/deliverable-eligibility.ts';

const activityCatalogCandidates = [
  {
    id: 'cat-1',
    saCode: 'SA3.4',
    activityName: 'Elaborare materiale suport eveniment',
    description: 'Materiale de prezentare si suport pentru evenimente.',
  },
  {
    id: 'cat-2',
    saCode: 'SA3.4',
    activityName: 'Intalnire cu reprezentanti membri',
    description: 'Intalniri si consultari cu reprezentanti ai membrilor.',
  },
];

const deliverableOptions = [
  'Material prezentare / suport eveniment',
  'Minute intalnire / MOM',
];

test('accepta sugestii de activitate si tip livrabil cand exista in listele permise', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-2',
      saCode: 'SA3.4',
      activityName: 'Intalnire cu reprezentanti membri',
      deliverableType: 'Minute intalnire / MOM',
      confidence: 'high',
      reason: 'Documentul este o minuta de intalnire, nu un material de prezentare.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.deepEqual(suggestion?.changes, ['activity', 'deliverableType']);
  assert.equal(suggestion?.selectedActivityId, 'cat-2');
  assert.equal(suggestion?.deliverableType, 'Minute intalnire / MOM');
});

test('elimina sugestiile care inventeaza activitati sau tipuri de livrabil', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-x',
      saCode: 'SA9.9',
      activityName: 'Activitate inventata',
      deliverableType: 'Tip inventat',
      confidence: 'medium',
      reason: 'Propunere invalida.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.equal(suggestion, undefined);
});

test('nu pastreaza sugestii identice cu setarile curente', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-1',
      saCode: 'SA3.4',
      activityName: 'Elaborare materiale suport eveniment',
      deliverableType: 'Material prezentare / suport eveniment',
      confidence: 'low',
      reason: 'Nu schimba nimic.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.equal(suggestion, undefined);
});

test('fallbackul pentru esec AI ramane raspuns neconcludent controlat', () => {
  const fallback = buildNonConclusiveAiFailure('schema response failed');

  assert.equal(fallback.status, 'neconcludent');
  assert.equal(fallback.score, 0);
  assert.equal(fallback.suggestedSettings, null);
  assert.match(fallback.summary, /nu a putut fi finalizata/);
  assert.match(fallback.riskFlags.join('\n'), /schema response failed/);
});

test('promptul trateaza printurile Concordia cu sursa initiala profit.ro ca dovada de publicare', () => {
  assert.match(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES, /dovada publicarii\/republicarii pe site-ul Concordia/);
  assert.match(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES, /minimum doua indicii concordante/);
  assert.match(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES, /URL-ul nu este vizibil/);
  assert.match(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES, /profit\.ro/);
  assert.match(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES, /nu include "dovada publicarii pe concordia\.ro" in missingElements/);
});

test('nu respinge articol Concordia Daniel Apostol doar pentru mentiunea publicarii initiale pe profit.ro', () => {
  const protectedResult = protectConcordiaPublicationEligibility({
    deliverableType: 'Articole pe concordia.ro',
    documentTitle: 'Daniel Apostol, FPE: Factura ascunsa a investitiilor amanate',
    fileName: 'Daniel Apostol, FPE_Factura ascunsa a investitiilor amanate - Confederatia Patronala Concordia.pdf',
    extractedText: [
      'Confederatia Patronala Concordia',
      'Despre Dialog social Programe Activitate Aderare',
      'OPINII',
      'Daniel Apostol, FPE: Factura ascunsa a investitiilor amanate',
      '15/07/2026',
      'Autor: Daniel Apostol',
      'Aceasta opinie a fost publicata initial pe profit.ro.',
      'Footer Concordia. Proiect cofinantat de Uniunea Europeana. Contact.',
    ].join('\n'),
    result: {
      status: 'neeligibil',
      score: 35,
      summary: 'Documentul nu contine dovada publicarii pe concordia.ro deoarece mentioneaza profit.ro si nu are URL vizibil.',
      checks: [
        {
          criterion: 'Dovada publicarii',
          status: 'fail',
          explanation: 'Lipseste linkul concordia.ro.',
        },
      ],
      missingElements: ['Dovada publicarii pe concordia.ro'],
      recommendations: ['Adauga linkul concordia.ro.'],
      riskFlags: ['URL concordia.ro absent.'],
      suggestedSettings: null,
    },
  });

  assert.notEqual(protectedResult.status, 'neeligibil');
  assert.equal(protectedResult.status, 'eligibil_cu_observatii');
  assert.deepEqual(protectedResult.missingElements, []);
  assert.match(protectedResult.summary, /Dovada publicarii pe Concordia: confirmata/);
});

test('schema AI accepta suggestedSettings null sau campuri nullable', () => {
  const base = {
    status: 'neconcludent',
    score: 0,
    summary: 'Text insuficient.',
    checks: [{ criterion: 'Context', status: 'unknown', explanation: 'Nu exista destul text.' }],
    missingElements: [],
    recommendations: [],
    riskFlags: [],
  };

  assert.equal(deliverableEligibilitySchema.safeParse({ ...base, suggestedSettings: null }).success, true);
  assert.equal(deliverableEligibilitySchema.safeParse({
    ...base,
    suggestedSettings: {
      saCode: null,
      activityName: null,
      selectedActivityId: null,
      deliverableType: 'Minute intalnire / MOM',
      confidence: 'medium',
      reason: 'Documentul seamana cu o minuta.',
      changes: ['deliverableType'],
    },
  }).success, true);
});

test('schema trimisa catre AI foloseste obiect suggestedSettings fara nullable', () => {
  const aiOutput = {
    status: 'neconcludent',
    score: 0,
    summary: 'Text insuficient.',
    checks: [{ criterion: 'Context', status: 'unknown', explanation: 'Nu exista destul text.' }],
    missingElements: [],
    recommendations: [],
    riskFlags: [],
    suggestedSettings: {
      hasSuggestion: false,
      saCode: '',
      activityName: '',
      selectedActivityId: '',
      deliverableType: '',
      confidence: 'low',
      reason: '',
      changes: [],
    },
  };

  const parsed = deliverableEligibilityAiSchema.safeParse(aiOutput);
  assert.equal(parsed.success, true);
  assert.equal(
    parsed.success ? normalizeDeliverableEligibilityAiOutput(parsed.data).suggestedSettings : undefined,
    null,
  );
});
