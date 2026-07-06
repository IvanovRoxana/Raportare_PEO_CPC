import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActivityAutofillCatalogShortlist,
  buildActivityAutofillDeliverablesPayload,
  buildFallbackActivityAutofillSuggestion,
  buildActivityAutofillPrompt,
  validateActivityAutofillSuggestionAgainstCatalog,
  type ActivityAutofillCatalogCandidate,
} from '../lib/activity-autofill.ts';

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

test('payloadul pentru autocompletare include toate livrabilele cu text si le ignora pe cele fara text', () => {
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

test('promptul cere instructiuni clare pentru fiecare linie completata din formular', () => {
  const { prompt } = buildActivityAutofillPrompt({
    deliverables: [
      {
        fileName: 'raport.docx',
        documentTitle: 'Raport de analiza',
        extractedText: 'Analiza documentara si recomandari pentru politici publice.',
      },
    ],
    catalogCandidates,
    expertName: 'Expert Test',
    expertRole: 'Expert politici publice',
    projectCode: '302141',
    month: 5,
    year: 2026,
    selectedDates: ['2026-06-10'],
  });

  assert.match(prompt, /recommended\.saCode/);
  assert.match(prompt, /recommended\.activityName/);
  assert.match(prompt, /recommended\.description/);
  assert.match(prompt, /fieldInstructions\.saCode/);
  assert.match(prompt, /fieldInstructions\.activityName/);
  assert.match(prompt, /fieldInstructions\.description/);
  assert.match(prompt, /persoana I singular/);
  assert.match(prompt, /Ghid de incadrare AP\/PA/);
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

test('validarea respinge sugestiile care nu exista exact in catalog', () => {
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
  );

  assert.equal(result.ok, false);
});

test('validarea accepta sugestiile care corespund unei activitati din catalog', () => {
  const result = validateActivityAutofillSuggestionAgainstCatalog(
    {
      recommended: {
        saCode: 'SA1.1',
        activityName: 'Analiza documente de politici publice',
        description: 'Am analizat documentele de politici publice si am sintetizat recomandarile relevante.',
      },
      confidence: 'medium',
      fieldInstructions: {
        saCode: 'Documentul se incadreaza in SA1.1.',
        activityName: 'Activitatea corespunde analizei documentare.',
        description: 'Descrierea include actiunea si rezultatul documentat.',
      },
      evidence: ['Livrabilul este un raport de analiza.'],
      warnings: ['Revizuieste formularea finala inainte de salvare.'],
    },
    catalogCandidates,
  );

  assert.equal(result.ok, true);
});

test('validarea accepta coduri SA echivalente dupa normalizare', () => {
  const result = validateActivityAutofillSuggestionAgainstCatalog(
    {
      recommended: {
        saCode: 'SA 1.1',
        activityName: 'Analiza documente de politici publice',
        description: 'Am analizat documentele de politici publice si am sintetizat recomandarile relevante.',
      },
      confidence: 'medium',
      fieldInstructions: {
        saCode: 'Documentul se incadreaza in SA1.1.',
        activityName: 'Activitatea corespunde analizei documentare.',
        description: 'Descrierea include actiunea si rezultatul documentat.',
      },
      evidence: ['Livrabilul este un raport de analiza.'],
      warnings: [],
    },
    catalogCandidates,
  );

  assert.equal(result.ok, true);
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
    expertRole: 'Expert Afaceri Publice',
  }, 1);

  assert.equal(shortlist[0].activityName, 'Redactare Newsletter lunar CPC');
});

test('fallbackul local propune o activitate AP pentru Andreea cand AI nu raspunde', () => {
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
    expertName: 'Andreea Cojocaru',
    expertRole: 'Expert Afaceri Publice',
    category: 'ap',
    projectCode: '302141',
    month: 5,
    year: 2026,
    selectedDates: ['2026-06-15'],
  });

  assert.equal(fallback?.recommended.activityName, 'Organizare eveniment / masa rotunda / dezbatere');
  assert.equal(fallback?.confidence, 'low');
  assert.match(fallback?.warnings.join('\n') || '', /generata local/);
});
