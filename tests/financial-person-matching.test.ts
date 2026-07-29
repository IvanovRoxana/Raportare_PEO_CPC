import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFinancialPersonKey, rankFinancialPersonMatches } from '../lib/financial-person-matching.ts';
import type { Expert, FinancialPersonLink } from '../lib/types.ts';

const experts: Expert[] = [
  { id: 'alexandra-colceru', name: 'Alexandra Ioana Colceru', role: 'Expert', norma: 8 },
  { id: 'adelina-andrei', name: 'Andrei Adelina', role: 'Expert', norma: 8 },
  { id: 'roxana-ivanov', name: 'Roxana Ivanov', role: 'Expert', norma: 8 },
];

test('normalizeaza cheia persoanei financiare pentru potriviri robuste', () => {
  assert.equal(normalizeFinancialPersonKey('  Ștefănescu-Ioană  '), 'stefanescu ioana');
});

test('sugereaza experti cu nume intermediar sau ordine diferita', () => {
  const middleNameMatch = rankFinancialPersonMatches('Alexandra Colceru', experts);
  assert.equal(middleNameMatch[0].expertId, 'alexandra-colceru');
  assert.equal(middleNameMatch[0].reason, 'potrivire cu nume intermediar');

  const reorderedMatch = rankFinancialPersonMatches('Adelina Andrei', experts);
  assert.equal(reorderedMatch[0].expertId, 'adelina-andrei');
  assert.equal(reorderedMatch[0].reason, 'aceleasi parti de nume, alta ordine');
});

test('nu propune sugestii respinse manual pentru aceeasi persoana financiara', () => {
  const links: FinancialPersonLink[] = [{
    id: 'dismissed-1',
    financialPersonName: 'Alexandra Colceru',
    financialPersonKey: 'alexandra colceru',
    expertId: 'alexandra-colceru',
    status: 'dismissed',
    confidence: 0.9,
    source: 'manual',
  }];

  const suggestions = rankFinancialPersonMatches('Alexandra Colceru', experts, links);
  assert.equal(suggestions.some((suggestion) => suggestion.expertId === 'alexandra-colceru'), false);
});
