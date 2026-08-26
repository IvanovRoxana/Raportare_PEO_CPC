import type {
  Activity,
  ConcurrentProject,
  ConcurrentProjectTimesheetEntry,
  Expert,
  ExpertNormContract,
  LeaveEntry,
  NormUnit,
} from './types.ts';
import { getNonWorkingDayInfo } from './non-working-days.ts';

export const ABSOLUTE_DAILY_HOURS_LIMIT = 8;

export type CapacityConflict = {
  code: 'DAILY_CIM_EXCEEDED' | 'DAILY_PEO_EXCEEDED' | 'MONTHLY_PEO_EXCEEDED' | 'MONTHLY_CIM_EXCEEDED' | 'LEAVE_DAY_LOCKED';
  date?: string;
  message: string;
};

export type CapacitySnapshot = {
  peoMonthlyLimit: number;
  cimMonthlyLimit: number;
  peoUsed: number;
  cimUsed: number;
  peoRemaining: number;
  cimRemaining: number;
  dailyTotals: Record<string, number>;
  conflicts: CapacityConflict[];
};

type CapacityActivity = Omit<Partial<Activity>, 'status'> & { status?: string };

type CapacityInput = {
  expert: Partial<Expert>;
  contracts?: ExpertNormContract[];
  activities?: CapacityActivity[];
  concurrentProjects?: Partial<ConcurrentProject>[];
  concurrentEntries?: Partial<ConcurrentProjectTimesheetEntry>[];
  leaveEntries?: Partial<LeaveEntry>[];
  month: number;
  year: number;
};

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function getEffectiveNormContract(contracts: ExpertNormContract[], expertId: string, date: string) {
  return contracts
    .filter((contract) => contract.expertId === expertId && date >= contract.validFrom && (!contract.validTo || date <= contract.validTo))
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
}

export function buildLegacyNormContract(expert: Partial<Expert>): ExpertNormContract {
  const monthly = numeric(expert.projectMonthlyNorm ?? expert.manualMonthlyNorm);
  const daily = numeric(expert.dailyHours ?? expert.oreZi ?? expert.norma) || 8;
  return {
    id: `legacy:${expert.id ?? 'unknown'}`,
    expertId: expert.id ?? '',
    validFrom: '1900-01-01',
    peoNormUnit: monthly > 0 ? 'HOURS_PER_MONTH' : 'HOURS_PER_DAY',
    peoNormValue: monthly || daily,
    peoDailyCap: daily,
    cimNormUnit: 'HOURS_PER_DAY',
    cimNormValue: daily,
    cimDailyCap: daily,
    leaveHoursPerDay: daily,
    status: 'ACTIVE',
    justification: 'Compatibilitate cu modelul vechi',
  };
}

export function resolveNormContract(expert: Partial<Expert>, contracts: ExpertNormContract[] | undefined, date: string) {
  return getEffectiveNormContract(contracts ?? [], expert.id ?? '', date) ?? buildLegacyNormContract(expert);
}

function monthLimit(
  expert: Partial<Expert>,
  contracts: ExpertNormContract[] | undefined,
  month: number,
  year: number,
  bucket: 'peo' | 'cim',
) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthPrefix = year + '-' + String(month + 1).padStart(2, '0');
  const monthEnd = monthPrefix + '-' + String(lastDay).padStart(2, '0');
  const endContract = resolveNormContract(expert, contracts, monthEnd);
  const unit = bucket === 'peo' ? endContract.peoNormUnit : endContract.cimNormUnit;
  const value = bucket === 'peo' ? endContract.peoNormValue : endContract.cimNormValue;
  if (unit === 'HOURS_PER_MONTH') return value;

  let total = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = monthPrefix + '-' + String(day).padStart(2, '0');
    if (getNonWorkingDayInfo(date).isNonWorkingDay) continue;
    const dayContract = resolveNormContract(expert, contracts, date);
    total += bucket === 'peo' ? dayContract.peoNormValue : dayContract.cimNormValue;
  }
  return total;
}

export function calculateCapacitySnapshot(input: CapacityInput): CapacitySnapshot {
  const { expert, month, year } = input;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const contract = resolveNormContract(expert, input.contracts, `${monthKey}-01`);
  const peoMonthlyLimit = monthLimit(expert, input.contracts, month, year, 'peo');
  const cimMonthlyLimit = monthLimit(expert, input.contracts, month, year, 'cim');
  const dailyTotals: Record<string, number> = {};
  const activeLeaveDates = new Set<string>();
  const workDates = new Set<string>();
  let peoUsed = 0;
  let cimUsed = 0;

  const add = (date: string, hours: number, peoHours = 0, bucket: 'work' | 'leave' = 'work') => {
    if (!date.startsWith(monthKey) || hours <= 0) return;
    dailyTotals[date] = (dailyTotals[date] ?? 0) + hours;
    cimUsed += hours;
    peoUsed += peoHours;
    if (bucket === 'leave') activeLeaveDates.add(date);
    else workDates.add(date);
  };

  for (const activity of input.activities ?? []) {
    if (activity.status === 'rejected' || activity.dayType === 'CO') continue;
    add(String(activity.date), numeric(activity.hours), numeric(activity.hours));
  }
  for (const entry of input.concurrentEntries ?? []) {
    if (entry.status === 'rejected' || entry.dayType === 'CO') continue;
    add(String(entry.date), numeric(entry.hours));
  }
  for (const leave of input.leaveEntries ?? []) {
    if (leave.status === 'REJECTED') continue;
    add(String(leave.date), numeric(leave.totalHours), numeric(leave.peoHours), 'leave');
  }

  const conflicts: CapacityConflict[] = [];
  for (const date of workDates) {
    if (activeLeaveDates.has(date)) {
      conflicts.push({
        code: 'LEAVE_DAY_LOCKED',
        date,
        message: `${date}: ziua are CO/CM in calendar si nu permite adaugarea de activitati.`,
      });
    }
  }
  for (const [date, total] of Object.entries(dailyTotals)) {
    const dayContract = resolveNormContract(expert, input.contracts, date);
    const cimLimit = Math.min(ABSOLUTE_DAILY_HOURS_LIMIT, dayContract.cimDailyCap || 8);
    if (total > cimLimit) {
      conflicts.push({ code: 'DAILY_CIM_EXCEEDED', date, message: `${date}: total ${total} h, peste norma CIM de ${cimLimit} h/zi.` });
    }
  }
  if (peoUsed > peoMonthlyLimit) {
    conflicts.push({ code: 'MONTHLY_PEO_EXCEEDED', message: `Total PEO ${peoUsed} h / plafon ${peoMonthlyLimit} h.` });
  }
  if (cimUsed > cimMonthlyLimit) {
    conflicts.push({ code: 'MONTHLY_CIM_EXCEEDED', message: `Total CIM ${cimUsed} h / plafon ${cimMonthlyLimit} h.` });
  }

  return {
    peoMonthlyLimit,
    cimMonthlyLimit,
    peoUsed,
    cimUsed,
    peoRemaining: Math.max(0, peoMonthlyLimit - peoUsed),
    cimRemaining: Math.max(0, cimMonthlyLimit - cimUsed),
    dailyTotals,
    conflicts,
  };
}

export function allocateLeaveEntries(args: CapacityInput & {
  dates: string[];
  source: LeaveEntry['source'];
  createdBy?: string;
}): LeaveEntry[] {
  const existing = [...(args.leaveEntries ?? [])];
  const result: LeaveEntry[] = [];

  for (const date of [...new Set(args.dates)].sort()) {
    if (getNonWorkingDayInfo(date).isNonWorkingDay) throw new Error(`${date} este zi nelucr?toare.`);
    const contract = resolveNormContract(args.expert, args.contracts, date);
    const before = calculateCapacitySnapshot({ ...args, leaveEntries: existing });
    const totalHours = Math.min(ABSOLUTE_DAILY_HOURS_LIMIT, contract.leaveHoursPerDay || contract.cimDailyCap);
    const cimLimit = Math.min(ABSOLUTE_DAILY_HOURS_LIMIT, contract.cimDailyCap || 8);
    if ((before.dailyTotals[date] ?? 0) + totalHours > cimLimit) {
      throw new Error(`${date}: CO de ${totalHours} h ar dep??i norma CIM de ${cimLimit} h/zi.`);
    }
    const peoDailyLimit = Math.min(
      ABSOLUTE_DAILY_HOURS_LIMIT,
      contract.peoNormUnit === 'HOURS_PER_DAY'
        ? contract.peoNormValue
        : contract.peoDailyCap || totalHours,
    );
    const peoHours = Math.min(totalHours, peoDailyLimit, before.peoRemaining);
    const leave: LeaveEntry = {
      id: `leave:${args.expert.id}:${date}:CO`,
      expertId: args.expert.id ?? '',
      date,
      month: Number(date.slice(5, 7)) - 1,
      year: Number(date.slice(0, 4)),
      type: 'CO',
      totalHours,
      peoHours,
      cpcHours: totalHours - peoHours,
      source: args.source,
      status: 'DRAFT',
      lockedForExpert: args.source === 'FINANCIAL',
      normContractId: contract.id,
      automaticSplit: true,
      peoNormUnit: contract.peoNormUnit,
      peoNormValue: contract.peoNormValue,
      peoDailyCap: contract.peoDailyCap,
      cimNormUnit: contract.cimNormUnit,
      cimNormValue: contract.cimNormValue,
      cimDailyCap: contract.cimDailyCap,
      createdBy: args.createdBy,
    };
    existing.push(leave);
    result.push(leave);
  }
  return result;
}

export function assertCapacity(snapshot: CapacitySnapshot) {
  if (snapshot.conflicts.length > 0) throw new Error(snapshot.conflicts[0].message);
}
