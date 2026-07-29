import type { Expert, FinancialPersonLink } from './types';

export type FinancialPersonMatchSuggestion = {
  expertId: string;
  expertName: string;
  expertEmail?: string;
  score: number;
  reason: string;
};

export function normalizeFinancialPersonKey(value: string | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string | undefined) {
  return normalizeFinancialPersonKey(value).split(' ').filter(Boolean);
}

function tokenSet(value: string | undefined) {
  return new Set(tokens(value));
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function scoreName(financialName: string, expertName: string) {
  const financialKey = normalizeFinancialPersonKey(financialName);
  const expertKey = normalizeFinancialPersonKey(expertName);
  if (!financialKey || !expertKey) return { score: 0, reason: 'nume incomplet' };
  if (financialKey === expertKey) return { score: 1, reason: 'nume identic' };

  const financialTokens = tokenSet(financialName);
  const expertTokens = tokenSet(expertName);
  const shared = intersectionSize(financialTokens, expertTokens);
  const smallest = Math.min(financialTokens.size, expertTokens.size);
  const largest = Math.max(financialTokens.size, expertTokens.size);
  if (smallest > 0 && shared === largest) return { score: 0.96, reason: 'aceleasi parti de nume, alta ordine' };
  if (smallest > 0 && shared === smallest && largest > smallest) return { score: 0.9, reason: 'potrivire cu nume intermediar' };

  const union = new Set([...financialTokens, ...expertTokens]).size;
  const jaccard = union ? shared / union : 0;
  return { score: Number((jaccard * 0.82).toFixed(3)), reason: 'potrivire partiala dupa nume' };
}

export function rankFinancialPersonMatches(
  financialName: string,
  experts: Expert[],
  links: FinancialPersonLink[] = [],
): FinancialPersonMatchSuggestion[] {
  const financialPersonKey = normalizeFinancialPersonKey(financialName);
  const dismissedExpertIds = new Set(
    links
      .filter((link) => link.financialPersonKey === financialPersonKey && link.status === 'dismissed' && link.expertId)
      .map((link) => link.expertId!),
  );

  return experts
    .filter((expert) => !dismissedExpertIds.has(expert.id))
    .map((expert) => {
      const scored = scoreName(financialName, expert.name);
      return {
        expertId: expert.id,
        expertName: expert.name,
        expertEmail: expert.email,
        score: scored.score,
        reason: scored.reason,
      };
    })
    .filter((match) => match.score >= 0.55)
    .sort((left, right) => right.score - left.score || left.expertName.localeCompare(right.expertName, 'ro'))
    .slice(0, 5);
}
