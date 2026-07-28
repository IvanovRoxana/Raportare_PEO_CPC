import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActivityAutofillCatalogShortlist,
  buildActivityAutofillDeliverablesPayload,
  buildFallbackActivityAutofillSuggestion,
  buildActivityAutofillPrompt,
  activityAutofillRequestSchema,
  getActivityAutofillMissingSteps,
  validateActivityAutofillSuggestionAgainstCatalog,
  type ActivityAutofillCatalogCandidate,
} from '../lib/activity-autofill.ts';
import {
  classifyDeliverableKind,
  evaluateFinalActivityDescription,
} from '../lib/agents/activity-agent-quality.ts';
import { buildActivityAgentPrompt } from '../lib/agents/activity-agent-prompt.ts';

const catalogCandidates: ActivityAutofillCatalogCandidate[] = [
  {
    id: 'cat-1',
    category: 'ap',
    saCode: 'SA1.1',
    serviceCategory: 'Analiza politici publice',
    activityNumber: 1,
    activityName: 'Analiza documente de politici publice',
    description: 'Analiza documentelor relevante pentru dialog social.',
    objectives: 'Identificarea problemelor si formularea de recomandari.',
    serviceComponent: 'Analiza documentara si sinteza concluziilor.',
    expectedResults: 'Sinteza documentata.',
    deliverables: 'Raport de analiza',
    indicators: 'Nr. documente analizate',
  },
  {
    id: 'cat-2',
    category: 'ap',
    saCode: 'SA2.1',
    serviceCategory: 'Comunicare',
    activityNumber: 2,
    activityName: 'Pregatire materiale de informare',
  },
];

const selectedActivityContext = {
  selectedActivityId: 'cat-1',
  saCode: 'SA1.1',
  activityName: 'Analiza documente de politici publice',
  currentDescription: 'Analiza documentelor relevante pentru dialog social.',
};

test('payloadul pentru descriere asistata include toate livrabilele cu text si le ignora pe cele fara text', () => {
  const payload = buildActivityAutofillDeliverablesPayload([
    {
      id: 'doc-1',
      fileName: 'raport.docx',
      documentTitle: 'Raport de analiza',
      deliverableType: 'Raport de monitorizare',
      stadiu: 'final',
      docText: 'Raportul analizeaza documentele de politici publice si formuleaza recomandari.',
      firstPageText: 'Raport de analiza',
      eligibilityStatus: 'eligibil',
      eligibilitySummary: 'Document corelat cu activitatea.',
    },
    {
      id: 'doc-2',
      fileName: 'agenda.pdf',
      documentTitle: 'Agenda discutii',
      firstPageText: 'Agenda intalnirii privind recomandarile pentru dialog social.',
    },
    {
      id: 'doc-3',
      fileName: 'foto.png',
      documentTitle: 'Fotografie eveniment',
    },
  ]);

  assert.equal(payload.length, 2);
  assert.equal(payload[0].fileName, 'raport.docx');
  assert.equal(payload[0].textScope, 'Text extras disponibil din document');
  assert.equal(payload[1].fileName, 'agenda.pdf');
  assert.equal(payload[1].textScope, 'Prima pagina / inceputul documentului');
});

test('promptul cere doar rescrierea descrierii activitatii', () => {
  const { prompt } = buildActivityAutofillPrompt({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Test',
    expertRole: 'Expert politici publice',
    projectCode: '302141',
    month: 5,
    year: 2026,
    selectedDates: ['2026-06-10'],
  });

  assert.match(prompt, /rescrie doar descrierea/);
  assert.match(prompt, /currentDescription/);
  assert.match(prompt, /Analiza documentelor relevante/);
  assert.doesNotMatch(prompt, /recommended\.saCode/);
  assert.doesNotMatch(prompt, /recommended\.activityName/);
  assert.match(prompt, /fieldInstructions\.description/);
  assert.match(prompt, /persoana I singular/);
  assert.match(prompt, /Ghid de incadrare AP\/PA/);
});

test('promptul Agentului PEO pastreaza activitatea selectata ca tinta fixa', () => {
  const prompt = buildActivityAgentPrompt({
    deliverables: [
      {
        documentTitle: 'Analiza acte normative iunie 2026',
        extractedText: 'Pentru luna iunie, au fost analizate 85 proiecte de acte normative.',
      },
    ],
    catalogCandidates,
    selectedActivityId: 'cat-2',
    saCode: 'SA2.1',
    activityName: 'Pregatire materiale de informare',
    currentDescription: 'Am redactat si consolidat continut pentru newsletterul intern CPC.',
    expertName: 'Expert Test',
    projectCode: '302141',
  });

  assert.match(prompt, /Pastreaza subactivitatea si activitatea selectate ca tinta fixa/);
  assert.match(prompt, /Nu schimba proposedSaCode si proposedActivityName/);
  assert.match(prompt, /descrierea curenta din formular ca intentie principala/);
});

test('promptul include context RAG doar cand este furnizat', () => {
  const baseRequest = {
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Test',
  };

  const withoutRag = buildActivityAutofillPrompt(baseRequest);
  assert.doesNotMatch(withoutRag.prompt, /Context RAG intern/);

  const withRag = buildActivityAutofillPrompt({
    ...baseRequest,
    internalRagContext: {
      promptContext: '[{"sourceType":"raportare_aprobata_oir","text":"context aprobat"}]',
    },
  });
  assert.match(withRag.prompt, /Context RAG intern/);
  assert.match(withRag.prompt, /context aprobat/);
});

test('promptul include separat scopul oficial al SA si accepta descriere curenta goala', () => {
  const parsed = activityAutofillRequestSchema.safeParse({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Test',
    currentDescription: '',
    saPurposeContext: {
      saCode: 'SA1.1',
      title: 'Informare, recrutare, selectie GT',
      text: 'Scopul oficial al subactivitatii este informarea si selectia grupului tinta.',
      sourceType: 'scop_sa',
      documentId: 'sauri-document',
      chunkIds: ['chunk-1'],
    },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const { prompt } = buildActivityAutofillPrompt(parsed.data);
  assert.match(prompt, /Scop oficial pentru SA1\.1/);
  assert.match(prompt, /informarea si selectia grupului tinta/);
  assert.match(prompt, /nu il transforma in munca pretins realizata/i);
});

test('promptul pentru activitate comuna include colaboratorii confirmati', () => {
  const { prompt } = buildActivityAutofillPrompt({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Curent',
    collaborationContext: {
      isCommonActivity: true,
      collaborators: [
        { id: 'expert-2', name: 'Expert Colaborator', role: 'AP', positionInProject: 'Expert politici publice' },
      ],
    },
  });

  assert.match(prompt, /Context colaborare activitate comuna/);
  assert.match(prompt, /Expert Colaborator/);
  assert.match(prompt, /am colaborat cu persoanele/);
  assert.match(prompt, /Nu inventa impartirea rolurilor/);
});

test('promptul include instructiunile PM/Admin pentru expert sub regulile principale', () => {
  const { prompt } = buildActivityAutofillPrompt({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Curent',
    expertReportingInstructions: 'Accentueaza analiza legislativa si sinteza pentru membri.',
  });

  assert.match(prompt, /Instructiuni PM\/Admin pentru expert/);
  assert.match(prompt, /Accentueaza analiza legislativa/);
  assert.match(prompt, /nu pot contrazice scopul oficial al SA/);
});

test('promptul pentru activitate privata interzice mentionarea colaboratorilor', () => {
  const { prompt } = buildActivityAutofillPrompt({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
    expertName: 'Expert Curent',
    collaborationContext: {
      isCommonActivity: false,
      collaborators: [
        { id: 'expert-2', name: 'Expert Colaborator' },
      ],
    },
  });

  assert.match(prompt, /Activitatea nu este marcata ca activitate comuna/);
  assert.doesNotMatch(prompt, /Expert Colaborator/);
});

test('descrierea finala se deblocheaza numai dupa cei patru pasi ai fiecarui livrabil', () => {
  assert.deepEqual(getActivityAutofillMissingSteps([
    {
      uploaded: true,
      docText: 'Continut extras',
      titleConfirmed: false,
      stadiu: '',
    },
  ]), ['titlul confirmat', 'stadiul selectat', 'eligibilitatea verificata']);

  assert.deepEqual(getActivityAutofillMissingSteps([
    {
      uploaded: true,
      docText: 'Continut extras',
      titleConfirmed: true,
      stadiu: 'final',
      aiCheck: { eligible: true },
    },
  ]), []);
});

test('validarea respinge raspunsurile care incearca sa propuna activitatea', () => {
  const result = validateActivityAutofillSuggestionAgainstCatalog(
    {
      recommended: {
        saCode: 'SA9.9',
        activityName: 'Activitate inventata',
        description: 'Descriere suficient de lunga pentru schema raspunsului.',
      },
      confidence: 'high',
      fieldInstructions: {
        saCode: 'Ales din document.',
        activityName: 'Ales din document.',
        description: 'Descriere construita din document.',
      },
      evidence: ['Documentul mentioneaza analiza.'],
      warnings: [],
    },
    catalogCandidates,
    {
      deliverables: [],
      catalogCandidates,
      ...selectedActivityContext,
    },
  );

  assert.equal(result.ok, false);
});

test('validarea accepta descrierea pentru activitatea selectata din catalog', () => {
  const result = validateActivityAutofillSuggestionAgainstCatalog(
    {
      description: 'Am analizat documentele de politici publice si am sintetizat recomandarile relevante.',
      confidence: 'medium',
      fieldInstructions: {
        description: 'Descrierea include actiunea si rezultatul documentat.',
      },
      evidence: ['Livrabilul este un raport de analiza.'],
      warnings: ['Revizuieste formularea finala inainte de salvare.'],
    },
    catalogCandidates,
    {
      deliverables: [],
      catalogCandidates,
      ...selectedActivityContext,
    },
  );

  assert.equal(result.ok, true);
});

test('validarea respinge cifre inventate fata de livrabil', () => {
  const request = {
    deliverables: [
      {
        extractedText: 'Pentru luna iunie, au fost analizate 85 proiecte de acte normative. Pentru 56 proiecte nu se impune agregarea unei pozitii Concordia.',
      },
    ],
    catalogCandidates,
    ...selectedActivityContext,
  };

  const valid = validateActivityAutofillSuggestionAgainstCatalog(
    {
      description: 'Am analizat 85 proiecte de acte normative si am constatat ca pentru 56 nu se impune agregarea unei pozitii.',
      confidence: 'high',
      fieldInstructions: {
        description: 'Descrierea pastreaza cifrele din livrabil.',
      },
      evidence: ['Livrabilul mentioneaza 85 proiecte si 56 fara pozitie.'],
      warnings: [],
    },
    catalogCandidates,
    request,
  );
  assert.equal(valid.ok, true);

  const invalid = validateActivityAutofillSuggestionAgainstCatalog(
    {
      description: 'Am analizat 70 proiecte de acte normative si am constatat ca pentru 45 nu se impune agregarea unei pozitii.',
      confidence: 'high',
      fieldInstructions: {
        description: 'Descrierea schimba cifrele.',
      },
      evidence: ['Livrabilul mentioneaza analiza actelor normative.'],
      warnings: [],
    },
    catalogCandidates,
    request,
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /70, 45/);
});

test('validarea respinge cand activitatea selectata nu exista in catalog', () => {
  const result = validateActivityAutofillSuggestionAgainstCatalog(
    {
      description: 'Am analizat documentele de politici publice si am sintetizat recomandarile relevante.',
      confidence: 'medium',
      fieldInstructions: {
        description: 'Descrierea include actiunea si rezultatul documentat.',
      },
      evidence: ['Livrabilul este un raport de analiza.'],
      warnings: [],
    },
    catalogCandidates,
    {
      deliverables: [],
      catalogCandidates,
      ...selectedActivityContext,
      saCode: 'SA9.9',
      activityName: 'Activitate inventata',
    },
  );

  assert.equal(result.ok, false);
});

test('shortlistul favorizeaza activitatea cea mai apropiata de livrabil', () => {
  const candidates: ActivityAutofillCatalogCandidate[] = [
    {
      id: 'cat-1',
      category: 'ap',
      saCode: 'SA3.4',
      activityName: 'Redactare Newsletter lunar CPC',
      description: 'Newsletter si informari pentru membri.',
    },
    {
      id: 'cat-2',
      category: 'ap',
      saCode: 'SA3.4',
      activityName: 'Organizare eveniment / masa rotunda / dezbatere',
      description: 'Organizare evenimente si dezbateri.',
    },
    {
      id: 'cat-3',
      category: 'ap',
      saCode: 'SA3.5',
      activityName: 'Vizita de studiu / schimb experienta federatie europeana',
      description: 'Schimb de bune practici europene.',
    },
  ];

  const shortlist = buildActivityAutofillCatalogShortlist({
    deliverables: [
      {
        documentTitle: 'Newsletter lunar CPC - mai 2026',
        extractedText: 'Am redactat newsletterul lunar CPC cu informari legislative relevante pentru companiile membre.',
      },
    ],
    catalogCandidates: candidates,
    selectedActivityId: 'cat-1',
    saCode: 'SA3.4',
    activityName: 'Redactare Newsletter lunar CPC',
    currentDescription: 'Newsletter si informari pentru membri.',
    expertRole: 'Expert Afaceri Publice',
  }, 1);

  assert.equal(shortlist[0].activityName, 'Redactare Newsletter lunar CPC');
});

test('fallbackul local rescrie prudent descrierea fara sa schimbe activitatea selectata', () => {
  const candidates: ActivityAutofillCatalogCandidate[] = [
    {
      id: 'cat-1',
      category: 'ap',
      saCode: 'SA3.2',
      activityName: 'Monitorizare legislativa regionala si informare membri',
      description: 'Monitorizare legislativa regionala.',
    },
    {
      id: 'cat-2',
      category: 'ap',
      saCode: 'SA3.4',
      activityName: 'Organizare eveniment / masa rotunda / dezbatere',
      description: 'Organizarea de evenimente si mese rotunde cu stakeholderi pe teme economice si sociale.',
    },
  ];

  const fallback = buildFallbackActivityAutofillSuggestion({
    deliverables: [
      {
        fileName: '20260615_Minuta_Masa_Rotunda_Federatii.docx',
        documentTitle: 'Minuta masa rotunda federatii',
        extractedText: 'Minuta surprinde discutiile din cadrul mesei rotunde cu federatii si stakeholderi.',
      },
    ],
    catalogCandidates: candidates,
    selectedActivityId: 'cat-2',
    saCode: 'SA3.4',
    activityName: 'Organizare eveniment / masa rotunda / dezbatere',
    currentDescription: 'Organizarea de evenimente si mese rotunde cu stakeholderi pe teme economice si sociale.',
    expertName: 'Andreea Cojocaru',
    expertRole: 'Expert Afaceri Publice',
    category: 'ap',
    projectCode: '302141',
    month: 5,
    year: 2026,
    selectedDates: ['2026-06-15'],
  });

  assert.match(fallback?.description || '', /Organizarea de evenimente/);
  assert.match(fallback?.description || '', /Minuta surprinde discutiile/);
  assert.match(fallback?.evidence.join('\n') || '', /SA3.4 :: Organizare eveniment/);
  assert.equal(fallback?.confidence, 'low');
  assert.match(fallback?.warnings.join('\n') || '', /generata local/);
});

test('agentul evalueaza descrierea finala pentru Anexa 10 si clasifica tipul livrabilului', () => {
  const request = {
    deliverables: [
      {
        documentTitle: 'Newsletter lunar CPC - mai 2026',
        deliverableType: 'Newsletter',
        extractedText: 'Newsletterul lunar CPC a inclus informari pentru membri despre activitatea Concordia, grupuri de lucru, webinarul SME ECO-TECH si evenimentele anuntate pentru perioada urmatoare.',
      },
    ],
    catalogCandidates,
    selectedActivityId: 'cat-2',
    saCode: 'SA3.4',
    activityName: 'Redactare Newsletter lunar CPC',
    currentDescription: 'Newsletter si informari pentru membri.',
    expertName: 'Expert Test',
    expertRole: 'Expert Afaceri Publice',
    category: 'ap',
    projectCode: '302141',
    month: 6,
    year: 2026,
    selectedDates: ['2026-06-02'],
  };

  const bad = evaluateFinalActivityDescription(
    'Agentul AI a citit livrabilul si a pregatit raportarea lunara.',
    request,
  );
  assert.ok(bad.score < 0.55);
  assert.match(bad.warnings.join('\n'), /termeni tehnici/);

  const deliverableKind = classifyDeliverableKind(request);
  assert.equal(deliverableKind.kind, 'newsletter');
  assert.match(
    deliverableKind.label,
    /Newsletter/,
  );
});

test('evaluatorul penalizeaza temele inventate care nu apar in livrabil sau context', () => {
  const request = {
    deliverables: [
      {
        documentTitle: 'Articol Concordia - iunie 2026',
        deliverableType: 'Articol',
        extractedText: 'Articolul prezinta publicarea unei informari despre activitatea organizatiei si mentioneaza sinteza mesajelor pentru comunicarea institutionala a Concordia.',
      },
    ],
    catalogCandidates,
    selectedActivityId: 'cat-2',
    saCode: 'SA3.4',
    activityName: 'Articole pe concordia.ro',
    currentDescription: 'Am redactat articole pentru concordia.ro.',
    expertName: 'Expert Test',
    expertRole: 'Expert Afaceri Publice',
    category: 'ap',
    projectCode: '302141',
    month: 6,
    year: 2026,
    selectedDates: ['2026-06-09'],
  };

  const quality = evaluateFinalActivityDescription(
    'In data de 9 iunie 2026, am realizat redactarea si publicarea de articole pe site-ul oficial al Concordia, cu scopul de a informa membrii si publicul larg despre politicile oficiale ale membrilor nostri. Am analizat teme privind deficitul bugetar, ajustari fiscale, Pilonul Social UE si competitivitatea economiei europene. Activitatea a contribuit la documentarea rezultatelor proiectului.',
    request,
  );

  assert.ok(quality.evidenceSupport.score < 0.55);
  assert.match(quality.warnings.join('\n'), /termeni\/teme/);
  assert.ok(quality.evidenceSupport.unsupportedTerms.includes('deficitul'));
  assert.ok(quality.evidenceSupport.unsupportedTerms.includes('bugetar'));
});
