'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileText, Loader2, Plus, Save, SearchIcon, ShieldCheck, Users } from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useActivitiesByMonth,
  useAllConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
  useExperts,
  useAllExpertNormContracts,
  useExpertNormContractMutations,
  useFinancialPersonLinkMutations,
  useFinancialPersonLinks,
  useLeaveEntries,
  useLeaveEntryMutations,
} from '@/hooks/use-backend-data';
import { buildFinancialReportingSummary, type FinancialTimesheetRow } from '@/lib/financial-reporting';
import { buildFinancialLeaveGridAllocations, getPeoLeaveDates } from '@/lib/financial-leave-grid';
import { normalizeFinancialPersonKey, rankFinancialPersonMatches } from '@/lib/financial-person-matching';
import { isFinancialLeaveEnabledClient, isFinancialTimesheetsEnabledClient } from '@/lib/feature-flags';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';
import type { Expert, ExpertNormContract, LeaveEntry, NormUnit } from '@/lib/types';

type SectionMode = 'timesheets' | 'leave';

type NormPanelRow = {
  id: string;
  name: string;
  detail: string;
  peoFunction: string;
  peoNormLabel?: string;
  cimNormLabel?: string;
  financialOnly: boolean;
  expert?: Expert;
  contract?: ExpertNormContract;
  peoDailyCap: number;
  cimDailyCap: number;
  cpcFormulaHours: number;
  otherDailyHours: number;
  goodworksProjects: Array<{ expertProjectRole?: string; expertFunction?: string; projectName?: string; dailyHours?: number }>;
  otherProjects: Array<{ expertProjectRole?: string; expertFunction?: string; projectName?: string; dailyHours?: number }>;
};

type LeaveGridDraft = {
  peoNorm: string;
  peoDays: string;
  peoHours: string;
  cpcNorm: string;
  cpcDays: string;
  cpcHours: string;
  period: string;
};

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
const TIMESHEET_ACCEPTANCE_COLUMNS = [
  'SALARIAT',
  'POZITIA DE BAZA (CONCORDIA)',
  'ORE LUCRATE CONCORDIA',
  'ORE CO CONCORDIA',
  'FUNCTIA IN PEO',
  'ORE LUCRATE PEO',
  'ORE CO PEO',
  'FUNCTIA IN GOODWORKS4ALL',
  'ORE LUCRATE GOODWORKS4ALL',
  'TOTAL ORE LUCRATE',
  'TOTAL ORE CO',
  'TOTAL ORE LUNA',
];

function hours(value: number) {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value)} h`;
}

function compactHours(value: number) {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value);
}

function isoDate(year: number, month: number, day = 1) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function previousDay(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function parseDailyHoursLabel(value: string | undefined) {
  const matched = value?.match(/(\d+(?:[.,]\d+)?)\s*h\s*\/\s*zi/i);
  return matched ? Number(matched[1].replace(',', '.')) : 0;
}

function hourlyRateRowKey(row: FinancialTimesheetRow) {
  return row.expertId ?? row.name;
}

function leaveGridRowKey(row: FinancialTimesheetRow) {
  return row.expertId ?? row.name;
}

function numericCell(value: string) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumericCell(value: number) {
  return value ? compactHours(value) : '0';
}

function formatLeavePeriod(dates: string[]) {
  const days = [...new Set(dates.map((date) => Number(date.slice(8, 10))).filter(Boolean))].sort((left, right) => left - right);
  const parts: string[] = [];
  for (let index = 0; index < days.length; index += 1) {
    const start = days[index];
    let end = start;
    while (index + 1 < days.length && days[index + 1] === end + 1) {
      index += 1;
      end = days[index];
    }
    parts.push(start === end ? String(start).padStart(2, '0') : `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`);
  }
  return parts.join('; ');
}

function getMonthCalendarCells(month: number, year: number) {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string; isWeekend: boolean } | null> = [];
  for (let index = 0; index < offset; index += 1) cells.push(null);
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const weekday = date.getUTCDay();
    cells.push({
      day,
      date: isoDate(year, month, day),
      isWeekend: weekday === 0 || weekday === 6,
    });
  }
  return cells;
}

function parseLeavePeriod(period: string, month: number, year: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days = new Set<number>();
  const tokens = period
    .replace(/\*/g, '')
    .split(/[;,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const match = token.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
    if (!match) throw new Error(`Perioada CO "${token}" nu este valida. Foloseste formatul 01-08; 29-31.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > lastDay) throw new Error(`Perioada CO "${token}" este in afara lunii selectate.`);
    for (let day = start; day <= end; day += 1) {
      const date = new Date(Date.UTC(year, month, day));
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.add(day);
    }
  }

  return [...days].sort((left, right) => left - right).map((day) => isoDate(year, month, day));
}

function FinancialLeavePeriodPicker({
  disabled,
  month,
  onSelectDates,
  period,
  rowName,
  year,
}: {
  disabled: boolean;
  month: number;
  onSelectDates: (dates: string[]) => void;
  period: string;
  rowName: string;
  year: number;
}) {
  const selectedDates = useMemo(() => {
    try {
      return new Set(parseLeavePeriod(period, month, year));
    } catch {
      return new Set<string>();
    }
  }, [month, period, year]);
  const calendarCells = useMemo(() => getMonthCalendarCells(month, year), [month, year]);
  const selectedCount = selectedDates.size;

  const toggleDate = (date: string) => {
    const next = new Set(selectedDates);
    if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }
    onSelectDates([...next].sort());
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-full justify-center rounded-none px-1 text-center text-[11px] font-normal tabular-nums"
          disabled={disabled}
          title={`Alege zile CO pentru ${rowName}`}
        >
          <CalendarDays className="mr-1 h-3 w-3" />
          <span className={period ? 'text-slate-900' : 'text-muted-foreground'}>{period || 'Alege zile'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[260px] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{MONTHS[month]} {year}</div>
          <Badge variant="secondary" className="text-[10px]">{selectedCount} zile</Badge>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
          {['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'].map((label) => <div key={label}>{label}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarCells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="h-7" />;
            const selected = selectedDates.has(cell.date);
            return (
              <Button
                key={cell.date}
                type="button"
                variant={selected ? 'default' : 'outline'}
                className={`h-7 rounded-sm p-0 text-[11px] ${cell.isWeekend ? 'opacity-40' : ''}`}
                disabled={cell.isWeekend}
                onClick={() => toggleDate(cell.date)}
              >
                {cell.day}
              </Button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onSelectDates([])}>
            Sterge
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const allWorkingDays = calendarCells.filter((cell): cell is NonNullable<typeof cell> => !!cell && !cell.isWeekend).map((cell) => cell.date);
              onSelectDates(allWorkingDays);
            }}
          >
            Toate zilele
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function downloadResponse(response: Response, fallbackName: string) {
  return response.blob().then((blob) => {
    const disposition = response.headers.get('content-disposition') ?? '';
    const matchedName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = matchedName ?? fallbackName;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function StatusBadge({ row }: { row: FinancialTimesheetRow }) {
  if (!row.expertId) return <Badge variant="destructive">Lipsă în aplicație</Badge>;
  if (row.conflicts.some((conflict) => conflict.severity === 'error')) return <Badge variant="destructive">Eroare</Badge>;
  if (row.conflicts.length) return <Badge variant="secondary">{row.conflicts.length} diferențe</Badge>;
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">Conform</Badge>;
}

function ConflictDot({ row }: { row: FinancialTimesheetRow }) {
  if (row.conflicts.length === 0) return null;
  const hasError = !row.expertId || row.conflicts.some((conflict) => conflict.severity === 'error');
  const label = `${row.conflicts.length} ${row.conflicts.length === 1 ? 'problemă' : 'probleme'} pentru ${row.name}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label}>
          <span className={`h-2.5 w-2.5 rounded-full ${hasError ? 'bg-red-600' : 'bg-amber-500'}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-sm p-3 text-xs">
        <div className="mb-1.5 font-semibold">{label}</div>
        <ul className="space-y-1">
          {row.conflicts.map((conflict, index) => <li key={`${conflict.code}-${index}`}>• {conflict.message}</li>)}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function FinancialReportingDashboard({ mode }: { mode: SectionMode }) {
  const [month, setMonth] = useState(5);
  const [year, setYear] = useState(2026);
  const [search, setSearch] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [savingLeave, setSavingLeave] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [selectedFinancialPersonKey, setSelectedFinancialPersonKey] = useState('');
  const [selectedLinkExpertId, setSelectedLinkExpertId] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [hourlyRates, setHourlyRates] = useState<Record<string, string>>({});
  const [leaveGridDrafts, setLeaveGridDrafts] = useState<Record<string, LeaveGridDraft>>({});
  const [savingLeaveRow, setSavingLeaveRow] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    expertId: '',
    date: isoDate(2026, 5),
    mode: 'automatic' as 'automatic' | 'manual',
    totalHours: '8',
    peoHours: '6',
    cpcHours: '2',
    justification: '',
  });
  const { experts, isLoading: loadingExperts } = useExperts();
  const { activities, isLoading: loadingActivities } = useActivitiesByMonth(month, year);
  const { projects, isLoading: loadingProjects } = useAllConcurrentProjects();
  const { entries, isLoading: loadingEntries } = useConcurrentProjectTimesheetByMonth(month, year);
  const { contracts, isLoading: loadingContracts } = useAllExpertNormContracts();
  const { links: financialPersonLinks, isLoading: loadingLinks } = useFinancialPersonLinks();
  const { leaveEntries, isLoading: loadingLeave, mutate: refreshLeaveEntries } = useLeaveEntries(month, year);
  const { createAutomatic, createManual, remove: removeLeaveEntry, updateStatus } = useLeaveEntryMutations(month, year);
  const { create: createNormContract, update: updateNormContract } = useExpertNormContractMutations();
  const { create: createFinancialPersonLink, update: updateFinancialPersonLink } = useFinancialPersonLinkMutations();
  const enabled = mode === 'timesheets' ? isFinancialTimesheetsEnabledClient() : isFinancialLeaveEnabledClient();
  const isLoading = loadingExperts || loadingActivities || loadingProjects || loadingEntries || loadingContracts || loadingLinks || loadingLeave;
  const hourlyRateStorageKey = `financial-peo-hourly-rates-${year}-${String(month + 1).padStart(2, '0')}`;

  useEffect(() => {
    try {
      const storedRates = window.localStorage.getItem(hourlyRateStorageKey);
      setHourlyRates(storedRates ? JSON.parse(storedRates) as Record<string, string> : {});
    } catch {
      setHourlyRates({});
    }
  }, [hourlyRateStorageKey]);

  const summary = useMemo(() => buildFinancialReportingSummary({
    experts,
    activities,
    concurrentProjects: projects,
    concurrentEntries: entries,
    normContracts: contracts,
    leaveEntries,
    financialPersonLinks,
    month,
    year,
  }), [experts, activities, projects, entries, contracts, leaveEntries, financialPersonLinks, month, year]);
  const referenceMonthLabel = MONTHS[summary.referenceMonth - 1] ?? MONTHS[month];

  const selectedFinancialRow = useMemo(
    () => summary.rows.find((row) => row.financialPersonKey === selectedFinancialPersonKey && !row.expertId) ?? null,
    [selectedFinancialPersonKey, summary.rows],
  );
  const selectedFinancialSuggestions = useMemo(
    () => selectedFinancialRow ? rankFinancialPersonMatches(selectedFinancialRow.name, experts, financialPersonLinks) : [],
    [experts, financialPersonLinks, selectedFinancialRow],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ro-RO');
    return summary.rows.filter((row) => {
      if (onlyConflicts && row.conflicts.length === 0) return false;
      return !query || `${row.name} ${row.role}`.toLocaleLowerCase('ro-RO').includes(query);
    });
  }, [summary.rows, search, onlyConflicts, mode]);

  const visibleLeaveRows = useMemo<Array<{ row: FinancialTimesheetRow; leave: LeaveEntry | null }>>(
    () => visibleRows.reduce<Array<{ row: FinancialTimesheetRow; leave: LeaveEntry | null }>>((result, row) => {
      if (row.leaveEntries.length) {
        result.push(...row.leaveEntries.map((leave) => ({ row, leave })));
      } else {
        result.push({ row, leave: null });
      }
      return result;
    }, []),
    [visibleRows],
  );
  const firstDraftLeave = useMemo(
    () => visibleLeaveRows.find(({ leave }) => leave && leave.status !== 'VALIDATED' && leave.status !== 'REJECTED')?.leave ?? null,
    [visibleLeaveRows],
  );
  const normPanelRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ro-RO');
    const referenceDate = isoDate(year, month, 1);
    const appRows: NormPanelRow[] = experts
      .filter((expert) => !query || `${expert.name} ${expert.role} ${expert.positionInProject ?? ''}`.toLocaleLowerCase('ro-RO').includes(query))
      .map((expert) => {
        const contract = contracts
          .filter((item) => item.expertId === expert.id && item.validFrom <= referenceDate && (!item.validTo || item.validTo >= referenceDate))
          .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
        const expertProjects = projects.filter((project) => project.expertId === expert.id && project.isActive !== false);
        const goodworksProjects = expertProjects.filter((project) => `${project.projectName} ${project.projectCode} ${project.fundingSource}`.toUpperCase().includes('GOODWORKS4ALL'));
        const otherProjects = expertProjects.filter((project) => !goodworksProjects.some((goodworks) => goodworks.id === project.id));
        const otherDailyHours = otherProjects.reduce((sum, project) => sum + (Number(project.dailyHours) || 0), 0);
        const peoDailyCap = contract?.peoDailyCap ?? 0;
        const cimDailyCap = contract?.cimDailyCap ?? 0;
        const cpcFormulaHours = Math.max(0, cimDailyCap - peoDailyCap - otherDailyHours);
        return {
          id: expert.id,
          name: expert.name,
          detail: expert.email ?? expert.id,
          peoFunction: expert.positionInProject || expert.role || '-',
          financialOnly: false,
          expert,
          contract,
          peoDailyCap,
          cimDailyCap,
          cpcFormulaHours,
          otherDailyHours,
          goodworksProjects,
          otherProjects,
        };
      });
    const financialOnlyRows: NormPanelRow[] = summary.rows
      .filter((row) => !row.expertId)
      .filter((row) => !query || `${row.name} ${row.basePosition} ${row.peoFunction} ${row.goodworksFunction}`.toLocaleLowerCase('ro-RO').includes(query))
      .map((row) => {
        const peoDailyCap = row.workbookNorm === '-' ? 0 : parseDailyHoursLabel(row.workbookNorm);
        const cimDailyCap = peoDailyCap > 0 || row.concordiaWorked + row.concordiaLeave + row.totalMonth > 0 ? 8 : 0;
        return {
          id: `financial-only-${row.name}`,
          name: row.name,
          detail: 'Angajat CPC din Excel, fara cont utilizator',
          peoFunction: row.peoFunction,
          peoNormLabel: row.workbookNorm === '-' ? 'Fara norma PEO' : row.workbookNorm,
          cimNormLabel: cimDailyCap ? `${compactHours(cimDailyCap)} h/zi` : 'CIM de completat',
          financialOnly: true,
          peoDailyCap,
          cimDailyCap,
          cpcFormulaHours: Math.max(0, cimDailyCap - peoDailyCap),
          otherDailyHours: 0,
          goodworksProjects: row.goodworksFunction && row.goodworksFunction !== '-' ? [{ projectName: row.goodworksFunction }] : [],
          otherProjects: row.basePosition && row.basePosition !== '-' ? [{ projectName: row.basePosition, dailyHours: cimDailyCap || undefined }] : [],
        };
      });
    return [...appRows, ...financialOnlyRows].sort((left, right) => left.name.localeCompare(right.name, 'ro'));
  }, [contracts, experts, month, projects, search, summary.rows, year]);
  const normPanelByExpert = useMemo(() => {
    const lookup = new Map<string, NormPanelRow>();
    for (const row of normPanelRows) {
      if (row.expert?.id) lookup.set(row.expert.id, row);
    }
    return lookup;
  }, [normPanelRows]);

  useEffect(() => {
    if (mode !== 'leave') return;
    const nextDrafts: Record<string, LeaveGridDraft> = {};
    for (const row of visibleRows) {
      const key = leaveGridRowKey(row);
      const normRow = row.expertId ? normPanelByExpert.get(row.expertId) : undefined;
      const peoNorm = normRow?.peoDailyCap ?? parseDailyHoursLabel(row.peoNorm);
      const cpcNorm = normRow?.cpcFormulaHours ?? Math.max(0, parseDailyHoursLabel(row.cimNorm) - peoNorm);
      nextDrafts[key] = {
        peoNorm: formatNumericCell(peoNorm),
        peoDays: formatNumericCell(peoNorm > 0 ? row.peoLeave / peoNorm : 0),
        peoHours: formatNumericCell(row.peoLeave),
        cpcNorm: formatNumericCell(cpcNorm),
        cpcDays: formatNumericCell(cpcNorm > 0 ? row.concordiaLeave / cpcNorm : 0),
        cpcHours: formatNumericCell(row.concordiaLeave),
        period: formatLeavePeriod(getPeoLeaveDates(row.leaveEntries)),
      };
    }
    setLeaveGridDrafts(nextDrafts);
  }, [mode, normPanelByExpert, visibleRows]);

  const leaveGridTotals = useMemo(() => visibleRows.reduce((totals, row) => {
    const draft = leaveGridDrafts[leaveGridRowKey(row)];
    return {
      peoDays: totals.peoDays + numericCell(draft?.peoDays ?? '0'),
      peoHours: totals.peoHours + numericCell(draft?.peoHours ?? '0'),
      cpcDays: totals.cpcDays + numericCell(draft?.cpcDays ?? '0'),
      cpcHours: totals.cpcHours + numericCell(draft?.cpcHours ?? '0'),
    };
  }, { peoDays: 0, peoHours: 0, cpcDays: 0, cpcHours: 0 }), [leaveGridDrafts, visibleRows]);

  const firstExpert = useMemo(() => experts.find((expert) => expert.id) ?? null, [experts]);
  const monthlyExpert = useMemo(() => {
    const monthlyContract = contracts.find((contract) => contract.peoNormUnit === 'HOURS_PER_MONTH' && contract.peoDailyCap === 6);
    return monthlyContract ? experts.find((expert) => expert.id === monthlyContract.expertId) ?? null : null;
  }, [contracts, experts]);
  const setLeaveStatus = async (
    leaveId: string,
    status: 'VALIDATED' | 'REJECTED',
  ) => {
    setValidating(leaveId);
    try {
      await updateStatus(
        leaveId,
        status,
        'financial-session',
        status === 'REJECTED' ? 'Respins din dashboardul Financiar' : undefined,
      );
    } finally {
      setValidating(null);
    }
  };

  const updateHourlyRate = (row: FinancialTimesheetRow, value: string) => {
    const key = hourlyRateRowKey(row);
    setHourlyRates((current) => {
      const next = { ...current, [key]: value };
      if (!value.trim()) delete next[key];
      window.localStorage.setItem(hourlyRateStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const openFinancialLinkPanel = (row: FinancialTimesheetRow) => {
    setSelectedFinancialPersonKey(row.financialPersonKey);
    setSelectedLinkExpertId(row.matchSuggestions[0]?.expertId ?? '');
    setVerificationMessage(`Alege utilizatorul existent care corespunde persoanei ${row.name}.`);
  };

  const saveFinancialPersonLink = async () => {
    if (!selectedFinancialRow || !selectedLinkExpertId) return;
    const expert = experts.find((item) => item.id === selectedLinkExpertId);
    const financialPersonKey = selectedFinancialRow.financialPersonKey || normalizeFinancialPersonKey(selectedFinancialRow.name);
    const confidence = selectedFinancialSuggestions.find((match) => match.expertId === selectedLinkExpertId)?.score ?? 1;
    const existing = financialPersonLinks.find((link) => link.financialPersonKey === financialPersonKey);
    setSavingLink(true);
    try {
      if (existing) {
        await updateFinancialPersonLink(existing.id, {
          expertId: selectedLinkExpertId,
          status: 'confirmed',
          confidence,
          source: 'manual',
          updatedBy: 'financial-session',
        });
      } else {
        await createFinancialPersonLink({
          financialPersonName: selectedFinancialRow.name,
          financialPersonKey,
          expertId: selectedLinkExpertId,
          status: 'confirmed',
          confidence,
          source: 'manual',
          createdBy: 'financial-session',
        });
      }
      setVerificationMessage(`${selectedFinancialRow.name} a fost asociat cu ${expert?.name ?? 'utilizatorul selectat'}.`);
      setSelectedFinancialPersonKey('');
      setSelectedLinkExpertId('');
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Asocierea nu a putut fi salvata.');
    } finally {
      setSavingLink(false);
    }
  };

  const updateLeaveGridDraft = (row: FinancialTimesheetRow, field: keyof LeaveGridDraft, value: string) => {
    const key = leaveGridRowKey(row);
    setLeaveGridDrafts((current) => {
      const previous = current[key] ?? {
        peoNorm: '0',
        peoDays: '0',
        peoHours: '0',
        cpcNorm: '0',
        cpcDays: '0',
        cpcHours: '0',
        period: '',
      };
      const next = { ...previous, [field]: value };
      if (field === 'peoNorm' || field === 'peoDays') {
        next.peoHours = formatNumericCell(numericCell(next.peoNorm) * numericCell(next.peoDays));
      }
      if (field === 'cpcNorm' || field === 'cpcDays') {
        next.cpcHours = formatNumericCell(numericCell(next.cpcNorm) * numericCell(next.cpcDays));
      }
      return { ...current, [key]: next };
    });
  };

  const updateLeaveGridPeriod = (row: FinancialTimesheetRow, dates: string[]) => {
    const key = leaveGridRowKey(row);
    setLeaveGridDrafts((current) => {
      const previous = current[key] ?? {
        peoNorm: '0',
        peoDays: '0',
        peoHours: '0',
        cpcNorm: '0',
        cpcDays: '0',
        cpcHours: '0',
        period: '',
      };
      const next = {
        ...previous,
        period: formatLeavePeriod(dates),
      };
      const selectedDays = dates.length;
      const peoNorm = numericCell(next.peoNorm);
      const cpcNorm = numericCell(next.cpcNorm);
      if (peoNorm > 0) {
        next.peoDays = formatNumericCell(selectedDays);
        next.peoHours = formatNumericCell(peoNorm * selectedDays);
      }
      if (cpcNorm > 0) {
        next.cpcDays = formatNumericCell(selectedDays);
        next.cpcHours = formatNumericCell(cpcNorm * selectedDays);
      }
      if (selectedDays === 0) {
        next.peoDays = '0';
        next.peoHours = '0';
        next.cpcDays = '0';
        next.cpcHours = '0';
      }
      return { ...current, [key]: next };
    });
  };

  const saveLeaveGridRowOnEnter = (row: FinancialTimesheetRow, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void saveLeaveGridRow(row);
  };

  const saveLeaveGridRow = async (row: FinancialTimesheetRow) => {
    if (!row.expertId) {
      setVerificationMessage(`${row.name} nu are expert in aplicatie. Creeaza mai intai expertul ca sa poti salva CO manual.`);
      return;
    }
    const key = leaveGridRowKey(row);
    const draft = leaveGridDrafts[key];
    if (!draft) return;

    const peoNorm = numericCell(draft.peoNorm);
    const cpcNorm = numericCell(draft.cpcNorm);
    const draftPeoDays = numericCell(draft.peoDays);
    const draftCpcDays = numericCell(draft.cpcDays);
    const draftPeoHours = numericCell(draft.peoHours);
    const draftCpcHours = numericCell(draft.cpcHours);
    let replacementDates: string[];
    try {
      replacementDates = parseLeavePeriod(draft.period, month, year);
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Perioada CO nu este valida.');
      return;
    }
    const selectedDays = replacementDates.length;
    const peoDays = draftPeoDays || (peoNorm > 0 ? selectedDays : 0);
    const cpcDays = draftCpcDays || (cpcNorm > 0 ? selectedDays : 0);
    const peoHours = draftPeoHours || peoNorm * peoDays;
    const cpcHours = draftCpcHours || cpcNorm * cpcDays;
    if (peoHours > 0 && replacementDates.length === 0) {
      setVerificationMessage(`Completeaza perioada CO PEO pentru ${row.name}, de exemplu 01-08; 29-31.`);
      return;
    }
    if (selectedDays > 0 && peoHours + cpcHours === 0) {
      setVerificationMessage(`Completeaza norma sau orele CO pentru ${row.name} inainte de salvare.`);
      return;
    }
    if (selectedDays > 0 && (peoDays !== draftPeoDays || cpcDays !== draftCpcDays || peoHours !== draftPeoHours || cpcHours !== draftCpcHours)) {
      setLeaveGridDrafts((current) => ({
        ...current,
        [key]: {
          ...draft,
          peoDays: formatNumericCell(peoDays),
          peoHours: formatNumericCell(peoHours),
          cpcDays: formatNumericCell(cpcDays),
          cpcHours: formatNumericCell(cpcHours),
        },
      }));
    }
    setSavingLeaveRow(key);
    try {
      const allocations = buildFinancialLeaveGridAllocations({
        existingLeaveDates: row.coLeaveDates,
        peoDates: replacementDates,
        peoHours,
        cpcHours,
        peoDays,
        cpcDays,
      });
      const validFrom = isoDate(year, month, 1);
      const sameDateContract = contracts.find((contract) => contract.expertId === row.expertId && contract.validFrom === validFrom);
      const cpcDailyCap = Math.max(0, cpcNorm);
      const cimDailyCap = Math.max(0, parseDailyHoursLabel(row.cimNorm) || Number(sameDateContract?.cimDailyCap) || 0);
      if (sameDateContract) {
        await updateNormContract(sameDateContract.id, {
          peoNormUnit: 'HOURS_PER_DAY',
          peoNormValue: peoNorm,
          peoDailyCap: peoNorm,
          cimNormUnit: 'HOURS_PER_DAY',
          cimNormValue: cimDailyCap,
          cimDailyCap,
          leaveHoursPerDay: cimDailyCap,
          status: 'ACTIVE',
          justification: 'Actualizare manuala CO din grila Financiar',
          updatedBy: 'financial-session',
        });
      } else {
        const openContract = contracts
          .filter((contract) => contract.expertId === row.expertId && !contract.validTo && contract.validFrom < validFrom)
          .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
        if (openContract) {
          await updateNormContract(openContract.id, { validTo: previousDay(validFrom), updatedBy: 'financial-session' });
        }
        await createNormContract({
          expertId: row.expertId,
          validFrom,
          peoNormUnit: 'HOURS_PER_DAY',
          peoNormValue: peoNorm,
          peoDailyCap: peoNorm,
          cimNormUnit: 'HOURS_PER_DAY',
          cimNormValue: cimDailyCap,
          cimDailyCap,
          leaveHoursPerDay: cimDailyCap,
          status: 'ACTIVE',
          justification: 'Actualizare manuala CO din grila Financiar',
          createdBy: 'financial-session',
          updatedBy: 'financial-session',
        });
      }

      const replaceableLeaves = row.leaveEntries.filter((leave) => leave.type === 'CO' && leave.status !== 'REJECTED');
      for (const leave of replaceableLeaves) {
        await removeLeaveEntry(leave.id);
      }

      let savedLeaveCount = 0;
      if (allocations.length > 0) {
        for (const allocation of allocations) {
          await createManual({
            expertId: row.expertId,
            date: allocation.date,
            month,
            year,
            type: 'CO',
            totalHours: allocation.totalHours,
            peoHours: allocation.peoHours,
            cpcHours: allocation.cpcHours,
            source: 'FINANCIAL',
            status: 'VALIDATED',
            lockedForExpert: true,
            automaticSplit: false,
            justification: `Actualizare manuala CO Financiar: PEO ${draft.period || '-'}, CPC ${formatLeavePeriod(allocations.filter((allocationItem) => allocationItem.cpcHours > 0).map((allocationItem) => allocationItem.date)) || '-'}`,
            createdBy: 'financial-session',
          });
          savedLeaveCount += 1;
        }
      }
      await refreshLeaveEntries();
      setVerificationMessage(
        savedLeaveCount > 0
          ? `CO pentru ${row.name} a fost salvat si validat: ${savedLeaveCount} zile calendar, ${formatNumericCell(peoHours)} ore PEO, ${formatNumericCell(cpcHours)} ore CPC.`
          : `CO pentru ${row.name} a fost actualizat. Nu exista zile CO de salvat pentru acest rand.`,
      );
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : `CO pentru ${row.name} nu a putut fi salvat.`);
    } finally {
      setSavingLeaveRow(null);
    }
  };

  const saveFinancialLeave = async () => {
    if (!leaveForm.expertId || !leaveForm.date) return;
    setSavingLeave(true);
    try {
      if (leaveForm.mode === 'automatic') {
        await createAutomatic({
          expertId: leaveForm.expertId,
          dates: [leaveForm.date],
          source: 'FINANCIAL',
          createdBy: 'financial-session',
        });
      } else {
        const totalHours = Number(leaveForm.totalHours);
        const peoHours = Number(leaveForm.peoHours);
        const cpcHours = Number(leaveForm.cpcHours);
        await createManual({
          expertId: leaveForm.expertId,
          date: leaveForm.date,
          month,
          year,
          type: 'CO',
          totalHours,
          peoHours,
          cpcHours,
          source: 'FINANCIAL',
          status: 'DRAFT',
          lockedForExpert: true,
          automaticSplit: false,
          justification: leaveForm.justification,
          createdBy: 'financial-session',
        });
      }
      setLeaveForm((current) => ({ ...current, justification: '' }));
    } finally {
      setSavingLeave(false);
    }
  };

  const exportCentralizer = async () => {
    setExporting('centralizer');
    try {
      const response = await fetch('/api/export/financial-timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, rows: summary.rows, mode }),
      });
      if (!response.ok) throw new Error(await response.text());
      await downloadResponse(response, `TEST_Centralizator_${mode}_${year}-${String(month + 1).padStart(2, '0')}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const exportExpertTemplate = async (row: FinancialTimesheetRow) => {
    const expert = experts.find((item) => item.id === row.expertId);
    if (!expert) return;
    setExporting(row.expertId ?? row.name);
    try {
      const expertProjects = projects.filter((project) => project.expertId === expert.id);
      const projectIds = new Set(expertProjects.map((project) => project.id));
      const hourlyRate = Number(hourlyRates[hourlyRateRowKey(row)]?.replace(',', '.')) || undefined;
      const response = await fetch('/api/export/pontaj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPontajExportPayload({
          kind: 'consolidated',
          expert: { ...expert, hourlyRate },
          activities: activities.filter((activity) => activity.expertId === expert.id),
          concurrentProjects: expertProjects,
          concurrentTimesheetEntries: entries.filter((entry) => projectIds.has(entry.concurrentProjectId)),
          leaveEntries: row.leaveEntries,
          month,
          year,
        })),
      });
      if (!response.ok) throw new Error(await response.text());
      await downloadResponse(response, `TEST_Pontaj_${expert.name}_${year}-${String(month + 1).padStart(2, '0')}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const verifyTimesheetDashboard = () => {
    setVerificationMessage(`Pontaje: ${TIMESHEET_ACCEPTANCE_COLUMNS.length}/12 coloane configurate, tabel compact, bulina conflict la hover si export TEST disponibil.`);
  };

  const prepareAutomaticLeaveCheck = () => {
    const target = monthlyExpert ?? firstExpert;
    if (!target) return;
    setLeaveForm((current) => ({
      ...current,
      expertId: target.id,
      date: isoDate(year, month, 1),
      mode: 'automatic',
      justification: '',
    }));
    setVerificationMessage(`Concedii: CO automat pregatit pentru ${target.name}. Apasa Salveaza CO pentru calcul CIM -> PEO/CPC.`);
  };

  const prepareManualLeaveCheck = () => {
    const target = monthlyExpert ?? firstExpert;
    if (!target) return;
    setLeaveForm({
      expertId: target.id,
      date: isoDate(year, month, 2),
      mode: 'manual',
      totalHours: '8',
      peoHours: '6',
      cpcHours: '2',
      justification: 'Verificare repartizare manuala CO staging',
    });
    setVerificationMessage(`Concedii: CO manual pregatit pentru ${target.name}, cu justificare si split 6 PEO + 2 CPC.`);
  };

  const validateFirstDraftLeave = async () => {
    if (!firstDraftLeave) {
      setVerificationMessage('Concedii: nu exista CO draft vizibil pentru validare. Creeaza sau afiseaza un CO draft.');
      return;
    }
    await setLeaveStatus(firstDraftLeave.id, 'VALIDATED');
    setVerificationMessage('Concedii: primul CO draft vizibil a fost validat.');
  };

  const title = mode === 'timesheets' ? 'Pontaje centralizate' : 'Concedii centralizate';
  const description = mode === 'timesheets'
    ? 'Orele introduse în modulul Raportare sunt sursa de adevăr. Excelul atașat este utilizat numai pentru audit și evidențierea diferențelor.'
    : 'Centralizare CO și CM extrasă din raportarea experților și din pontajele proiectelor concurente.';

  if (!enabled) {
    return (
      <DashboardShell activeHref={`/financiar/${mode === 'timesheets' ? 'pontaje' : 'concedii'}`} navItems={financialNavItems} eyebrow="Modul Financiar" title={title} description={description}>
        <Card><CardContent className="py-10 text-center text-muted-foreground">Secțiunea este disponibilă numai în mediul staging.</CardContent></Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeHref={`/financiar/${mode === 'timesheets' ? 'pontaje' : 'concedii'}`}
      navItems={financialNavItems}
      eyebrow="Modul Financiar"
      title={title}
      description={description}
      reportingMonth={`${MONTHS[month]} ${year}`}
      actions={(
        <Button className="w-full sm:w-auto" onClick={exportCentralizer} disabled={isLoading || exporting !== null}>
          {exporting === 'centralizer' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export Excel centralizat
        </Button>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />Experți monitorizați</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.rows.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4" />{mode === 'timesheets' ? 'Ore PEO raportate' : 'Ore concediu'}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{hours(mode === 'timesheets' ? summary.totalPeoWorked : summary.totalLeave)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4" />Diferențe detectate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-amber-700">{summary.conflictCount}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />Lipsă în aplicație</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-red-700">{summary.missingExperts}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Verificare {mode === 'timesheets' ? 'Pontaje' : 'Concedii'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          {mode === 'timesheets' ? (
            <>
              <Button className="justify-start sm:justify-center" variant="outline" onClick={verifyTimesheetDashboard}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Verifica 12 coloane
              </Button>
              <Button className="justify-start sm:justify-center" variant={onlyConflicts ? 'default' : 'outline'} onClick={() => {
                setOnlyConflicts((value) => !value);
                setVerificationMessage('Pontaje: filtrul Doar diferente a fost comutat; problemele raman in bulina cu hover.');
              }}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Verifica buline conflicte
              </Button>
              <Button className="justify-start sm:justify-center" onClick={exportCentralizer} disabled={isLoading || exporting !== null}>
                {exporting === 'centralizer' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Verifica export TEST
              </Button>
            </>
          ) : (
            <>
              <Button className="justify-start sm:justify-center" variant="outline" onClick={prepareAutomaticLeaveCheck}>
                <Plus className="mr-2 h-4 w-4" />
                Pregateste CO automat
              </Button>
              <Button className="justify-start sm:justify-center" variant="outline" onClick={prepareManualLeaveCheck}>
                <Plus className="mr-2 h-4 w-4" />
                Pregateste CO manual
              </Button>
              <Button className="justify-start sm:justify-center" variant="outline" onClick={validateFirstDraftLeave} disabled={validating !== null}>
                {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Valideaza primul draft
              </Button>
              <Button asChild className="justify-start sm:justify-center" variant="outline">
                <Link href="/financiar/salariati">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Gestioneaza norme
                </Link>
              </Button>
            </>
          )}
          {verificationMessage && <div className="min-w-full rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">{verificationMessage}</div>}
        </CardContent>
      </Card>

      {selectedFinancialRow && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
              <Users className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">Asociere utilizator financiar: {selectedFinancialRow.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Utilizator PEO/PM
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
                value={selectedLinkExpertId}
                onChange={(event) => setSelectedLinkExpertId(event.target.value)}
                aria-label={`Utilizator pentru ${selectedFinancialRow.name}`}
              >
                <option value="">Alege expert</option>
                {selectedFinancialSuggestions.map((match) => (
                  <option key={match.expertId} value={match.expertId}>
                    {match.expertName} - {Math.round(match.score * 100)}% - {match.reason}
                  </option>
                ))}
                {experts
                  .filter((expert) => !selectedFinancialSuggestions.some((match) => match.expertId === expert.id))
                  .map((expert) => <option key={expert.id} value={expert.id}>{expert.name}</option>)}
              </select>
            </label>
            <Button onClick={saveFinancialPersonLink} disabled={savingLink || !selectedLinkExpertId}>
              {savingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirma
            </Button>
            <Button variant="outline" onClick={() => setSelectedFinancialPersonKey('')} disabled={savingLink}>
              Anuleaza
            </Button>
          </CardContent>
        </Card>
      )}

      {mode === 'leave' && (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4" />Adauga CO Financiar</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <select className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2" value={leaveForm.expertId} onChange={(event) => setLeaveForm((current) => ({ ...current, expertId: event.target.value }))} aria-label="Expert concediu">
                <option value="">Alege expert</option>
                {experts.map((expert) => <option key={expert.id} value={expert.id}>{expert.name}</option>)}
              </select>
              <Input type="date" value={leaveForm.date} onChange={(event) => setLeaveForm((current) => ({ ...current, date: event.target.value }))} aria-label="Data CO" />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={leaveForm.mode} onChange={(event) => setLeaveForm((current) => ({ ...current, mode: event.target.value as 'automatic' | 'manual' }))} aria-label="Mod repartizare CO">
                <option value="automatic">Automat</option>
                <option value="manual">Manual</option>
              </select>
              {leaveForm.mode === 'manual' && (
                <>
                  <Input type="number" min="0" step="0.5" value={leaveForm.totalHours} onChange={(event) => setLeaveForm((current) => ({ ...current, totalHours: event.target.value }))} aria-label="CO total" />
                  <Input type="number" min="0" step="0.5" value={leaveForm.peoHours} onChange={(event) => setLeaveForm((current) => ({ ...current, peoHours: event.target.value }))} aria-label="CO PEO" />
                  <Input type="number" min="0" step="0.5" value={leaveForm.cpcHours} onChange={(event) => setLeaveForm((current) => ({ ...current, cpcHours: event.target.value }))} aria-label="CO CPC" />
                  <Input className="md:col-span-3" value={leaveForm.justification} onChange={(event) => setLeaveForm((current) => ({ ...current, justification: event.target.value }))} placeholder="Justificare repartizare manuala" />
                </>
              )}
              <Button className="md:col-span-2" onClick={saveFinancialLeave} disabled={savingLeave || !leaveForm.expertId || !leaveForm.date || (leaveForm.mode === 'manual' && !leaveForm.justification.trim())}>
                {savingLeave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salveaza CO
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Sursa: modulul Raportare</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Referința Excel pentru ore este activă numai pentru {referenceMonthLabel} {summary.referenceYear}. Funcțiile și normele aplicației rămân autoritare.</p>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto">
            <select className="h-10 rounded-md border bg-background px-3 text-sm sm:w-auto" value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Luna">
              {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
            <Input className="sm:w-24" type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Anul" />
            <div className="relative sm:w-64"><SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută expert sau funcție" /></div>
            <Button className="justify-start sm:justify-center" variant={onlyConflicts ? 'default' : 'outline'} onClick={() => setOnlyConflicts((value) => !value)}>Doar diferențe</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto overscroll-x-contain px-2 pb-3 sm:px-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Se încarcă raportarea...</div>
          ) : (
            mode === 'timesheets' ? (
              visibleRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">Nu există înregistrări pentru filtrul selectat.</div>
              ) : (
              <TooltipProvider delayDuration={150}>
                <table className="w-full min-w-[1500px] table-fixed border-collapse border border-slate-300 text-[10px] leading-tight">
                  <colgroup>
                    {[3.5, 14, 12, 6, 5, 12, 5.5, 4.5, 11, 7, 4.5, 4, 4.5, 6.5].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
                  </colgroup>
                  <thead><tr className="text-center text-[9px] font-semibold uppercase leading-tight text-white">
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">NR. CRT.</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">SALARIAT</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">POZITIA DE BAZA (CONCORDIA)</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">ORE LUCRATE CONCORDIA</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">ORE CO CONCORDIA</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">FUNCTIA IN PEO</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">ORE LUCRATE PEO</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">ORE CO PEO</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">FUNCTIA IN GOODWORKS4ALL</th>
                    <th className="border-r border-white/30 bg-emerald-800 px-1 py-2">ORE LUCRATE GOODWORKS4ALL</th>
                    <th className="border-r border-white/30 bg-slate-700 px-1 py-2">TOTAL ORE LUCRATE</th>
                    <th className="border-r border-white/30 bg-slate-700 px-1 py-2">TOTAL ORE CO</th>
                    <th className="bg-amber-600 px-1 py-2">TOTAL ORE LUNA</th>
                    <th className="bg-blue-800 px-1 py-2">RATA ORARA PEO</th>
                  </tr></thead>
                  <tbody>{visibleRows.map((row, rowIndex) => (
                    <tr key={`${row.expertId ?? 'missing'}-${row.name}`} className={`border-b border-slate-300 align-middle hover:bg-emerald-50 ${rowIndex % 2 ? 'bg-emerald-50/40' : 'bg-white'}`}>
                      <td className="border-r border-slate-300 px-1 py-1 text-center font-semibold tabular-nums">{rowIndex + 1}</td>
                      <td className="border-r border-slate-300 px-1 py-1">
                        <div className="flex min-w-0 items-start gap-0.5">
                          <ConflictDot row={row} />
                          <span className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-snug" title={row.name}>{row.name}</span>
                          {!row.expertId ? (
                            <Button size="sm" variant="outline" className="h-5 shrink-0 px-1 text-[9px]" title={`Asociaza ${row.name} cu un utilizator PEO/PM`} onClick={() => openFinancialLinkPanel(row)}>
                              Asociaza
                            </Button>
                          ) : null}
                          <Button asChild size="icon" variant="ghost" className="h-5 w-5 shrink-0" title={`Editeaza salariatul ${row.name}`} aria-label={`Editeaza salariatul ${row.name}`}>
                            <Link href={row.expertId ? `/financiar/salariati?expertId=${encodeURIComponent(row.expertId)}` : `/financiar/salariati?financialPersonKey=${encodeURIComponent(row.financialPersonKey)}`}>
                              <ShieldCheck className="h-3 w-3" />
                            </Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title={`Exportă template pentru ${row.name}`} aria-label={`Exportă template pentru ${row.name}`} disabled={!row.expertId || exporting !== null} onClick={() => exportExpertTemplate(row)}>{exporting === row.expertId ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}</Button>
                        </div>
                      </td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.6em] overflow-hidden whitespace-normal break-words" title={row.basePosition}>{row.basePosition}</div></td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.concordiaWorked)}</td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.concordiaLeave)}</td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.6em] overflow-hidden whitespace-normal break-words" title={row.peoFunction}>{row.peoFunction}</div></td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.peoWorked)}</td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.peoLeave)}</td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.6em] overflow-hidden whitespace-normal break-words" title={row.goodworksFunction}>{row.goodworksFunction}</div></td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.goodworksWorked)}</td>
                      <td className="border-r border-slate-400 bg-slate-100/80 px-1 py-1 text-center font-semibold tabular-nums">{compactHours(row.totalWorked)}</td>
                      <td className="border-r border-slate-400 bg-slate-100/80 px-1 py-1 text-center font-semibold tabular-nums">{compactHours(row.totalLeave)}</td>
                      <td className="bg-amber-50 px-1 py-1 text-center font-semibold tabular-nums">{compactHours(row.totalMonth)}</td>
                      <td className="border-l border-slate-300 bg-blue-50 px-1 py-1">
                        <Input
                          className="h-7 px-1 text-center text-[10px] tabular-nums"
                          inputMode="decimal"
                          placeholder="lei/h"
                          value={hourlyRates[hourlyRateRowKey(row)] ?? ''}
                          disabled={!row.expertId}
                          title={row.expertId ? `Rata orara PEO pentru ${row.name}` : 'Disponibil dupa inregistrarea expertului in aplicatie'}
                          onChange={(event) => updateHourlyRate(row, event.target.value)}
                        />
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </TooltipProvider>
              )
            ) : (
              <TooltipProvider delayDuration={150}>
                {verificationMessage ? (
                  <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {verificationMessage}
                  </div>
                ) : null}
                <table className="w-full min-w-[1060px] table-fixed border-collapse border-t-2 border-black text-[11px] leading-tight">
                  <colgroup>
                    {[22, 8, 9, 9, 8, 9, 9, 18, 8].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="border-b-2 border-r border-black bg-[#f58f93] px-2 py-3 text-left text-[11px] font-bold uppercase" colSpan={2}>
                        {MONTHS[month].toUpperCase()} {year}
                      </th>
                      <th className="border-b-2 border-black bg-white" colSpan={7} />
                    </tr>
                    <tr className="border-b-2 border-black bg-white text-center text-[10px] font-bold uppercase">
                      <th className="border-r border-black px-2 py-2">NUME PRENUME</th>
                      <th className="border-r border-black px-2 py-2">NORMA<br />PEO</th>
                      <th className="border-r border-black px-2 py-2">ZILE CO<br />PEO</th>
                      <th className="border-r border-black bg-slate-200 px-2 py-2">ORE CO<br />PEO</th>
                      <th className="border-r border-black px-2 py-2">NORMA<br />CPC</th>
                      <th className="border-r border-black px-2 py-2">ZILE CO<br />CPC</th>
                      <th className="border-r border-black bg-slate-200 px-2 py-2">ORE CO<br />CPC</th>
                      <th className="border-r border-black px-2 py-2">PERIOADA<br />CO PEO {MONTHS[month].toUpperCase()}</th>
                      <th className="px-2 py-2">SALVEAZA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const key = leaveGridRowKey(row);
                      const draft = leaveGridDrafts[key] ?? {
                        peoNorm: '0',
                        peoDays: '0',
                        peoHours: '0',
                        cpcNorm: '0',
                        cpcDays: '0',
                        cpcHours: '0',
                        period: '',
                      };
                      const hasDraftLeave = row.leaveEntries.some((leave) => leave.status !== 'VALIDATED' && leave.status !== 'REJECTED');
                      const inputBaseClass = 'h-7 w-full min-w-0 rounded-sm border border-transparent bg-white/70 px-1 text-center text-[11px] tabular-nums shadow-none hover:border-slate-300 hover:bg-white focus-visible:border-primary focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-primary disabled:bg-transparent';
                      return (
                        <tr key={key} className="border-b border-dashed border-black align-middle hover:bg-slate-50/70">
                          <td className="border-r border-black px-2 py-1">
                            <div className="flex min-w-0 items-center gap-1">
                              <ConflictDot row={row} />
                              <span className="min-w-0 flex-1 whitespace-normal break-words font-medium uppercase leading-snug" title={row.name}>{row.name}</span>
                              {hasDraftLeave ? <Badge variant="secondary" className="shrink-0 text-[9px]">draft</Badge> : null}
                            </div>
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.peoNorm} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoNorm', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Norma PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.peoDays} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoDays', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Zile CO PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black bg-slate-200 px-1 py-1">
                            <Input className={`${inputBaseClass} font-bold`} inputMode="decimal" value={draft.peoHours} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoHours', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Ore CO PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.cpcNorm} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcNorm', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Norma CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.cpcDays} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcDays', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Zile CO CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black bg-slate-200 px-1 py-1">
                            <Input className={`${inputBaseClass} font-bold`} inputMode="decimal" value={draft.cpcHours} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcHours', event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => saveLeaveGridRowOnEnter(row, event)} aria-label={`Ore CO CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <FinancialLeavePeriodPicker
                              disabled={!row.expertId}
                              month={month}
                              onSelectDates={(dates) => updateLeaveGridPeriod(row, dates)}
                              period={draft.period}
                              rowName={row.name}
                              year={year}
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title={`Salveaza CO pentru ${row.name}`} aria-label={`Salveaza CO pentru ${row.name}`} disabled={!row.expertId || savingLeaveRow !== null} onClick={() => saveLeaveGridRow(row)}>
                              {savingLeaveRow === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-black bg-slate-200 text-[11px] font-bold uppercase">
                      <td className="border-r border-black px-2 py-2">TOTAL</td>
                      <td className="border-r border-black px-1 py-2" />
                      <td className="border-r border-black px-1 py-2 text-center tabular-nums">{compactHours(leaveGridTotals.peoDays)}</td>
                      <td className="border-r border-black px-1 py-2 text-center tabular-nums">{compactHours(leaveGridTotals.peoHours)}</td>
                      <td className="border-r border-black px-1 py-2" />
                      <td className="border-r border-black px-1 py-2 text-center tabular-nums">{compactHours(leaveGridTotals.cpcDays)}</td>
                      <td className="border-r border-black px-1 py-2 text-center tabular-nums">{compactHours(leaveGridTotals.cpcHours)}</td>
                      <td className="border-r border-black px-1 py-2" />
                      <td className="px-1 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </TooltipProvider>
            )
          )}
          {!isLoading && visibleRows.length === 0 && <div className="py-12 text-center text-muted-foreground">Nu există înregistrări pentru filtrul selectat.</div>}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
