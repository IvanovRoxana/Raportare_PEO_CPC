import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDocument } from '../lib/procurement-evaluation/classification.ts';
import { LEARNING_HUB_COURSE_PROFILES } from '../lib/procurement-evaluation/courses.ts';
import { assessCourseRelevance, calculateOnlineYearsFromIntervals, calculateYearsFromIntervals, finalizeExpertCourseMapping, mergeOverlappingIntervals } from '../lib/procurement-evaluation/experience.ts';
import { deriveExpertsFromDocuments } from '../lib/procurement-evaluation/expert-extraction.ts';
import { buildProcurementEvaluationWorkbookRows, PROCUREMENT_EVALUATION_EXPORT_SHEETS } from '../lib/procurement-evaluation/export.ts';
import { createLearningHubEvaluationSeed } from '../lib/procurement-evaluation/sample.ts';
import { calculatePriceScore, calculateScoring, rankScoringResults, scoreCoordinatorYears, scoreOnlineYears, scoreTrainerYears } from '../lib/procurement-evaluation/scoring.ts';
import { detectEmbeddedSignature } from '../lib/procurement-evaluation/signature-detection.ts';
import type { DocumentClassification, OfferPackageDocumentInput } from '../lib/procurement-evaluation/types.ts';
import { validateClassifiedDocuments, validateDocumentSignatures } from '../lib/procurement-evaluation/validation.ts';

test('clasifică determinist formularele și marchează necunoscutele pentru review', () => {
  const f6 = classifyDocument({
    id: 'doc-1',
    originalPath: 'Oferta/Formularele/FORMULARUL NR. 6 - LISTA EXPERTILOR.pdf',
    normalizedFilename: 'formularul nr 6 lista expertilor pdf',
    extractedText: '',
  });
  const unknown = classifyDocument({
    id: 'doc-2',
    originalPath: 'Oferta/anexa-diverse.bin',
    normalizedFilename: 'anexa diverse bin',
    extractedText: 'continut fara semnale',
  });

  assert.equal(f6.docType, 'FORMULAR_6');
  assert.equal(f6.reviewRequired, false);
  assert.equal(unknown.docType, 'NECLASIFICAT');
  assert.equal(unknown.reviewRequired, true);
});

test('unește intervalele suprapuse și calculează separat anii online dovediți', () => {
  const intervals = [
    { startDate: '2020-01-01', endDate: '2020-12-31', onlineDelivery: true },
    { startDate: '2020-06-01', endDate: '2021-05-31', onlineDelivery: true },
    { startDate: '2022-01-01', endDate: '2022-12-31', onlineDelivery: false },
  ];

  assert.equal(mergeOverlappingIntervals(intervals).length, 2);
  assert.equal(calculateYearsFromIntervals(intervals), 2.41);
  assert.equal(calculateOnlineYearsFromIntervals(intervals), 1.42);
});

test('decide relevanța cursului pe baza dovezilor, nu doar a CV-ului', () => {
  const profile = LEARNING_HUB_COURSE_PROFILES.find((course) => course.courseId === 'C06');
  assert.ok(profile);

  const relevant = assessCourseRelevance({
    profile,
    evidenceText: 'Adeverință pentru formare în transformare digitală, instrumente AI și automatizare procese.',
    cvText: 'Expert în competențe digitale.',
  });
  const cvOnly = assessCourseRelevance({
    profile,
    evidenceText: 'Adeverință generală pentru cursuri de comunicare.',
    cvText: 'CV: transformare digitală și inteligență artificială.',
  });

  assert.equal(relevant.relevance, 'ridicata');
  assert.equal(cvOnly.relevance, 'review');
});

test('marchează gap declarat vs dovedit și nu selectează la scoring mapări insuficient dovedite', () => {
  const mapping = finalizeExpertCourseMapping({
    id: 'm1',
    supplierId: 's1',
    supplierName: 'Ofertant',
    expertId: 'e1',
    expertName: 'Expert',
    role: 'FORMATOR',
    courseId: 'C01',
    courseName: 'Curs',
    courseKeywords: ['guvernanță'],
    yearsClaimedF6: 6,
    yearsClaimedCv: 5,
    yearsProvenGeneral: 3.5,
    yearsOnlineClaimed: 2,
    yearsOnlineProven: 1.2,
    supportDocumentIds: ['doc-a'],
    cvMatchesEvidence: 'Neverificat',
    f6MatchesEvidence: 'Neverificat',
    courseRelevance: 'medie',
    keywordMatchScore: 0.3,
    declaredVsProvenGap: 0,
    eligibilityDecision: 'Neverificat',
    selectedForScoring: true,
    confidence: 0.65,
  });

  assert.equal(mapping.declaredVsProvenGap, 2.5);
  assert.equal(mapping.eligibilityDecision, 'Review');
  assert.equal(mapping.selectedForScoring, false);
});

test('calculează CT1, CT2, CT3 și punctaj financiar conform grilei', () => {
  assert.equal(scoreCoordinatorYears(10), 10);
  assert.equal(scoreCoordinatorYears(8), 5);
  assert.equal(scoreTrainerYears(7.2, { bonusDialogSocial: true, bonusCollectiveNegotiation: true }), 7.5);
  assert.equal(scoreTrainerYears(8.1, { bonusDialogSocial: true, bonusCollectiveNegotiation: true }), 7.5);
  assert.equal(scoreOnlineYears(4), 0.625);
  assert.equal(calculatePriceScore(120, 100), 16.67);
});

test('scoringul final este zero pentru oferte cu validări blocante neconforme', () => {
  const result = calculateScoring({
    supplierId: 's1',
    supplierName: 'Ofertant',
    blockingValidationPass: false,
    coordinatorYearsProven: 10,
    mappings: [],
    financialOffer: {
      supplierId: 's1',
      supplierName: 'Ofertant',
      currency: 'RON',
      totalPriceExVat: 100,
      form12Present: true,
      annexPresent: true,
      totalsMatch: true,
      status: 'Conform',
    },
    minimumAdmissiblePrice: 100,
  });

  assert.equal(result.status, 'Neconform');
  assert.equal(result.totalScore, 0);
});

test('validează documentele obligatorii și exportă toate foile standard', () => {
  const validations = validateClassifiedDocuments([
    { documentId: 'doc-opis', docType: 'OPIS', confidence: 0.9, source: 'deterministic', signals: ['opis'], reviewRequired: false },
  ]);
  const snapshot = createLearningHubEvaluationSeed('seed-procurement-045');
  const rows = buildProcurementEvaluationWorkbookRows(snapshot);

  assert.ok(validations.some((validation) => validation.ruleId === 'V001' && validation.status === 'Conform'));
  assert.ok(validations.some((validation) => validation.ruleId === 'V002' && validation.status === 'Neconform'));
  assert.deepEqual(Object.keys(rows), [...PROCUREMENT_EVALUATION_EXPORT_SHEETS]);
});

test('rankingu-ul ordonează ofertele conforme după total și preț', () => {
  const ranked = rankScoringResults([
    { supplierId: 's1', supplierName: 'A', blockingValidationPass: true, ct1CoordinatorScore: 0, ct2TrainersScore: 0, ct3OnlineScore: 0, priceExVat: 120, priceScore: 20, totalScore: 90, status: 'Conform' },
    { supplierId: 's2', supplierName: 'B', blockingValidationPass: true, ct1CoordinatorScore: 0, ct2TrainersScore: 0, ct3OnlineScore: 0, priceExVat: 100, priceScore: 20, totalScore: 90, status: 'Conform' },
  ]);

  assert.equal(ranked[0].supplierId, 's2');
  assert.equal(ranked[0].rank, 1);
});

test('detectează markeri locali de semnătură și cere validare calificată externă', () => {
  const signedBytes = new TextEncoder().encode('%PDF-1.7 /ByteRange [0 42 84 126] /SubFilter /adbe.pkcs7.detached');
  const detection = detectEmbeddedSignature(signedBytes, 'oferta_semnata.pdf');
  assert.equal(detection.signaturePresent, true);
  assert.equal(detection.status, 'review');

  const validations = validateDocumentSignatures([
    {
      id: 'doc-signed',
      procurementProjectId: 'ACH-045',
      supplierId: 's1',
      supplierName: 'Ofertant',
      packageId: 'pkg-1',
      originalPath: 'oferta_semnata.pdf',
      normalizedFilename: 'oferta semnata pdf',
      extension: 'pdf',
      importedAt: '2026-05-27T00:00:00.000Z',
      signaturePresent: true,
      qualifiedSignatureStatus: 'not_configured',
    },
  ]);

  assert.ok(validations.some((validation) => validation.ruleId === 'V003' && validation.status === 'Conform'));
  assert.ok(validations.some((validation) => validation.ruleId === 'V003Q' && validation.status === 'Review'));
});

test('extrage experți și mapări relevante din CV, Formular 6 și dovezi suport', () => {
  const documents: OfferPackageDocumentInput[] = [
    {
      id: 'doc-cv',
      procurementProjectId: 'ACH-045',
      supplierId: 's1',
      supplierName: 'Ofertant',
      packageId: 'pkg-1',
      originalPath: 'CV_Ana_Popescu.pdf',
      normalizedFilename: 'cv ana popescu pdf',
      extension: 'pdf',
      importedAt: '2026-05-27T00:00:00.000Z',
      extractedText: 'Nume expert: Ana Popescu. Formator cu 6 ani experiență în transformare digitală și inteligență artificială.',
    },
    {
      id: 'doc-f6',
      procurementProjectId: 'ACH-045',
      supplierId: 's1',
      supplierName: 'Ofertant',
      packageId: 'pkg-1',
      originalPath: 'Formular_6_lista_experti.pdf',
      normalizedFilename: 'formular 6 lista experti pdf',
      extension: 'pdf',
      importedAt: '2026-05-27T00:00:00.000Z',
      extractedText: 'Ana Popescu - formator - 6 ani experiență declarată.',
    },
    {
      id: 'doc-adv',
      procurementProjectId: 'ACH-045',
      supplierId: 's1',
      supplierName: 'Ofertant',
      packageId: 'pkg-1',
      originalPath: 'Adeverinta_Ana_Popescu_AI.pdf',
      normalizedFilename: 'adeverinta ana popescu ai pdf',
      extension: 'pdf',
      importedAt: '2026-05-27T00:00:00.000Z',
      extractedText: 'Adeverință Ana Popescu: cursuri online pe platformă e-learning despre transformare digitală, inteligență artificială, automatizare și instrumente AI, în perioada 01.01.2020 - 31.12.2023.',
    },
  ];
  const classifications: DocumentClassification[] = [
    { documentId: 'doc-cv', docType: 'CV', confidence: 0.95, source: 'deterministic', signals: ['cv'], reviewRequired: false },
    { documentId: 'doc-f6', docType: 'FORMULAR_6', confidence: 0.95, source: 'deterministic', signals: ['formular 6'], reviewRequired: false },
    { documentId: 'doc-adv', docType: 'ADEVERINTA', confidence: 0.95, source: 'deterministic', signals: ['adeverinta'], reviewRequired: false },
  ];

  const extracted = deriveExpertsFromDocuments(documents, classifications);
  const digitalMapping = extracted.mappings.find((mapping) => mapping.expertName === 'Ana Popescu' && mapping.courseId === 'C06');

  assert.equal(extracted.experts[0].expertName, 'Ana Popescu');
  assert.ok(digitalMapping);
  assert.equal(digitalMapping.courseRelevance, 'ridicata');
  assert.equal(digitalMapping.supportDocumentIds.includes('doc-adv'), true);
  assert.ok(digitalMapping.yearsProvenGeneral >= 3.9);
});
