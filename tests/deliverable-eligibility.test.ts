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
  protectVerifiedDocumentTitleEligibility,
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
const deliverableItemSource = readFileSync(new URL('../components/expert/deliverable-item.tsx', import.meta.url), 'utf8');
const activityFormSource = readFileSync(new URL('../components/expert/activity-form.tsx', import.meta.url), 'utf8');
const peoPageSource = readFileSync(new URL('../app/expert/peo/page.tsx', import.meta.url), 'utf8');
const eligibilityRouteSource = readFileSync(new URL('../app/api/ai/check-deliverable-eligibility/route.ts', import.meta.url), 'utf8');
const deliverableTypesSource = readFileSync(new URL('../lib/deliverable-types.ts', import.meta.url), 'utf8');
const pmDossierModalSource = readFileSync(new URL('../components/pm/dosar-expert-modal.tsx', import.meta.url), 'utf8');
const backendDataHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const amplifyDataResourceSource = readFileSync(new URL('../amplify/data/resource.ts', import.meta.url), 'utf8');

test('UI tolereaza suggestedSettings persistat fara lista changes', () => {
  assert.doesNotMatch(deliverableItemSource, /suggestedSettings\?\.changes\.includes/);
  assert.match(deliverableItemSource, /suggestedSettings\?\.changes\?\.includes\('activity'\)/);
  assert.match(deliverableItemSource, /suggestedSettings\?\.changes\?\.includes\('deliverableType'\)/);
});

test('formularul pastreaza tipul livrabilului nou incarcat in aceleasi campuri ca livrabilul existent', () => {
  assert.match(deliverableItemSource, /value=\{deliverable\.type \|\| deliverable\.deliverableType \|\| ''\}/);
  assert.match(deliverableItemSource, /type: value,\s*deliverableType: value,/);
  assert.match(activityFormSource, /const resolvedDeliverableType = d\.type \|\| d\.deliverableType \|\| d\.slotType/);
  assert.match(activityFormSource, /category: resolvedDeliverableType,\s*deliverableType: resolvedDeliverableType,/);
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

test('livrabilele pending upload pastreaza diagnosticul si il afiseaza in formular', () => {
  assert.match(amplifyDataResourceSource, /uploadError: a\.string\(\)/);
  assert.match(deliverableItemSource, /const hasPendingUpload = deliverable\.duplicateStatus === 'pending_upload' \|\| Boolean\(deliverable\.uploadError\)/);
  assert.match(deliverableItemSource, /Livrabil in asteptare upload S3/);
  assert.match(deliverableItemSource, /deliverable\.uploadError \|\| 'Fisierul nu a fost confirmat in S3/);
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
  assert.match(eligibilityRouteSource, /isConcordiaPublishedDeliverableType\(currentDeliverableType\)/);
  assert.match(eligibilityRouteSource, /const concordiaPublicationPromptRules =/);
  assert.match(eligibilityRouteSource, /\$\{concordiaPublicationPromptRules\}/);
  assert.doesNotMatch(eligibilityRouteSource, /\$\{CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES\}/);
  assert.equal(isConcordiaPublishedDeliverableType('Analiza acte normative'), false);
});

test('permite verificarea unui PDF Concordia cu titlu confirmat chiar daca OCR-ul este scurt', () => {
  assert.equal(hasSufficientDeliverableEvidenceForEligibility({
    extractedText: 'Green Transition Forum 6.0',
    documentTitle: 'Green Transition Forum 6.0',
    titleConfirmed: true,
    fileName: '20260602_Green Transition Forum 6.0.pdf',
    fileType: 'application/pdf',
    deliverableType: 'Articole tematice publicate pe concordia.ro',
  }), true);
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

test('permite verificarea livrabilelor COM cu titlu confirmat si OCR scurt', () => {
  assert.equal(hasSufficientDeliverableEvidenceForEligibility({
    extractedText: 'Newsletter iunie',
    documentTitle: 'Newsletter informativ lunar CPC',
    titleConfirmed: true,
    fileName: 'newsletter-iunie.pdf',
    fileType: 'application/pdf',
    deliverableType: 'Newsletter informativ lunar CPC',
    expertCategory: 'com',
  }), true);
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

test('nu pastreaza riscul de titlu cand titlul documentului este confirmat', () => {
  const result = protectVerifiedDocumentTitleEligibility({
    documents: [
      {
        documentTitle: 'Pregatire participare dezbatere pe marginea taxarii transportului rutier greu in Bucuresti',
        declaredTitle: 'Pregatire participare dezbatere pe marginea taxarii transportului rutier greu in Bucuresti',
        suggestedTitle: 'Pregatire participare dezbatere pe marginea taxarii transportului rutier greu in Bucuresti',
        titleCheckStatus: 'matched',
        fileName: 'pregatire-dezbatere.pdf',
        extractedText: 'Pregatire participare dezbatere pe marginea taxarii transportului rutier greu in Bucuresti. Context si obiective.',
      },
    ],
    result: {
      status: 'eligibil_cu_observatii',
      score: 84,
      summary: 'Documentul este corelat cu activitatea.',
      checks: [
        { criterion: 'Elemente lipsa', status: 'warning', explanation: 'Titlu clar identificat in document.' },
        { criterion: 'Tip livrabil', status: 'pass', explanation: 'Tipul este adecvat.' },
      ],
      missingElements: ['Titlu clar identificat in document.'],
      recommendations: [
        'Clarificarea titlului documentului.',
        'Un titlu clar ar trebui incorporat in corpul documentului, nu doar pe prima pagina.',
      ],
      riskFlags: ['Titlu suspect sau lipsa'],
      suggestedSettings: null,
    },
  });

  assert.deepEqual(result.riskFlags, []);
  assert.deepEqual(result.missingElements, []);
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.checks[0].status, 'pass');
  assert.match(result.checks[0].explanation, /Titlul documentului este confirmat/);
});

test('nu ascunde riscul de titlu al livrabilului principal cand doar un livrabil secundar are titlu confirmat', () => {
  const result = protectVerifiedDocumentTitleEligibility({
    documents: [
      {
        id: 'principal',
        documentTitle: 'Raport fara titlu confirmat',
        declaredTitle: 'Raport fara titlu confirmat',
        titleCheckStatus: 'mismatch',
        fileName: 'principal.pdf',
        extractedText: 'Continut fara titlul declarat.',
        isPrimary: true,
      },
      {
        id: 'secundar',
        documentTitle: 'Anexa confirmata',
        declaredTitle: 'Anexa confirmata',
        titleCheckStatus: 'matched',
        fileName: 'anexa.pdf',
        extractedText: 'Anexa confirmata.',
        isPrimary: false,
      },
    ],
    result: {
      status: 'eligibil_cu_observatii',
      score: 82,
      summary: 'Documentul principal are titlu neconfirmat.',
      checks: [
        { criterion: 'Titlu document', status: 'warning', explanation: 'Titlu suspect sau lipsa pe livrabilul principal.' },
      ],
      missingElements: ['Titlu clar identificat in documentul principal.'],
      recommendations: ['Clarifica titlul documentului principal.'],
      riskFlags: ['Titlu suspect sau lipsa'],
      suggestedSettings: null,
    },
  });

  assert.deepEqual(result.riskFlags, ['Titlu suspect sau lipsa']);
  assert.deepEqual(result.missingElements, ['Titlu clar identificat in documentul principal.']);
  assert.deepEqual(result.recommendations, ['Clarifica titlul documentului principal.']);
  assert.equal(result.checks[0].status, 'warning');
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

test('dosarul PM randeaza preview DOCX ca HTML cand fisierul poate fi preluat', () => {
  assert.match(pmDossierModalSource, /function isDocxPreviewFile/);
  assert.match(pmDossierModalSource, /const mammoth = await import\('mammoth'\)/);
  assert.match(pmDossierModalSource, /mammoth\.convertToHtml\(\{ arrayBuffer: await blob\.arrayBuffer\(\) \}\)/);
  assert.match(pmDossierModalSource, /setDocxPreviewHtml\(buildDocxPreviewHtml\(converted\.value\)\)/);
  assert.match(pmDossierModalSource, /srcDoc=\{docxPreviewHtml\}/);
  assert.match(pmDossierModalSource, /sandbox=""/);
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
  assert.match(deliverableItemSource, /const eligibilityDeliverables = getEligibilityDeliverables\(deliverable, relatedDeliverables\)/);
  assert.match(deliverableItemSource, /Textul extras din livrabilele incarcate pentru grupul activitatii/);
});

test('rezultatul eligibilitatii pastreaza metadatele livrabilelor analizate', () => {
  assert.match(eligibilityRouteSource, /analyzedDeliverables: eligibilityDocuments\.map/);
  assert.match(eligibilityRouteSource, /isPrimary: deliverable\.isPrimary/);
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

test('ruta de eligibilitate include audit semantic si context explicit in raspuns', () => {
  assert.match(eligibilityRouteSource, /buildDeliverableEligibilitySemanticAudit/);
  assert.match(eligibilityRouteSource, /expertCategory/);
  assert.match(eligibilityRouteSource, /workingGroupActivities/);
  assert.match(eligibilityRouteSource, /ruleVersionId/);
  assert.match(eligibilityRouteSource, /semanticAudit/);
  assert.match(eligibilityRouteSource, /rubricScores/);
  assert.match(eligibilityRouteSource, /categoryContextUsed/);
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

test('ruta de eligibilitate foloseste rulesetul activ cand requestul nu trimite ruleVersionId', () => {
  assert.match(eligibilityRouteSource, /getActiveAiEligibilityRuleset/);
  assert.match(eligibilityRouteSource, /effectiveRuleVersionId/);
  assert.match(eligibilityRouteSource, /activeRulesetContext/);
  assert.match(eligibilityRouteSource, /ruleVersionId: effectiveRuleVersionId/);
});
