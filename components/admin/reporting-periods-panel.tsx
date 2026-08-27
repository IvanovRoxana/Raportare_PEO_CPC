'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReportingPeriodMutations, useReportingPeriods } from '@/hooks/use-backend-data';
import {
  DEFAULT_REPORTING_PROJECT_CODE,
  buildReportingPeriod,
  formatReportingPeriodLabel,
  sortReportingPeriods,
  validateReportingPeriod,
} from '@/lib/reporting-periods';
import type { ReportingPeriod, ReportingPeriodStatus } from '@/lib/types';

const months = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
];

const statusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  published: { label: 'Publicat', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  closed: { label: 'Închis', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  archived: { label: 'Arhivat', className: 'border-slate-200 bg-slate-100 text-slate-500' },
};

function statusBadge(status: ReportingPeriodStatus) {
  const meta = statusMeta[status] ?? statusMeta.draft;
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

export function ReportingPeriodsPanel() {
  const { reportingPeriods, isLoading } = useReportingPeriods();
  const { create, update } = useReportingPeriodMutations();
  const [code, setCode] = useState('');
  const [projectCode, setProjectCode] = useState(DEFAULT_REPORTING_PROJECT_CODE);
  const [startMonth, setStartMonth] = useState(new Date().getMonth());
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [monthCount, setMonthCount] = useState(3);
  const [status, setStatus] = useState<ReportingPeriodStatus>('draft');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periods = useMemo(() => sortReportingPeriods(reportingPeriods), [reportingPeriods]);
  const draft = useMemo(() => buildReportingPeriod({
    projectCode,
    code,
    startMonth,
    startYear,
    monthCount,
    status,
    notes: notes.trim() || undefined,
  }), [code, monthCount, notes, projectCode, startMonth, startYear, status]);
  const resetForm = () => {
    setCode('');
    setProjectCode(DEFAULT_REPORTING_PROJECT_CODE);
    setStartMonth(new Date().getMonth());
    setStartYear(new Date().getFullYear());
    setMonthCount(3);
    setStatus('draft');
    setNotes('');
  };

  const handleCreate = async () => {
    const errors = validateReportingPeriod(draft, reportingPeriods);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await create({
        ...draft,
        publishedAt: draft.status === 'published' ? new Date().toISOString() : undefined,
      });
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Perioada nu a putut fi salvată.');
    } finally {
      setIsSaving(false);
    }
  };

  const setPeriodStatus = async (period: ReportingPeriod, nextStatus: ReportingPeriodStatus) => {
    setError(null);
    const updates = buildReportingPeriod({
      projectCode: period.projectCode,
      code: period.code,
      startMonth: period.startMonth,
      startYear: period.startYear,
      monthCount: period.monthCount,
      notes: period.notes,
      createdBy: period.createdBy,
      updatedBy: period.updatedBy,
      status: nextStatus,
      publishedAt: nextStatus === 'published' ? period.publishedAt ?? new Date().toISOString() : period.publishedAt,
      closedAt: nextStatus === 'closed' ? new Date().toISOString() : period.closedAt,
    });
    const errors = validateReportingPeriod(updates, reportingPeriods, period.id);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    await update(period.id, {
      status: nextStatus,
      endMonth: updates.endMonth,
      endYear: updates.endYear,
      publishedAt: nextStatus === 'published' ? period.publishedAt ?? new Date().toISOString() : period.publishedAt,
      closedAt: nextStatus === 'closed' ? new Date().toISOString() : period.closedAt,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Perioade de raportare</h2>
        <p className="text-sm text-muted-foreground">Configurează perioadele RP care apar în selectorul PM.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            Perioadă nouă
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[0.8fr_0.8fr_1fr_0.7fr_0.8fr_1.3fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label>Cod raport</Label>
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="RP 12" />
          </div>
          <div className="space-y-1.5">
            <Label>Proiect</Label>
            <Input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Luna început</Label>
            <Select value={String(startMonth)} onValueChange={(value) => setStartMonth(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((month, index) => <SelectItem key={month} value={String(index)}>{month}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>An</Label>
            <Input type="number" value={startYear} onChange={(event) => setStartYear(Number(event.target.value) || new Date().getFullYear())} />
          </div>
          <div className="space-y-1.5">
            <Label>Durată</Label>
            <Select value={String(monthCount)} onValueChange={(value) => setMonthCount(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 luni</SelectItem>
                <SelectItem value="3">3 luni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observații</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={formatReportingPeriodLabel({ ...draft, code: code || 'RP' })} />
          </div>
          <Button onClick={handleCreate} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adaugă
          </Button>
        </CardContent>
      </Card>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="grid grid-cols-[1.1fr_0.8fr_1fr_0.7fr_1.2fr] border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
          <span>Perioadă</span>
          <span>Status</span>
          <span>Durată</span>
          <span>Proiect</span>
          <span>Acțiuni</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Se încarcă perioadele...</div>
        ) : periods.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nu există perioade configurate. PM folosește temporar lista implicită RP până la publicarea primei perioade.</div>
        ) : (
          periods.map((period) => (
            <div key={period.id} className="grid grid-cols-[1.1fr_0.8fr_1fr_0.7fr_1.2fr] items-center border-b px-4 py-3 text-sm last:border-b-0">
              <div>
                <p className="font-semibold">{formatReportingPeriodLabel(period)}</p>
                {period.notes ? <p className="mt-1 text-xs text-muted-foreground">{period.notes}</p> : null}
              </div>
              <div>{statusBadge(period.status)}</div>
              <div>{period.monthCount} luni</div>
              <div>{period.projectCode}</div>
              <div className="flex flex-wrap gap-2">
                {period.status !== 'published' ? <Button size="sm" variant="outline" onClick={() => setPeriodStatus(period, 'published')}>Publică</Button> : null}
                {period.status !== 'closed' ? <Button size="sm" variant="outline" onClick={() => setPeriodStatus(period, 'closed')}>Închide</Button> : null}
                {period.status !== 'archived' ? <Button size="sm" variant="outline" onClick={() => setPeriodStatus(period, 'archived')}>Arhivează</Button> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
