import referenceSeed from '../data/staging/seed.json' with { type: 'json' };
import { normalizeFinancialPersonKey, rankFinancialPersonMatches, type FinancialPersonMatchSuggestion } from './financial-person-matching.ts';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, ExpertNormContract, FinancialPersonLink, LeaveEntry } from './types.ts';
import { calculateCapacitySnapshot, getEffectiveNormContract, resolveNormContract } from './time-capacity.ts';
import { applyFinancialReferenceNorms } from './financial-norm-contracts.ts';

export type FinancialConflictCode =
  | 'missing_expert'
  | 'extra_expert'
  | 'role_mismatch'
  | 'daily_norm_mismatch'
  | 'monthly_norm_mismatch'
  | 'peo_hours_mismatch'
  | 'leave_hours_mismatch'
  | 'concordia_hours_mismatch'
  | 'goodworks_hours_mismatch'
  | 'daily_limit_exceeded'
  | 'peo_monthly_limit_exceeded'
  | 'cim_monthly_limit_exceeded'
  | 'leave_not_validated';

export type FinancialConflict = {
  code: FinancialConflictCode;
  severity: 'error' | 'warning';
  message: string;
};

export type FinancialReferencePerson = (typeof referenceSeed.people)[number];

export type FinancialTimesheetRow = {
  expertId?: string;
  name: string;
  role: string;
  basePosition: string;
  peoFunction: string;
  goodworksFunction: string;
  appNorm: string;
  peoNorm: string;
  cimNorm: string;
  peoRemaining: number;
  cimRemaining: number;
  leaveEntries: LeaveEntry[];
  workbookNorm: string;
  peoWorked: number;
  peoLeave: number;
  medicalLeave: number;
  concordiaWorked: number;
  concordiaLeave: number;
  goodworksWorked: number;
  totalWorked: number;
  totalLeave: number;
  totalMonth: number;
  workbookPeoWorked?: number;
  workbookPeoLeave?: number;
  workbookConcordiaWorked?: number;
  workbookConcordiaLeave?: number;
  workbookGoodworksWorked?: number;
  draftHours: number;
  leaveDates: string[];
  conflicts: FinancialConflict[];
  financialPersonKey: string;
  matchSuggestions: FinancialPersonMatchSuggestion[];
};

export type FinancialReportingSummary = {
  rows: FinancialTimesheetRow[];
  totalPeoWorked: number;
  totalLeave: number;
  totalConcurrentWorked: number;
  missingExperts: number;
  conflictCount: number;
  referenceMonth: number;
  referenceYear: number;
};

const EPSILON = 0.01;

export function normalizeFinancialPersonName(value: string | undefined) {
  return normalizeFinancialPersonKey(value);
}

function isSameNumber(left: number | undefined, right: number | undefined) {
  return Math.abs((left ?? 0) - (right ?? 0)) < EPSILON;
}

function parseWorkbookNorm(norm: string) {
  const daily = norm.match(/(\d+(?:[.,]\d+)?)\s*h\s*\/\s*zi/i);
  if (daily) return { kind: 'daily' as const, value: Number(daily[1].replace(',', '.')) };
  const monthly = norm.match(/(\d+(?:[.,]\d+)?)\s*h\s*\/\s*luna/i);
  if (monthly) return { kind: 'monthly' as const, value: Number(monthly[1].replace(',', '.')) };
  return null;
}

function expertDailyNorm(expert: Expert | undefined) {
  return expert?.dailyHours ?? expert?.oreZi ?? expert?.norma;
}

function expertMonthlyNorm(expert: Expert | undefined) {
  return expert?.projectMonthlyNorm ?? expert?.manualMonthlyNorm;
}

function expertNormLabel(expert: Expert | undefined) {
  if (!expert) return 'Lipsă din baza de date';
  const monthly = expertMonthlyNorm(expert);
  if (monthly) return `${monthly} h/lună`;
  const daily = expertDailyNorm(expert);
  return daily ? `${daily} h/zi` : 'Nedefinită';
}

function projectBucket(project: ConcurrentProject | undefined) {
  const label = `${project?.projectName ?? ''} ${project?.projectCode ?? ''}`.toLowerCase();
  return label.includes('goodworks') ? 'goodworks' : 'concordia';
}

function referencePosition(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '-' ? trimmed : undefined;
}

function addConflict(
  target: FinancialConflict[],
  code: FinancialConflictCode,
  message: string,
  severity: FinancialConflict['severity'] = 'warning',
) {
  target.push({ code, message, severity });
}

function compareReference(
  row: FinancialTimesheetRow,
  expert: Expert | undefined,
  reference: FinancialReferencePerson,
  compareHours: boolean,
) {
  const conflicts = row.conflicts;
  if (!expert) {
    addConflict(conflicts, 'missing_expert', 'Persoana există în Excel, dar nu este înregistrată în baza aplicației.', 'error');
    return;
  }

  if (reference.peoPosition !== '-') {
    const expectedRole = normalizeFinancialPersonName(reference.peoPosition);
    const actualRole = normalizeFinancialPersonName(expert.positionInProject ?? expert.role);
    if (expectedRole && actualRole && !expectedRole.includes(actualRole) && !actualRole.includes(expectedRole)) {
      addConflict(conflicts, 'role_mismatch', `Funcție diferită: aplicație „${expert.positionInProject ?? expert.role}”, Excel „${reference.peoPosition}”.`);
    }
  }

  const workbookNorm = parseWorkbookNorm(reference.peoNorm);
  if (workbookNorm?.kind === 'daily' && !isSameNumber(expertDailyNorm(expert), workbookNorm.value)) {
    addConflict(conflicts, 'daily_norm_mismatch', `Normă zilnică diferită: aplicație ${expertDailyNorm(expert) ?? 0} h, Excel ${workbookNorm.value} h.`);
  }
  if (workbookNorm?.kind === 'monthly' && !isSameNumber(expertMonthlyNorm(expert), workbookNorm.value)) {
    addConflict(conflicts, 'monthly_norm_mismatch', `Normă lunară diferită: aplicație ${expertMonthlyNorm(expert) ?? 0} h, Excel ${workbookNorm.value} h.`);
  }

  if (!compareHours) return;
  if (!isSameNumber(row.peoWorked, reference.peoWorked)) {
    addConflict(conflicts, 'peo_hours_mismatch', `Ore PEO diferite: raportare ${row.peoWorked} h, Excel ${reference.peoWorked} h.`);
  }
  if (!isSameNumber(row.peoLeave + row.medicalLeave, reference.peoLeave)) {
    addConflict(conflicts, 'leave_hours_mismatch', `Concediu PEO diferit: raportare ${row.peoLeave + row.medicalLeave} h, Excel ${reference.peoLeave} h.`);
  }
  if (!isSameNumber(row.concordiaWorked, reference.concordiaWorked)) {
    addConflict(conflicts, 'concordia_hours_mismatch', `Ore Concordia diferite: raportare ${row.concordiaWorked} h, Excel ${reference.concordiaWorked} h.`);
  }
  if (!isSameNumber(row.concordiaLeave, reference.concordiaLeave)) {
    addConflict(conflicts, 'leave_hours_mismatch', `Concediu Concordia diferit: raportare ${row.concordiaLeave} h, Excel ${reference.concordiaLeave} h.`);
  }
  if (!isSameNumber(row.goodworksWorked, reference.goodworksWorked)) {
    addConflict(conflicts, 'goodworks_hours_mismatch', `Ore GOODWORKS4ALL diferite: raportare ${row.goodworksWorked} h, Excel ${reference.goodworksWorked} h.`);
  }
}

export function buildFinancialReportingSummary(input: {
  experts: Expert[];
  activities: Activity[];
  concurrentProjects?: ConcurrentProject[];
  concurrentEntries?: ConcurrentProjectTimesheetEntry[];
  month: number;
  normContracts?: ExpertNormContract[];
  leaveEntries?: LeaveEntry[];
  financialPersonLinks?: FinancialPersonLink[];
  year: number;
  referencePeople?: FinancialReferencePerson[];
}): FinancialReportingSummary {
  const projects = input.concurrentProjects ?? [];
  const concurrentEntries = input.concurrentEntries ?? [];
  const referencePeople = input.referencePeople ?? referenceSeed.people;
  const expertById = new Map(input.experts.map((expert) => [expert.id, expert]));
  const normContracts = input.normContracts ?? [];
  const leaveEntries = input.leaveEntries ?? [];
  const financialPersonLinks = input.financialPersonLinks ?? [];
  const expertByName = new Map(input.experts.map((expert) => [normalizeFinancialPersonName(expert.name), expert]));
  const referenceByName = new Map(referencePeople.map((person) => [normalizeFinancialPersonName(person.name), person]));
  const confirmedLinkByPersonKey = new Map(
    financialPersonLinks
      .filter((link) => link.status === 'confirmed' && link.expertId)
      .map((link) => [link.financialPersonKey, link]),
  );
  const inferredMatchByPersonKey = new Map<string, FinancialPersonMatchSuggestion>();
  for (const person of referencePeople) {
    const personKey = normalizeFinancialPersonName(person.name);
    if (confirmedLinkByPersonKey.has(personKey)) continue;
    const [bestMatch, secondMatch] = rankFinancialPersonMatches(person.name, input.experts, financialPersonLinks);
    if (bestMatch && bestMatch.score >= 0.96 && (!secondMatch || secondMatch.score < bestMatch.score)) {
      inferredMatchByPersonKey.set(personKey, bestMatch);
    }
  }
  const linkedExpertIds = new Set([
    ...[...confirmedLinkByPersonKey.values()].map((link) => link.expertId!),
    ...[...inferredMatchByPersonKey.values()].map((match) => match.expertId),
  ]);
  const activityByExpert = new Map<string, Activity[]>();
  const concurrentByExpert = new Map<string, ConcurrentProjectTimesheetEntry[]>();
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const leaveByExpert = new Map<string, LeaveEntry[]>();

  for (const activity of input.activities) {
    const key = activity.expertId || normalizeFinancialPersonName(activity.expertName);
    activityByExpert.set(key, [...(activityByExpert.get(key) ?? []), activity]);
  }
  for (const entry of concurrentEntries) {
    concurrentByExpert.set(entry.expertId, [...(concurrentByExpert.get(entry.expertId) ?? []), entry]);
  }

  for (const leave of leaveEntries) {
    leaveByExpert.set(leave.expertId, [...(leaveByExpert.get(leave.expertId) ?? []), leave]);
  }

  const names = new Set([
    ...referenceByName.keys(),
    ...input.experts
      .filter((expert) => !linkedExpertIds.has(expert.id))
      .map((expert) => normalizeFinancialPersonName(expert.name)),
  ]);
  const compareHours = input.month + 1 === referenceSeed.month && input.year === referenceSeed.year;
  const rows = [...names].map((normalizedName) => {
    const reference = referenceByName.get(normalizedName);
    const confirmedLink = confirmedLinkByPersonKey.get(normalizedName);
    const inferredMatch = inferredMatchByPersonKey.get(normalizedName);
    const expert = confirmedLink?.expertId
      ? expertById.get(confirmedLink.expertId)
      : inferredMatch?.expertId
        ? expertById.get(inferredMatch.expertId)
        : expertByName.get(normalizedName);
    const activities = expert
      ? activityByExpert.get(expert.id) ?? []
      : [...activityByExpert.values()].flat().filter((activity) => normalizeFinancialPersonName(activity.expertName) === normalizedName);
    const entries = expert ? concurrentByExpert.get(expert.id) ?? [] : [];
    const expertProjects = expert ? projects.filter((project) => project.expertId === expert.id) : [];
    const concordiaProject = expertProjects.find((project) => projectBucket(project) === 'concordia');
    const goodworksProject = expertProjects.find((project) => projectBucket(project) === 'goodworks');
    const basePosition = referencePosition(expert?.basePositionConcordia)
      ?? referencePosition(reference?.basePosition)
      ?? concordiaProject?.expertProjectRole
      ?? concordiaProject?.expertFunction
      ?? expert?.jobDescriptionText
      ?? '-';
    const leaves = expert ? leaveByExpert.get(expert.id) ?? [] : [];
    const peoFunction = referencePosition(expert?.positionInProject)
      ?? referencePosition(reference?.peoPosition)
      ?? expert?.role
      ?? '-';
    const goodworksFunction = referencePosition(expert?.goodworksPosition)
      ?? referencePosition(reference?.goodworksPosition)
      ?? goodworksProject?.expertProjectRole
      ?? goodworksProject?.expertFunction
      ?? '-';
    const leaveDates = new Set<string>();
    let peoWorked = 0;
    let peoLeave = 0;
    let medicalLeave = 0;
    let draftHours = 0;
    const dailyTotals = new Map<string, number>();

    for (const activity of activities) {
      const hours = Number(activity.hours) || 0;
      if (activity.dayType === 'CO' || activity.dayType === 'CM') {
        leaveDates.add(activity.date);
      } else {
        peoWorked += hours;
        dailyTotals.set(activity.date, (dailyTotals.get(activity.date) ?? 0) + hours);
      }
      if (activity.status === 'draft') draftHours += hours;
    }

    let concurrentConcordiaWorked = 0;
    let concordiaLeave = 0;
    let goodworksWorked = 0;
    for (const entry of entries) {
      const hours = Number(entry.hours) || 0;
      const bucket = projectBucket(projectById.get(entry.concurrentProjectId));
      if (entry.dayType === 'CO' || entry.dayType === 'CM') {
        leaveDates.add(entry.date);
      } else if (bucket === 'goodworks') {
        goodworksWorked += hours;
        dailyTotals.set(entry.date, (dailyTotals.get(entry.date) ?? 0) + hours);
      } else {
        concurrentConcordiaWorked += hours;
        dailyTotals.set(entry.date, (dailyTotals.get(entry.date) ?? 0) + hours);
      }
    }

    for (const leave of leaves) {
      if (leave.status === 'REJECTED') continue;
      if (leave.type === 'CM') {
        medicalLeave += Number(leave.peoHours) || 0;
      } else {
        peoLeave += Number(leave.peoHours) || 0;
      }
      concordiaLeave += Number(leave.cpcHours) || 0;
      leaveDates.add(leave.date);
      dailyTotals.set(leave.date, (dailyTotals.get(leave.date) ?? 0) + (Number(leave.totalHours) || 0));
    }

    const effectiveNormContracts = expert
      ? applyFinancialReferenceNorms(expert, normContracts, input.month, input.year, referencePeople)
      : normContracts;
    const capacity = expert ? calculateCapacitySnapshot({
      expert,
      contracts: effectiveNormContracts,
      activities,
      concurrentProjects: expertProjects,
      concurrentEntries: entries,
      leaveEntries: leaves,
      month: input.month,
      year: input.year,
    }) : undefined;
    const realActiveContract = expert
      ? getEffectiveNormContract(effectiveNormContracts, expert.id, input.year + '-' + String(input.month + 1).padStart(2, '0') + '-01')
      : undefined;
    const activeContract = expert
      ? resolveNormContract(expert, effectiveNormContracts, input.year + '-' + String(input.month + 1).padStart(2, '0') + '-01')
      : undefined;
    const totalLeave = peoLeave + medicalLeave + concordiaLeave;
    const concordiaWorked = capacity
      ? Math.max(0, capacity.cimMonthlyLimit - peoWorked - goodworksWorked - totalLeave)
      : concurrentConcordiaWorked;


    const row: FinancialTimesheetRow = {
      expertId: expert?.id,
      name: expert?.name ?? reference?.name ?? normalizedName,
      role: peoFunction,
      basePosition,
      peoFunction,
      goodworksFunction,
      appNorm: expertNormLabel(expert),
      workbookNorm: reference?.peoNorm ?? 'Nu există în Excel',
      peoNorm: realActiveContract
        ? realActiveContract.peoNormValue + ' ' + (realActiveContract.peoNormUnit === 'HOURS_PER_MONTH' ? 'h/luna' : 'h/zi')
        : reference?.peoNorm ?? 'Nedefinita',
      cimNorm: realActiveContract
        ? realActiveContract.cimNormValue + ' ' + (realActiveContract.cimNormUnit === 'HOURS_PER_MONTH' ? 'h/luna' : 'h/zi')
        : reference?.cimNorm ?? 'Nedefinita',
      peoRemaining: capacity?.peoRemaining ?? 0,
      cimRemaining: capacity?.cimRemaining ?? 0,
      leaveEntries: leaves,

      peoWorked,
      peoLeave,
      medicalLeave,
      concordiaWorked,
      concordiaLeave,
      goodworksWorked,
      totalWorked: peoWorked + concordiaWorked + goodworksWorked,
      totalLeave,
      totalMonth: peoWorked + concordiaWorked + goodworksWorked + totalLeave,
      workbookPeoWorked: compareHours ? reference?.peoWorked : undefined,
      workbookPeoLeave: compareHours ? reference?.peoLeave : undefined,
      workbookConcordiaWorked: compareHours ? reference?.concordiaWorked : undefined,
      workbookConcordiaLeave: compareHours ? reference?.concordiaLeave : undefined,
      workbookGoodworksWorked: compareHours ? reference?.goodworksWorked : undefined,
      draftHours,
      leaveDates: [...leaveDates].sort(),
      conflicts: [],
      financialPersonKey: normalizedName,
      matchSuggestions: expert ? [] : rankFinancialPersonMatches(reference?.name ?? normalizedName, input.experts, financialPersonLinks),
    };

    if (reference) compareReference(row, expert, reference, compareHours);
    if (expert && !reference) addConflict(row.conflicts, 'extra_expert', 'Expertul există în aplicație, dar nu apare în Excelul de referință.');
    for (const conflict of capacity?.conflicts ?? []) {
      const code = conflict.code === 'MONTHLY_PEO_EXCEEDED'
        ? 'peo_monthly_limit_exceeded'
        : conflict.code === 'MONTHLY_CIM_EXCEEDED'
          ? 'cim_monthly_limit_exceeded'
          : 'daily_limit_exceeded';
      addConflict(row.conflicts, code, conflict.message, 'error');
    }
    if (leaves.some((leave) => leave.status !== 'VALIDATED' && leave.status !== 'REJECTED')) {
      addConflict(row.conflicts, 'leave_not_validated', 'Exista CO nevalidat de Financiar.');
    }

    for (const [date, hours] of dailyTotals) {
      if (hours > 8 + EPSILON) addConflict(row.conflicts, 'daily_limit_exceeded', `Totalul de ${hours} h din ${date} depășește limita CIM de 8 h.`, 'error');
    }
    return row;
  }).sort((left, right) => left.name.localeCompare(right.name, 'ro'));

  return {
    rows,
    totalPeoWorked: rows.reduce((sum, row) => sum + row.peoWorked, 0),
    totalLeave: rows.reduce((sum, row) => sum + row.peoLeave + row.medicalLeave + row.concordiaLeave, 0),
    totalConcurrentWorked: rows.reduce((sum, row) => sum + row.concordiaWorked + row.goodworksWorked, 0),
    missingExperts: rows.filter((row) => row.conflicts.some((conflict) => conflict.code === 'missing_expert')).length,
    conflictCount: rows.reduce((sum, row) => sum + row.conflicts.length, 0),
    referenceMonth: referenceSeed.month,
    referenceYear: referenceSeed.year,
  };
}

export const financialReferencePeople = referenceSeed.people;
