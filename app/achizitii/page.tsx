'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  SearchIcon,
  Send,
  Upload,
} from 'lucide-react';
import { DashboardShell, procurementNavItems } from '@/components/layout/dashboard-shell';
import { DataTable, RightInfoCard, StatCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProcurementEvaluationWorkspace } from '@/components/procurement/evaluation-workspace';
import { useProcurementProjects } from '@/hooks/use-procurement-data';
import { getSignedInUser } from '@/lib/aws/auth';
import { resolveDashboardAccess } from '@/lib/pm-dashboard';
import {
  buildProcurementDashboardSummary,
  formatProcedureType,
  formatProcurementType,
  formatRon,
  PROCUREMENT_ATTENTION_LABELS,
  PROCUREMENT_DOCUMENT_VISIBILITY_LABELS,
  PROCUREMENT_STATUS_BADGE,
  PROCUREMENT_STATUS_LABELS,
  REQUIRED_PROCUREMENT_CHECKLIST,
  type ProcurementProject,
  type ProcurementProcedureType,
  type ProcurementStatus,
  type ProcurementType,
} from '@/lib/procurement';

const statusFilterOptions: Array<{ value: ProcurementStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Toate statusurile' },
  { value: 'PLANIFICATA', label: PROCUREMENT_STATUS_LABELS.PLANIFICATA },
  { value: 'DOCUMENTATIE_IN_LUCRU', label: PROCUREMENT_STATUS_LABELS.DOCUMENTATIE_IN_LUCRU },
  { value: 'GATA_DE_LANSARE', label: PROCUREMENT_STATUS_LABELS.GATA_DE_LANSARE },
  { value: 'IN_EVALUARE', label: PROCUREMENT_STATUS_LABELS.IN_EVALUARE },
  { value: 'CONTRACT_IN_IMPLEMENTARE', label: PROCUREMENT_STATUS_LABELS.CONTRACT_IN_IMPLEMENTARE },
  { value: 'TRANSMIS_FINANCIAR', label: PROCUREMENT_STATUS_LABELS.TRANSMIS_FINANCIAR },
];

const stageCards = [
  { id: 'documentatie', title: 'Documentație achiziții', icon: FileText, meta: 'Intern / publicabil / ofertanți', count: 5 },
  { id: 'lansare', title: 'Lansare achiziții', icon: Send, meta: 'Canal, calendar, clarificări', count: 3 },
  { id: 'evaluare', title: 'Evaluare oferte', icon: ClipboardCheck, meta: 'Conformitate, tehnic, financiar', count: 4 },
  { id: 'contracte', title: 'Contracte și implementare', icon: ClipboardList, meta: 'Semnare, livrabile, termene', count: 4 },
  { id: 'receptie-facturare', title: 'Recepție și facturare', icon: CircleDollarSign, meta: 'PV, factură, financiar', count: 3 },
] as const;

export default function ProcurementDashboardPage() {
  const router = useRouter();
  const { procurementProjects, isLoading } = useProcurementProjects();
  const [isAllowed, setIsAllowed] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProcurementStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ProcurementType | 'all'>('all');
  const [procedureFilter, setProcedureFilter] = useState<ProcurementProcedureType | 'all'>('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const access = resolveDashboardAccess({ roles: user.roles });
      setIsAllowed(access.canUseAchizitii);
      setAccessChecked(true);
    });
  }, [router]);

  const years = useMemo(() => {
    const values = new Set<string>();
    procurementProjects.forEach((project) => {
      if (project.plannedStartYear) values.add(String(project.plannedStartYear));
      if (project.plannedEndYear) values.add(String(project.plannedEndYear));
    });
    return Array.from(values).sort();
  }, [procurementProjects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return procurementProjects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.title.toLowerCase().includes(normalizedQuery) ||
        project.category.toLowerCase().includes(normalizedQuery) ||
        project.code.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === 'all' || project.currentStatus === statusFilter;
      const matchesType = typeFilter === 'all' || project.procurementType === typeFilter;
      const matchesProcedure = procedureFilter === 'all' || project.procedureType === procedureFilter;
      const matchesYear =
        yearFilter === 'all' ||
        String(project.plannedStartYear) === yearFilter ||
        String(project.plannedEndYear) === yearFilter ||
        project.plannedPeriod.includes(yearFilter);

      return matchesQuery && matchesStatus && matchesType && matchesProcedure && matchesYear;
    });
  }, [procurementProjects, procedureFilter, query, statusFilter, typeFilter, yearFilter]);

  const summary = useMemo(() => buildProcurementDashboardSummary(procurementProjects), [procurementProjects]);
  const selectedProject = useMemo(
    () => procurementProjects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? procurementProjects[0],
    [filteredProjects, procurementProjects, selectedProjectId],
  );

  if (!accessChecked || isLoading) {
    return (
      <DashboardShell
        activeHref="/achizitii"
        navItems={procurementNavItems}
        eyebrow="Modul Achiziții"
        title="Achiziții"
        description="Se încarcă registrul de achiziții."
      >
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-8 text-sm text-muted-foreground">Se încarcă datele...</div>
      </DashboardShell>
    );
  }

  if (!isAllowed) {
    return (
      <DashboardShell
        activeHref="/achizitii"
        navItems={procurementNavItems}
        eyebrow="Modul Achiziții"
        title="Acces restricționat"
        description="Modulul Achiziții este disponibil pentru PM și Admin."
      >
        <Button onClick={() => router.push('/auth/select-dashboard')}>Înapoi la zonele de lucru</Button>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeHref="/achizitii"
      navItems={procurementNavItems}
      eyebrow="Modul Achiziții"
      title="Registru și urmărire achiziții"
      description="Urmărește fiecare achiziție contractată pe PEO 302141 de la planificare până la contract, recepție, factură și transmitere financiară."
      actions={
        <>
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4" />
            Import plan
          </Button>
          <Button>
            <Plus className="h-4 w-4" />
            Proiect achiziție
          </Button>
        </>
      }
      aside={
        <>
          <RightInfoCard title="Proiect selectat" icon={ClipboardList}>
            {selectedProject ? <ProjectSnapshot project={selectedProject} /> : null}
          </RightInfoCard>

          <RightInfoCard title="Documente pe etape" icon={FileText}>
            <div className="space-y-3">
              {Object.entries(PROCUREMENT_DOCUMENT_VISIBILITY_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <span className="text-slate-700">{label}</span>
                  <StatusBadge status={key === 'INTERNAL_ONLY' ? 'informativ' : 'in_lucru'}>{key}</StatusBadge>
                </div>
              ))}
            </div>
          </RightInfoCard>

          <RightInfoCard title="Checklist minim" icon={CheckCircle2}>
            <div className="space-y-2">
              {REQUIRED_PROCUREMENT_CHECKLIST.slice(0, 6).map((item) => (
                <div key={item.itemKey} className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-[#36c2a0]" />
                  <span>{item.itemLabel}</span>
                </div>
              ))}
            </div>
          </RightInfoCard>
        </>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={ClipboardList} label="Total achiziții" value={summary.totalProjects} description="Rânduri contractate în plan" tone="navy" />
        <StatCard icon={BarChart3} label="Valoare cu TVA" value={formatRon(summary.totalEstimatedWithVat)} description="Total estimat" tone="success" />
        <StatCard icon={FileText} label="Planificate" value={summary.plannedProjects} description="Status inițial" tone="blue" />
        <StatCard icon={Filter} label="În atenție" value={summary.attentionProjects} description="Indicatori neutri" tone="warning" />
        <StatCard icon={Archive} label="Finalizate" value={summary.completed} description="Contract încheiat / arhivat" tone="slate" />
      </section>

      <section id="planificare" className="scroll-mt-24 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Planificare și filtre</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sursa inițială: Plan_achizitii_SMIS_April_2026.xlsx, 71 proiecte de achiziție.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Caută" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProcurementStatus | 'all')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{statusFilterOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ProcurementType | 'all')}>
              <SelectTrigger><SelectValue placeholder="Tip" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate tipurile</SelectItem>
                <SelectItem value="SERVICII">Servicii</SelectItem>
                <SelectItem value="BUNURI">Bunuri</SelectItem>
                <SelectItem value="LUCRARI">Lucrări</SelectItem>
              </SelectContent>
            </Select>
            <Select value={procedureFilter} onValueChange={(value) => setProcedureFilter(value as ProcurementProcedureType | 'all')}>
              <SelectTrigger><SelectValue placeholder="Procedură" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate procedurile</SelectItem>
                <SelectItem value="ACHIZITIE_DIRECTA">Achiziție directă</SelectItem>
                <SelectItem value="ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE">Competitivă Ordin MFE</SelectItem>
                <SelectItem value="ALTA_PROCEDURA">Altă procedură</SelectItem>
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger><SelectValue placeholder="An" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toți anii</SelectItem>
                {years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section id="proiecte" className="scroll-mt-24">
        <DataTable
          columns={['Cod', 'Proiect achiziție', 'Tip', 'Procedură', 'Perioadă', 'Valoare totală', 'Status', 'Indicator']}
          rows={filteredProjects.slice(0, 18).map((project) => [
            <button key="code" type="button" onClick={() => setSelectedProjectId(project.id)} className="font-semibold text-primary">{project.code}</button>,
            <div key="title" className="max-w-[30rem]">
              <p className="font-medium text-slate-900">{project.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{project.category}</p>
            </div>,
            formatProcurementType(project.procurementType),
            formatProcedureType(project.procedureType),
            project.plannedPeriod,
            formatRon(project.estimatedValueWithVat),
            <StatusBadge key="status" status={PROCUREMENT_STATUS_BADGE[project.currentStatus]}>{PROCUREMENT_STATUS_LABELS[project.currentStatus]}</StatusBadge>,
            <StatusBadge key="attention" status={project.attentionLevel === 'on_track' ? 'informativ' : 'cu_observatii'}>
              {PROCUREMENT_ATTENTION_LABELS[project.attentionLevel]}
            </StatusBadge>,
          ])}
          footer={<p className="text-sm text-muted-foreground">Afișate {Math.min(filteredProjects.length, 18)} din {filteredProjects.length} achiziții filtrate.</p>}
        />
      </section>

      {selectedProject ? <ProcurementEvaluationWorkspace project={selectedProject} /> : null}

      <section className="grid gap-4 lg:grid-cols-5">
        {stageCards.map((stage) => {
          const Icon = stage.icon;
          return (
            <Card key={stage.id} id={stage.id} className="scroll-mt-24 rounded-[1.5rem] py-0">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="flex items-center gap-3 text-base font-bold text-slate-950">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3fb] text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  {stage.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <p className="text-sm leading-6 text-muted-foreground">{stage.meta}</p>
                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge status="in_lucru">{stage.count} câmpuri</StatusBadge>
                  <Upload className="h-4 w-4 text-primary" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </DashboardShell>
  );
}

function ProjectSnapshot({ project }: { project: ProcurementProject }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{project.code}</p>
        <h3 className="mt-1 text-base font-bold leading-6 text-slate-950">{project.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{project.category}</p>
      </div>
      <div className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Status</span>
          <StatusBadge status={PROCUREMENT_STATUS_BADGE[project.currentStatus]}>{PROCUREMENT_STATUS_LABELS[project.currentStatus]}</StatusBadge>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Tip</span>
          <span className="font-medium text-slate-800">{formatProcurementType(project.procurementType)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Perioadă</span>
          <span className="font-medium text-slate-800">{project.plannedPeriod}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Valoare cu TVA</span>
          <span className="font-semibold text-slate-950">{formatRon(project.estimatedValueWithVat)}</span>
        </div>
      </div>
    </div>
  );
}
