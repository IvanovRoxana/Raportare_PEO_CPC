import type { LeaveEntry } from './types';

export interface FinancialLeaveGridAllocationInput {
  existingLeaveDates: string[];
  peoDates: string[];
  peoHours: number;
  cpcHours: number;
  peoDays: number;
  cpcDays: number;
}

export interface FinancialLeaveGridAllocation {
  date: string;
  peoHours: number;
  cpcHours: number;
  totalHours: number;
}

function roundHours(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function uniqueSortedDates(dates: string[]) {
  return [...new Set(dates.filter(Boolean))].sort();
}

function takeAllocationDates(candidates: string[], requestedDays: number, label: string) {
  const count = Math.round(requestedDays);
  if (count <= 0) return [];
  const dates = uniqueSortedDates(candidates);
  if (dates.length < count) {
    throw new Error(`Nu exista suficiente zile CO pentru repartizarea ${label}: ai ${dates.length}, dar sunt necesare ${count}.`);
  }
  return dates.slice(0, count);
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expandWorkingDatesFromSelection(seedDates: string[], requestedDays: number) {
  const count = Math.round(requestedDays);
  if (count <= 0) return [];
  const sortedSeedDates = uniqueSortedDates(seedDates);
  const firstSeedDate = sortedSeedDates[0];
  if (!firstSeedDate) return [];
  const year = Number(firstSeedDate.slice(0, 4));
  const month = Number(firstSeedDate.slice(5, 7)) - 1;
  const startDay = Number(firstSeedDate.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(startDay)) return sortedSeedDates;

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const expanded = new Set(sortedSeedDates);
  for (let day = startDay; day <= lastDay && expanded.size < count; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    expanded.add(isoDate(year, month, day));
  }
  return uniqueSortedDates([...expanded]).slice(0, count);
}

export function buildFinancialLeaveGridAllocations(input: FinancialLeaveGridAllocationInput): FinancialLeaveGridAllocation[] {
  const peoDates = takeAllocationDates(input.peoDates, input.peoHours > 0 ? input.peoDays || input.peoDates.length : 0, 'PEO');
  const cpcRequestedDays = input.cpcHours > 0 ? input.cpcDays || input.existingLeaveDates.length || input.peoDates.length || peoDates.length : 0;
  const knownCpcCandidateDates = uniqueSortedDates([...input.existingLeaveDates, ...input.peoDates]);
  const cpcCandidateDates = knownCpcCandidateDates.length >= Math.round(cpcRequestedDays)
    ? knownCpcCandidateDates
    : expandWorkingDatesFromSelection(input.peoDates, cpcRequestedDays);
  const cpcDates = takeAllocationDates(cpcCandidateDates, cpcRequestedDays, 'CPC');

  if (input.peoHours > 0 && peoDates.length === 0) {
    throw new Error('Alege perioada CO PEO inainte de salvare.');
  }
  if (input.cpcHours > 0 && cpcDates.length === 0) {
    throw new Error('Nu exista zile CO pe care sa fie repartizate orele CPC.');
  }

  const peoPerDay = peoDates.length ? input.peoHours / peoDates.length : 0;
  const cpcPerDay = cpcDates.length ? input.cpcHours / cpcDates.length : 0;
  const peoDateSet = new Set(peoDates);
  const cpcDateSet = new Set(cpcDates);
  const cpcUsesBroaderLeaveCalendar = cpcDates.length > peoDates.length;

  return uniqueSortedDates([...peoDates, ...cpcDates]).map((date) => {
    const peoHours = peoDateSet.has(date) ? roundHours(peoPerDay) : 0;
    const cpcHours = cpcDateSet.has(date) ? roundHours(cpcPerDay) : 0;
    return {
      date,
      peoHours,
      cpcHours,
      totalHours: cpcUsesBroaderLeaveCalendar ? Math.max(peoHours, cpcHours) : roundHours(peoHours + cpcHours),
    };
  });
}

export function getPeoLeaveDates(leaves: LeaveEntry[]) {
  return uniqueSortedDates(
    leaves
      .filter((leave) => leave.status !== 'REJECTED' && leave.type === 'CO' && (Number(leave.peoHours) || 0) > 0)
      .map((leave) => leave.date),
  );
}
