import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAutomaticTitleSuggestion,
  detectSuggestedTitleFromText,
  firstLinesLookAdministrative,
  getTitleValidationText,
  isAdministrativeTitleCandidate,
  shouldUseAiTitleSuggestion,
  isLikelyFilenameDerivedTitle,
  resolveDocumentTitleSuggestion,
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
    titleCheckMessage: 'Titlul se regaseste in prima pagina a documentului.',
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

test('matches titles when ampersand is extracted as the word and', () => {
  const documentText = 'European distressed investing and asset based lending SUMMIT';
  assert.equal(
    titleExistsInDocumentText(documentText, 'European distressed investing & asset based lending SUMMIT'),
    true,
  );

  assert.deepEqual(validateDeclaredTitleInDocumentText({
    documentText,
    declaredTitle: 'European distressed investing & asset based lending SUMMIT',
    titleSource: 'edited_by_expert',
  }), {
    titleMatch: true,
    titleCheckStatus: 'matched',
    titleCheckMessage: 'Titlul se regaseste in prima pagina a documentului.',
  });
});

test('does not accept fuzzy title words as substrings of other words', () => {
  assert.equal(
    titleExistsInDocumentText(
      'Planificarea activitatilor pentru reorganizare institutionala aprofundata regionala',
      'Plan activitate pentru reorganizare institutionala aprofundata regionala',
    ),
    false,
  );
});

test('prefers first-page text for title validation and falls back to full text', () => {
  assert.equal(getTitleValidationText('Titlu prima pagina', 'Titlu din continut'), 'Titlu prima pagina');
  assert.equal(getTitleValidationText('', 'Titlu din continut'), 'Titlu din continut');
});

test('matches OCR text with accents and punctuation differences', () => {
  assert.equal(
    titleExistsInDocumentText(
      'Sinteza legislativa cu impact regional / sectorial',
      'Sinteză legislativă cu impact regional-sectorial',
    ),
    true,
  );
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

test('keeps local first-page title when AI returns null', () => {
  const localSuggestion = {
    suggestedTitle: 'Document de pozitie privind reorganizarea MEDAT si impactul legislativ',
    confidence: 'high' as const,
    alternatives: [],
    reason: 'Candidat local.',
  };

  const resolved = resolveDocumentTitleSuggestion({
    localSuggestion,
    aiSuggestion: {
      suggestedTitle: null,
      confidence: 'low',
      alternatives: [],
      reason: 'AI nu a identificat titlu clar.',
    },
    documentText: 'Document de pozitie privind reorganizarea MEDAT si impactul legislativ\nAugust 2026',
  });

  assert.equal(resolved.suggestedTitle, localSuggestion.suggestedTitle);
  assert.equal(resolved.confidence, 'high');
});

test('uses AI title when it is explicitly present in the first page', () => {
  const resolved = resolveDocumentTitleSuggestion({
    localSuggestion: {
      suggestedTitle: 'Document de pozitie',
      confidence: 'medium',
      alternatives: [],
    },
    aiSuggestion: {
      suggestedTitle: 'Document de pozitie privind reorganizarea MEDAT',
      confidence: 'high',
      alternatives: [],
    },
    documentText: 'Document de pozitie privind reorganizarea MEDAT\nAugust 2026',
  });

  assert.equal(resolved.suggestedTitle, 'Document de pozitie privind reorganizarea MEDAT');
  assert.equal(resolved.confidence, 'high');
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

test('does not suggest meeting date and location metadata as a document title', () => {
  const firstPage = [
    'Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia',
    'Participanți: membri CPC',
    'Subiecte discutate',
  ].join('\n');

  assert.equal(
    isAdministrativeTitleCandidate('Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia'),
    true,
  );
  assert.equal(detectSuggestedTitleFromText(firstPage), null);
});

test('detects MoM title after date location and participant metadata', () => {
  const firstPage = [
    'Data: 12.03.2026',
    'Locatie: Microsoft Teams',
    'Participanti: experti CPC si reprezentanti federatii',
    'Semnaturi',
    'Minuta intalnirii de lucru privind pregatirea consultarilor publice regionale',
    'Au fost analizate temele propuse pentru dialogul social.',
  ].join('\n');

  assert.equal(
    detectSuggestedTitleFromText(firstPage),
    'Minuta intalnirii de lucru privind pregatirea consultarilor publice regionale',
  );
});

test('detects meeting agenda title after MoM metadata', () => {
  const firstPage = [
    'Data sedintei: 04.06.2026',
    'Locatia sedintei: Sediul CPC',
    'Participanti: echipa proiect',
    'Agenda intalnirii privind organizarea evenimentelor regionale',
    '1. Stabilirea etapelor de lucru',
  ].join('\n');

  assert.equal(
    detectSuggestedTitleFromText(firstPage),
    'Agenda intalnirii privind organizarea evenimentelor regionale',
  );
});

test('rejects AI title suggestions that are literal administrative metadata', () => {
  const metadataTitle = 'Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia';
  const resolved = resolveDocumentTitleSuggestion({
    localSuggestion: {
      suggestedTitle: null,
      confidence: 'low',
      alternatives: [],
    },
    aiSuggestion: {
      suggestedTitle: metadataTitle,
      confidence: 'high',
      alternatives: [],
    },
    documentText: `${metadataTitle}\nParticipanți: membri CPC`,
  });

  assert.equal(resolved.suggestedTitle, null);
  assert.equal(resolved.confidence, 'low');
});

test('does not auto fill administrative metadata even with high confidence', () => {
  assert.deepEqual(
    applyAutomaticTitleSuggestion({
      currentDeclaredTitle: '',
      suggestedTitle: 'Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia',
      confidence: 'high',
      documentText: 'Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia',
      fileName: '20260604_Minuta pregătiri preliminare evenimente regionale 1.docx',
    }),
    {
      declaredTitle: '',
      titleSource: undefined,
      autoFilled: false,
    },
  );
});

test('blocks confirmation when the declared title is meeting metadata', () => {
  const metadataTitle = 'Data ședinței: 04.06.2026 Locația ședinței: Sediul Confederației Patronale Concordia';
  const result = validateDeclaredTitleInDocumentText({
    documentText: `${metadataTitle}\nParticipanți: membri CPC`,
    declaredTitle: metadataTitle,
    titleSource: 'auto_detected',
  });

  assert.equal(result.titleMatch, false);
  assert.equal(result.titleCheckStatus, 'mismatch');
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
