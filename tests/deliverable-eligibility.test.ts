import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildDeliverableEligibilitySemanticAudit,
  buildNonConclusiveAiFailure,
  CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES,
  DEFAULT_ELIGIBILITY_RULE_VERSION_ID,
  deliverableEligibilityAiSchema,
  deliverableEligibilitySchema,
  hasSufficientDeliverableEvidenceForEligibility,
  isConcordiaPublishedDeliverableType,
  normalizeDeliverableEligibilityAiOutput,
  normalizeDeliverableEligibilityCheck,
  normalizeDeliverableEligibilityDocuments,
  protectConcordiaPublicationEligibility,
  validateEligibilitySuggestedSettings,
} from '../lib/deliverable-eligibility.ts';
import { extractEventDate, type DeliverableSlot } from '../lib/deliverable-types.ts';
import { getDeclaredTitleEligibilityIssue, isReusableEligibilityCheck, isReusableEligibilityCheckForContext } from '../lib/deliverable-check-state.ts';
import { buildEligibilityAssessmentPrompt, validateEligibilityAssessmentInput, type EligibilityAssessmentInput } from '../lib/eligibility-assessment.ts';
import type { EligibilityContextResult } from '../lib/rag/eligibility-context.ts';

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

const assessmentPromptContext: EligibilityContextResult = {
  promptContext: '', sources: [],
  coverage: { project: false, subactivity: false, job_description: false },
  missingRequiredSources: ['project', 'subactivity', 'job_description'], warnings: [],
};

function assessmentPromptInput(deliverableType = 'Analiza acte normative'): EligibilityAssessmentInput {
  return {
    documents: [{ id: 'doc-1', isPrimary: true, deliverableType, extractedText: 'Documentul prezinta analiza informatiilor relevante pentru pregatirea materialelor de suport ale evenimentului.' }],
    candidates: activityCatalogCandidates.map((candidate) => ({ ...candidate, category: 'com' })),
    category: 'com', saCode: 'SA3.4', selectedActivityId: 'cat-1', classificationMode: 'manual',
  };
}
const deliverableItemSource = readFileSync(new URL('../components/expert/deliverable-item.tsx', import.meta.url), 'utf8');
const activityFormSource = readFileSync(new URL('../components/expert/activity-form.tsx', import.meta.url), 'utf8');
const peoPageSource = readFileSync(new URL('../app/expert/peo/page.tsx', import.meta.url), 'utf8');
const eligibilityRouteSource = readFileSync(new URL('../app/api/ai/check-deliverable-eligibility/route.ts', import.meta.url), 'utf8');
const eventReportRouteSource = readFileSync(new URL('../app/api/ai/generate-event-report/route.ts', import.meta.url), 'utf8');
const deliverableTypesSource = readFileSync(new URL('../lib/deliverable-types.ts', import.meta.url), 'utf8');
const titleSuggestionSource = readFileSync(new URL('../lib/title-suggestion.ts', import.meta.url), 'utf8');
const pmDossierModalSource = readFileSync(new URL('../components/pm/dosar-expert-modal.tsx', import.meta.url), 'utf8');
const pmAlertsPanelSource = readFileSync(new URL('../components/pm/pm-alerts-panel.tsx', import.meta.url), 'utf8');
const backendDataHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const amplifyDataResourceSource = readFileSync(new URL('../amplify/data/resource.ts', import.meta.url), 'utf8');

test('UI tolereaza suggestedSettings persistat fara lista changes', () => {
  assert.doesNotMatch(deliverableItemSource, /suggestedSettings\?\.changes\.includes/);
  assert.match(deliverableItemSource, /suggestedSettings\?\.changes\?\.includes\('activity'\)/);
  assert.doesNotMatch(deliverableItemSource, /Aplica tipul livrabilului/);
});

test('formularul pastreaza compatibilitatea tipului salvat fara selector manual de livrabil', () => {
  assert.doesNotMatch(deliverableItemSource, /placeholder="Tip livrabil"/);
  assert.match(deliverableItemSource, /deliverableType: deliverable\.type \|\| deliverable\.deliverableType \|\| deliverable\.slotType/);
  assert.match(deliverableItemSource, /type: settings\.deliverableType,\s*deliverableType: settings\.deliverableType,/);
  assert.match(activityFormSource, /const resolvedDeliverableType = d\.type \|\| d\.deliverableType \|\| d\.slotType/);
  assert.match(activityFormSource, /const resolvedDeliverableCategory = getSavedDeliverableCategory\(d\)/);
  assert.match(activityFormSource, /category: resolvedDeliverableCategory,\s*deliverableType: resolvedDeliverableType,/);
});

test('formularul afiseaza aliasul salvat main ca livrabil principal', () => {
  assert.match(
    activityFormSource,
    /function isMainDeliverableSlot\(deliverable: Pick<DeliverableSlot, 'slotType'>\) \{\s*return !deliverable\.slotType \|\| deliverable\.slotType === 'livrabil' \|\| deliverable\.slotType === 'main';\s*\}/,
  );
  assert.match(activityFormSource, /const mainDeliverables = deliverables\.filter\(isMainDeliverableSlot\)/);
});

test('formularul salveaza activitatea cu livrabil pending cand uploadul S3 esueaza', () => {
  assert.match(activityFormSource, /const uploadFailures: string\[\] = \[\]/);
  assert.match(activityFormSource, /Fisierul nu mai este disponibil in formular\. Reincarca livrabilul\./);
  assert.match(activityFormSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(activityFormSource, /setTimeout\(resolve, attempt \* 750\)/);
  assert.match(activityFormSource, /duplicateStatus: 'pending_upload'/);
  assert.match(activityFormSource, /uploadError: errorMessage/);
  assert.match(activityFormSource, /Activitatea se salveaza, dar urmatoarele livrabile nu au ajuns in S3 dupa reincercari automate/);
  assert.ok(
    activityFormSource.indexOf('if (uploadFailures.length > 0) {')
      < activityFormSource.indexOf('await onSave(activities);'),
    'formularul trebuie sa afiseze avertismentul inainte de onSave cand uploadul livrabilului esueaza',
  );
  assert.doesNotMatch(activityFormSource, /Activitatea nu a fost salvata pentru ca livrabilul nu a putut fi incarcat/);
});

test('formularul afiseaza distinct erorile in care activitatea s-a salvat dar livrabilul nu', () => {
  assert.match(activityFormSource, /const isDeliverableSaveWarning = Boolean\(saveError\?\.startsWith\('Activitatea a fost salvata, dar livrabilul'\)\)/);
  assert.match(activityFormSource, /Livrabil neincarcat: /);
  assert.match(activityFormSource, /border-amber-300 bg-amber-50 text-amber-950/);
});

test('verificarea eligibilitatii livrabilului ramane consultativa la salvarea activitatii', () => {
  const saveBlockersStart = activityFormSource.indexOf('const saveBlockers = [');
  const saveBlockersEnd = activityFormSource.indexOf('];', saveBlockersStart);
  const saveBlockersBlock = activityFormSource.slice(saveBlockersStart, saveBlockersEnd);
  const deliverablesStepStart = activityFormSource.indexOf("id: 'deliverables'");
  const deliverablesStepEnd = activityFormSource.indexOf("id: 'description'", deliverablesStepStart);
  const deliverablesStepBlock = activityFormSource.slice(deliverablesStepStart, deliverablesStepEnd);

  assert.ok(saveBlockersStart >= 0, 'formularul trebuie sa aiba lista explicita de saveBlockers');
  assert.match(activityFormSource, /const mainDeliverableEligibilityWarnings =/);
  assert.doesNotMatch(saveBlockersBlock, /mainDeliverableEligibilityWarnings/);
  assert.doesNotMatch(saveBlockersBlock, /Ruleaza verificarea eligibilitatii/);
  assert.doesNotMatch(saveBlockersBlock, /Livrabilul este neeligibil/);
  assert.doesNotMatch(deliverablesStepBlock, /mainDeliverableEligibilityWarnings\.length/);
  assert.match(activityFormSource, /Verificarea eligibilitatii este consultativa si nu blocheaza salvarea/);
});

test('explicatia pentru ore suplimentare la eveniment ramane vizibila dupa completare', () => {
  assert.match(
    activityFormSource,
    /const shouldShowExtendedEventDescription = isEvent && eventDur > 0 && totalHours > eventDur;/,
  );
  assert.match(
    activityFormSource,
    /const needsExtendedDesc = shouldShowExtendedEventDescription && \(eventExtendedDesc \|\| ''\)\.trim\(\)\.length < 20;/,
  );
  assert.match(activityFormSource, /\{shouldShowExtendedEventDescription && \(/g);
  assert.doesNotMatch(activityFormSource, /\{needsExtendedDesc && \(\s*<div className="mt-2">\s*<Label className="text-xs text-amber-700">Activitati conexe evenimentului - obligatoriu<\/Label>/);
});

test('livrabilele pending upload pastreaza diagnosticul si il afiseaza in formular', () => {
  assert.match(amplifyDataResourceSource, /uploadError: a\.string\(\)/);
  assert.match(deliverableItemSource, /const hasPendingUpload = deliverable\.duplicateStatus === 'pending_upload' \|\| Boolean\(deliverable\.uploadError\)/);
  assert.match(deliverableItemSource, /Livrabil in asteptare upload S3/);
  assert.match(deliverableItemSource, /deliverable\.uploadError \|\| 'Fisierul nu a fost confirmat in S3/);
});

test('fotografiile atasate in formular nu asteapta OCR pentru a fi marcate ca uploadate', () => {
  const buildFilePatchStart = deliverableItemSource.indexOf('const buildFilePatch = async');
  const handleFileStart = deliverableItemSource.indexOf('const handleFile = async', buildFilePatchStart);
  const buildFilePatchSource = deliverableItemSource.slice(buildFilePatchStart, handleFileStart);

  assert.match(buildFilePatchSource, /const isPhoto = isImageFile\(file\.name\) \|\| file\.type\.startsWith\('image\/'\)/);
  assert.match(buildFilePatchSource, /if \(isPhoto\) \{\s*textExtractionSource = undefined;/);
  assert.doesNotMatch(buildFilePatchSource, /if \(isPhoto\) \{\s*const ocrResult = await extractImageTextWithSource\(file\)/);
  assert.match(buildFilePatchSource, /Fotografie atasata ca dovada de eveniment; uploadul nu asteapta extragere OCR\./);
});

test('butonul de selectie fisier nu trimite formularul inainte de upload foto', () => {
  assert.match(deliverableItemSource, /accept="\.pdf,\.doc,\.docx,\.html,\.htm,\.xlsx,\.png,\.jpg,\.jpeg,\.gif,\.bmp,\.webp,image\/\*"/);
  assert.match(
    deliverableItemSource,
    /<Button\s+type="button"\s+variant="outline"\s+size="sm"\s+onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/,
  );
});

test('raportul de eveniment generat foloseste data pontata, nu data generarii', () => {
  assert.equal(extractEventDate([
    'MINUTA DE INTALNIRE (MOM)',
    'DATA: joi, 27 august 2026',
    'Data intocmirii: 02.09.2026',
  ].join('\n')), '2026-08-27');
  assert.match(eventReportRouteSource, /const normalizedReport = output \? \{ \.\.\.output, eventDate: date \} : output/);
  assert.match(eventReportRouteSource, /Data [îi]ntocmirii:\s*\$\{formattedDate\}/);
  assert.doesNotMatch(eventReportRouteSource, /Data [îi]ntocmirii:\s*\$\{new Date\(\)\.toLocaleDateString\('ro-RO'\)\}/);
});

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

test('valideaza suggestedSettings persistat fara changes prin inferenta din campuri', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-2',
      saCode: 'SA3.4',
      activityName: 'Intalnire cu reprezentanti membri',
      deliverableType: 'Minute intalnire / MOM',
      confidence: 'medium',
      reason: 'Structura veche fara changes.',
    } as never,
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.deepEqual(suggestion?.changes, ['activity', 'deliverableType']);
});

test('normalizeaza eligibilityCheck persistat cu array-uri lipsa', () => {
  const check = normalizeDeliverableEligibilityCheck({
    status: 'eligibil',
    score: 89,
    summary: 'Verificat anterior.',
    suggestedSettings: {
      saCode: 'SA3.4',
      activityName: 'Intalnire cu reprezentanti membri',
      confidence: 'high',
      reason: 'Structura veche.',
    },
    checkedAt: '2026-07-01T00:00:00.000Z',
  });

  assert.equal(check?.status, 'eligibil');
  assert.deepEqual(check?.checks, []);
  assert.deepEqual(check?.missingElements, []);
  assert.deepEqual(check?.recommendations, []);
  assert.deepEqual(check?.riskFlags, []);
  assert.deepEqual(check?.suggestedSettings?.changes, ['activity']);
  assert.equal(check?.checkedAt, '2026-07-01T00:00:00.000Z');
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

test('recunoaste tipul Articole tematice publicate pe concordia.ro', () => {
  assert.equal(isConcordiaPublishedDeliverableType('Articole tematice publicate pe concordia.ro'), true);
});

test('promptul include regulile Concordia doar pentru livrabile de publicare', () => {
  const publicationPrompt = buildEligibilityAssessmentPrompt(assessmentPromptInput('Articole tematice publicate pe concordia.ro'), assessmentPromptContext);
  const otherPrompt = buildEligibilityAssessmentPrompt(assessmentPromptInput(), assessmentPromptContext);
  assert.ok(publicationPrompt.system.includes(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES));
  assert.equal(otherPrompt.system.includes(CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES), false);
  assert.match(eligibilityRouteSource, /buildEligibilityAssessmentPrompt\(input, context\)/);
});

test('nu foloseste titlul confirmat ca substitut pentru text extras suficient', () => {
  assert.equal(hasSufficientDeliverableEvidenceForEligibility({
    extractedText: 'Green Transition Forum 6.0',
    documentTitle: 'Green Transition Forum 6.0',
    titleConfirmed: true,
    fileName: '20260602_Green Transition Forum 6.0.pdf',
    fileType: 'application/pdf',
    deliverableType: 'Articole tematice publicate pe concordia.ro',
  }), false);
});

test('nu relaxeaza pragul pentru un PDF generic fara tip de articol Concordia', () => {
  assert.equal(hasSufficientDeliverableEvidenceForEligibility({
    extractedText: 'Titlu scurt',
    documentTitle: 'Titlu scurt',
    titleConfirmed: true,
    fileName: 'document.pdf',
    fileType: 'application/pdf',
    deliverableType: 'Minute intalnire / MOM',
  }), false);
});

test('nu relaxeaza pragul pentru livrabile COM doar pentru ca titlul este confirmat', () => {
  assert.equal(hasSufficientDeliverableEvidenceForEligibility({
    extractedText: 'Newsletter iunie',
    documentTitle: 'Newsletter informativ lunar CPC',
    titleConfirmed: true,
    fileName: 'newsletter-iunie.pdf',
    fileType: 'application/pdf',
    deliverableType: 'Newsletter informativ lunar CPC',
    expertCategory: 'com',
  }), false);
});

test('nu accepta sugestii de activitate din alta categorie cand categoria curenta este COM', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-ap',
      saCode: 'SA3.4',
      activityName: 'Redactare Newsletter lunar CPC',
      deliverableType: 'Newsletter informativ lunar CPC',
      confidence: 'medium',
      reason: 'Propunere AP pentru livrabil COM.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates: [
      {
        id: 'cat-ap',
        category: 'ap',
        saCode: 'SA3.4',
        activityName: 'Redactare Newsletter lunar CPC',
      },
    ],
    deliverableOptions: ['Newsletter informativ lunar CPC'],
    currentSaCode: 'SA3.4',
    currentActivityName: 'Alta activitate COM',
    currentDeliverableType: 'Material publicat + link',
    currentCategory: 'com',
  });

  assert.deepEqual(suggestion?.changes, ['deliverableType']);
  assert.equal(suggestion?.selectedActivityId, null);
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

test('normalizeaza payload multi-livrabil doar pentru grupul de activitati curent', () => {
  const documents = normalizeDeliverableEligibilityDocuments({
    activityGroupId: 'group-a',
    primaryDeliverableId: 'd2',
    deliverables: [
      {
        id: 'd1',
        activityGroupId: 'group-a',
        documentTitle: 'Agenda reuniune',
        fileName: 'agenda.pdf',
        extractedText: 'Agenda reuniunii si punctele discutate.',
        deliverableType: 'Agenda',
      },
      {
        id: 'd2',
        activityGroupId: 'group-a',
        documentTitle: 'Minuta reuniune',
        fileName: 'minuta.pdf',
        extractedText: 'Minuta reuniunii cu decizii si actiuni.',
        deliverableType: 'Minute intalnire / MOM',
      },
      {
        id: 'd3',
        activityGroupId: 'group-b',
        documentTitle: 'Livrabil alta activitate',
        fileName: 'alta-activitate.pdf',
        extractedText: 'Nu trebuie inclus in verificarea grupului curent.',
        deliverableType: 'Raport',
      },
    ],
  });

  assert.deepEqual(documents.map((document) => document.id), ['d2', 'd1']);
  assert.equal(documents[0].isPrimary, true);
  assert.equal(documents.some((document) => document.id === 'd3'), false);
});

test('pastreaza compatibilitatea cu payloadul vechi cu un singur livrabil', () => {
  const documents = normalizeDeliverableEligibilityDocuments({
    documentTitle: 'Material suport',
    fileName: 'material.pdf',
    extractedText: 'Material suport pentru activitatea selectata.',
    deliverableType: 'Material prezentare / suport eveniment',
    textScope: 'Text extras disponibil',
  });

  assert.equal(documents.length, 1);
  assert.equal(documents[0].documentTitle, 'Material suport');
  assert.equal(documents[0].isPrimary, true);
});

test('ruta de eligibilitate nu foloseste verificarea titlului ca regula de verdict', () => {
  assert.doesNotMatch(eligibilityRouteSource, /protectVerifiedDocumentTitleEligibility/);
  assert.doesNotMatch(eligibilityRouteSource, /Status verificare titlu/);
  assert.doesNotMatch(eligibilityRouteSource, /Incredere sugestie titlu/);
  assert.doesNotMatch(eligibilityRouteSource, /Verifica separat titlul documentului/);
  assert.doesNotMatch(eligibilityRouteSource, /Daca titlul declarat lipseste/);
  assert.doesNotMatch(deliverableItemSource, /titleCheckStatus: deliverable\.titleCheckStatus/);
  assert.doesNotMatch(deliverableItemSource, /titleSuggestionConfidence: deliverable\.titleSuggestionConfidence/);
});

test('reincadrarea PM sincronizeaza si metadatele documentului, nu doar eligibilityCheck', () => {
  assert.match(pmDossierModalSource, /const \{ update: updateDocument \} = useDocumentMutations\(\)/);
  assert.match(pmDossierModalSource, /await updateDocument\(focusedDocument\.id, \{/);
  assert.match(pmDossierModalSource, /sourceActivityId: focusedSourceActivity\.id/);
  assert.match(pmDossierModalSource, /saCode: selectedEligibilityCatalogActivity\.saCode/);
  assert.match(pmDossierModalSource, /deliverableType: checkedDeliverableType/);
  assert.match(pmDossierModalSource, /eligibilityCheck: nextCheck/);
  assert.match(backendDataHooksSource, /const update = async \(\s*id: string,\s*updates: Partial<Pick<[\s\S]*DocumentMetadata[\s\S]*sourceActivityId[\s\S]*deliverableType[\s\S]*eligibilityCheck/);
  assert.match(awsStoreSource, /async update\(id: string, updates: Partial<Pick<[\s\S]*sourceActivityId[\s\S]*deliverableType[\s\S]*eligibilityCheck/);
  assert.match(awsStoreSource, /assertNoErrors\(result, 'AWS update document metadata'\)/);
});

test('reincadrarea PM permite reverificarea eligibilitatii inainte de aprobarea livrabilului', () => {
  assert.match(pmDossierModalSource, /Reverifica eligibilitatea/);
  assert.match(pmDossierModalSource, /fetch\('\/api\/ai\/check-deliverable-eligibility'/);
  assert.match(pmDossierModalSource, /classificationMode: 'manual'/);
  assert.match(pmDossierModalSource, /selectedActivityId: selectedEligibilityCatalogActivity\.id/);
  assert.match(pmDossierModalSource, /const nextCheck = mergeEligibilityCheckWithPmUnlockTracking\(focusedEligibilityCheck,/);
  assert.match(pmDossierModalSource, /const reassignmentPatch = buildPmActivityAssignmentPatch\(focusedSourceActivity, selectedEligibilityCatalogActivity, now\)/);
  assert.match(pmDossierModalSource, /Eligibilitatea a fost reverificata si este OK\. Poti aproba livrabilul\./);
});

test('dosarul PM randeaza preview DOCX ca HTML cand fisierul poate fi preluat', () => {
  assert.match(pmDossierModalSource, /function isDocxPreviewFile/);
  assert.match(pmDossierModalSource, /const mammoth = await import\('mammoth'\)/);
  assert.match(pmDossierModalSource, /mammoth\.convertToHtml\(\{ arrayBuffer: await blob\.arrayBuffer\(\) \}\)/);
  assert.match(pmDossierModalSource, /setDocxPreviewHtml\(buildDocxPreviewHtml\(converted\.value\)\)/);
  assert.match(pmDossierModalSource, /srcDoc=\{docxPreviewHtml\}/);
  assert.match(pmDossierModalSource, /sandbox=""/);
});

test('deblocarea PM deschide dosarul targetat cu preview si formular de reincadrare', () => {
  assert.match(pmDossierModalSource, /initialFocus\.issueType === 'pm_unlock_requests'/);
  assert.match(pmDossierModalSource, /initialFocus\.issueType === 'pm_unlock_requested'/);
  assert.match(pmDossierModalSource, /<CardTitle className="text-sm">Reincadrare PM<\/CardTitle>/);
  assert.match(pmAlertsPanelSource, /onOpenDossier\(document\.uploadedByExpertId, \{ documentId: document\.id, activityId: document\.sourceActivityId, issueType: 'pm_unlock_requests' \}\)/);
});

test('formularul trimite toate livrabilele incarcate din grupul activitatii la eligibilitate', () => {
  assert.match(activityFormSource, /const currentDeliverablesForEligibility = useMemo\(\s*\(\) => deliverables\.filter\(\(d\) => d\.uploaded && !d\.isPhoto\),\s*\[deliverables\],\s*\)/);
  assert.match(activityFormSource, /const groupId = getActivityEditGroupId\(initialActivity\)/);
  assert.match(activityFormSource, /getActivityEditGroupId\(activity\) === groupId/);
  assert.match(activityFormSource, /isSameEditableActivity\(initialActivity, activity\)/);
  assert.match(activityFormSource, /mapSavedDeliverableToSlot\(deliverable, true\)/);
  assert.match(activityFormSource, /relatedDeliverables=\{deliverablesForEligibility\}/);
  assert.match(deliverableItemSource, /relatedDeliverables\?: DeliverableSlot\[\]/);
  assert.match(deliverableItemSource, /deliverables: eligibilityDeliverables\.map/);
  assert.match(deliverableItemSource, /primaryDeliverableId: deliverable\.id/);
  assert.match(deliverableItemSource, /activityGroupId/);
  assert.match(deliverableItemSource, /Verifica \{relatedDeliverables\.length\} livrabile incarcate pentru grupul activitatii/);
});

test('poarta de text pentru eligibilitate verifica toate livrabilele grupului activitatii', () => {
  assert.match(deliverableItemSource, /function getEligibilityDeliverables\(deliverable: DeliverableSlot, relatedDeliverables\?: DeliverableSlot\[\]\)/);
  assert.match(deliverableItemSource, /eligibilityDeliverables\.some\(\(item\) => hasEnoughExtractedTextForEligibility\(item, expertCategory\)\)/);
  assert.match(deliverableItemSource, /function canAttemptTextExtractionFromStoredFile/);
  assert.match(deliverableItemSource, /eligibilityDeliverables\.some\(canAttemptTextExtractionFromStoredFile\)/);
  assert.match(deliverableItemSource, /const eligibilityDeliverables = getEligibilityDeliverables\(deliverable, relatedDeliverables\)/);
  assert.match(deliverableItemSource, /Textul extras din livrabilele incarcate pentru grupul activitatii/);
  assert.match(deliverableItemSource, /isReusableEligibilityCheckForContext\(visibleEligibilityCheck/);
  assert.equal(isReusableEligibilityCheck(normalizeDeliverableEligibilityCheck({ status: 'neconcludent', summary: 'Textul extras este prea scurt.' })), false);
  const validGroup = assessmentPromptInput();
  assert.doesNotThrow(() => validateEligibilityAssessmentInput(validGroup));
  assert.throws(() => validateEligibilityAssessmentInput({
    ...validGroup,
    documents: [...validGroup.documents, { id: 'unreadable-annex', extractedText: 'Text scurt' }],
  }), /Un livrabil nu are suficient text lizibil/);
  assert.match(eligibilityRouteSource, /validateEligibilityAssessmentInput\(input\)/);
  assert.match(eligibilityRouteSource, /eligibilityDocuments\.length !== parsedDocuments\.data\.length/);
});

test('reutilizeaza verdictul doar pentru acelasi document si acelasi context de raportare', () => {
  const check = normalizeDeliverableEligibilityCheck({
    status: 'eligibil',
    score: 94,
    summary: 'Document eligibil.',
    checkedSaCode: 'SA3.4',
    checkedActivityId: 'activity-1',
    checkedActivityName: 'Elaborare newsletter',
    checkedDeliverableType: 'Informare / newsletter',
  });

  const context = {
    saCode: 'SA3.4',
    activityId: 'activity-1',
    activityName: 'Elaborare newsletter',
    deliverableType: 'Informare / newsletter',
  };
  assert.equal(isReusableEligibilityCheckForContext(check, context), true);
  assert.equal(isReusableEligibilityCheckForContext(check, { ...context, activityId: 'activity-2' }), false);
  assert.equal(isReusableEligibilityCheckForContext(check, { ...context, deliverableType: 'Raport' }), false);
  assert.equal(isReusableEligibilityCheckForContext(check, { ...context, saCode: 'SA3.5' }), false);
  assert.equal(isReusableEligibilityCheckForContext(check, { ...context, activityName: 'Alta activitate' }), false);
  assert.equal(isReusableEligibilityCheckForContext({ ...check!, checkedActivityName: undefined }, context), false);
});

test('eligibilitatea afiseaza direct eroarea de titlu declarat', () => {
  assert.match(titleSuggestionSource, /Titlul declarat nu se regaseste in prima pagina a documentului/);
  const deliverable: DeliverableSlot = {
    id: 'title-test', slotType: 'main', uploaded: true, isPhoto: false,
    docTitle: null, docText: 'Raport de activitate', firstPageText: 'Raport de activitate',
    declaredTitle: 'Ghid de lucru pentru experti', titleMatch: false, titleConfirmed: false,
    stadiu: 'final', aiCheck: null, isPendingConfirm: false,
  };
  assert.match(getDeclaredTitleEligibilityIssue(deliverable) || '', /nu se regaseste in prima pagina/);
  assert.equal(getDeclaredTitleEligibilityIssue({ ...deliverable, firstPageText: null }, true), null);
  assert.match(deliverableItemSource, /const titleEligibilityIssue = hasReusableEligibilityCheck \? null : getDeclaredTitleEligibilityIssue\(deliverable, canAttemptTextExtractionFromStoredFile\(deliverable\)\)/);
  assert.match(deliverableItemSource, /getDeclaredTitleEligibilityIssue\(eligibilityDeliverable\)/);
  assert.match(deliverableItemSource, /getDeclaredTitleEligibilityIssue\(primaryEligibilityDeliverable\)/);
  assert.match(deliverableItemSource, /function buildTitleEligibilityFailure/);
  assert.match(deliverableItemSource, /aiCheck: \{ eligible: null, reason: titleIssue, issues: \[titleIssue\] \}/);
});

test('verificarea eligibilitatii reciteste fisierul cand textul lipseste din slot', () => {
  assert.match(deliverableItemSource, /async function getDeliverableFileForTextExtraction/);
  assert.match(deliverableItemSource, /getSecureDocumentUrl\(\{/);
  assert.match(deliverableItemSource, /async function extractDeliverableTextForEligibility/);
  assert.match(deliverableItemSource, /const extractionPatch = await extractDeliverableTextForEligibility\(deliverable, expertCategory\)/);
  assert.match(deliverableItemSource, /const eligibilityDeliverable = extractionPatch \? \{ \.\.\.deliverable, \.\.\.extractionPatch \} : deliverable/);
  assert.match(deliverableItemSource, /getEligibilityDeliverables\(deliverable, relatedDeliverables\)\.map\(async \(item\) =>/);
  assert.match(deliverableItemSource, /buildEligibilityDocumentPayload\(eligibilityDeliverable, selectedActivityId \|\| subActivity, true\)/);
  assert.match(deliverableItemSource, /buildEligibilityDocumentPayload\(item, activityGroupId, item\.id === deliverable\.id\)/);
});

test('rezultatul eligibilitatii pastreaza metadatele livrabilelor analizate', () => {
  const documents = normalizeDeliverableEligibilityDocuments({
    deliverables: [{ id: 'doc-metadata', fileName: 'raport.pdf', documentTitle: 'Raport de analiza', deliverableType: 'Raport', fileHash: 'hash-original', extractedText: 'Continutul documentului', isPrimary: true }],
  });
  assert.equal(documents[0].id, 'doc-metadata');
  assert.equal(documents[0].isPrimary, true);
  assert.equal(documents[0].fileHash, 'hash-original');
  assert.equal(documents[0].documentTitle, 'Raport de analiza');
  assert.match(eligibilityRouteSource, /analyzedDeliverables: input\.documents\.map\(\(\{ extractedText: _text, \.\.\.document \}\) => document\)/);
  assert.match(deliverableItemSource, /analyzedDeliverables: result\.analyzedDeliverables/);
  assert.match(deliverableTypesSource, /analyzedDeliverables\?: Array<\{/);
});

test('rezultatul eligibilitatii sincronizeaza statusul AI folosit de preflight', () => {
  assert.match(deliverableItemSource, /function getAiStatusForEligibilityResult/);
  assert.match(deliverableItemSource, /aiStatus: getAiStatusForEligibilityResult\(result\.status\)/);
  assert.match(deliverableItemSource, /aiStatus: 'review'/);
  assert.match(peoPageSource, /function needsAiReadinessReview\(deliverable: Deliverable\)/);
  assert.match(peoPageSource, /eligibilityStatus === 'eligibil' \|\| eligibilityStatus === 'eligibil_cu_observatii'/);
  assert.match(peoPageSource, /deliverableRefs\.filter\(\(\{ deliverable \}\) => needsAiReadinessReview\(deliverable\)\)/);
});

test('cardul de eligibilitate afiseaza livrabilele analizate', () => {
  assert.match(deliverableItemSource, /Livrabile analizate:/);
  assert.match(deliverableItemSource, /item\.isPrimary \? ' \(principal\)' : ''/);
});

test('construieste audit semantic cu context expert, rubrici si risc duplicat', () => {
  const audit = buildDeliverableEligibilitySemanticAudit({
    result: {
      status: 'eligibil_cu_observatii',
      score: 82,
      summary: 'Materialul este corelat cu activitatea si mentioneaza grupul tinta.',
      checks: [
        { criterion: 'Potrivire activitate', status: 'pass', explanation: 'Activitatea este corecta.' },
        { criterion: 'Tip livrabil', status: 'pass', explanation: 'Tipul este potrivit.' },
      ],
      missingElements: [],
      recommendations: ['Pastreaza linkul pentru trasabilitate.'],
      riskFlags: [],
      suggestedSettings: null,
    },
    documents: [
      {
        id: 'd1',
        documentTitle: 'Articol Concordia',
        fileName: 'articol-concordia.pdf',
        deliverableType: 'Articole pe concordia.ro',
        isPrimary: true,
        extractedText: [
          'Confederatia Patronala Concordia',
          'Autor: Daniel Apostol',
          '15/07/2026',
          'https://concordia.ro/articol',
          'Material pentru beneficiari si grup tinta.',
        ].join('\n'),
        duplicateStatus: 'possible_common_unmarked',
        possibleDuplicateOfDocumentId: 'doc-existing',
      },
    ],
    expertId: 'expert-1',
    expertCategory: 'com',
    expertFunction: 'Expert comunicare',
    expertProjectRole: 'Expert',
    selectedActivityId: 'cat-1',
    selectedActivityName: 'Articol publicat pe site',
    saCode: 'SA3.4',
    deliverableType: 'Articole pe concordia.ro',
    catalogBeneficiaries: 'Grup tinta si membri Concordia',
    catalogExpectedResults: 'Material publicat',
    catalogDeliverables: 'Articol pe site',
    projectCode: '302141',
    activityGroupId: 'cat-1',
    collaborators: [{ id: 'expert-2', name: 'Expert colaborator' }],
    workingGroupActivities: [{ id: 'a1', saCode: 'SA3.4' }],
  });

  assert.equal(audit.ruleVersionId, DEFAULT_ELIGIBILITY_RULE_VERSION_ID);
  assert.equal(audit.categoryContextUsed.expertCategory, 'com');
  assert.equal(audit.categoryContextUsed.collaboratorCount, 1);
  assert.equal(audit.categoryContextUsed.workingGroupActivityCount, 1);
  assert.equal(audit.rubricScores.activityMatch.status, 'pass');
  assert.equal(audit.rubricScores.duplicateRisk.status, 'warning');
  assert.ok(audit.normalizedScore > 0);
  assert.match(audit.appliedRules.join('\n'), /concordia-publication-default/);
  assert.match(audit.evidenceUsed.join('\n'), /link\/url\/domeniu/);
  assert.equal(audit.documentsRead[0].duplicateStatus, 'possible_common_unmarked');
});

test('ruta leaga evaluarea LLM de catalogul autorizat, sursele oficiale si auditul raspunsului', () => {
  assert.match(eligibilityRouteSource, /loadEligibilityCatalog\(/);
  assert.match(eligibilityRouteSource, /candidates: catalog\.candidates/);
  assert.match(eligibilityRouteSource, /category: resolved\.expert\.category/);
  assert.match(eligibilityRouteSource, /resolveEligibilityContext\(req/);
  assert.match(eligibilityRouteSource, /retrieveEligibilityContext\(/);
  assert.match(eligibilityRouteSource, /const prompt = buildEligibilityAssessmentPrompt\(input, context\)/);
  assert.match(eligibilityRouteSource, /const assessment = finalizeEligibilityAssessment\(input, context, result\.output\)/);
  assert.match(eligibilityRouteSource, /await completeEligibilityRun\(run, response\)/);
  assert.match(eligibilityRouteSource, /NextResponse\.json\(response\)/);
  assert.match(eligibilityRouteSource, /categoryContextUsed/);
  assert.match(eligibilityRouteSource, /modelAuditId: result\.auditId/);
  assert.doesNotMatch(eligibilityRouteSource, /buildDeliverableEligibilitySemanticAudit|semanticAudit\.normalizedScore|rubricScores/);
});

test('controlul eligibilitatii trimite context expert, catalog si working group', () => {
  assert.match(deliverableItemSource, /expertCategory\?: string/);
  assert.match(deliverableItemSource, /workingGroupActivities\?: Array/);
  assert.match(deliverableItemSource, /catalogSource\?: string/);
  assert.match(deliverableItemSource, /duplicateStatus: deliverable\.duplicateStatus/);
  assert.match(activityFormSource, /expertCategory=\{expertCategory\}/);
  assert.match(activityFormSource, /catalogSource=\{catalog\.length > 0 \? 'aws-activity-catalog' : 'fallback-activity-catalog'\}/);
  assert.match(activityFormSource, /workingGroupActivities=\{eligibilityWorkingGroupActivities\}/);
  assert.match(activityFormSource, /collaborators=\{eligibilityCollaborators\}/);
});

test('schema AWS are fundatia pentru ruleseturi AI versionate', () => {
  assert.match(amplifyDataResourceSource, /AiEligibilityRuleset: a/);
  assert.match(amplifyDataResourceSource, /AiEligibilityRuleVersion: a/);
  assert.match(amplifyDataResourceSource, /rulesJson: a\.json\(\)/);
  assert.match(amplifyDataResourceSource, /previousRulesJson: a\.json\(\)/);
  assert.match(amplifyDataResourceSource, /newRulesJson: a\.json\(\)/);
  assert.match(amplifyDataResourceSource, /allow\.groups\(\["pm", "admin"\]\)\.to\(\["create", "read", "update", "delete"\]\)/);
});

test('ruta foloseste rulesetul activ autorizat si stabileste versiunea pe server', () => {
  const rulesContext = JSON.stringify({ mandatoryEvidence: 'Verifica rezultatele documentate.' });
  const prompt = buildEligibilityAssessmentPrompt({ ...assessmentPromptInput(), rulesContext }, assessmentPromptContext);
  assert.equal(JSON.parse(prompt.prompt).administeredRules, rulesContext);
  assert.match(eligibilityRouteSource, /getActiveAiEligibilityRuleset\(\{ projectCode: resolved\.expert\.projectCode/);
  assert.match(eligibilityRouteSource, /input\.rulesContext = activeRuleset\?\.rulesJson \? JSON\.stringify\(activeRuleset\.rulesJson\)/);
  assert.match(eligibilityRouteSource, /ruleVersionId: activeRuleset \? `\$\{activeRuleset\.id\}:v\$\{activeRuleset\.version\}` : ELIGIBILITY_ASSESSMENT_VERSION/);
  assert.doesNotMatch(eligibilityRouteSource, /body\.ruleVersionId/);
});
