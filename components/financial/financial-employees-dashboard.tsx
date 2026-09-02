'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, SearchIcon, ShieldCheck, Users, UsersRound } from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useAllExpertNormContracts,
  useExpertMutations,
  useExpertNormContractMutations,
  useExperts,
  useFinancialPersonLinkMutations,
  useFinancialPersonLinks,
} from '@/hooks/use-backend-data';
import {
  buildFinancialHrValidationRows,
  financialHrRowNeedsAttention,
  formatFinancialHrNorm,
  parseFinancialHrNorm,
  summarizeFinancialHrValidation,
  type FinancialHrFieldCheck,
  type FinancialHrValidationRow,
} from '@/lib/financial-hr-validation';
import type { Expert, ExpertNormContract, NormUnit } from '@/lib/types';

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

type EmployeeForm = {
  expertId: string;
  financialPersonKey: string;
  financialPersonName: string;
  name: string;
  basePositionConcordia: string;
  positionInProject: string;
  goodworksPosition: string;
  isActive: boolean;
};

type ContractForm = {
  expertId: string;
  validFrom: string;
  peoNormUnit: NormUnit;
  peoNormValue: string;
  cimNormUnit: NormUnit;
  cimNormValue: string;
  justification: string;
};

function isoDate(year: number, month: number, day = 1) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function previousDay(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function normalizeInput(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed && trimmed !== '-' ? trimmed : undefined;
}

function numeric(value: string, fallback = 0) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dailyCapFromNorm(unit: NormUnit, value: string, fallback = 8) {
  return unit === 'HOURS_PER_DAY' ? numeric(value, fallback) : fallback;
}

function fieldBadge(status: FinancialHrFieldCheck['status']) {
  if (status === 'ok') return <Badge className="bg-emerald-600">OK</Badge>;
  if (status === 'missing') return <Badge variant="destructive">lipsa</Badge>;
  if (status === 'unlinked') return <Badge variant="secondary">necorelat</Badge>;
  return <Badge className="bg-amber-600">diferit</Badge>;
}

function rowBadge(status: FinancialHrValidationRow['status']) {
  if (status === 'ok') return <Badge className="bg-emerald-600">OK</Badge>;
  if (status === 'unlinked') return <Badge variant="destructive">necorelat</Badge>;
  if (status === 'extra') return <Badge variant="secondary">in plus</Badge>;
  return <Badge className="bg-amber-600">de verificat</Badge>;
}

function FieldCompare({ label, check }: { label: string; check: FinancialHrFieldCheck }) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
        {fieldBadge(check.status)}
      </div>
      <div className="min-w-0 rounded border bg-white px-2 py-1">
        <div className="truncate text-xs font-medium" title={check.appValue}>Aplicatie: {check.appValue}</div>
        <div className="truncate text-[11px] text-muted-foreground" title={check.excelValue}>Excel: {check.excelValue}</div>
      </div>
    </div>
  );
}

function contractDefaults(row?: FinancialHrValidationRow, expert?: Expert, contract?: ExpertNormContract, validFrom = '2026-06-01'): ContractForm {
  const peoReference = parseFinancialHrNorm(row?.peoNorm.excelValue) ?? null;
  const cimReference = parseFinancialHrNorm(row?.cimNorm.excelValue);
  const fallbackDaily = expert?.dailyHours ?? expert?.oreZi ?? expert?.norma ?? 8;
  return {
    expertId: expert?.id ?? '',
    validFrom,
    peoNormUnit: contract?.peoNormUnit ?? peoReference?.unit ?? 'HOURS_PER_DAY',
    peoNormValue: String(contract?.peoNormValue ?? peoReference?.value ?? fallbackDaily),
    cimNormUnit: contract?.cimNormUnit ?? cimReference?.unit ?? 'HOURS_PER_DAY',
    cimNormValue: String(contract?.cimNormValue ?? cimReference?.value ?? fallbackDaily),
    justification: '',
  };
}

export function FinancialEmployeesDashboard() {
  const searchParams = useSearchParams();
  const { experts, isLoading: loadingExperts } = useExperts({ includeInactive: true });
  const { contracts, isLoading: loadingContracts } = useAllExpertNormContracts();
  const { links, isLoading: loadingLinks } = useFinancialPersonLinks();
  const { create: createExpert, update: updateExpert } = useExpertMutations();
  const { create: createContract, update: updateContract } = useExpertNormContractMutations();
  const { create: createLink, update: updateLink } = useFinancialPersonLinkMutations();
  const [month, setMonth] = useState(5);
  const [year, setYear] = useState(2026);
  const [search, setSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState('');
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm | null>(null);
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => buildFinancialHrValidationRows({
    experts,
    normContracts: contracts,
    financialPersonLinks: links,
    month,
    year,
  }), [contracts, experts, links, month, year]);

  const summary = useMemo(() => summarizeFinancialHrValidation(rows), [rows]);
  const isLoading = loadingExperts || loadingContracts || loadingLinks;

  const visibleRows = useMemo(() => {
    const needle = search.toLocaleLowerCase('ro-RO').trim();
    return rows.filter((row) => {
      if (onlyIssues && !financialHrRowNeedsAttention(row)) return false;
      if (!needle) return true;
      return [
        row.financialPersonName,
        row.expert?.name,
        row.basePosition.appValue,
        row.basePosition.excelValue,
        row.peoFunction.appValue,
        row.peoFunction.excelValue,
        row.peoNorm.appValue,
        row.peoNorm.excelValue,
        row.goodworksFunction.appValue,
        row.goodworksFunction.excelValue,
      ].some((value) => String(value ?? '').toLocaleLowerCase('ro-RO').includes(needle));
    });
  }, [onlyIssues, rows, search]);

  const selectRow = (row: FinancialHrValidationRow) => {
    const activeContract = row.expert
      ? contracts
        .filter((contract) => contract.expertId === row.expert!.id && contract.status === 'ACTIVE')
        .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0]
      : undefined;
    setSelectedRowId(row.id);
    setEmployeeForm({
      expertId: row.expert?.id ?? '',
      financialPersonKey: row.financialPersonKey,
      financialPersonName: row.financialPersonName,
      name: row.expert?.name ?? row.financialPersonName,
      basePositionConcordia: row.expert?.basePositionConcordia ?? (row.basePosition.excelValue === '-' ? '' : row.basePosition.excelValue),
      positionInProject: row.expert?.positionInProject ?? row.expert?.role ?? (row.peoFunction.excelValue === '-' ? '' : row.peoFunction.excelValue),
      goodworksPosition: row.expert?.goodworksPosition ?? (row.goodworksFunction.excelValue === '-' ? '' : row.goodworksFunction.excelValue),
      isActive: row.expert?.isActive ?? true,
    });
    setContractForm(contractDefaults(row, row.expert, activeContract, isoDate(year, month, 1)));
    setMessage('');
  };

  const addEmployee = () => {
    setSelectedRowId('new');
    setEmployeeForm({
      expertId: '',
      financialPersonKey: '',
      financialPersonName: '',
      name: '',
      basePositionConcordia: '',
      positionInProject: '',
      goodworksPosition: '',
      isActive: true,
    });
    setContractForm(contractDefaults(undefined, undefined, undefined, isoDate(year, month, 1)));
    setMessage('');
    window.setTimeout(() => {
      document.getElementById('employee-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  useEffect(() => {
    const expertId = searchParams.get('expertId');
    const financialPersonKey = searchParams.get('financialPersonKey');
    const row = rows.find((item) => (expertId && item.expertId === expertId) || (financialPersonKey && item.financialPersonKey === financialPersonKey));
    if (row && row.id !== selectedRowId) selectRow(row);
  }, [rows, searchParams, selectedRowId]);

  const saveEmployee = async () => {
    if (!employeeForm) return;
    setSaving(true);
    try {
      const daily = contractForm ? dailyCapFromNorm(contractForm.cimNormUnit, contractForm.cimNormValue, 8) : 8;
      const fields = {
        name: employeeForm.name.trim(),
        role: normalizeInput(employeeForm.positionInProject) ?? 'Salariat Concordia',
        norma: daily,
        oreZi: daily,
        dailyHours: daily,
        basePositionConcordia: normalizeInput(employeeForm.basePositionConcordia),
        positionInProject: normalizeInput(employeeForm.positionInProject),
        goodworksPosition: normalizeInput(employeeForm.goodworksPosition),
        hasPmAccess: false,
        isActive: employeeForm.isActive,
        saCodes: [],
      };
      let expertId = employeeForm.expertId;
      if (expertId) {
        await updateExpert(expertId, fields);
      } else {
        const created = await createExpert(fields);
        expertId = created.id;
        if (employeeForm.financialPersonKey) {
          const existingLink = links.find((link) => link.financialPersonKey === employeeForm.financialPersonKey);
          const linkPayload = {
            financialPersonName: employeeForm.financialPersonName,
            financialPersonKey: employeeForm.financialPersonKey,
            expertId,
            status: 'confirmed' as const,
            confidence: 1,
            source: 'financial' as const,
            createdBy: 'financial-session',
            updatedBy: 'financial-session',
          };
          if (existingLink) await updateLink(existingLink.id, linkPayload);
          else await createLink(linkPayload);
        }
        setEmployeeForm((current) => current ? { ...current, expertId } : current);
        setContractForm((current) => current ? { ...current, expertId } : current);
      }
      setMessage(`Profilul pentru ${fields.name} a fost salvat.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profilul nu a putut fi salvat.');
    } finally {
      setSaving(false);
    }
  };

  const saveContract = async () => {
    if (!contractForm?.expertId || !contractForm.validFrom) return;
    if (!contractForm.justification.trim()) {
      setMessage('Justificarea este obligatorie pentru modificarea normei CIM/PEO.');
      return;
    }
    setSaving(true);
    try {
      const cimDailyCap = dailyCapFromNorm(contractForm.cimNormUnit, contractForm.cimNormValue, 8);
      const payload: Omit<ExpertNormContract, 'id'> = {
        expertId: contractForm.expertId,
        validFrom: contractForm.validFrom,
        peoNormUnit: contractForm.peoNormUnit,
        peoNormValue: numeric(contractForm.peoNormValue),
        peoDailyCap: cimDailyCap,
        cimNormUnit: contractForm.cimNormUnit,
        cimNormValue: numeric(contractForm.cimNormValue),
        cimDailyCap,
        leaveHoursPerDay: cimDailyCap,
        status: 'ACTIVE',
        justification: contractForm.justification,
        createdBy: 'financial-session',
        updatedBy: 'financial-session',
      };
      const sameDateContract = contracts.find((contract) => contract.expertId === payload.expertId && contract.validFrom === payload.validFrom);
      if (sameDateContract) {
        await updateContract(sameDateContract.id, payload);
      } else {
        const openContract = contracts
          .filter((contract) => contract.expertId === payload.expertId && !contract.validTo && contract.validFrom < payload.validFrom)
          .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
        if (openContract) await updateContract(openContract.id, { validTo: previousDay(payload.validFrom), updatedBy: 'financial-session' });
        await createContract(payload);
      }
      setContractForm((current) => current ? { ...current, justification: '' } : current);
      setMessage(`Norma a fost salvata: CIM ${formatFinancialHrNorm(payload.cimNormUnit, payload.cimNormValue)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Norma nu a putut fi salvata.');
    } finally {
      setSaving(false);
    }
  };

  const deactivateSelected = async () => {
    if (!employeeForm?.expertId) return;
    setSaving(true);
    try {
      await updateExpert(employeeForm.expertId, { isActive: false });
      setEmployeeForm((current) => current ? { ...current, isActive: false } : current);
      setMessage(`${employeeForm.name} a fost dezactivat. Istoricul ramane pastrat.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell
      activeHref="/financiar/salariati"
      navItems={financialNavItems}
      eyebrow="Modul Financiar"
      title="Salariati si validare HR"
      description="Verificare salariați fata de tabelul Excel trimis catre HR. Aplicatia ramane sursa pentru export; Excelul este reperul de control."
      reportingMonth={`${MONTHS[month]} ${year}`}
      actions={(
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button onClick={addEmployee}>
            <Plus className="mr-2 h-4 w-4" />
            Adauga salariat
          </Button>
          <Button asChild variant="outline">
            <Link href="/financiar/pontaje">Pontaje</Link>
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />Total</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" />OK</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-emerald-700">{summary.ok}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4" />De verificat</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-amber-700">{summary.needsReview}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><UsersRound className="h-4 w-4" />Necorelat</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-red-700">{summary.unlinked}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />In plus</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.extra}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Validare tabel HR</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Baseline: Date pentru aplicatie.xlsx, Sheet1 pentru pozitii/functii si Sheet2 pentru norme.</p>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Luna">
              {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
            <Input className="sm:w-24" type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Anul" />
            <div className="relative sm:w-72"><SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cauta salariat sau functie" /></div>
            <Button variant={onlyIssues ? 'default' : 'outline'} onClick={() => setOnlyIssues((value) => !value)}>Doar probleme</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto overscroll-x-contain px-2 pb-3 sm:px-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Se incarca salariații...</div>
          ) : (
            <table className="w-full min-w-[1380px] border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[11px] uppercase text-muted-foreground">
                  <th className="p-2">Salariat</th>
                  <th className="p-2">Pozitia de baza Concordia</th>
                  <th className="p-2">Functie PEO</th>
                  <th className="p-2">Norma PEO</th>
                  <th className="p-2">Functie Goodworks4All</th>
                  <th className="p-2">Norma CIM</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Actiuni</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b align-top hover:bg-slate-50/70">
                    <td className="p-2">
                      <div className="font-medium">{row.expert?.name ?? row.financialPersonName}</div>
                      <div className="text-[11px] text-muted-foreground">Excel: {row.financialPersonName}</div>
                      {row.matchSuggestions[0] ? <div className="mt-1 text-[11px] text-amber-700">Sugestie: {row.matchSuggestions[0].expertName} ({Math.round(row.matchSuggestions[0].score * 100)}%)</div> : null}
                    </td>
                    <td className="p-2"><FieldCompare label="Pozitie" check={row.basePosition} /></td>
                    <td className="p-2"><FieldCompare label="PEO" check={row.peoFunction} /></td>
                    <td className="p-2"><FieldCompare label="Norma PEO" check={row.peoNorm} /></td>
                    <td className="p-2"><FieldCompare label="Goodworks" check={row.goodworksFunction} /></td>
                    <td className="p-2"><FieldCompare label="CIM" check={row.cimNorm} /></td>
                    <td className="p-2">{rowBadge(row.status)}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant={selectedRowId === row.id ? 'default' : 'outline'} onClick={() => selectRow(row)}>
                        {row.expertId ? 'Editeaza' : 'Creeaza salariat'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && visibleRows.length === 0 ? <div className="py-12 text-center text-muted-foreground">Nu exista randuri pentru filtrul selectat.</div> : null}
        </CardContent>
      </Card>

      {employeeForm && contractForm ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card id="employee-editor">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />Profil salariat</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Nume salariat" />
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" checked={employeeForm.isActive} onChange={(event) => setEmployeeForm((current) => current ? { ...current, isActive: event.target.checked } : current)} />
                Activ
              </label>
              <Input value={employeeForm.basePositionConcordia} onChange={(event) => setEmployeeForm((current) => current ? { ...current, basePositionConcordia: event.target.value } : current)} placeholder="Pozitia de baza Concordia" />
              <Input value={employeeForm.positionInProject} onChange={(event) => setEmployeeForm((current) => current ? { ...current, positionInProject: event.target.value } : current)} placeholder="Functie PEO" />
              <Input value={employeeForm.goodworksPosition} onChange={(event) => setEmployeeForm((current) => current ? { ...current, goodworksPosition: event.target.value } : current)} placeholder="Functie Goodworks4All" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveEmployee} disabled={saving || !employeeForm.name.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salveaza profil
                </Button>
                {employeeForm.expertId ? (
                  <Button variant="outline" onClick={deactivateSelected} disabled={saving || !employeeForm.isActive}>
                    <UsersRound className="mr-2 h-4 w-4" />
                    Dezactiveaza
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card id="norma-editor">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Norma CIM/PEO</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Input type="date" value={contractForm.validFrom} onChange={(event) => setContractForm((current) => current ? { ...current, validFrom: event.target.value } : current)} aria-label="Valabil de la" />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={contractForm.peoNormUnit} onChange={(event) => setContractForm((current) => current ? { ...current, peoNormUnit: event.target.value as NormUnit } : current)} aria-label="Unitate PEO">
                <option value="HOURS_PER_DAY">PEO h/zi</option>
                <option value="HOURS_PER_MONTH">PEO h/luna</option>
              </select>
              <Input type="number" min="0" step="0.5" value={contractForm.peoNormValue} onChange={(event) => setContractForm((current) => current ? { ...current, peoNormValue: event.target.value } : current)} placeholder="Norma PEO" />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={contractForm.cimNormUnit} onChange={(event) => setContractForm((current) => current ? { ...current, cimNormUnit: event.target.value as NormUnit } : current)} aria-label="Unitate CIM">
                <option value="HOURS_PER_DAY">CIM h/zi</option>
                <option value="HOURS_PER_MONTH">CIM h/luna</option>
              </select>
              <Input type="number" min="0" step="0.5" value={contractForm.cimNormValue} onChange={(event) => setContractForm((current) => current ? { ...current, cimNormValue: event.target.value } : current)} placeholder="Norma CIM" />
              <Input className="md:col-span-2" value={contractForm.justification} onChange={(event) => setContractForm((current) => current ? { ...current, justification: event.target.value } : current)} placeholder="Justificare modificare norma" />
              <Button onClick={saveContract} disabled={saving || !contractForm.expertId}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salveaza norma
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {message ? <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
    </DashboardShell>
  );
}
