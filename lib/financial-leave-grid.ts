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

export function buildFinancialLeaveGridAllocations(input: FinancialLeaveGridAllocationInput): FinancialLeaveGridAllocation[] {
  const peoDates = takeAllocationDates(input.peoDates, input.peoHours > 0 ? input.peoDays || input.peoDates.length : 0, 'PEO');
  const cpcCandidateDates = uniqueSortedDates([...input.existingLeaveDates, ...input.peoDates]);
  const cpcRequestedDays = input.cpcHours > 0 ? input.cpcDays || cpcCandidateDates.length || peoDates.length : 0;
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
