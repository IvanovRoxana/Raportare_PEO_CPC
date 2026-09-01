export type TitleSource = 'auto_detected' | 'manual' | 'edited_by_expert' | 'admin_override';
export type TitleCheckStatus = 'matched' | 'mismatch' | 'extraction_failed' | 'admin_overridden';
export type TitleSuggestionConfidence = 'high' | 'medium' | 'low';

export interface TitleCheckResult {
  titleMatch: boolean;
  titleCheckStatus: TitleCheckStatus;
  titleCheckMessage: string;
}

export interface TitleSuggestionResult {
  suggestedTitle: string | null;
  confidence: TitleSuggestionConfidence;
  alternatives: string[];
  reason?: string;
}

const GENERIC_LINE_PATTERNS = [
  /^peo\s*2021\s*[-–]\s*2027$/i,
  /program(ul)?\s+educa(t|ț)ie/i,
  /ocupar(e|ii)/i,
  /confedera(t|ț)ia\s+patronal(a|ă)\s+concordia/i,
  /^cod\s+smis/i,
  /^cod\s+mysmis/i,
  /^mysmis\s*[:#-]?\s*\d+$/i,
  /^cod\s+proiect/i,
  /^proiect\s*(nr\.?|num(a|ă)r)?\s*[:#-]?\s*[\w./-]+$/i,
  /^cod\b/i,
  /^pagina\s+\d+(\s+din\s+\d+)?$/i,
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^anexa\b$/i,
  /^raport$/i,
  /^document$/i,
  /^livrabil$/i,
  /^cofinan(t|ț)at/i,
  /^uniunea\s+european(a|ă)$/i,
  /^guvernul\s+rom(a|â)niei$/i,
  /^ministerul\b/i,
  /^autoritatea\b/i,
  /^beneficiar\b/i,
  /^partener\b/i,
  /^cui\b/i,
  /^tel(efon)?\b/i,
  /^e[- ]?mail\b/i,
  /^www\./i,
  /^https?:\/\//i,
  /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i,
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,
  /^\d+$/,
];

const RELEVANT_TITLE_TERMS = [
  'raport',
  'analiz',
  'notă',
  'nota',
  'metodologie',
  'ghid',
  'centralizare',
  'sinteză',
  'sinteza',
  'informare',
  'livrabil',
  'plan',
  'document de lucru',
  'studiu',
  'manual',
  'procedură',
  'procedura',
  'strategie',
  'curriculum',
  'suport de curs',
  'minute',
  'proces verbal',
  'instrument',
];

const ADMINISTRATIVE_TERMS = [
  'beneficiar',
  'partener',
  'proiect',
  'cod smis',
  'cod mysmis',
  'mysmis',
  'programul educație și ocupare',
  'programul educatie si ocupare',
  'uniunea europeană',
  'uniunea europeana',
  'guvernul româniei',
  'guvernul romaniei',
  'ministerul',
  'adresa',
  'strada',
  'telefon',
  'email',
];

const ADMINISTRATIVE_FIRST_LINE_PATTERNS = [
  /^data\b/i,
  /^dat(a|ă)\s*[:.-]/i,
  /^loca(t|ț)ie\b/i,
  /^locul\b/i,
  /^participant/i,
  /^semn(a|ă)turi?/i,
  /^dovad(a|ă)\b/i,
  /^captur(a|ă)\b/i,
  /^screenshot\b/i,
  /^teams\b/i,
  /^zoom\b/i,
  /^link\b/i,
  /^agenda\b/i,
  /^prezen(t|ț)(a|ă)\b/i,
  /^tabel\b/i,
];

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTitleForMatch(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function splitRelevantLines(text?: string | null) {
  return (text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeSpaces)
    .filter(Boolean);
}

function wordCount(line: string) {
  return normalizeSpaces(line).split(/\s+/).filter(Boolean).length;
}

function hasRelevantTitleTerm(line: string) {
  const normalized = line.toLowerCase();
  return RELEVANT_TITLE_TERMS.some((term) => normalized.includes(term));
}

function looksAdministrative(line: string) {
  const normalized = normalizeSpaces(line);
  const lower = normalized.toLowerCase();
  return ADMINISTRATIVE_FIRST_LINE_PATTERNS.some((pattern) => pattern.test(normalized))
    || (ADMINISTRATIVE_TERMS.some((term) => lower.includes(term)) && !hasRelevantTitleTerm(normalized));
}

function isGenericStandalone(line: string) {
  return /^(raport|document|anex(a|ă)|livrabil|not(a|ă)|plan|ghid)$/i.test(normalizeSpaces(line));
}

export function isGenericTitleLine(line: string) {
  const normalized = normalizeSpaces(line);
  const words = wordCount(normalized);
  if (normalized.length < 5) return true;
  if (normalized.length > 180) return true;
  if (words > 24) return true;
  if (/[,;:]\s*(str\.|sector|jude(t|ț)|telefon|tel\.|fax|email|e-mail|www\.|https?:\/\/)/i.test(normalized)) return true;
  if (/\b(CUI|CIF|IBAN|RO\d{2}[A-Z]{4})\b/i.test(normalized)) return true;
  if (/\b\d{6,}\b/.test(normalized) && !hasRelevantTitleTerm(normalized)) return true;
  return GENERIC_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeContinuation(line: string) {
  const normalized = normalizeSpaces(line);
  if (isGenericTitleLine(normalized)) return false;
  if (wordCount(normalized) > 16) return false;
  if (/[.!?]$/.test(normalized)) return false;
  if (/^(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+\d{4}$/i.test(normalized)) return false;
  if (/^(aprobat|avizat|întocmit|intocmit|data|semn(a|ă)tura)/i.test(normalized)) return false;
  return normalized.length >= 8 && normalized.length <= 120;
}

function titleCaseSignal(line: string) {
  const words = normalizeSpaces(line).split(/\s+/).filter((word) => /[A-Za-zĂÂÎȘȚăâîșț]/.test(word));
  if (words.length === 0) return 0;
  const uppercaseWords = words.filter((word) => word.length > 2 && word === word.toLocaleUpperCase('ro-RO')).length;
  const capitalizedWords = words.filter((word) => /^[A-ZĂÂÎȘȚ]/.test(word)).length;
  if (uppercaseWords / words.length >= 0.65) return 8;
  if (capitalizedWords / words.length >= 0.45) return 4;
  return 0;
}

function scoreTitleCandidate(candidate: string, index: number, lineCount: number) {
  const normalized = normalizeSpaces(candidate);
  const words = wordCount(normalized);
  let score = 0;
  const relativePosition = lineCount > 0 ? index / lineCount : 1;

  if (relativePosition <= 0.4) score += 25;
  else if (relativePosition <= 0.6) score += 10;
  else score -= 15;

  if (words >= 4 && words <= 14) score += 24;
  else if (words >= 3 && words <= 18) score += 12;
  else score -= 15;
  if (words < 3 && !hasRelevantTitleTerm(normalized)) score -= 35;

  if (normalized.length >= 24 && normalized.length <= 140) score += 12;
  if (hasRelevantTitleTerm(normalized)) score += 22;
  if (/^(raport|analiz(a|ă)|not(a|ă)|metodologie|ghid|centralizare|sintez(a|ă)|informare|livrabil|plan|document de lucru|studiu|manual|strategie)\b/i.test(normalized)) score += 10;
  score += titleCaseSignal(normalized);

  if (isGenericStandalone(normalized)) score -= 35;
  if (ADMINISTRATIVE_TERMS.some((term) => normalized.toLowerCase().includes(term)) && !hasRelevantTitleTerm(normalized)) score -= 20;
  if (/^[A-ZĂÂÎȘȚ0-9 .,&-]{5,}$/.test(normalized) && !hasRelevantTitleTerm(normalized)) score -= 12;
  if (/[.!?]$/.test(normalized)) score -= 8;
  if (/:$/.test(normalized)) score -= 8;

  return score;
}

function uniqueCandidates(candidates: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  candidates.forEach((candidate) => {
    const clean = normalizeSpaces(candidate).replace(/^["'„”]+|["'„”]+$/g, '');
    const key = normalizeTitleForMatch(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    result.push(clean.slice(0, 220));
  });
  return result;
}

export function formatTitleFromFilename(fileName?: string | null) {
  const withoutExtension = normalizeSpaces(String(fileName || '').replace(/\.[^.]+$/, ''));
  return withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLikelyFilenameDerivedTitle(title?: string | null, fileName?: string | null) {
  const titleNorm = normalizeTitleForMatch(String(title || '').replace(/\.[a-z0-9]{2,5}$/i, ''));
  const fileTitleNorm = normalizeTitleForMatch(formatTitleFromFilename(fileName));
  if (!titleNorm || !fileTitleNorm) return false;
  if (titleNorm === fileTitleNorm) return true;

  const titleWords = titleNorm.split(' ').filter(Boolean);
  if (titleWords.length > 2 || titleNorm.length > 24) return false;

  const fileWords = new Set(fileTitleNorm.split(' ').filter(Boolean));
  return titleWords.every((word) => word.length > 3 && fileWords.has(word));
}

export function suggestTitleFromFirstPage(text?: string | null): TitleSuggestionResult {
  const lines = splitRelevantLines(text);
  if (lines.length === 0) {
    return {
      suggestedTitle: null,
      confidence: 'low',
      alternatives: [],
      reason: 'Nu există text extras din prima pagină.',
    };
  }

  const candidateRows: Array<{ value: string; score: number; index: number }> = [];
  const scanLimit = Math.min(lines.length, Math.max(8, Math.ceil(lines.length * 0.6)));

  for (let index = 0; index < scanLimit; index += 1) {
    const line = lines[index];
    if (!isGenericTitleLine(line)) {
      candidateRows.push({ value: line, score: scoreTitleCandidate(line, index, lines.length), index });
    }

    const nextLine = lines[index + 1];
    if (line && nextLine && !isGenericTitleLine(line) && looksLikeContinuation(nextLine)) {
      const combined = `${line} ${nextLine}`;
      candidateRows.push({ value: combined, score: scoreTitleCandidate(combined, index, lines.length) + 5, index });
    }
  }

  const ranked = uniqueCandidates(
    candidateRows
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((candidate) => candidate.value)
  );
  const best = ranked[0] || null;
  const bestScore = best ? candidateRows.find((row) => normalizeTitleForMatch(row.value) === normalizeTitleForMatch(best))?.score ?? 0 : 0;
  const confidence: TitleSuggestionConfidence = bestScore >= 55 ? 'high' : bestScore >= 35 ? 'medium' : 'low';

  return {
    suggestedTitle: best,
    confidence,
    alternatives: ranked.slice(1, 4),
    reason: best
      ? `Candidat selectat din primele linii ale primei pagini (scor ${bestScore}).`
      : 'Nu a fost identificat un candidat relevant pentru titlu.',
  };
}

export function firstLinesLookAdministrative(text?: string | null) {
  const lines = splitRelevantLines(text).slice(0, 8);
  if (lines.length === 0) return false;
  const administrativeLines = lines.filter((line) => looksAdministrative(line)).length;
  return administrativeLines >= 2 || looksAdministrative(lines[0]);
}

export function shouldUseAiTitleSuggestion(args: {
  text?: string | null;
  suggestion?: TitleSuggestionResult | null;
}) {
  if (!args.text || String(args.text).trim().length < 20) return false;
  return true;
}

export function detectSuggestedTitleFromText(text?: string | null) {
  return suggestTitleFromFirstPage(text).suggestedTitle;
}

export function resolveDocumentTitleSuggestion(args: {
  localSuggestion: TitleSuggestionResult;
  aiSuggestion?: TitleSuggestionResult | null;
  documentText?: string | null;
}): TitleSuggestionResult {
  const aiTitle = normalizeSpaces(args.aiSuggestion?.suggestedTitle || '');
  if (aiTitle && titleExistsInDocumentText(args.documentText, aiTitle)) {
    return {
      suggestedTitle: aiTitle,
      confidence: args.aiSuggestion?.confidence || 'medium',
      alternatives: args.aiSuggestion?.alternatives || [],
      reason: args.aiSuggestion?.reason,
    };
  }

  const localTitle = normalizeSpaces(args.localSuggestion.suggestedTitle || '');
  if (localTitle && titleExistsInDocumentText(args.documentText, localTitle)) {
    return {
      ...args.localSuggestion,
      suggestedTitle: localTitle,
      reason: args.aiSuggestion?.suggestedTitle === null
        ? 'AI nu a confirmat un titlu, dar sugestia locala apare explicit in prima pagina.'
        : args.localSuggestion.reason,
    };
  }

  return args.aiSuggestion || args.localSuggestion;
}

export function titleExistsInDocumentText(documentText: string | null | undefined, declaredTitle: string | null | undefined) {
  const documentNorm = normalizeTitleForMatch(documentText || '');
  const titleNorm = normalizeTitleForMatch(declaredTitle || '');
  if (!documentNorm || !titleNorm) return false;

  if (documentNorm.includes(titleNorm)) return true;

  const words = titleNorm.split(' ').filter((word) => word.length > 3);
  if (words.length === 0) return false;
  if (words.length < 5 || titleNorm.length < 32) return false;

  const matchedWords = words.filter((word) => documentNorm.includes(word)).length;
  return matchedWords >= Math.max(5, Math.ceil(words.length * 0.9));
}

export function validateDeclaredTitleInDocumentText(args: {
  documentText?: string | null;
  declaredTitle?: string | null;
  titleSource?: TitleSource | string;
  allowManualConfirmationWithoutExtractedText?: boolean;
}): TitleCheckResult {
  if (args.titleSource === 'admin_override') {
    return {
      titleMatch: true,
      titleCheckStatus: 'admin_overridden',
      titleCheckMessage: 'Titlul a fost suprascris de administrator cu justificare.',
    };
  }

  if (!args.documentText) {
    if (args.allowManualConfirmationWithoutExtractedText && normalizeSpaces(args.declaredTitle || '')) {
      return {
        titleMatch: true,
        titleCheckStatus: 'matched',
        titleCheckMessage: 'Titlul a fost confirmat manual; textul documentului nu a putut fi extras pentru verificare automata.',
      };
    }

    return {
      titleMatch: false,
      titleCheckStatus: 'extraction_failed',
      titleCheckMessage: 'Nu am putut extrage textul documentului pentru verificarea titlului.',
    };
  }

  const matched = titleExistsInDocumentText(args.documentText, args.declaredTitle);
  return {
    titleMatch: matched,
    titleCheckStatus: matched ? 'matched' : 'mismatch',
    titleCheckMessage: matched
      ? 'Titlul se regaseste in document.'
      : 'Titlul final nu se regaseste in document. Validarea este blocata pana la corectare sau suprascriere de administrator.',
  };
}

export function applyAutomaticTitleSuggestion(args: {
  currentDeclaredTitle?: string | null;
  currentTitleSource?: TitleSource | string | null;
  suggestedTitle?: string | null;
  confidence?: TitleSuggestionConfidence | string | null;
  documentText?: string | null;
  fileName?: string | null;
}) {
  const declaredTitle = normalizeSpaces(args.currentDeclaredTitle || '');
  const suggestedTitle = normalizeSpaces(args.suggestedTitle || '');
  const canAutoFill = args.confidence === 'high';
  const currentTitleSource = args.currentTitleSource || (declaredTitle ? 'manual' : undefined);
  const keepExplicitExpertTitle = currentTitleSource === 'edited_by_expert' || currentTitleSource === 'admin_override';
  const currentTitleExistsInDocument = declaredTitle
    ? titleExistsInDocumentText(args.documentText, declaredTitle)
    : false;
  const currentTitleLooksStale = Boolean(
    declaredTitle
    && !keepExplicitExpertTitle
    && (
      isLikelyFilenameDerivedTitle(declaredTitle, args.fileName)
      || (args.documentText && !currentTitleExistsInDocument)
    ),
  );

  if (keepExplicitExpertTitle) {
    return {
      declaredTitle,
      titleSource: currentTitleSource as TitleSource,
      autoFilled: false,
    };
  }

  if (!suggestedTitle) {
    return {
      declaredTitle: currentTitleLooksStale ? '' : declaredTitle,
      titleSource: currentTitleLooksStale ? undefined : currentTitleSource as TitleSource | undefined,
      autoFilled: false,
    };
  }

  if ((!declaredTitle || currentTitleLooksStale) && canAutoFill) {
    return {
      declaredTitle: suggestedTitle,
      titleSource: 'auto_detected' as TitleSource,
      autoFilled: true,
    };
  }

  return {
    declaredTitle,
    titleSource: currentTitleSource as TitleSource | undefined,
    autoFilled: false,
  };
}
