import type { LeaveEntry, LeaveType } from './types.ts';

export type FinancialLeaveAllocationType = LeaveType | string;

export interface FinancialLeaveAllocation {
  date: string;
  type: FinancialLeaveAllocationType;
  peoHours: number;
  cpcHours: number;
  totalHours: number;
  source?: LeaveEntry['source'];
  status?: LeaveEntry['status'];
  lockedForExpert?: boolean;
  automaticSplit?: boolean;
}

export interface FinancialLeaveAllocationOptions {
  month?: number;
  year?: number;
  peoScope?: boolean;
  exportableOnly?: boolean;
}

function roundHours(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function leaveMonth(date: string) {
  return Number(date.slice(5, 7)) - 1;
}

function leaveYear(date: string) {
  return Number(date.slice(0, 4));
}

function normalizeLeaveType(type?: string) {
  const normalized = String(type ?? '').trim().toUpperCase();
  return normalized === 'CM' ? 'CM' : 'CO';
}

function isExportableLeave(leave: Partial<LeaveEntry>) {
  const status = String(leave.status ?? '').toUpperCase();
  const source = String(leave.source ?? '').toUpperCase();
  return source === 'FINANCIAL' || status === 'VALIDATED';
}

export function calculateLeaveAllocationForDay(
  leave: Partial<LeaveEntry>,
  options: FinancialLeaveAllocationOptions = {},
): FinancialLeaveAllocation | null {
  if (!leave.date) return null;
  if (options.month !== undefined && (leave.month ?? leaveMonth(leave.date)) !== options.month) return null;
  if (options.year !== undefined && (leave.year ?? leaveYear(leave.date)) !== options.year) return null;
  if (String(leave.status ?? '').toUpperCase() === 'REJECTED') return null;
  if (options.exportableOnly && !isExportableLeave(leave)) return null;

  const totalHours = roundHours(Number(leave.totalHours) || 0);
  const peoScope = options.peoScope !== false;
  const peoHours = peoScope ? roundHours(Number(leave.peoHours) || 0) : 0;
  const cpcHours = peoScope ? roundHours(Number(leave.cpcHours) || 0) : totalHours;

  return {
    date: leave.date,
    type: normalizeLeaveType(leave.type),
    peoHours,
    cpcHours,
    totalHours,
    source: leave.source,
    status: leave.status,
    lockedForExpert: leave.lockedForExpert,
    automaticSplit: leave.automaticSplit,
  };
}

export function aggregateLeaveAllocationsByDate(
  leaveEntries: Partial<LeaveEntry>[] | undefined,
  options: FinancialLeaveAllocationOptions = {},
) {
  const allocations = new Map<string, FinancialLeaveAllocation>();
  for (const leave of leaveEntries ?? []) {
    const allocation = calculateLeaveAllocationForDay(leave, options);
    if (!allocation) continue;
    const existing = allocations.get(allocation.date);
    allocations.set(allocation.date, {
      ...allocation,
      type: existing?.type === 'CO' || allocation.type === 'CO' ? 'CO' : 'CM',
      peoHours: roundHours((existing?.peoHours ?? 0) + allocation.peoHours),
      cpcHours: roundHours((existing?.cpcHours ?? 0) + allocation.cpcHours),
      totalHours: roundHours((existing?.totalHours ?? 0) + allocation.totalHours),
      lockedForExpert: Boolean(existing?.lockedForExpert || allocation.lockedForExpert),
      automaticSplit: existing?.automaticSplit === false || allocation.automaticSplit === false ? false : allocation.automaticSplit,
    });
  }
  return allocations;
}

export function sumLeaveAllocationHours(
  allocations: Map<string, FinancialLeaveAllocation>,
  field: 'peoHours' | 'cpcHours' | 'totalHours',
) {
  return roundHours([...allocations.values()].reduce((sum, leave) => sum + leave[field], 0));
}
