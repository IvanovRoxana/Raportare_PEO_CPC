import referenceSeed from '../data/staging/seed.json' with { type: 'json' };
import { normalizeFinancialPersonKey } from './financial-person-matching.ts';
import { getEffectiveNormContract } from './time-capacity.ts';
import type { Expert, ExpertNormContract, NormUnit } from './types.ts';

function parseNormLabel(value?: string) {
  if (!value || value === '-') return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const unit: NormUnit = /h\s*\/\s*luna/i.test(value) ? 'HOURS_PER_MONTH' : 'HOURS_PER_DAY';
  return {
    value: Number(match[1].replace(',', '.')) || 0,
    unit,
  };
}

function sameFinancialPerson(left?: string, right?: string) {
  const leftKey = normalizeFinancialPersonKey(left);
  const rightKey = normalizeFinancialPersonKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  const leftTokens = leftKey.split(' ').filter(Boolean).sort().join(' ');
  const rightTokens = rightKey.split(' ').filter(Boolean).sort().join(' ');
  return leftTokens === rightTokens;
}

function monthStart(month: number, year: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function referenceBaselineStart() {
  return monthStart(referenceSeed.month, referenceSeed.year);
}

function isAppEditedContract(contract: ExpertNormContract) {
  return !contract.id.startsWith('financial-reference:')
    && (Boolean(contract.createdBy) || Boolean(contract.updatedBy));
}

export function applyFinancialReferenceNorms(
  expert: Partial<Expert>,
  contracts: ExpertNormContract[] | undefined,
  month: number,
  year: number,
  referencePeople: Array<{ name: string; peoNorm?: string; cimNorm?: string }> = referenceSeed.people,
) {
  const reference = referencePeople.find((person) => sameFinancialPerson(person.name, expert.name));
  const peoNorm = parseNormLabel(reference?.peoNorm);
  const cimNorm = parseNormLabel(reference?.cimNorm);
  if (!reference || !peoNorm || !cimNorm || !expert.id) return contracts ?? [];

  const start = monthStart(month, year);
  const existingContracts = contracts ?? [];
  const appEditedContract = getEffectiveNormContract(
    existingContracts.filter(isAppEditedContract),
    expert.id,
    start,
  );
  if (appEditedContract) return existingContracts;

  const financialContract: ExpertNormContract = {
    id: `financial-reference:${expert.id}`,
    expertId: expert.id,
    validFrom: referenceBaselineStart(),
    peoNormUnit: peoNorm.unit,
    peoNormValue: peoNorm.value,
    peoDailyCap: peoNorm.unit === 'HOURS_PER_DAY' ? peoNorm.value : 0,
    cimNormUnit: cimNorm.unit,
    cimNormValue: cimNorm.value,
    cimDailyCap: cimNorm.unit === 'HOURS_PER_DAY' ? cimNorm.value : 8,
    leaveHoursPerDay: cimNorm.unit === 'HOURS_PER_DAY' ? cimNorm.value : 8,
    status: 'ACTIVE',
    justification: 'Norme preluate din tabelul Financiar',
  };

  const financialContracts = existingContracts.filter((contract) => (
    contract.expertId !== expert.id
    || isAppEditedContract(contract)
  ));
  return [...financialContracts, financialContract];
}
