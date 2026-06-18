import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActivityAutofillDeliverablesPayload,
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
