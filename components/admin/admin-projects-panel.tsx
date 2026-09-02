'use client';

import { useMemo, useState } from 'react';
import { Archive, Building2, CheckCircle2, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useAllConcurrentProjects,
  useConcurrentProjectMutations,
  useExperts,
} from '@/hooks/use-backend-data';
import type { ConcurrentProject } from '@/lib/types';

type ProjectForm = {
  projectName: string;
  projectCode: string;
  fundingSource: string;
  timesheetBucket: 'peo_pids' | 'outside_peo_pids';
  expertProjectRole: string;
  expertFunction: string;
  dailyHours: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'validated';
  deliverableOptions: string;
  notes: string;
};

const EMPTY_FORM: ProjectForm = {
  projectName: '',
  projectCode: '',
  fundingSource: '',
  timesheetBucket: 'outside_peo_pids',
  expertProjectRole: '',
  expertFunction: '',
  dailyHours: '0',
  startDate: '',
  endDate: '',
  status: 'draft',
  deliverableOptions: '',
  notes: '',
};

export function AdminProjectsPanel() {
  const { experts, isLoading: isLoadingExperts } = useExperts();
  const { projects, isLoading: isLoadingProjects, mutate } = useAllConcurrentProjects();
  const { createProject, updateProject } = useConcurrentProjectMutations();
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.isActive !== false && project.status !== 'archived'),
    [projects]
  );
  const groupedProjects = useMemo(() => groupConcurrentProjects(activeProjects), [activeProjects]);
  const duplicateExperts = useMemo(
    () => selectedExpertIds.filter((expertId) => hasActiveDuplicate(activeProjects, expertId, form.projectCode, form.projectName)),
    [activeProjects, form.projectCode, form.projectName, selectedExpertIds]
  );

  const updateField = (field: keyof ProjectForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleExpert = (expertId: string, checked: boolean) => {
    setSelectedExpertIds((current) => (
      checked ? Array.from(new Set([...current, expertId])) : current.filter((id) => id !== expertId)
    ));
  };

  const handleCreate = async () => {
    setError(null);
    const projectName = form.projectName.trim();
    if (!projectName || !form.startDate || selectedExpertIds.length === 0) {
      setError('Completeaza denumirea, data de start si cel putin un expert.');
      return;
    }
    if (duplicateExperts.length > 0) {
      setError('Exista deja asignari active pentru proiectul acesta la expertii selectati.');
      return;
    }

    const dailyHours = Number(form.dailyHours);
    if (!Number.isFinite(dailyHours) || dailyHours < 0) {
      setError('Orele pe zi trebuie sa fie un numar pozitiv sau 0.');
      return;
    }

    setIsSaving(true);
    try {
      const deliverableOptions = splitLines(form.deliverableOptions);
      const validatedAt = form.status === 'validated' ? new Date().toISOString() : undefined;
      for (const expertId of selectedExpertIds) {
        const expert = experts.find((item) => item.id === expertId);
        if (!expert) continue;
        await createProject({
          expertId: expert.id,
          expertName: expert.name,
          projectName,
          projectCode: optionalText(form.projectCode),
          expertProjectRole: optionalText(form.expertProjectRole),
          expertFunction: optionalText(form.expertFunction),
          fundingSource: optionalText(form.fundingSource),
          timesheetBucket: form.timesheetBucket,
          dailyHours,
          startDate: form.startDate,
          endDate: optionalText(form.endDate),
          isActive: true,
          status: form.status,
          validatedAt,
          validatedBy: form.status === 'validated' ? 'pm_admin' : undefined,
          assignmentSource: 'pm_admin',
          deliverableOptions,
          notes: optionalText(form.notes),
        });
      }
      setForm(EMPTY_FORM);
      setSelectedExpertIds([]);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva proiectul.');
    } finally {
      setIsSaving(false);
    }
  };

  const validateAssignments = async (assignments: ConcurrentProject[]) => {
    setError(null);
    try {
      await Promise.all(assignments.map((project) => updateProject(project.id, {
        status: 'validated',
        validatedAt: project.validatedAt || new Date().toISOString(),
        validatedBy: project.validatedBy || 'pm_admin',
      })));
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut valida asignarile.');
    }
  };

  const archiveAssignment = async (project: ConcurrentProject) => {
    setError(null);
    try {
      await updateProject(project.id, { isActive: false, status: 'archived' });
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut arhiva asignarea.');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <div className="rounded-xl border bg-slate-50/70 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <p className="font-semibold text-slate-950">Proiect concurent</p>
            <p className="text-xs text-muted-foreground">Creeaza asignari PM fara sa schimbi pontajul existent.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <Label>Denumire proiect *</Label>
            <Input value={form.projectName} onChange={(event) => updateField('projectName', event.target.value)} placeholder="GOODWORKS4ALL" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cod proiect</Label>
              <Input value={form.projectCode} onChange={(event) => updateField('projectCode', event.target.value)} placeholder="P6-GW4ALL" />
            </div>
            <div>
              <Label>Finantator</Label>
              <Input value={form.fundingSource} onChange={(event) => updateField('fundingSource', event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rol expert</Label>
              <Input value={form.expertProjectRole} onChange={(event) => updateField('expertProjectRole', event.target.value)} />
            </div>
            <div>
              <Label>Functie expert</Label>
              <Input value={form.expertFunction} onChange={(event) => updateField('expertFunction', event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Ore/zi</Label>
              <Input type="number" min={0} step="0.5" value={form.dailyHours} onChange={(event) => updateField('dailyHours', event.target.value)} />
            </div>
            <div>
              <Label>Start *</Label>
              <Input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
            </div>
            <div>
              <Label>Final</Label>
              <Input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} />
            </div>
          </div>

          <div>
            <Label>Bucket pontaj</Label>
            <Select value={form.timesheetBucket} onValueChange={(value) => updateField('timesheetBucket', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outside_peo_pids">În afara PEO/PIDS</SelectItem>
                <SelectItem value="peo_pids">PEO/PIDS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Status initial</Label>
            <Select value={form.status} onValueChange={(value) => updateField('status', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft - nu apare la expert</SelectItem>
                <SelectItem value="validated">Validat - apare la expert</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Livrabile relevante</Label>
            <Textarea
              value={form.deliverableOptions}
              onChange={(event) => updateField('deliverableOptions', event.target.value)}
              placeholder="Cate un livrabil pe linie"
            />
          </div>

          <div>
            <Label>Note / reguli</Label>
            <Textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
          </div>

          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>Experti *</Label>
              <Badge variant="secondary">{selectedExpertIds.length} selectati</Badge>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
              {isLoadingExperts && <p className="text-sm text-muted-foreground">Se incarca expertii...</p>}
              {!isLoadingExperts && experts.length === 0 && <p className="text-sm text-muted-foreground">Nu exista experti disponibili.</p>}
              {experts.map((expert) => {
                const checked = selectedExpertIds.includes(expert.id);
                const isDuplicate = checked && duplicateExperts.includes(expert.id);
                return (
                  <label key={expert.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                    <Checkbox checked={checked} onCheckedChange={(value) => toggleExpert(expert.id, value === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{expert.name}</span>
                      {isDuplicate && <span className="text-xs text-destructive">Asignare activa existenta</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <Button onClick={handleCreate} disabled={isSaving || isLoadingExperts}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Creeaza asignari
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-semibold text-slate-950">Proiecte concurente</p>
            <p className="text-xs text-muted-foreground">{activeProjects.length} asignari active</p>
          </div>
          <Badge variant="outline">{groupedProjects.length} proiecte</Badge>
        </div>

        <div className="divide-y">
          {isLoadingProjects && <div className="p-5 text-sm text-muted-foreground">Se incarca proiectele...</div>}
          {!isLoadingProjects && groupedProjects.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground">Nu exista proiecte concurente configurate.</div>
          )}
          {groupedProjects.map((group) => {
            const draftAssignments = group.assignments.filter((project) => project.status === 'draft');
            return (
              <div key={group.key} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{group.projectName}</p>
                      {group.projectCode && <Badge variant="outline">{group.projectCode}</Badge>}
                      {draftAssignments.length > 0 ? (
                        <Badge variant="secondary">{draftAssignments.length} draft</Badge>
                      ) : (
                        <Badge variant="secondary">validat</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[group.fundingSource, `${group.assignments.length} experti`, `${group.dailyHours}h/zi`].filter(Boolean).join(' - ')}
                    </p>
                  </div>
                  {draftAssignments.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => validateAssignments(draftAssignments)}>
                      <ShieldCheck className="h-4 w-4" />
                      Valideaza draft
                    </Button>
                  )}
                </div>

                <div className="grid gap-2">
                  {group.assignments.map((project) => (
                    <div key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50/60 p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{project.expertName || project.expertId}</p>
                          <Badge variant={project.status === 'draft' ? 'outline' : 'secondary'}>
                            {project.status || 'validated'}
                          </Badge>
                          {project.assignmentSource && <Badge variant="outline">{project.assignmentSource}</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[project.expertProjectRole, project.expertFunction, formatPeriod(project)].filter(Boolean).join(' - ')}
                        </p>
                        {project.deliverableOptions?.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">Livrabile: {project.deliverableOptions.join(', ')}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {project.status === 'draft' && (
                          <Button variant="outline" size="sm" onClick={() => validateAssignments([project])}>
                            <CheckCircle2 className="h-4 w-4" />
                            Valideaza
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => archiveAssignment(project)} aria-label="Arhiveaza asignarea">
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function groupConcurrentProjects(projects: ConcurrentProject[]) {
  const groups = new Map<string, ConcurrentProject[]>();
  projects.forEach((project) => {
    const key = projectKey(project.projectCode, project.projectName);
    groups.set(key, [...(groups.get(key) || []), project]);
  });

  return Array.from(groups.entries()).map(([key, assignments]) => {
    const first = assignments[0];
    return {
      key,
      projectName: first.projectName,
      projectCode: first.projectCode,
      fundingSource: first.fundingSource,
      dailyHours: first.dailyHours,
      assignments: assignments.sort((a, b) => (a.expertName || a.expertId).localeCompare(b.expertName || b.expertId)),
    };
  }).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function hasActiveDuplicate(projects: ConcurrentProject[], expertId: string, projectCode: string, projectName: string) {
  const key = projectKey(projectCode, projectName);
  return projects.some((project) => (
    project.expertId === expertId
    && project.isActive !== false
    && project.status !== 'archived'
    && projectKey(project.projectCode, project.projectName) === key
  ));
}

function projectKey(projectCode?: string, projectName?: string) {
  return (projectCode || projectName || '').trim().toLowerCase();
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function formatPeriod(project: ConcurrentProject) {
  return [project.startDate, project.endDate].filter(Boolean).join(' - ');
}
