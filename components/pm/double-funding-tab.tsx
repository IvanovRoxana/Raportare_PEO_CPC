'use client';

import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { AlertTriangle, Download, Filter, Plus, Save, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildCsv,
  buildDoubleFundingRiskRows,
  buildDoubleFundingSummary,
  buildPmExportRows,
  type DoubleFundingRiskStatus,
} from '@/lib/double-funding';
import { buildConsolidatedTimesheet, getConcurrentProjectMonthlyTotal } from '@/lib/concurrent-projects';
import { useConcurrentProjectTimesheetMutations } from '@/hooks/use-backend-data';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, ReportStatus } from '@/lib/types';

interface DoubleFundingTabProps {
  experts: Expert[];
  activities: Activity[];
  concurrentProjects: ConcurrentProject[];
  concurrentTimesheetEntries: ConcurrentProjectTimesheetEntry[];
  onCreateConcurrentProject?: (project: Omit<ConcurrentProject, 'id'>) => Promise<ConcurrentProject> | void;
  onUpdateConcurrentProject?: (id: string, updates: Partial<ConcurrentProject>) => Promise<ConcurrentProject> | void;
  onArchiveConcurrentProject?: (id: string) => Promise<void> | void;
  reportStatuses: ReportStatus[];
  month: number;
  year: number;
}

type NewConcurrentProjectForm = { expertId: string; projectName: string; projectCode: string; expertProjectRole: string; fundingSource: string; timesheetBucket: 'peo_pids' | 'outside_peo_pids'; startDate: string; endDate: string; dailyHours: string; notes: string };

const emptyConcurrentProjectForm: NewConcurrentProjectForm = { expertId: '', projectName: '', projectCode: '', expertProjectRole: '', fundingSource: '', timesheetBucket: 'outside_peo_pids', startDate: '', endDate: '', dailyHours: '0', notes: '' };

const statusLabels: Record<DoubleFundingRiskStatus | 'all', string> = {
  all: 'Toate statusurile',
  high_risk: 'Risc ridicat',
  needs_review: 'Necesită verificare',
  ok: 'OK',
};

const statusBadge: Record<DoubleFundingRiskStatus, string> = {
  high_risk: 'border-red-300 bg-red-50 text-red-800',
  needs_review: 'border-amber-300 bg-amber-50 text-amber-900',
  ok: 'border-green-300 bg-green-50 text-green-800',
};

export function DoubleFundingTab({
  experts,
  activities,
  concurrentProjects,
  concurrentTimesheetEntries,
  onCreateConcurrentProject,
  onUpdateConcurrentProject,
  onArchiveConcurrentProject,
  reportStatuses,
  month,
  year,
}: DoubleFundingTabProps) {
  const [expertFilter, setExpertFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<DoubleFundingRiskStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProject, setNewProject] = useState<NewConcurrentProjectForm>(emptyConcurrentProjectForm);
  const [draftEntries, setDraftEntries] = useState<Record<string, Partial<ConcurrentProjectTimesheetEntry>>>({});
  const { upsertEntry } = useConcurrentProjectTimesheetMutations(month, year);

  const rows = useMemo(
    () =>
      buildDoubleFundingRiskRows({
        experts,
        activities,
        concurrentProjects,
        concurrentTimesheetEntries,
        reportStatuses,
        month,
        year,
      }),
    [activities, concurrentProjects, concurrentTimesheetEntries, experts, month, reportStatuses, year]
  );
  const summary = useMemo(() => buildDoubleFundingSummary(rows), [rows]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const expertMatches = expertFilter === 'all' || row.expertId === expertFilter;
        const statusMatches = statusFilter === 'all' || row.status === statusFilter;
        const projectText = `${row.projectCode || ''} ${row.projectName} ${row.fundingSource || ''}`.toLowerCase();
        const projectMatches = !projectFilter.trim() || projectText.includes(projectFilter.trim().toLowerCase());
        return expertMatches && statusMatches && projectMatches;
      }),
    [expertFilter, projectFilter, rows, statusFilter]
  );

  const exportRiskCsv = () => {
    downloadCsv(
      buildCsv(filteredRows.map((row) => ({
        expert: row.expertName,
        role: row.expertRole || '',
        projectCode: row.projectCode || '',
        projectName: row.projectName,
        fundingSource: row.fundingSource || '',
        startDate: row.startDate,
        endDate: row.endDate || '',
        overlapDays: row.overlapDays,
        peoHours: row.peoHours,
        concurrentEstimatedHours: row.concurrentEstimatedHours,
        totalEstimatedHours: row.totalEstimatedHours,
        maxDailyCombinedHours: row.maxDailyCombinedHours,
        status: row.status,
        reasons: row.reasons.join(' | '),
        dailyEntryCount: row.dailyEntryCount,
        exceededDays: row.exceededDays,
        coCmConflicts: row.coCmConflicts,
        incompleteTimesheet: row.incompleteTimesheet ? 'DA' : 'NU',
        reportStatus: row.reportStatus || 'draft',
      }))),
      `verificare_dubla_finantare_${month + 1}_${year}.csv`
    );
  };

  const exportFinalPmCsv = () => {
    const exportRows = buildPmExportRows({
      experts,
      activities,
      concurrentRiskRows: rows,
      reportStatuses,
      month,
      year,
    });
    downloadCsv(buildCsv(exportRows), `export_pm_final_${month + 1}_${year}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Verificare dublă finanțare</h3>
          <p className="text-sm text-muted-foreground">
            Centralizează proiectele concurente declarate, perioadele suprapuse și riscurile de depășire a normei.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportRiskCsv}>
            <Download className="h-4 w-4" />
            Export verificări
          </Button>
          <Button onClick={exportFinalPmCsv}>
            <Download className="h-4 w-4" />
            Export PM final
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Proiecte concurente" value={summary.totalConcurrentProjects} />
        <SummaryCard label="Experți implicați" value={summary.expertsWithConcurrentProjects} />
        <SummaryCard label="Risc ridicat" value={summary.highRisk} tone="danger" />
        <SummaryCard label="Necesită verificare" value={summary.needsReview} tone="warning" />
        <SummaryCard label="Ore concurente estimate" value={`${summary.totalEstimatedConcurrentHours}h`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtre verificare
          </CardTitle>
          <CardDescription>
            Filtrare după expert, proiect/dosar, sursă finanțare și status de verificare.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Select value={expertFilter} onValueChange={setExpertFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Expert" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toți experții</SelectItem>
              {experts.map((expert) => (
                <SelectItem key={expert.id} value={expert.id}>
                  {expert.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            placeholder="Caută proiect, dosar sau finanțator"
          />

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DoubleFundingRiskStatus | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <ConcurrentProjectsAdmin
        experts={experts}
        projects={concurrentProjects}
        entries={concurrentTimesheetEntries}
        activities={activities}
        month={month}
        year={year}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        newProject={newProject}
        setNewProject={setNewProject}
        draftEntries={draftEntries}
        setDraftEntries={setDraftEntries}
        onCreateConcurrentProject={onCreateConcurrentProject}
        onUpdateConcurrentProject={onUpdateConcurrentProject}
        onArchiveConcurrentProject={onArchiveConcurrentProject}
        upsertEntry={upsertEntry}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proiecte și dosare concurente</CardTitle>
          <CardDescription>
            Risc calculat pentru luna selectată: ore PEO + ore estimate din proiectele concurente active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nu există proiecte concurente pentru filtrele curente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Expert</th>
                    <th className="px-3 py-2 font-medium">Proiect/Dosar concurent</th>
                    <th className="px-3 py-2 font-medium">Perioadă suprapusă</th>
                    <th className="px-3 py-2 font-medium">Ore PEO</th>
                    <th className="px-3 py-2 font-medium">Ore concurente</th>
                    <th className="px-3 py-2 font-medium">Pontaj zilnic</th>
                    <th className="px-3 py-2 font-medium">Max zilnic cumulat</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Observații</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.expertName}</div>
                        <div className="text-xs text-muted-foreground">{row.expertRole || '-'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.projectName}</div>
                        <div className="text-xs text-muted-foreground">
                          {[row.projectCode, row.fundingSource].filter(Boolean).join(' · ') || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{row.startDate} - {row.endDate || 'fără final'}</div>
                        <div className="text-xs text-muted-foreground">{row.overlapDays} zile lucrătoare în luna selectată</div>
                      </td>
                      <td className="px-3 py-3">{row.peoHours}h / {row.peoMonthlyNorm}h</td>
                      <td className="px-3 py-3">{row.concurrentEstimatedHours}h</td>
                      <td className="px-3 py-3">
                        <div>{row.dailyEntryCount} intrări</div>
                        {row.incompleteTimesheet && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">incomplet</Badge>}
                        {(row.exceededDays > 0 || row.coCmConflicts > 0) && (
                          <div className="mt-1 text-xs text-red-700">{row.exceededDays} depășiri · {row.coCmConflicts} conflicte CO/CM</div>
                        )}
                      </td>
                      <td className="px-3 py-3">{row.maxDailyCombinedHours}h / 8h</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={statusBadge[row.status]}>
                          {statusLabels[row.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        {row.reasons.length > 0 ? (
                          <ul className="space-y-1">
                            {row.reasons.map((reason) => (
                              <li key={reason} className="flex items-start gap-1">
                                <AlertTriangle className="mt-0.5 h-3 w-3 text-amber-600" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="flex items-center gap-1 text-green-700">
                            <ShieldCheck className="h-3 w-3" />
                            Fără risc detectat
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function ConcurrentProjectsAdmin({
  experts,
  projects,
  entries,
  activities,
  month,
  year,
  selectedProjectId,
  setSelectedProjectId,
  newProject,
  setNewProject,
  draftEntries,
  setDraftEntries,
  onCreateConcurrentProject,
  onUpdateConcurrentProject,
  onArchiveConcurrentProject,
  upsertEntry,
}: {
  experts: Expert[];
  projects: ConcurrentProject[];
  entries: ConcurrentProjectTimesheetEntry[];
  activities: Activity[];
  month: number;
  year: number;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  newProject: NewConcurrentProjectForm;
  setNewProject: Dispatch<SetStateAction<NewConcurrentProjectForm>>;
  draftEntries: Record<string, Partial<ConcurrentProjectTimesheetEntry>>;
  setDraftEntries: (value: Record<string, Partial<ConcurrentProjectTimesheetEntry>>) => void;
  onCreateConcurrentProject?: (project: Omit<ConcurrentProject, 'id'>) => Promise<ConcurrentProject> | void;
  onUpdateConcurrentProject?: (id: string, updates: Partial<ConcurrentProject>) => Promise<ConcurrentProject> | void;
  onArchiveConcurrentProject?: (id: string) => Promise<void> | void;
  upsertEntry: (entry: Omit<ConcurrentProjectTimesheetEntry, 'id'> & { id?: string }) => Promise<ConcurrentProjectTimesheetEntry>;
}) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const projectEntries = selectedProject ? entries.filter((entry) => entry.concurrentProjectId === selectedProject.id) : [];
  const totals = selectedProject ? getConcurrentProjectMonthlyTotal({ project: selectedProject, entries, month, year }) : null;
  const consolidatedRows = selectedProject
    ? buildConsolidatedTimesheet({
        activities: activities.filter((activity) => activity.expertId === selectedProject.expertId),
        concurrentProjects: [selectedProject],
        entries: projectEntries,
        month,
        year,
      }).filter((row) => row.peoHours > 0 || row.totalHours > 0 || row.dayTypes.length > 0)
    : [];

  const createProject = async () => {
    const expert = experts.find((item) => item.id === newProject.expertId);
    if (!expert || !newProject.projectName || !newProject.startDate || !onCreateConcurrentProject) return;
    const created = await onCreateConcurrentProject({
      expertId: expert.id,
      expertName: expert.name,
      projectName: newProject.projectName,
      projectCode: newProject.projectCode,
      expertProjectRole: newProject.expertProjectRole,
      fundingSource: newProject.fundingSource,
      timesheetBucket: newProject.timesheetBucket,
      dailyHours: Number(newProject.dailyHours) || 0,
      startDate: newProject.startDate,
      endDate: newProject.endDate || undefined,
      isActive: true,
      notes: newProject.notes,
    });
    if (created?.id) setSelectedProjectId(created.id);
    setNewProject(emptyConcurrentProjectForm);
  };

  const updateDraft = (date: string, updates: Partial<ConcurrentProjectTimesheetEntry>) => {
    const existing = projectEntries.find((entry) => entry.date === date);
    setDraftEntries({
      ...draftEntries,
      [date]: {
        ...existing,
        ...draftEntries[date],
        ...updates,
      },
    });
  };

  const saveEntry = async (date: string) => {
    if (!selectedProject) return;
    const existing = projectEntries.find((entry) => entry.date === date);
    const draft = draftEntries[date] || existing || {};
    await upsertEntry({
      id: existing?.id,
      concurrentProjectId: selectedProject.id,
      expertId: selectedProject.expertId,
      date,
      month,
      year,
      wp: draft.wp || '',
      hours: Number(draft.hours) || 0,
      taskName: draft.taskName || '',
      relevantDeliverable: draft.relevantDeliverable || '',
      dayType: draft.dayType || 'lucratoare',
      notes: draft.notes || '',
      status: draft.status || 'draft',
      source: 'pm_manual',
      updatedBy: 'pm_admin',
    });
    const { [date]: _saved, ...rest } = draftEntries;
    setDraftEntries(rest);
  };

  const monthDays = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4" />
          Proiecte paralele
        </CardTitle>
        <CardDescription>
          Administrare proiecte reale paralele (ex. GOODWORKS4ALL / P6-GW4ALL) și pontaj lunar detaliat pe WP, task și livrabil.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Expert</Label>
            <Select value={newProject.expertId} onValueChange={(value) => setNewProject({ ...newProject, expertId: value })}>
              <SelectTrigger><SelectValue placeholder="Selectează expert" /></SelectTrigger>
              <SelectContent>{experts.map((expert) => <SelectItem key={expert.id} value={expert.id}>{expert.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Denumire proiect" value={newProject.projectName} onChange={(value) => setNewProject({ ...newProject, projectName: value })} placeholder="GOODWORKS4ALL" />
          <Field label="Cod proiect" value={newProject.projectCode} onChange={(value) => setNewProject({ ...newProject, projectCode: value })} placeholder="P6-GW4ALL" />
          <Field label="Rol expert" value={newProject.expertProjectRole} onChange={(value) => setNewProject({ ...newProject, expertProjectRole: value })} placeholder="Project Officer" />
          <Field label="Finanțator" value={newProject.fundingSource} onChange={(value) => setNewProject({ ...newProject, fundingSource: value })} />
          <div className="space-y-1">
            <Label>Bucket pontaj</Label>
            <Select value={newProject.timesheetBucket} onValueChange={(value) => setNewProject({ ...newProject, timesheetBucket: value as NewConcurrentProjectForm['timesheetBucket'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outside_peo_pids">În afara PEO/PIDS</SelectItem>
                <SelectItem value="peo_pids">PEO/PIDS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Start" type="date" value={newProject.startDate} onChange={(value) => setNewProject({ ...newProject, startDate: value })} />
          <Field label="Final" type="date" value={newProject.endDate} onChange={(value) => setNewProject({ ...newProject, endDate: value })} />
          <Field label="DailyHours fallback" type="number" value={newProject.dailyHours} onChange={(value) => setNewProject({ ...newProject, dailyHours: value })} />
          <div className="md:col-span-4 flex justify-end">
            <Button onClick={createProject} disabled={!onCreateConcurrentProject || !newProject.expertId || !newProject.projectName || !newProject.startDate}>
              <Plus className="h-4 w-4" /> Adaugă proiect paralel
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            {projects.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nu există proiecte paralele active.</div> : null}
            {projects.map((project) => {
              const total = getConcurrentProjectMonthlyTotal({ project, entries, month, year });
              return (
                <button key={project.id} type="button" onClick={() => setSelectedProjectId(project.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedProject?.id === project.id ? 'border-primary bg-primary/5' : 'bg-background'}`}>
                  <div className="font-medium">{project.projectName}</div>
                  <div className="text-xs text-muted-foreground">{project.expertName || project.expertId} · {project.projectCode || 'fără cod'}</div>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{total.totalHours}h</Badge>{total.isIncomplete && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">pontaj incomplet</Badge>}</div>
                </button>
              );
            })}
          </div>

          {selectedProject && totals && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Completează pontaj proiect — {selectedProject.projectName}</div>
                    <div className="text-sm text-muted-foreground">Total proiect paralel: {totals.totalHours}h · Total pe WP: {Object.entries(totals.totalByWp).map(([wp, h]) => `${wp}: ${h}h`).join(', ') || 'fără ore pe WP'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onUpdateConcurrentProject?.(selectedProject.id, { isActive: false })}>Dezactivează</Button>
                    <Button variant="outline" size="sm" onClick={() => onArchiveConcurrentProject?.(selectedProject.id)}>Arhivează</Button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-2 py-2 text-left">Data</th><th>DayType</th><th>WP</th><th>No. h</th><th>Task name</th><th>Relevant deliverable</th><th>Note</th><th>Acțiune</th></tr></thead>
                  <tbody>{monthDays.map((date) => {
                    const existing = projectEntries.find((entry) => entry.date === date);
                    const draft = { ...existing, ...draftEntries[date] } as Partial<ConcurrentProjectTimesheetEntry>;
                    return <tr key={date} className="border-t"><td className="px-2 py-2 font-medium">{date}</td><td><Input value={draft.dayType || 'lucratoare'} onChange={(e) => updateDraft(date, { dayType: e.target.value })} className="h-8" /></td><td><Input value={draft.wp || ''} onChange={(e) => updateDraft(date, { wp: e.target.value })} className="h-8" /></td><td><Input type="number" min={0} step="0.5" value={draft.hours ?? ''} onChange={(e) => updateDraft(date, { hours: Number(e.target.value) || 0 })} className="h-8" /></td><td><Input value={draft.taskName || ''} onChange={(e) => updateDraft(date, { taskName: e.target.value })} className="h-8" /></td><td><Input value={draft.relevantDeliverable || ''} onChange={(e) => updateDraft(date, { relevantDeliverable: e.target.value })} className="h-8" /></td><td><Input value={draft.notes || ''} onChange={(e) => updateDraft(date, { notes: e.target.value })} className="h-8" /></td><td className="px-2"><Button size="sm" variant="outline" onClick={() => saveEntry(date)}><Save className="h-3 w-3" /> Salvează</Button></td></tr>;
                  })}</tbody>
                </table>
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 font-medium">Pontaj consolidat PEO + proiect paralel (zile cu ore/status)</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {consolidatedRows.slice(0, 12).map((row) => <div key={row.date} className="rounded-md border p-2 text-xs"><b>{row.date}</b>: PEO {row.peoHours}h · paralel {Object.values(row.concurrentHoursByProject).reduce((sum, h) => sum + h, 0)}h · total {row.totalHours}h · {row.status}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' | 'warning' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
