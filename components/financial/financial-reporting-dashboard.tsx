'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileText, Loader2, Plus, Save, SearchIcon, ShieldCheck, Users } from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

function normLabel(unit?: NormUnit, value?: number) {
  if (!unit || value == null) return '-';
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value)} ${unit === 'HOURS_PER_MONTH' ? 'h/luna' : 'h/zi'}`;
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
  const [savingContract, setSavingContract] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [selectedNormExpertName, setSelectedNormExpertName] = useState('');
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
  const [contractForm, setContractForm] = useState({
    expertId: '',
    validFrom: isoDate(2026, 5),
    peoNormUnit: 'HOURS_PER_DAY' as NormUnit,
    peoNormValue: '8',
    peoDailyCap: '8',
    cimNormUnit: 'HOURS_PER_DAY' as NormUnit,
    cimNormValue: '8',
    cimDailyCap: '8',
    leaveHoursPerDay: '8',
    justification: '',
  });
  const { experts, isLoading: loadingExperts } = useExperts();
  const { activities, isLoading: loadingActivities } = useActivitiesByMonth(month, year);
  const { projects, isLoading: loadingProjects } = useAllConcurrentProjects();
  const { entries, isLoading: loadingEntries } = useConcurrentProjectTimesheetByMonth(month, year);
  const { contracts, isLoading: loadingContracts } = useAllExpertNormContracts();
  const { links: financialPersonLinks, isLoading: loadingLinks } = useFinancialPersonLinks();
  const { leaveEntries, isLoading: loadingLeave } = useLeaveEntries(month, year);
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
        const peoDailyCap = contract?.peoDailyCap ?? expert.dailyHours ?? expert.oreZi ?? expert.norma ?? 0;
        const cimDailyCap = contract?.cimDailyCap ?? 8;
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
        period: formatLeavePeriod(row.leaveDates),
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
    const peoHours = numericCell(draft.peoHours);
    const cpcHours = numericCell(draft.cpcHours);
    const totalHours = peoHours + cpcHours;
    let replacementDates: string[];
    try {
      replacementDates = parseLeavePeriod(draft.period, month, year);
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Perioada CO nu este valida.');
      return;
    }
    if (totalHours > 0 && replacementDates.length === 0) {
      setVerificationMessage(`Completeaza perioada CO pentru ${row.name}, de exemplu 01-08; 29-31.`);
      return;
    }
    const preservedFinalLeaves = row.leaveEntries.filter((leave) => leave.source === 'FINANCIAL' && (leave.status === 'VALIDATED' || leave.status === 'REJECTED'));
    if (preservedFinalLeaves.length) {
      setVerificationMessage(`${row.name} are CO financiar validat/respins. Aceste inregistrari raman neschimbate; respinge sau corecteaza separat inainte de inlocuire completa.`);
    }

    setSavingLeaveRow(key);
    try {
      const validFrom = isoDate(year, month, 1);
      const sameDateContract = contracts.find((contract) => contract.expertId === row.expertId && contract.validFrom === validFrom);
      const cpcDailyCap = Math.max(0, cpcNorm);
      const cimDailyCap = peoNorm + cpcDailyCap;
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

      const replaceableLeaves = row.leaveEntries.filter((leave) => leave.source === 'FINANCIAL' && leave.status !== 'VALIDATED' && leave.status !== 'REJECTED');
      for (const leave of replaceableLeaves) {
        await removeLeaveEntry(leave.id);
      }

      if (totalHours > 0) {
        const peoPerDay = peoHours / replacementDates.length;
        const cpcPerDay = cpcHours / replacementDates.length;
        for (const date of replacementDates) {
          await createManual({
            expertId: row.expertId,
            date,
            month,
            year,
            type: 'CO',
            totalHours: peoPerDay + cpcPerDay,
            peoHours: peoPerDay,
            cpcHours: cpcPerDay,
            source: 'FINANCIAL',
            status: 'DRAFT',
            lockedForExpert: true,
            automaticSplit: false,
            justification: `Actualizare manuala CO Financiar: ${draft.period || date}`,
            createdBy: 'financial-session',
          });
        }
      }
      setVerificationMessage(`CO pentru ${row.name} a fost salvat in formatul centralizatorului Excel.`);
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

  const saveNormContract = async () => {
    if (!contractForm.expertId || !contractForm.validFrom) {
      setVerificationMessage('Alege expertul si data de inceput pentru versiunea de norma.');
      return;
    }
    if (!contractForm.justification.trim()) {
      setVerificationMessage('Justificarea este obligatorie ca sa putem pastra istoricul modificarilor de norma.');
      document.getElementById('norma-editor-justification')?.focus();
      return;
    }
    setSavingContract(true);
    try {
      const payload: Omit<ExpertNormContract, 'id'> = {
        expertId: contractForm.expertId,
        validFrom: contractForm.validFrom,
        peoNormUnit: contractForm.peoNormUnit,
        peoNormValue: Number(contractForm.peoNormValue),
        peoDailyCap: Number(contractForm.peoDailyCap),
        cimNormUnit: contractForm.cimNormUnit,
        cimNormValue: Number(contractForm.cimNormValue),
        cimDailyCap: Number(contractForm.cimDailyCap),
        leaveHoursPerDay: Number(contractForm.leaveHoursPerDay),
        status: 'ACTIVE',
        justification: contractForm.justification,
        createdBy: 'financial-session',
        updatedBy: 'financial-session',
      };
      const sameDateContract = contracts.find((contract) => contract.expertId === contractForm.expertId && contract.validFrom === contractForm.validFrom);
      if (sameDateContract) {
        await updateNormContract(sameDateContract.id, {
          peoNormUnit: payload.peoNormUnit,
          peoNormValue: payload.peoNormValue,
          peoDailyCap: payload.peoDailyCap,
          cimNormUnit: payload.cimNormUnit,
          cimNormValue: payload.cimNormValue,
          cimDailyCap: payload.cimDailyCap,
          leaveHoursPerDay: payload.leaveHoursPerDay,
          status: 'ACTIVE',
          justification: payload.justification,
          updatedBy: 'financial-session',
        });
        setVerificationMessage(`Norma pentru ${selectedNormExpertName || 'expert'} a fost actualizata pentru ${contractForm.validFrom}.`);
      } else {
        const openContract = contracts
          .filter((contract) => contract.expertId === contractForm.expertId && !contract.validTo && contract.validFrom < contractForm.validFrom)
          .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
        if (openContract) {
          await updateNormContract(openContract.id, { validTo: previousDay(contractForm.validFrom), updatedBy: 'financial-session' });
        }
        await createNormContract(payload);
        setVerificationMessage(`Norma pentru ${selectedNormExpertName || 'expert'} a fost salvata ca versiune noua din ${contractForm.validFrom}.`);
      }
      setContractForm((current) => ({ ...current, justification: '' }));
    } finally {
      setSavingContract(false);
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

  const prepareNormVersionCheck = () => {
    const target = monthlyExpert ?? firstExpert;
    if (!target) return;
    setContractForm({
      expertId: target.id,
      validFrom: isoDate(year, month, 1),
      peoNormUnit: 'HOURS_PER_MONTH',
      peoNormValue: target.projectMonthlyNorm ? String(target.projectMonthlyNorm) : '130',
      peoDailyCap: '6',
      cimNormUnit: 'HOURS_PER_DAY',
      cimNormValue: '8',
      cimDailyCap: '8',
      leaveHoursPerDay: '8',
      justification: 'Verificare norma versionata staging',
    });
    setVerificationMessage(`Concedii: norma versionata pregatita pentru ${target.name}. Apasa Salveaza norma pentru istoric nou.`);
  };

  const editNormFromPanel = (row: NormPanelRow) => {
    if (!row.expert) {
      setVerificationMessage(`${row.name} este angajat CPC preluat din Excel, fara cont utilizator si fara inregistrare Expert in aplicatie. Il afisam in Financiar pentru salarizare si cross-check; norma PEO este neaplicabila pana cand Financiar decide sa il inregistreze ca persoana financiara.`);
      return;
    }
    const contract = row.contract;
    setSelectedNormExpertName(row.expert.name);
    setContractForm({
      expertId: row.expert.id,
      validFrom: isoDate(year, month, 1),
      peoNormUnit: contract?.peoNormUnit ?? 'HOURS_PER_DAY',
      peoNormValue: String(contract?.peoNormValue ?? row.peoDailyCap ?? 8),
      peoDailyCap: String(contract?.peoDailyCap ?? row.peoDailyCap ?? 8),
      cimNormUnit: contract?.cimNormUnit ?? 'HOURS_PER_DAY',
      cimNormValue: String(contract?.cimNormValue ?? row.cimDailyCap ?? 8),
      cimDailyCap: String(contract?.cimDailyCap ?? row.cimDailyCap ?? 8),
      leaveHoursPerDay: String(contract?.leaveHoursPerDay ?? row.cimDailyCap ?? 8),
      justification: '',
    });
    setVerificationMessage(`Experti si norme: ${row.expert.name} a fost incarcat in formular. CPC se calculeaza ca CIM - PEO - alte proiecte.`);
    window.setTimeout(() => {
      document.getElementById('norma-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('norma-editor-justification')?.focus();
    }, 50);
  };

  const editNormFromTimesheet = (row: FinancialTimesheetRow) => {
    if (!row.expertId) {
      setVerificationMessage(`${row.name} exista in Excel ca angajat CPC, dar nu este utilizator/expert PEO in aplicatie. Il afisam in Financiar pentru salarizare CPC/proiecte concurente; norma PEO este neaplicabila.`);
      return;
    }
    const panelRow = normPanelRows.find((item) => item.expert?.id === row.expertId);
    if (!panelRow) {
      setVerificationMessage(`Nu am gasit configuratia de norme pentru ${row.name}. Verifica daca expertul este activ in baza de date.`);
      return;
    }
    editNormFromPanel(panelRow);
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
        <Button onClick={exportCentralizer} disabled={isLoading || exporting !== null}>
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
        <CardContent className="flex flex-wrap items-center gap-2">
          {mode === 'timesheets' ? (
            <>
              <Button variant="outline" onClick={verifyTimesheetDashboard}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Verifica 12 coloane
              </Button>
              <Button variant={onlyConflicts ? 'default' : 'outline'} onClick={() => {
                setOnlyConflicts((value) => !value);
                setVerificationMessage('Pontaje: filtrul Doar diferente a fost comutat; problemele raman in bulina cu hover.');
              }}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Verifica buline conflicte
              </Button>
              <Button onClick={exportCentralizer} disabled={isLoading || exporting !== null}>
                {exporting === 'centralizer' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Verifica export TEST
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={prepareAutomaticLeaveCheck}>
                <Plus className="mr-2 h-4 w-4" />
                Pregateste CO automat
              </Button>
              <Button variant="outline" onClick={prepareManualLeaveCheck}>
                <Plus className="mr-2 h-4 w-4" />
                Pregateste CO manual
              </Button>
              <Button variant="outline" onClick={validateFirstDraftLeave} disabled={validating !== null}>
                {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Valideaza primul draft
              </Button>
              <Button variant="outline" onClick={prepareNormVersionCheck}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Pregateste norma versionata
              </Button>
            </>
          )}
          {verificationMessage && <div className="min-w-full rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">{verificationMessage}</div>}
        </CardContent>
      </Card>

      {selectedFinancialRow && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Asociere utilizator financiar: {selectedFinancialRow.name}
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
        <Card id="experti-norme">
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Experti si norme pe proiecte
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                PEO si CIM sunt editabile prin versiuni de contract. CPC este calculat: CIM zilnic - PEO zilnic - alte proiecte active.
              </p>
            </div>
            <Badge variant="secondary">{normPanelRows.length} persoane financiare</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[1280px] border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Expert</th>
                  <th className="p-2">Functie PEO</th>
                  <th className="p-2">Norma PEO</th>
                  <th className="p-2 text-right">Plafon PEO/zi</th>
                  <th className="p-2">Norma CIM/CPC</th>
                  <th className="p-2 text-right">Plafon CIM/zi</th>
                  <th className="p-2">GOODWORKS4ALL</th>
                  <th className="p-2">Alte proiecte</th>
                  <th className="p-2">Formula CPC</th>
                  <th className="p-2">Valabilitate</th>
                  <th className="p-2 text-right">Actiuni</th>
                </tr>
              </thead>
              <tbody>
                {normPanelRows.map((row) => (
                  <tr key={row.id} className="border-b align-top hover:bg-slate-50/60">
                    <td className="p-2">
                      <div className="flex items-center gap-2 font-medium">
                        {row.name}
                        {row.financialOnly ? <Badge variant="secondary" className="text-[10px]">CPC Excel</Badge> : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{row.detail}</div>
                    </td>
                    <td className="p-2">{row.peoFunction || '-'}</td>
                    <td className="p-2">{row.peoNormLabel ?? normLabel(row.contract?.peoNormUnit, row.contract?.peoNormValue)}</td>
                    <td className="p-2 text-right tabular-nums">{compactHours(row.peoDailyCap)}</td>
                    <td className="p-2">{row.cimNormLabel ?? normLabel(row.contract?.cimNormUnit, row.contract?.cimNormValue)}</td>
                    <td className="p-2 text-right tabular-nums">{compactHours(row.cimDailyCap)}</td>
                    <td className="p-2">
                      {row.goodworksProjects.length
                        ? row.goodworksProjects.map((project) => project.expertProjectRole || project.projectName).join(', ')
                        : '-'}
                    </td>
                    <td className="p-2">
                      {row.otherProjects.length
                        ? row.otherProjects.map((project) => `${project.projectName}${project.dailyHours ? ` (${compactHours(project.dailyHours)}/zi)` : ''}`).join(', ')
                        : '-'}
                    </td>
                    <td className="p-2">
                      <code className="rounded bg-slate-100 px-1.5 py-1 text-[11px]">
                        CPC = {compactHours(row.cimDailyCap)} - {compactHours(row.peoDailyCap)} - {compactHours(row.otherDailyHours)} = {compactHours(row.cpcFormulaHours)} h/zi
                      </code>
                    </td>
                    <td className="p-2">
                      {row.contract
                        ? `${row.contract.validFrom}${row.contract.validTo ? ` - ${row.contract.validTo}` : ' - prezent'}`
                        : row.financialOnly ? 'Excel financiar' : 'compatibilitate veche'}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => editNormFromPanel(row)}>
                        {row.financialOnly ? 'Detalii financiar' : 'Editeaza norma'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(mode === 'leave' || selectedNormExpertName) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {mode === 'leave' && (
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
          )}

          <Card id="norma-editor" className={selectedNormExpertName ? 'border-primary/60 shadow-sm ring-2 ring-primary/15' : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4" />
                Versiune norma PEO/CIM{selectedNormExpertName ? ` - ${selectedNormExpertName}` : ''}
              </CardTitle>
              {selectedNormExpertName && <p className="text-xs text-muted-foreground">Modificarea se salveaza ca versiune noua; istoricul existent nu se suprascrie.</p>}
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <select className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2" value={contractForm.expertId} onChange={(event) => setContractForm((current) => ({ ...current, expertId: event.target.value }))} aria-label="Expert norma">
                <option value="">Alege expert</option>
                {experts.map((expert) => <option key={expert.id} value={expert.id}>{expert.name}</option>)}
              </select>
              <Input type="date" value={contractForm.validFrom} onChange={(event) => setContractForm((current) => ({ ...current, validFrom: event.target.value }))} aria-label="Valabil de la" />
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Unitate PEO
                <select className="h-10 rounded-md border bg-background px-3 text-sm text-foreground" value={contractForm.peoNormUnit} onChange={(event) => setContractForm((current) => ({ ...current, peoNormUnit: event.target.value as NormUnit }))} aria-label="Unitate PEO">
                  <option value="HOURS_PER_DAY">PEO h/zi</option>
                  <option value="HOURS_PER_MONTH">PEO h/luna</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                {contractForm.peoNormUnit === 'HOURS_PER_DAY' ? 'Bază calcul plafon lunar PEO (h/zi)' : 'Plafon lunar PEO (ore)'}
                <Input type="number" min="0" step="0.5" value={contractForm.peoNormValue} onChange={(event) => setContractForm((current) => ({ ...current, peoNormValue: event.target.value }))} aria-label={contractForm.peoNormUnit === 'HOURS_PER_DAY' ? 'Bază calcul plafon lunar PEO (h/zi)' : 'Plafon lunar PEO (ore)'} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Referință zilnică PEO
                <Input type="number" min="0" step="0.5" value={contractForm.peoDailyCap} onChange={(event) => setContractForm((current) => ({ ...current, peoDailyCap: event.target.value }))} aria-label="Referință zilnică PEO" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Unitate CIM
                <select className="h-10 rounded-md border bg-background px-3 text-sm text-foreground" value={contractForm.cimNormUnit} onChange={(event) => setContractForm((current) => ({ ...current, cimNormUnit: event.target.value as NormUnit }))} aria-label="Unitate CIM">
                  <option value="HOURS_PER_DAY">CIM h/zi</option>
                  <option value="HOURS_PER_MONTH">CIM h/luna</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Norma lunara CIM
                <Input type="number" min="0" step="0.5" value={contractForm.cimNormValue} onChange={(event) => setContractForm((current) => ({ ...current, cimNormValue: event.target.value }))} aria-label="Norma lunara CIM" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Maximum total CIM într-o zi
                <Input type="number" min="0" max="8" step="0.5" value={contractForm.cimDailyCap} onChange={(event) => setContractForm((current) => ({ ...current, cimDailyCap: event.target.value, leaveHoursPerDay: event.target.value }))} aria-label="Maximum total CIM într-o zi" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Ore CO pe zi
                <Input type="number" min="0" max="8" step="0.5" value={contractForm.leaveHoursPerDay} onChange={(event) => setContractForm((current) => ({ ...current, leaveHoursPerDay: event.target.value }))} aria-label="Ore CO pe zi" />
              </label>
              <p className="md:col-span-6 text-xs text-muted-foreground">Valoarea PEO folosită pentru calculul lunar nu limitează orele PEO dintr-o zi. Pontajul zilnic este limitat de CIM, iar PEO este limitat lunar.</p>
              <Input id="norma-editor-justification" className="md:col-span-3" value={contractForm.justification} onChange={(event) => setContractForm((current) => ({ ...current, justification: event.target.value }))} placeholder="Justificare modificare norma" />
              {contractForm.expertId && !contractForm.justification.trim() ? <p className="md:col-span-3 text-xs text-amber-700">Justificarea este obligatorie pentru audit. Scrie motivul modificarii, apoi salveaza.</p> : null}
              <Button className="md:col-span-2" onClick={saveNormContract} disabled={savingContract || !contractForm.expertId || !contractForm.validFrom}>
                {savingContract ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salveaza norma
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Sursa: modulul Raportare</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Referința Excel pentru ore este activă numai pentru {MONTHS[summary.referenceMonth - 1]} {summary.referenceYear}. Funcțiile și normele aplicației rămân autoritare.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Luna">
              {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
            <Input className="w-24" type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Anul" />
            <div className="relative"><SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="w-64 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută expert sau funcție" /></div>
            <Button variant={onlyConflicts ? 'default' : 'outline'} onClick={() => setOnlyConflicts((value) => !value)}>Doar diferențe</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-2 pb-3 sm:px-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Se încarcă raportarea...</div>
          ) : (
            mode === 'timesheets' ? (
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
                          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title={`Editeaza norma pentru ${row.name}`} aria-label={`Editeaza norma pentru ${row.name}`} onClick={() => editNormFromTimesheet(row)}><ShieldCheck className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" title={`Exportă template pentru ${row.name}`} aria-label={`Exportă template pentru ${row.name}`} disabled={!row.expertId || exporting !== null} onClick={() => exportExpertTemplate(row)}>{exporting === row.expertId ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}</Button>
                        </div>
                      </td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.2em] overflow-hidden" title={row.basePosition}>{row.basePosition}</div></td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.concordiaWorked)}</td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.concordiaLeave)}</td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.2em] overflow-hidden" title={row.peoFunction}>{row.peoFunction}</div></td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.peoWorked)}</td>
                      <td className="border-r border-slate-300 px-1 py-1 text-center tabular-nums">{compactHours(row.peoLeave)}</td>
                      <td className="border-r border-slate-300 px-1 py-1"><div className="max-h-[2.2em] overflow-hidden" title={row.goodworksFunction}>{row.goodworksFunction}</div></td>
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
            ) : (
              <TooltipProvider delayDuration={150}>
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
                      const inputBaseClass = 'h-7 rounded-none border-0 bg-transparent px-1 text-center text-[11px] tabular-nums shadow-none focus-visible:ring-1 focus-visible:ring-primary';
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
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.peoNorm} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoNorm', event.target.value)} aria-label={`Norma PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.peoDays} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoDays', event.target.value)} aria-label={`Zile CO PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black bg-slate-200 px-1 py-1">
                            <Input className={`${inputBaseClass} font-bold`} inputMode="decimal" value={draft.peoHours} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'peoHours', event.target.value)} aria-label={`Ore CO PEO ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.cpcNorm} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcNorm', event.target.value)} aria-label={`Norma CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={inputBaseClass} inputMode="decimal" value={draft.cpcDays} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcDays', event.target.value)} aria-label={`Zile CO CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black bg-slate-200 px-1 py-1">
                            <Input className={`${inputBaseClass} font-bold`} inputMode="decimal" value={draft.cpcHours} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'cpcHours', event.target.value)} aria-label={`Ore CO CPC ${row.name}`} />
                          </td>
                          <td className="border-r border-black px-1 py-1">
                            <Input className={`${inputBaseClass} text-center`} value={draft.period} disabled={!row.expertId} onChange={(event) => updateLeaveGridDraft(row, 'period', event.target.value)} placeholder="01-08; 29-31" aria-label={`Perioada CO ${row.name}`} />
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
