const ROMANIAN_DIACRITICS: Record<string, string> = {
  ă: 'a',
  â: 'a',
  î: 'i',
  ș: 's',
  ş: 's',
  ț: 't',
  ţ: 't',
  Ă: 'a',
  Â: 'a',
  Î: 'i',
  Ș: 's',
  Ş: 's',
  Ț: 't',
  Ţ: 't',
};

export function normalizeEvaluationText(value: string | undefined | null) {
  return String(value ?? '')
    .replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (char) => ROMANIAN_DIACRITICS[char] ?? char)
    .toLowerCase()
    .replace(/[_\-./\\()[\]{}:;,"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeFilename(value: string) {
  const parts = value.split(/[\\/]/);
  return normalizeEvaluationText(parts[parts.length - 1] ?? value);
}

export function getFileExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function countKeywordHits(text: string, keywords: string[]) {
  const normalizedText = normalizeEvaluationText(text);
  return keywords.reduce((count, keyword) => {
    const normalizedKeyword = normalizeEvaluationText(keyword);
    return normalizedKeyword && normalizedText.includes(normalizedKeyword) ? count + 1 : count;
  }, 0);
}

export function lexicalMatchScore(text: string, coreKeywords: string[], strongTerms: string[]) {
  const coreHits = countKeywordHits(text, coreKeywords);
  const strongHits = countKeywordHits(text, strongTerms);
  const denominator = Math.max(1, coreKeywords.length + strongTerms.length * 2);
  return Math.min(1, (coreHits + strongHits * 2) / denominator);
}

export function roundScore(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
