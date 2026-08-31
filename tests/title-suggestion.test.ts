import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAutomaticTitleSuggestion,
  detectSuggestedTitleFromText,
  firstLinesLookAdministrative,
  shouldUseAiTitleSuggestion,
  isLikelyFilenameDerivedTitle,
  titleExistsInDocumentText,
  validateDeclaredTitleInDocumentText,
} from '../lib/title-suggestion.ts';

test('PDF upload text extracts the first relevant title and skips generic headers', () => {
  const firstPage = [
    'PEO 2021-2027',
    'Program Educatie si Ocupare',
    'Cod SMIS 302151',
    'Consolidarea capacitatii Concordia pentru dialog social',
    'Analiza cadrului de politici publice',
    'Pagina 1',
  ].join('\n');

  assert.equal(
    detectSuggestedTitleFromText(firstPage),
    'Consolidarea capacitatii Concordia pentru dialog social Analiza cadrului de politici publice',
  );
});

test('DOCX upload text extracts the first relevant title from the document beginning', () => {
  const firstPage = [
    'Confederatia Patronala Concordia',
    'Cod proiect 302151',
    'Metodologie pentru recrutarea grupului tinta',
    'Versiunea de lucru',
  ].join('\n');

  assert.equal(
    detectSuggestedTitleFromText(firstPage),
    'Metodologie pentru recrutarea grupului tinta Versiunea de lucru',
  );
});

test('auto fills declaredTitle when it is empty', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: '',
      suggestedTitle: 'Ghid de lucru pentru experti',
      confidence: 'high',
    }),
    {
      declaredTitle: 'Ghid de lucru pentru experti',
      titleSource: 'auto_detected',
      autoFilled: true,
    },
  );
});

test('keeps uncertain title suggestions as suggestions without auto filling declaredTitle', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: '',
      suggestedTitle: 'Locatie: Microsoft Teams',
      confidence: 'medium',
    }),
    {
      declaredTitle: '',
      titleSource: undefined,
      autoFilled: false,
    },
  );
});

test('does not overwrite an existing declaredTitle', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: 'Titlu introdus manual',
      suggestedTitle: 'Titlu detectat automat',
      confidence: 'high',
    }),
    {
      declaredTitle: 'Titlu introdus manual',
      titleSource: 'manual',
      autoFilled: false,
    },
  );
});

test('replaces stale non-expert title with high confidence document title', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: 'medat',
      currentTitleSource: 'manual',
      suggestedTitle: 'Document de pozitie privind reorganizarea MEDAT',
      confidence: 'high',
      documentText: 'Document de pozitie privind reorganizarea MEDAT\nAugust 2026',
      fileName: 'CPC-reorganizare-medat.docx',
    }),
    {
      declaredTitle: 'Document de pozitie privind reorganizarea MEDAT',
      titleSource: 'auto_detected',
      autoFilled: true,
    },
  );
});

test('keeps explicit expert title and leaves validation to title check', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: 'Varianta expertului',
      currentTitleSource: 'edited_by_expert',
      suggestedTitle: 'Document de pozitie privind reorganizarea MEDAT',
      confidence: 'high',
      documentText: 'Document de pozitie privind reorganizarea MEDAT',
      fileName: 'CPC-reorganizare-medat.docx',
    }),
    {
      declaredTitle: 'Varianta expertului',
      titleSource: 'edited_by_expert',
      autoFilled: false,
    },
  );
});

test('accepts suggested title and validates when it exists in the document text', () => {
  const documentText = 'Ghid de lucru pentru experti\nCapitolul 1';
  assert.equal(titleExistsInDocumentText(documentText, 'Ghid de lucru pentru experti'), true);

  assert.deepEqual(validateDeclaredTitleInDocumentText({
    documentText,
    declaredTitle: 'Ghid de lucru pentru experti',
    titleSource: 'auto_detected',
  }), {
    titleMatch: true,
    titleCheckStatus: 'matched',
    titleCheckMessage: 'Titlul se regaseste in document.',
  });
});

test('blocks validation when edited title is not present in the document text', () => {
  const result = validateDeclaredTitleInDocumentText({
    documentText: 'Raport privind activitatile de informare',
    declaredTitle: 'Alt titlu ales de expert',
    titleSource: 'edited_by_expert',
  });

  assert.equal(result.titleMatch, false);
  assert.equal(result.titleCheckStatus, 'mismatch');
});

test('does not validate short filename-derived titles by loose word overlap', () => {
  const documentText = [
    'Confederatia Patronala Concordia',
    'Material prezentare eveniment',
    'Reorganizarea MEDAT si implicatii pentru mediul de afaceri',
  ].join('\n');

  assert.equal(titleExistsInDocumentText(documentText, 'CPC-reorganizare-medat.pdf'), false);
  assert.equal(isLikelyFilenameDerivedTitle('CPC reorganizare medat', 'CPC-reorganizare-medat.pdf'), true);

  const result = validateDeclaredTitleInDocumentText({
    documentText,
    declaredTitle: 'CPC-reorganizare-medat.pdf',
    titleSource: 'edited_by_expert',
  });
  assert.equal(result.titleCheckStatus, 'mismatch');
});

test('prefers document title over short filename fragments', () => {
  const firstPage = [
    'medat',
    'Confederatia Patronala Concordia',
    'Document de pozitie privind reorganizarea MEDAT si impactul legislativ',
    'August 2026',
  ].join('\n');

  assert.equal(isLikelyFilenameDerivedTitle('medat', 'CPC-reorganizare-medat.docx'), true);
  assert.equal(
    detectSuggestedTitleFromText(firstPage),
    'Document de pozitie privind reorganizarea MEDAT si impactul legislativ',
  );
});

test('ignores very short lines, page numbers, dates and generic labels', () => {
  const firstPage = [
    'A',
    'Pagina 1',
    '12.03.2026',
    'Raport',
    'Plan de interventie pentru dialog social',
  ].join('\n');

  assert.equal(detectSuggestedTitleFromText(firstPage), 'Plan de interventie pentru dialog social');
});

test('routes uncertain or administrative title suggestions to AI', () => {
  const momText = [
    'Data: 12.03.2026',
    'Locatie: Microsoft Teams',
    'Participanti: experti si membri GT',
    'Minuta intalnirii de lucru privind activitatea A1',
  ].join('\n');

  assert.equal(firstLinesLookAdministrative(momText), true);
  assert.equal(shouldUseAiTitleSuggestion({
    text: momText,
    suggestion: {
      suggestedTitle: 'Locatie: Microsoft Teams',
      confidence: 'medium',
      alternatives: [],
    },
  }), true);
});

test('routes any usable extracted text to AI, even when the local suggestion is high confidence', () => {
  const text = [
    'Metodologie pentru recrutarea grupului tinta',
    'Versiunea finala',
    'Capitolul 1',
  ].join('\n');

  assert.equal(firstLinesLookAdministrative(text), false);
  assert.equal(shouldUseAiTitleSuggestion({
    text,
    suggestion: {
      suggestedTitle: 'Metodologie pentru recrutarea grupului tinta',
      confidence: 'high',
      alternatives: [],
    },
  }), true);
});

test('keeps source admin_override matched for administrator exception', () => {
  assert.deepEqual(validateDeclaredTitleInDocumentText({
    documentText: null,
    declaredTitle: 'Titlu administrativ',
    titleSource: 'admin_override',
  }), {
    titleMatch: true,
    titleCheckStatus: 'admin_overridden',
    titleCheckMessage: 'Titlul a fost suprascris de administrator cu justificare.',
  });
});
