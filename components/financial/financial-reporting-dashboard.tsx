'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, FileText, Loader2, SearchIcon, ShieldCheck, Users } from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useActivitiesByMonth,
  useAllConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
  useExperts,
} from '@/hooks/use-backend-data';
import { buildFinancialReportingSummary, type FinancialTimesheetRow } from '@/lib/financial-reporting';
import { isFinancialLeaveEnabledClient, isFinancialTimesheetsEnabledClient } from '@/lib/feature-flags';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';

type SectionMode = 'timesheets' | 'leave';

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

function hours(value: number) {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(value)} h`;
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

export function FinancialReportingDashboard({ mode }: { mode: SectionMode }) {
  const [month, setMonth] = useState(6);
  const [year, setYear] = useState(2026);
  const [search, setSearch] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const { experts, isLoading: loadingExperts } = useExperts();
  const { activities, isLoading: loadingActivities } = useActivitiesByMonth(month, year);
  const { projects, isLoading: loadingProjects } = useAllConcurrentProjects();
  const { entries, isLoading: loadingEntries } = useConcurrentProjectTimesheetByMonth(month, year);
  const enabled = mode === 'timesheets' ? isFinancialTimesheetsEnabledClient() : isFinancialLeaveEnabledClient();
  const isLoading = loadingExperts || loadingActivities || loadingProjects || loadingEntries;

  const summary = useMemo(() => buildFinancialReportingSummary({
    experts,
    activities,
    concurrentProjects: projects,
    concurrentEntries: entries,
    month,
    year,
  }), [experts, activities, projects, entries, month, year]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ro-RO');
    return summary.rows.filter((row) => {
      if (mode === 'leave' && row.peoLeave + row.medicalLeave + row.concordiaLeave === 0 && row.leaveDates.length === 0) return false;
      if (onlyConflicts && row.conflicts.length === 0) return false;
      return !query || `${row.name} ${row.role}`.toLocaleLowerCase('ro-RO').includes(query);
    });
  }, [summary.rows, search, onlyConflicts, mode]);

  const exportCentralizer = async () => {
    setExporting('centralizer');
    try {
      const response = await fetch('/api/export/financial-timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, rows: summary.rows, mode }),
      });
      if (!response.ok) throw new Error(await response.text());
      await downloadResponse(response, `TEST_Centralizator_${mode}_${year}-${String(month).padStart(2, '0')}.xlsx`);
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
      const response = await fetch('/api/export/pontaj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPontajExportPayload({
          kind: 'consolidated',
          expert,
          activities: activities.filter((activity) => activity.expertId === expert.id),
          concurrentProjects: expertProjects,
          concurrentTimesheetEntries: entries.filter((entry) => projectIds.has(entry.concurrentProjectId)),
          month,
          year,
        })),
      });
      if (!response.ok) throw new Error(await response.text());
      await downloadResponse(response, `TEST_Pontaj_${expert.name}_${year}-${String(month).padStart(2, '0')}.xlsx`);
    } finally {
      setExporting(null);
    }
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
      reportingMonth={`${MONTHS[month - 1]} ${year}`}
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
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Sursa: modulul Raportare</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Referința Excel pentru ore este activă numai pentru {MONTHS[summary.referenceMonth - 1]} {summary.referenceYear}. Funcțiile și normele aplicației rămân autoritare.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Luna">
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
            <Input className="w-24" type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Anul" />
            <div className="relative"><SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="w-64 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută expert sau funcție" /></div>
            <Button variant={onlyConflicts ? 'default' : 'outline'} onClick={() => setOnlyConflicts((value) => !value)}>Doar diferențe</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Se încarcă raportarea...</div>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead><tr className="border-b bg-slate-50 text-left">
                <th className="p-3">Expert / funcție</th><th className="p-3">Normă</th>
                {mode === 'timesheets' ? <><th className="p-3 text-right">PEO</th><th className="p-3 text-right">Concordia</th><th className="p-3 text-right">GOODWORKS4ALL</th><th className="p-3 text-right">Total lucrat</th></> : <><th className="p-3 text-right">CO PEO</th><th className="p-3 text-right">CM PEO</th><th className="p-3 text-right">CO/CM Concordia</th><th className="p-3">Zile</th></>}
                <th className="p-3">Status audit</th><th className="p-3 text-right">Export</th>
              </tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={`${row.expertId ?? 'missing'}-${row.name}`} className="border-b align-top hover:bg-slate-50/60">
                    <td className="p-3"><div className="font-medium">{row.name}</div><div className="max-w-xs text-xs text-muted-foreground">{row.role}</div></td>
                    <td className="p-3"><div>{row.appNorm}</div>{row.workbookNorm !== row.appNorm && <div className="text-xs text-amber-700">Excel: {row.workbookNorm}</div>}</td>
                    {mode === 'timesheets' ? <><td className="p-3 text-right font-medium">{hours(row.peoWorked)}</td><td className="p-3 text-right">{hours(row.concordiaWorked)}</td><td className="p-3 text-right">{hours(row.goodworksWorked)}</td><td className="p-3 text-right font-semibold">{hours(row.totalWorked)}</td></> : <><td className="p-3 text-right">{hours(row.peoLeave)}</td><td className="p-3 text-right">{hours(row.medicalLeave)}</td><td className="p-3 text-right">{hours(row.concordiaLeave)}</td><td className="p-3 text-xs">{row.leaveDates.join(', ') || '—'}</td></>}
                    <td className="p-3"><StatusBadge row={row} />{row.conflicts.length > 0 && <ul className="mt-2 max-w-md space-y-1 text-xs text-amber-800">{row.conflicts.map((conflict, index) => <li key={`${conflict.code}-${index}`}>• {conflict.message}</li>)}</ul>}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="outline" disabled={!row.expertId || exporting !== null} onClick={() => exportExpertTemplate(row)}>{exporting === row.expertId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="mr-2 h-4 w-4" />Template</>}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && visibleRows.length === 0 && <div className="py-12 text-center text-muted-foreground">Nu există înregistrări pentru filtrul selectat.</div>}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
