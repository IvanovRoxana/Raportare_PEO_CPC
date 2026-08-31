'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Lock,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActivityCatalogGovernancePanel } from '@/components/admin/activity-description-editor';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMonthName } from '@/lib/app-utils';
import { buildPmClarificationRealertItems } from '@/lib/pm-clarification-realerts';
import { buildPmReportGroups } from '@/lib/pm-report-groups';
import { buildPmSubactivityReportGroups } from '@/lib/pm-subactivities-report';
import type {
  Activity,
  DashboardComplianceRow,
  ActivityCatalog,
  DocumentMetadata,
  Expert,
  MonthAccessRequest,
  Neconformitate,
  PmClarificationThread,
  ReportingPeriod,
  ReportStatus,
  SharedDeliverable,
} from '@/lib/types';
import type { PmSubmittedReportRow } from '@/components/pm/pm-submitted-reports-panel';
import { DeliverablesView } from './pm-deliverables-view';
import { KpiView } from './pm-kpi-view';
import { TimesheetView } from './pm-timesheet-view';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';
type StatusMeta = { label: string; variant: BadgeVariant };

type PendingSharedDeliverable = {
  relation: SharedDeliverable;
  document?: DocumentMetadata;
  sourceActivity?: Activity;
  sourceExpert?: Expert;
  targetExpert?: Expert;
};

export type PmWorkspaceProps = {
  experts: Expert[];
  dashboardRows: DashboardComplianceRow[];
  reportStatusByExpertId: Map<string, ReportStatus>;
  statusLabels: Record<ReportStatus['status'], StatusMeta>;
  selectedMonth: number;
  selectedYear: number;
  reportingPeriods: ReportingPeriod[];
  months: Array<{ value: number; label: string }>;
  onMonthChange: (month: number) => void;
  yearOptions: number[];
  onYearChange: (year: number) => void;
  pmSummary: {
    totalExperts: number;
    statusCounts: Record<ReportStatus['status'], number>;
    problemCount: number;
    openClarificationsCount: number;
    resolvedClarificationsCount: number;
  };
  dashboardTotals: {
    totalHours: number;
    missingDays: number;
    blockedDays: number;
    issues: number;
  };
  activities: Activity[];
  documents: DocumentMetadata[];
  submittedReportRows: PmSubmittedReportRow[];
  clarificationThreads: PmClarificationThread[];
  neconformitati: Neconformitate[];
  monthAccessRequests: Array<{ request: MonthAccessRequest; expert: Expert }>;
  activeMonthAccesses: Array<{ request: MonthAccessRequest; expert: Expert }>;
  staleMonthAccesses: Array<{ request: MonthAccessRequest; expert: Expert }>;
  pendingSharedDeliverables: PendingSharedDeliverable[];
  titleIssues: DocumentMetadata[];
  pmUnlockRequests: DocumentMetadata[];
  resolvedPmUnlockRequests: DocumentMetadata[];
  eventDocumentIssues: Activity[];
  isExportingOpisTotal: boolean;
  exportingPontajExpertId?: string | null;
  onOpenDossier: (expert: Expert, options?: { activityId?: string; documentId?: string; issueType?: string }) => void;
  onOpenDossierById: (expertId: string, options?: { activityId?: string; documentId?: string; issueType?: string }) => void;
  onApproveMonthAccessRequest: (request: MonthAccessRequest) => void | Promise<void>;
  onRejectMonthAccessRequest: (request: MonthAccessRequest) => void | Promise<void>;
  onCloseMonthAccess: (request: MonthAccessRequest) => void | Promise<void>;
  onRequestDocumentClarification: (document: DocumentMetadata) => void;
  onRealertClarification: (thread: PmClarificationThread) => void | Promise<void>;
  onApprovePmUnlock: (document: DocumentMetadata) => void | Promise<void>;
  onDownloadTotalOpisXls: () => void;
  onDownloadExpertPontaj: (expert: Expert) => void | Promise<void>;
  fallbackCatalog?: ActivityCatalog[];
  onEligibilityGovernanceAudit?: (input: {
    actionType: string;
    oldValue?: string;
    newValue?: string;
    justification: string;
    source: 'manual' | 'import' | 'eligibility_review';
  }) => Promise<unknown>;
};

type WorkspaceView = 'kpi' | 'access' | 'timesheets' | 'reports' | 'deliverables' | 'nonconformities' | 'actions';

const views: Array<{ id: WorkspaceView; label: string; badge?: (props: PmWorkspaceProps) => number }> = [
  { id: 'kpi', label: 'KPI' },
  { id: 'access', label: 'Acces lună' },
  { id: 'timesheets', label: 'Pontaj' },
  { id: 'reports', label: 'Raportare' },
  { id: 'deliverables', label: 'Livrabile' },
  { id: 'nonconformities', label: 'Neconformități', badge: (props) => props.pmSummary.problemCount },
  { id: 'actions', label: 'Acțiuni PM' },
];

function statusClass(status: ReportStatus['status']) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarifications') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'sent') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function MiniAvatar({ expert }: { expert: Expert }) {
  return <ExpertAvatar expert={expert} className="h-7 w-7 bg-[#1f73d8] text-[10px] text-white" />;
}

function PmTopBar({
  activeView,
  onViewChange,
  props,
}: {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  props: PmWorkspaceProps;
}) {
  return (
    <header className="sticky top-16 z-20 -mx-4 mt-4 border-b border-[#17396c] bg-[#1f3f75] px-4 text-white shadow-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <nav className="mx-auto flex min-h-12 max-w-screen-2xl items-end gap-2 overflow-x-auto pt-2">
        {views.map((view) => {
          const count = view.badge?.(props) || 0;
          const active = view.id === activeView;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onViewChange(view.id)}
              className={`relative shrink-0 border-b-2 px-3 py-3 text-xs font-semibold transition ${
                active ? 'border-white text-white' : 'border-transparent text-blue-100 hover:text-white'
              }`}
            >
              {view.label}
              {count > 0 && view.id === 'nonconformities' ? (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function MonthAccessView(props: PmWorkspaceProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border bg-blue-50 p-3 text-blue-700"><Lock className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold">Acces editare lună - {getMonthName(props.selectedMonth)} {props.selectedYear}</h2>
              <p className="text-xs text-slate-500">Gestionează accesul experților pentru luna selectată și luna precedentă.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(props.selectedMonth)} onValueChange={(value) => props.onMonthChange(Number(value))}>
              <SelectTrigger className="h-9 w-36 bg-white">
                <SelectValue placeholder="Luna" />
              </SelectTrigger>
              <SelectContent>
                {props.months.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(props.selectedYear)} onValueChange={(value) => props.onYearChange(Number(value))}>
              <SelectTrigger className="h-9 w-28 bg-white">
                <SelectValue placeholder="An" />
              </SelectTrigger>
              <SelectContent>
                {props.yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="bg-emerald-100 text-emerald-700">{props.activeMonthAccesses.length} accese active</Badge>
          </div>
        </div>
      </div>
      {props.staleMonthAccesses.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 px-4 py-3 text-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Acces rămas deschis mai vechi decât luna precedentă</h3>
            </div>
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
              {props.staleMonthAccesses.length} accese
            </Badge>
          </div>
          <div className="divide-y divide-amber-100 bg-white">
            {props.staleMonthAccesses.map(({ expert, request }) => (
              <AccessExpertRow
                key={`stale-${request.id || `${expert.id}-${request.year}-${request.month}`}`}
                expert={expert}
                helper={`Deschis pentru ${getMonthName(request.month)} ${request.year}`}
                action={<Button size="sm" variant="outline" onClick={() => props.onCloseMonthAccess(request)}>Închide acces</Button>}
              />
            ))}
          </div>
        </section>
      ) : null}
      <AccessGroup title="Cereri în așteptare" tone="amber" count={props.monthAccessRequests.length}>
        {props.monthAccessRequests.map(({ expert, request }) => (
          <AccessExpertRow
            key={request.id || expert.id}
            expert={expert}
            helper={`Solicitat pentru ${getMonthName(request.month)} ${request.year}`}
            action={<div className="flex gap-2"><Button size="sm" onClick={() => props.onApproveMonthAccessRequest(request)}>Aprobă</Button><Button size="sm" variant="outline" onClick={() => props.onRejectMonthAccessRequest(request)}>Respinge</Button></div>}
          />
        ))}
      </AccessGroup>
      <AccessGroup title="Acces deschis - experți" tone="emerald" count={props.activeMonthAccesses.length}>
        {props.activeMonthAccesses.map(({ expert, request }) => (
          <AccessExpertRow
            key={request.id || expert.id}
            expert={expert}
            helper={`Poate edita ${getMonthName(request.month)} ${request.year}`}
            action={<div className="flex gap-2"><Badge className="bg-emerald-100 text-emerald-700">aprobat</Badge><Button size="sm" variant="outline" onClick={() => props.onCloseMonthAccess(request)}>Închide acces</Button></div>}
          />
        ))}
      </AccessGroup>
    </div>
  );
}

function AccessGroup({ title, tone, count, children }: { title: string; tone: 'amber' | 'emerald'; count: number; children: ReactNode }) {
  const color = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/40 text-emerald-700' : 'border-amber-200 bg-amber-50/40 text-amber-700';
  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-sm ${tone === 'emerald' ? 'border-emerald-200' : 'border-amber-200'}`}>
      <div className={`flex items-center justify-between border-b px-4 py-3 ${color}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className={color}>{count} experți</Badge>
      </div>
      <div className="divide-y">{count === 0 ? <div className="p-4 text-sm text-slate-500">Nu există înregistrări.</div> : children}</div>
    </section>
  );
}

function AccessExpertRow({ expert, action, helper }: { expert: Expert; action: ReactNode; helper?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3"><MiniAvatar expert={expert} /><div><div className="text-sm font-semibold">{expert.name}</div><div className="text-xs text-slate-500">{helper || expert.role || expert.category || 'Expert'}</div></div></div>
      {action}
    </div>
  );
}

function ReportsView(props: PmWorkspaceProps) {
  const groups = buildPmReportGroups(props.submittedReportRows);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        {groups.map((group) => (
          <ReportGroup key={group.id} title={group.title} tone={group.tone} rows={group.rows} props={props} />
        ))}
      </div>
      <aside className="space-y-4">
        <SideCard title="Activitate recentă" items={props.submittedReportRows.slice(0, 5).map((row) => `${row.expert.name} - ${props.statusLabels[row.status.status]?.label || row.status.status}`)} />
        <ClarificationRealertCard
          threads={props.clarificationThreads.slice(0, 5)}
          experts={props.experts}
          onRealertClarification={props.onRealertClarification}
        />
      </aside>
    </div>
  );
}

function ReportGroup({ title, tone, rows, props }: { title: string; tone: 'emerald' | 'blue' | 'amber'; rows: PmSubmittedReportRow[]; props: PmWorkspaceProps }) {
  const toneClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/30' : tone === 'blue' ? 'border-blue-200 bg-blue-50/30' : 'border-amber-200 bg-amber-50/30';
  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3><Badge variant="outline">{rows.length} raportări</Badge></div>
      <div className="divide-y bg-white">
        {rows.length === 0 ? <div className="p-4 text-sm text-slate-500">Nu există raportări în această grupă.</div> : rows.map((row) => (
          <div key={row.status.id || row.expert.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3"><MiniAvatar expert={row.expert} /><div><div className="font-semibold">{row.expert.name}</div><div className="text-xs text-slate-500">{row.totalHours}h pontate · {row.totalDeliverables} atașate</div></div></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => props.onOpenDossier(row.expert)}><FolderOpen className="h-4 w-4" />Dosar</Button><Button size="sm" onClick={() => props.onOpenDossier(row.expert)}><Check className="h-4 w-4" />Verifică</Button></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NonconformitiesView(props: PmWorkspaceProps) {
  const [acceptedTitleDocument, setAcceptedTitleDocument] = useState<DocumentMetadata | null>(null);
  const cards = [
    ['Livrabile comune cu denumiri diferite', props.titleIssues.length],
    ['Evenimente comune zile diferite', props.eventDocumentIssues.length],
    ['Colaborare nedeclarată reciproc', props.pendingSharedDeliverables.length],
    ['Livrabile neeligibile', props.pmUnlockRequests.length],
    ['Verificare manuală PM', props.neconformitati.filter((item) => !item.resolved).length],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4"><div className="text-2xl font-bold text-amber-700">{value}</div><div className="mt-1 text-xs font-semibold text-slate-700">{label}</div></div>)}</div>
      <IssueSection
        title="Livrabile comune raportate cu denumiri diferite"
        items={props.titleIssues.map((doc) => ({ id: doc.id, title: doc.declaredTitle || doc.originalFileName, detail: doc.titleCheckMessage || 'Denumire diferită', expertId: doc.uploadedByExpertId, document: doc }))}
        props={props}
        onSetAcceptedTitle={setAcceptedTitleDocument}
      />
      <IssueSection title="Evenimente comune pontate în zile diferite" items={props.eventDocumentIssues.map((activity) => ({ id: activity.id, title: activity.title || activity.activityType, detail: activity.date, expertId: activity.expertId, activity }))} props={props} />
      <IssueSection title="Colaborare declarată dar neconfirmată reciproc" items={props.pendingSharedDeliverables.map((item) => ({ id: item.relation.id, title: item.relation.sourceActivityTitle || item.document?.declaredTitle || item.document?.originalFileName || 'Livrabil comun', detail: `${item.sourceExpert?.name || item.relation.sourceExpertName || 'Expert sursă'} → ${item.targetExpert?.name || 'Expert țintă'}`, expertId: item.relation.sourceExpertId, document: item.document }))} props={props} />
      <IssueSection title="Livrabile neeligibile" items={props.pmUnlockRequests.map((doc) => ({ id: doc.id, title: doc.declaredTitle || doc.originalFileName, detail: doc.eligibilityCheck?.summary || doc.eligibilityCheck?.status || 'Necesită decizie PM', expertId: doc.uploadedByExpertId, document: doc }))} props={props} />
      <IssueSection title="Verificări manuale PM" items={props.neconformitati.filter((item) => !item.resolved).map((item) => ({ id: item.id, title: item.description, detail: item.severity, expertId: item.affectedExpertId }))} props={props} />
      <AcceptedTitleDialog
        document={acceptedTitleDocument}
        onOpenChange={(open) => {
          if (!open) setAcceptedTitleDocument(null);
        }}
        onConfirm={(document) => {
          props.onRequestDocumentClarification(document);
          setAcceptedTitleDocument(null);
        }}
      />
    </div>
  );
}

function IssueSection({
  title,
  items,
  props,
  onSetAcceptedTitle,
}: {
  title: string;
  items: Array<{ id: string; title: string; detail?: string; expertId?: string; document?: DocumentMetadata; activity?: Activity }>;
  props: PmWorkspaceProps;
  onSetAcceptedTitle?: (document: DocumentMetadata) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3><Badge variant="outline">{items.length} cazuri</Badge></div>
      <div className="divide-y">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Nu există cazuri.</div>
        ) : (
          items.map((item) => {
            const expertId = item.expertId;
            const document = item.document;
            return (
              <div key={item.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-[#1f3f75]">{item.title}</div>
                  <div className="text-xs text-slate-500">{item.detail}</div>
                </div>
                <div className="flex gap-2">
                  {expertId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => props.onOpenDossierById(expertId, { activityId: item.activity?.id, documentId: document?.id, issueType: 'problems' })}
                    >
                      Dosar
                    </Button>
                  ) : null}
                  {document ? (
                    <Button size="sm" onClick={() => props.onRequestDocumentClarification(document)}>
                      <AlertTriangle className="h-4 w-4" />
                      Alertează
                    </Button>
                  ) : null}
                  {document && onSetAcceptedTitle ? (
                    <Button size="sm" variant="outline" onClick={() => onSetAcceptedTitle(document)}>
                      Stabilește denumirea
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function AcceptedTitleDialog({
  document,
  onOpenChange,
  onConfirm,
}: {
  document: DocumentMetadata | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (document: DocumentMetadata) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <Dialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stabilește denumirea acceptată a livrabilului</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Introdu denumirea oficială pe care experții implicați trebuie să o folosească pentru acest livrabil comun.
          </p>
          <div className="space-y-2">
            <label htmlFor="accepted-deliverable-title" className="text-xs font-semibold text-slate-600">Denumire livrabil acceptată</label>
            <Input
              id="accepted-deliverable-title"
              value={value || document?.declaredTitle || document?.extractedTitle || ''}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Ex: Raport metodologie selecție beneficiari"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Anulează</Button>
            <Button className="bg-[#1f3f75]" disabled={!document} onClick={() => document && onConfirm(document)}>
              <Send className="h-4 w-4" />
              Alertează experții cu denumirea corectă
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ActionsViewProps = PmWorkspaceProps & {
  eligibilityRulesFocusDocument?: DocumentMetadata | null;
};

function ActionsView(props: ActionsViewProps) {
  const [activeAction, setActiveAction] = useState<'opis' | 'subactivities' | 'annex12' | 'eligibility'>(
    props.eligibilityRulesFocusDocument ? 'eligibility' : 'opis',
  );
  const subactivityGroups = buildPmSubactivityReportGroups({
    activities: props.activities,
    experts: props.experts,
    catalog: props.fallbackCatalog || [],
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3"><span className="rounded-lg border bg-slate-50 p-3"><FileSpreadsheet className="h-5 w-5 text-[#1f3f75]" /></span><div><h2 className="font-semibold">Acțiuni PM - Instrumente raportare</h2><p className="text-xs text-slate-500">OPIS livrabile, documente subactivități și anexe raportare.</p></div></div>
          <div className="flex gap-2">
            <Button onClick={() => setActiveAction('opis')} variant={activeAction === 'opis' ? 'default' : 'outline'} className={activeAction === 'opis' ? 'bg-[#1f3f75]' : undefined}>OPIS</Button>
            <Button onClick={() => setActiveAction('subactivities')} variant={activeAction === 'subactivities' ? 'default' : 'outline'} className={activeAction === 'subactivities' ? 'bg-[#1f3f75]' : undefined}>Subactivități</Button>
            <Button onClick={() => setActiveAction('annex12')} variant={activeAction === 'annex12' ? 'default' : 'outline'} className={activeAction === 'annex12' ? 'bg-[#1f3f75]' : undefined}>Anexa 12</Button>
            <Button onClick={() => setActiveAction('eligibility')} variant={activeAction === 'eligibility' ? 'default' : 'outline'} className={activeAction === 'eligibility' ? 'bg-[#1f3f75]' : undefined}>Catalog eligibilitate</Button>
          </div>
        </div>
      </section>
      {activeAction === 'eligibility' ? (
        <EligibilityRulesActionPanel
          focusDocument={props.eligibilityRulesFocusDocument}
          activeDocuments={props.pmUnlockRequests}
          resolvedDocuments={props.resolvedPmUnlockRequests}
          props={props}
        />
      ) : null}
      {activeAction === 'subactivities' ? (
        <section className="grid gap-4 md:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            {subactivityGroups.map((group) => (
              <div key={group.saCode} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-sm font-bold text-[#1f3f75]">{group.saCode}</div>
                <div className="mt-1 text-xs text-slate-500">{group.rows.length} intrări · {group.totalHours}h</div>
              </div>
            ))}
            <Button className="w-full bg-[#1f3f75]" disabled><Download className="h-4 w-4" />Word SA</Button>
          </div>
          <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Subactivități - {getMonthName(props.selectedMonth)} {props.selectedYear}</h3>
              <Button size="sm" variant="outline" disabled><Download className="h-4 w-4" />Export Word</Button>
            </div>
            <div className="divide-y">
              {subactivityGroups.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Nu există activități pentru luna selectată.</div>
              ) : (
                subactivityGroups.flatMap((group) => (
                  group.rows.slice(0, 6).map((row) => {
                    const expert = props.experts.find((item) => item.id === row.expertId);
                    return (
                      <div key={row.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {expert ? <MiniAvatar expert={expert} /> : null}
                            <div>
                              <div className="text-sm font-semibold">{row.expertName}</div>
                              <div className="text-xs text-slate-500">{row.activityDate} · {group.saCode} · {row.hours}h · {row.deliverableCount} livrabile</div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" disabled><ClipboardList className="h-4 w-4" />Copy-paste în RA</Button>
                        </div>
                        <div className="mt-3 text-sm font-semibold text-slate-800">{row.catalogActivityName || row.activityTitle}</div>
                        {row.catalogDescription ? (
                          <p className="mt-1 text-xs text-slate-500">{row.catalogDescription}</p>
                        ) : null}
                        <p className="mt-3 rounded-md border bg-slate-50 p-3 text-xs italic leading-5 text-slate-700">
                          {row.reportedText || 'Descrierea activității nu este disponibilă.'}
                        </p>
                        {row.expectedDeliverables ? (
                          <div className="mt-2 text-xs text-slate-500">Livrabile așteptate: {row.expectedDeliverables}</div>
                        ) : null}
                      </div>
                    );
                  })
                ))
              )}
            </div>
          </section>
        </section>
      ) : null}
      {activeAction === 'annex12' ? (
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold">Anexa 12 - Evenimente declarate</h3>
              <p className="text-xs text-slate-500">UI pregătit pentru anexă; exportul rămâne dezactivat până există template aprobat.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600" disabled><AlertTriangle className="h-4 w-4" />Alertează experții</Button>
              <Button size="sm" className="bg-[#1f3f75]" disabled><Download className="h-4 w-4" />Descarcă Anexa 12</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-4 py-3">Expert</th><th>Eveniment</th><th>Data</th><th>Locație</th><th>SA</th><th>Status transmitere</th></tr></thead>
              <tbody className="divide-y">
                {props.eventDocumentIssues.slice(0, 8).map((activity) => {
                  const expert = props.experts.find((item) => item.id === activity.expertId);
                  return (
                    <tr key={activity.id}>
                      <td className="px-4 py-3"><div className="flex items-center gap-2">{expert ? <MiniAvatar expert={expert} /> : null}<span className="font-semibold">{expert?.name || activity.expertName}</span></div></td>
                      <td>{activity.title || activity.activityType}</td>
                      <td>{activity.date}</td>
                      <td>{activity.location || '-'}</td>
                      <td><Badge variant="outline">{activity.saCode || '-'}</Badge></td>
                      <td><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">În așteptare</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Anexa 12 se completează în luna anterioară evenimentelor. Nu se generează document real fără specificația aprobată.
          </div>
        </section>
      ) : null}
      {activeAction !== 'opis' ? null : (
      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-semibold">OPIS livrabile proiect</h3><Badge variant="secondary">{props.documents.length} livrabile</Badge></div>
        <div className="flex justify-end gap-2 border-b px-4 py-3">
          <Button size="sm" variant="outline" disabled>Preview tabel</Button>
          <Button size="sm" className="bg-[#1f3f75]" onClick={props.onDownloadTotalOpisXls} disabled={props.isExportingOpisTotal}><Download className="h-4 w-4" />Descarcă OPIS XLS</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-4 py-3">Nr.</th><th>Program</th><th>Ob. specific</th><th>Cod SMIS</th><th>Livrabil</th><th>Beneficiar/partener</th><th>Rol</th><th>Expert</th><th>Stare</th><th>Data finalizării</th></tr></thead>
            <tbody className="divide-y">{props.documents.slice(0, 12).map((doc, index) => <tr key={doc.id}><td className="px-4 py-3">{index + 1}</td><td>Program Educație și Ocupare 2021-2027</td><td>ESO4.2.</td><td className="text-blue-700">302141</td><td className="font-semibold">{doc.declaredTitle || doc.extractedTitle || doc.originalFileName}</td><td>Confederația Patronală Concordia</td><td>Beneficiar</td><td>{doc.uploadedByExpertName || doc.uploadedByExpertId}</td><td><Badge variant="outline" className={doc.titleMatch === true ? statusClass('approved') : statusClass('sent')}>{doc.titleMatch === true ? 'finalizat' : 'în realizare'}</Badge></td><td>{doc.updatedAt?.slice(0, 10) || '-'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}

function EligibilityRulesActionPanel({
  focusDocument,
  activeDocuments,
  resolvedDocuments,
  props,
}: {
  focusDocument?: DocumentMetadata | null;
  activeDocuments: DocumentMetadata[];
  resolvedDocuments: DocumentMetadata[];
  props: PmWorkspaceProps;
}) {
  const rows = [
    ...activeDocuments.map((document) => ({ document, status: 'Blocaj activ' })),
    ...resolvedDocuments.map((document) => ({ document, status: 'Auto-rezolvat' })),
  ];

  return (
    <div className="space-y-4">
      <ActivityCatalogGovernancePanel
        fallbackCatalog={props.fallbackCatalog}
        mode="pm"
        activities={props.activities}
        documents={props.documents}
        onAudit={props.onEligibilityGovernanceAudit}
      />

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Catalog eligibilitate - context Review</h3>
          <p className="text-xs text-slate-500">Cazurile active pot actualiza regulile; cele auto-rezolvate rămân auditabile fără deblocare PM.</p>
        </div>
        {focusDocument ? (
          <div className="border-b bg-blue-50 px-4 py-3 text-sm">
            <span className="font-semibold text-[#1f3f75]">Focus:</span>{' '}
            {focusDocument.declaredTitle || focusDocument.originalFileName}
            <span className="ml-2 text-xs text-slate-500">{focusDocument.eligibilityCheck?.summary || focusDocument.eligibilityCheck?.status}</span>
          </div>
        ) : null}
        <div className="divide-y">
          {rows.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nu există cazuri cu cerere PM unlock pentru catalog.</div>
          ) : rows.map(({ document, status }) => (
            <div key={document.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-[#1f3f75]">{document.declaredTitle || document.originalFileName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {status} · {document.eligibilityCheck?.checkedSaCode || document.eligibilityCheck?.checkedActivityName || 'SA neidentificată'}
                </div>
                <div className="mt-2 text-xs text-slate-600">{document.eligibilityCheck?.summary || 'Fără sumar AI.'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onOpenDossierById(document.uploadedByExpertId, {
                    activityId: document.sourceActivityId,
                    documentId: document.id,
                    issueType: 'eligibility_rules',
                  })}
                >
                  <FileText className="h-4 w-4" />
                  Review
                </Button>
                <Badge variant="outline" className={status === 'Blocaj activ' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                  {status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SideCard({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-lg border bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-3">{items.length === 0 ? <p className="text-xs text-slate-500">Nu există activitate.</p> : items.map((item, index) => <div key={`${item}-${index}`} className="rounded-md border p-3 text-xs text-slate-600">{item}</div>)}</div></section>;
}

function ClarificationRealertCard({
  threads,
  experts,
  onRealertClarification,
}: {
  threads: PmClarificationThread[];
  experts: Expert[];
  onRealertClarification: (thread: PmClarificationThread) => void | Promise<void>;
}) {
  const realertItems = buildPmClarificationRealertItems({ threads, experts });

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Clarificări recente</h3>
        <Badge variant="outline">{realertItems.length} deschise</Badge>
      </div>
      <div className="space-y-3">
        {realertItems.length === 0 ? (
          <p className="text-xs text-slate-500">Nu există clarificări deschise.</p>
        ) : realertItems.map(({ thread, expert, statusLabel }) => {
          return (
            <div key={thread.id} className="rounded-md border p-3 text-xs text-slate-600">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{expert?.name || thread.expertId}</p>
                  <p className="mt-1 line-clamp-3">{thread.pmMessage}</p>
                </div>
                <Badge variant="outline">{statusLabel}</Badge>
              </div>
              {thread.lastRealertedAt ? (
                <p className="mt-2 text-[11px] text-amber-700">
                  Re-alertat {new Date(thread.lastRealertedAt).toLocaleDateString('ro-RO')}
                  {thread.realertCount ? ` · ${thread.realertCount}x` : ''}
                </p>
              ) : null}
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onRealertClarification(thread)}>
                <Send className="h-4 w-4" />
                Re-alertează
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border bg-white p-6 text-sm text-slate-500 shadow-sm">{text}</div>;
}

export function PmWorkspace(props: PmWorkspaceProps) {
  const [activeView, setActiveView] = useState<WorkspaceView>('kpi');
  const [eligibilityRulesFocusDocument, setEligibilityRulesFocusDocument] = useState<DocumentMetadata | null>(null);
  const openEligibilityRules = (document: DocumentMetadata) => {
    setEligibilityRulesFocusDocument(document);
    setActiveView('actions');
  };
  const content = useMemo(() => {
    if (activeView === 'access') return <MonthAccessView {...props} />;
    if (activeView === 'timesheets') return <TimesheetView {...props} onOpenEligibilityRules={openEligibilityRules} />;
    if (activeView === 'reports') return <ReportsView {...props} />;
    if (activeView === 'deliverables') return <DeliverablesView {...props} />;
    if (activeView === 'nonconformities') return <NonconformitiesView {...props} />;
    if (activeView === 'actions') return <ActionsView {...props} eligibilityRulesFocusDocument={eligibilityRulesFocusDocument} />;
    return <KpiView {...props} />;
  }, [activeView, eligibilityRulesFocusDocument, props]);

  return (
    <div className="min-h-screen bg-[#eef3f8]">
      <PmTopBar activeView={activeView} onViewChange={setActiveView} props={props} />
      <main className="mx-auto max-w-screen-2xl px-2 py-4 sm:px-4 lg:px-0">{content}</main>
    </div>
  );
}
