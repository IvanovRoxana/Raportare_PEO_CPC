import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAutomaticTitleSuggestion,
  detectSuggestedTitleFromText,
  firstLinesLookAdministrative,
  shouldUseAiTitleSuggestion,
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
    }),
    {
      declaredTitle: 'Ghid de lucru pentru experti',
      titleSource: 'auto_detected',
      autoFilled: true,
    },
  );
});

test('does not overwrite an existing declaredTitle', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: 'Titlu introdus manual',
      suggestedTitle: 'Titlu detectat automat',
    }),
    {
      declaredTitle: 'Titlu introdus manual',
      titleSource: 'manual',
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

test('keeps high-confidence non-administrative suggestions local', () => {
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
  }), false);
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
