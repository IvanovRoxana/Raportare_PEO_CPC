export type TitleSource = 'auto_detected' | 'manual' | 'edited_by_expert' | 'admin_override';
export type TitleCheckStatus = 'matched' | 'mismatch' | 'extraction_failed' | 'admin_overridden';

export interface TitleCheckResult {
  titleMatch: boolean;
  titleCheckStatus: TitleCheckStatus;
  titleCheckMessage: string;
}

const GENERIC_LINE_PATTERNS = [
  /^peo\s*2021\s*[-–]\s*2027$/i,
  /program(ul)?\s+educa(t|ț)ie/i,
  /ocupar(e|ii)/i,
  /confedera(t|ț)ia\s+patronal(a|ă)\s+concordia/i,
  /^cod\s+smis/i,
  /^cod\s+proiect/i,
  /^cod\b/i,
  /^pagina\s+\d+/i,
  /^page\s+\d+/i,
  /^anexa\b/i,
  /^raport$/i,
  /^document$/i,
  /^cofinan(t|ț)at/i,
  /^uniunea\s+european(a|ă)$/i,
  /^guvernul\s+rom(a|â)niei$/i,
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,
  /^\d+$/,
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

export function isGenericTitleLine(line: string) {
  const normalized = normalizeSpaces(line);
  if (normalized.length < 5) return true;
  if (normalized.length > 220) return true;
  return GENERIC_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeContinuation(line: string) {
  if (isGenericTitleLine(line)) return false;
  if (/^[,.;:)]/.test(line)) return true;
  if (/^[a-zăâîșț]/.test(line)) return true;
  return line.length >= 8 && line.length <= 90 && !/[.!?]$/.test(line);
}

export function detectSuggestedTitleFromText(text?: string | null) {
  const lines = splitRelevantLines(text);
  const firstRelevantIndex = lines.findIndex((line) => !isGenericTitleLine(line));
  if (firstRelevantIndex === -1) return null;

  const titleParts = [lines[firstRelevantIndex]];
  const nextLine = lines[firstRelevantIndex + 1];
  if (nextLine && looksLikeContinuation(nextLine)) {
    titleParts.push(nextLine);
  }

  return normalizeSpaces(titleParts.join(' ')).slice(0, 220);
}

export function titleExistsInFirstPage(firstPageText: string | null | undefined, declaredTitle: string | null | undefined) {
  const pageNorm = normalizeTitleForMatch(firstPageText || '');
  const titleNorm = normalizeTitleForMatch(declaredTitle || '');
  if (!pageNorm || !titleNorm) return false;

  if (pageNorm.includes(titleNorm)) return true;

  const words = titleNorm.split(' ').filter((word) => word.length > 3);
  if (words.length === 0) return false;

  const matchedWords = words.filter((word) => pageNorm.includes(word)).length;
  return matchedWords >= Math.ceil(words.length * 0.8);
}

export function validateDeclaredTitleOnFirstPage(args: {
  firstPageText?: string | null;
  declaredTitle?: string | null;
  titleSource?: TitleSource | string;
}): TitleCheckResult {
  if (args.titleSource === 'admin_override') {
    return {
      titleMatch: true,
      titleCheckStatus: 'admin_overridden',
      titleCheckMessage: 'Titlul a fost suprascris de administrator cu justificare.',
    };
  }

  if (!args.firstPageText) {
    return {
      titleMatch: false,
      titleCheckStatus: 'extraction_failed',
      titleCheckMessage: 'Nu am putut extrage textul din prima pagina pentru verificarea titlului.',
    };
  }

  const matched = titleExistsInFirstPage(args.firstPageText, args.declaredTitle);
  return {
    titleMatch: matched,
    titleCheckStatus: matched ? 'matched' : 'mismatch',
    titleCheckMessage: matched
      ? 'Titlul se regaseste in prima pagina.'
      : 'Titlul final nu se regaseste in prima pagina. Validarea este blocata pana la corectare sau suprascriere de administrator.',
  };
}

export function applyAutomaticTitleSuggestion(args: {
  currentDeclaredTitle?: string | null;
  suggestedTitle?: string | null;
}) {
  const declaredTitle = normalizeSpaces(args.currentDeclaredTitle || '');
  const suggestedTitle = normalizeSpaces(args.suggestedTitle || '');

  if (!suggestedTitle) {
    return {
      declaredTitle,
      titleSource: declaredTitle ? ('manual' as TitleSource) : undefined,
      autoFilled: false,
    };
  }

  if (!declaredTitle) {
    return {
      declaredTitle: suggestedTitle,
      titleSource: 'auto_detected' as TitleSource,
      autoFilled: true,
    };
  }

  return {
    declaredTitle,
    titleSource: 'manual' as TitleSource,
    autoFilled: false,
  };
}
