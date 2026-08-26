import referenceSeed from '../data/staging/seed.json' with { type: 'json' };
import { normalizeFinancialPersonKey, rankFinancialPersonMatches, type FinancialPersonMatchSuggestion } from './financial-person-matching.ts';
import type { Expert, ExpertNormContract, FinancialPersonLink, NormUnit } from './types.ts';
import { getEffectiveNormContract } from './time-capacity.ts';

export type FinancialHrFieldStatus = 'ok' | 'missing' | 'different' | 'unlinked';
export type FinancialHrRowStatus = 'ok' | 'needs_review' | 'unlinked' | 'extra';

export type FinancialHrFieldCheck = {
  appValue: string;
  excelValue: string;
  status: FinancialHrFieldStatus;
};

export type FinancialHrValidationRow = {
  id: string;
  financialPersonKey: string;
  financialPersonName: string;
  expert?: Expert;
  expertId?: string;
  status: FinancialHrRowStatus;
  basePosition: FinancialHrFieldCheck;
  peoFunction: FinancialHrFieldCheck;
  peoNorm: FinancialHrFieldCheck;
  goodworksFunction: FinancialHrFieldCheck;
  cimNorm: FinancialHrFieldCheck;
  matchSuggestions: FinancialPersonMatchSuggestion[];
};

export type FinancialHrValidationSummary = {
  total: number;
  ok: number;
  needsReview: number;
  unlinked: number;
  extra: number;
};

export type ParsedFinancialNorm = {
  unit: NormUnit;
  value: number;
  dailyCap: number;
};

export type FinancialHrReferencePerson = (typeof referenceSeed.people)[number];

const MISSING_VALUE = '-';

function displayValue(value: unknown) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized && normalized !== MISSING_VALUE ? normalized : MISSING_VALUE;
}

function comparableValue(value: unknown) {
  return normalizeFinancialPersonKey(displayValue(value));
}

function buildFieldCheck(appValue: unknown, excelValue: unknown, linked: boolean): FinancialHrFieldCheck {
  const app = displayValue(appValue);
  const excel = displayValue(excelValue);
  if (!linked) return { appValue: app, excelValue: excel, status: 'unlinked' };
  if (app === MISSING_VALUE && excel !== MISSING_VALUE) return { appValue: app, excelValue: excel, status: 'missing' };
  if (comparableValue(app) !== comparableValue(excel)) return { appValue: app, excelValue: excel, status: 'different' };
  return { appValue: app, excelValue: excel, status: 'ok' };
}

function inferRowStatus(checks: FinancialHrFieldCheck[], linked: boolean): FinancialHrRowStatus {
  if (!linked) return 'unlinked';
  return checks.every((check) => check.status === 'ok') ? 'ok' : 'needs_review';
}

export function parseFinancialHrNorm(value?: string): ParsedFinancialNorm | null {
  const display = displayValue(value);
  if (display === MISSING_VALUE) return null;
  const match = display.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const unit: NormUnit = /h\s*\/\s*luna/i.test(display) ? 'HOURS_PER_MONTH' : 'HOURS_PER_DAY';
  return { unit, value: parsed, dailyCap: unit === 'HOURS_PER_DAY' ? parsed : 8 };
}

export function formatFinancialHrNorm(unit?: NormUnit, value?: number) {
  if (!unit || value == null || !Number.isFinite(value)) return MISSING_VALUE;
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value)} ${unit === 'HOURS_PER_MONTH' ? 'h/luna' : 'h/zi'}`;
}

function activeCimNormLabel(expert: Expert | undefined, contracts: ExpertNormContract[], date: string) {
  if (!expert) return MISSING_VALUE;
  const contract = getEffectiveNormContract(contracts, expert.id, date);
  if (contract) return formatFinancialHrNorm(contract.cimNormUnit, contract.cimNormValue);
  const daily = expert.dailyHours ?? expert.oreZi ?? expert.norma;
  return daily ? formatFinancialHrNorm('HOURS_PER_DAY', daily) : MISSING_VALUE;
}

function activePeoNormLabel(expert: Expert | undefined, contracts: ExpertNormContract[], date: string) {
  if (!expert) return MISSING_VALUE;
  const contract = getEffectiveNormContract(contracts, expert.id, date);
  if (contract) return formatFinancialHrNorm(contract.peoNormUnit, contract.peoNormValue);
  const daily = expert.projectMonthlyNorm ?? expert.dailyHours ?? expert.oreZi ?? expert.norma;
  return daily ? formatFinancialHrNorm(expert.projectMonthlyNorm ? 'HOURS_PER_MONTH' : 'HOURS_PER_DAY', daily) : MISSING_VALUE;
}

function resolveExpertForReference(args: {
  person: FinancialHrReferencePerson;
  experts: Expert[];
  expertById: Map<string, Expert>;
  expertByName: Map<string, Expert>;
  links: FinancialPersonLink[];
}) {
  const key = normalizeFinancialPersonKey(args.person.name);
  const confirmed = args.links.find((link) => link.financialPersonKey === key && link.status === 'confirmed' && link.expertId);
  if (confirmed?.expertId) return args.expertById.get(confirmed.expertId);
  const exact = args.expertByName.get(key);
  if (exact) return exact;
  const [best, second] = rankFinancialPersonMatches(args.person.name, args.experts, args.links);
  if (best && best.score >= 0.96 && (!second || second.score < best.score)) return args.expertById.get(best.expertId);
  return undefined;
}

export function buildFinancialHrValidationRows(input: {
  experts: Expert[];
  normContracts?: ExpertNormContract[];
  financialPersonLinks?: FinancialPersonLink[];
  referencePeople?: FinancialHrReferencePerson[];
  month?: number;
  year?: number;
}) {
  const referencePeople = input.referencePeople ?? referenceSeed.people;
  const month = input.month ?? referenceSeed.month - 1;
  const year = input.year ?? referenceSeed.year;
  const date = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const contracts = input.normContracts ?? [];
  const links = input.financialPersonLinks ?? [];
  const experts = input.experts;
  const expertById = new Map(experts.map((expert) => [expert.id, expert]));
  const expertByName = new Map(experts.map((expert) => [normalizeFinancialPersonKey(expert.name), expert]));
  const matchedExpertIds = new Set<string>();

  const rows: FinancialHrValidationRow[] = referencePeople.map((person) => {
    const key = normalizeFinancialPersonKey(person.name);
    const expert = resolveExpertForReference({ person, experts, expertById, expertByName, links });
    if (expert) matchedExpertIds.add(expert.id);
    const linked = Boolean(expert);
    const basePosition = buildFieldCheck(expert?.basePositionConcordia, person.basePosition, linked);
    const peoFunction = buildFieldCheck(expert?.positionInProject ?? expert?.role, person.peoPosition, linked);
    const peoNorm = buildFieldCheck(activePeoNormLabel(expert, contracts, date), person.peoNorm, linked);
    const goodworksFunction = buildFieldCheck(expert?.goodworksPosition, person.goodworksPosition, linked);
    const cimNorm = buildFieldCheck(activeCimNormLabel(expert, contracts, date), person.cimNorm, linked);
    const checks = [basePosition, peoFunction, peoNorm, goodworksFunction, cimNorm];
    return {
      id: key,
      financialPersonKey: key,
      financialPersonName: person.name,
      expert,
      expertId: expert?.id,
      status: inferRowStatus(checks, linked),
      basePosition,
      peoFunction,
      peoNorm,
      goodworksFunction,
      cimNorm,
      matchSuggestions: expert ? [] : rankFinancialPersonMatches(person.name, experts, links),
    };
  });

  for (const expert of experts) {
    if (matchedExpertIds.has(expert.id) || expert.isActive === false) continue;
    const key = normalizeFinancialPersonKey(expert.name);
    rows.push({
      id: `extra:${expert.id}`,
      financialPersonKey: key,
      financialPersonName: expert.name,
      expert,
      expertId: expert.id,
      status: 'extra',
      basePosition: buildFieldCheck(expert.basePositionConcordia, MISSING_VALUE, true),
      peoFunction: buildFieldCheck(expert.positionInProject ?? expert.role, MISSING_VALUE, true),
      peoNorm: buildFieldCheck(activePeoNormLabel(expert, contracts, date), MISSING_VALUE, true),
      goodworksFunction: buildFieldCheck(expert.goodworksPosition, MISSING_VALUE, true),
      cimNorm: buildFieldCheck(activeCimNormLabel(expert, contracts, date), MISSING_VALUE, true),
      matchSuggestions: [],
    });
  }

  return rows;
}

export function summarizeFinancialHrValidation(rows: FinancialHrValidationRow[]): FinancialHrValidationSummary {
  return {
    total: rows.length,
    ok: rows.filter((row) => row.status === 'ok').length,
    needsReview: rows.filter((row) => row.status === 'needs_review').length,
    unlinked: rows.filter((row) => row.status === 'unlinked').length,
    extra: rows.filter((row) => row.status === 'extra').length,
  };
}

export function financialHrRowNeedsAttention(row: FinancialHrValidationRow) {
  return row.status !== 'ok';
}
