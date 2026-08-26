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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMonthName } from '@/lib/app-utils';
import { isActivePmUnlockRequest } from '@/lib/pm-unlock-status';
import type {
  Activity,
  DashboardComplianceRow,
  DocumentMetadata,
  Expert,
  MonthAccessRequest,
  Neconformitate,
  PmClarificationThread,
  ReportStatus,
  SharedDeliverable,
} from '@/lib/types';
import type { PmSubmittedReportRow } from '@/components/pm/pm-submitted-reports-panel';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';
type StatusMeta = { label: string; variant: BadgeVariant };

type PendingSharedDeliverable = {
  relation: SharedDeliverable;
  document?: DocumentMetadata;
  sourceActivity?: Activity;
  sourceExpert?: Expert;
  targetExpert?: Expert;
};

type PmWorkspaceProps = {
  experts: Expert[];
  dashboardRows: DashboardComplianceRow[];
  reportStatusByExpertId: Map<string, ReportStatus>;
  statusLabels: Record<ReportStatus['status'], StatusMeta>;
  selectedMonth: number;
  selectedYear: number;
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
  onOpenDossier: (expert: Expert, options?: { activityId?: string; documentId?: string; issueType?: string }) => void;
  onOpenDossierById: (expertId: string, options?: { activityId?: string; documentId?: string; issueType?: string }) => void;
  onApproveMonthAccessRequest: (request: MonthAccessRequest) => void | Promise<void>;
  onRejectMonthAccessRequest: (request: MonthAccessRequest) => void | Promise<void>;
  onCloseMonthAccess: (request: MonthAccessRequest) => void | Promise<void>;
  onRequestDocumentClarification: (document: DocumentMetadata) => void;
  onApprovePmUnlock: (document: DocumentMetadata) => void | Promise<void>;
  onDownloadTotalOpisXls: () => void;
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function pct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function statusClass(status: ReportStatus['status']) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarifications') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'sent') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function MiniAvatar({ expert }: { expert: Expert }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1f73d8] text-[10px] font-bold text-white">
      {initials(expert.name)}
    </span>
  );
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

function KpiView(props: PmWorkspaceProps) {
  const [selectedReport, setSelectedReport] = useState('rp12');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const reportRows = props.dashboardRows;
  const onTime = reportRows.filter((row) => row.utilizationPercent >= 100 && !(props.reportStatusByExpertId.get(row.expertId)?.status === 'clarifications')).length;
  const verified = props.pmSummary.statusCounts.in_review + props.pmSummary.statusCounts.approved;
  const late = reportRows.filter((row) => row.missingActivityDays.length > 0 || row.remainingHours > 0).length;
  const approved = props.pmSummary.statusCounts.approved;
  const completed = reportRows.filter((row) => row.remainingHours === 0).length;
  const actionNeeded = props.pmSummary.problemCount;

  const cards = [
    ['Raportare la zi', onTime, 'din experți', 'bg-[#1f3f75] text-white border-[#1f3f75]'],
    ['Verificate PM', verified, `din ${props.pmSummary.statusCounts.sent} trimise`, 'bg-white text-slate-950 border-slate-200'],
    ['Cu întârzieri', late, 'raportări neîncheiate', 'bg-red-50 text-red-700 border-red-200'],
    ['Aprobate PM', approved, `${props.pmSummary.statusCounts.sent} trimise, în așteptare`, 'bg-white text-blue-700 border-slate-200'],
    ['Finalizate', completed, 'normă completă', 'bg-white text-emerald-700 border-slate-200'],
    ['Necesită acțiune', actionNeeded, 'neconformități', 'bg-amber-50 text-amber-700 border-amber-200'],
  ];
  const reportOptions = [
    ['rp9', 'RP 9 - Noiembrie 2025 / Ianuarie 2026'],
    ['rp10', 'RP 10 - Februarie 2026 / Aprilie 2026'],
    ['rp12', 'RP 12 - Mai 2026 / Iulie 2026'],
    ['rp13', 'RP 13 - August 2026 / Octombrie 2026'],
    ['rp14', 'RP 14 - Noiembrie 2026 / Ianuarie 2027'],
    ['rp15', 'RP 15 - Februarie 2027 / Aprilie 2027'],
    ['rp16', 'RP 16 - Mai 2027 / Iulie 2027'],
    ['rp17', 'RP 17 - August 2027 / Octombrie 2027'],
    ['rp18', 'RP 18 - Noiembrie 2027 / Ianuarie 2028'],
    ['rp19', 'RP 19 - Februarie 2028 / Aprilie 2028'],
    ['rp20', 'RP 20 - Mai 2028 / Iulie 2028'],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-600">Raport de progres:</span>
            <Select value={selectedReport} onValueChange={setSelectedReport}>
              <SelectTrigger className="h-9 w-[17rem] bg-white"><SelectValue placeholder="RP 12 - Mai 2026 / Iulie 2026" /></SelectTrigger>
              <SelectContent>
                {reportOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-slate-600">Luna:</span>
            <Select value={props.selectedMonth.toString()} onValueChange={(value) => props.onMonthChange(Number(value))}>
              <SelectTrigger className="h-9 w-[9rem] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {props.months.map((month) => <SelectItem key={month.value} value={String(month.value)}>{month.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-slate-400">23 zile lucrătoare</span>
          </div>
          <Button size="sm" className="bg-[#1f3f75]" onClick={() => setIsReportOpen(true)}>
            <FileText className="h-4 w-4" />
            Situație raportare
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, helper, className]) => (
          <div key={label} className={`rounded-lg border p-4 shadow-sm ${className}`}>
            <div className="text-3xl font-bold">{value}</div>
            <div className="mt-2 text-xs font-bold uppercase">{label}</div>
            <div className="mt-1 text-[11px] opacity-80">{helper}</div>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="border-b p-4">
          <h2 className="font-semibold">Status raportare - {getMonthName(props.selectedMonth)} {props.selectedYear}</h2>
          <p className="text-xs text-slate-500">PEO 302141 - date conectate din activități, norme și statusuri lunare.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nr.</th><th>Expert</th><th>Funcție</th><th>Normă/zi</th><th>Normă calculată</th><th>Ore pontate</th><th>Progres</th><th>Livrabile</th><th>Raport</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {props.dashboardRows.map((row, index) => {
                const expert = props.experts.find((item) => item.id === row.expertId);
                const status = props.reportStatusByExpertId.get(row.expertId)?.status || 'draft';
                return (
                  <tr key={row.expertId} className={status === 'approved' ? 'bg-emerald-50/40' : status === 'clarifications' ? 'bg-amber-50/40' : undefined}>
                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">{expert ? <MiniAvatar expert={expert} /> : null}<span className="font-semibold">{row.expertName}</span></div>
                    </td>
                    <td className="text-slate-600">{row.role || '-'}</td>
                    <td><Badge variant="outline">{row.normType === 'fixed' ? 'fix' : `${Math.round((row.monthlyNorm || 0) / 23)}h/zi`}</Badge></td>
                    <td className="font-semibold">{row.monthlyNorm}h</td>
                    <td className="font-semibold text-blue-700">{row.totalHours}h</td>
                    <td><div className="flex items-center gap-2"><Progress value={pct(row.utilizationPercent)} className="h-1.5 w-20" /><span>{row.utilizationPercent}%</span></div></td>
                    <td><Badge variant="outline">{row.missingDeliverableActivityCount > 0 ? `${row.missingDeliverableActivityCount} lipsă` : 'Trimise'}</Badge></td>
                    <td><Badge variant="outline" className={statusClass(status)}>{props.statusLabels[status]?.label || status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ReportSituationDialog open={isReportOpen} onOpenChange={setIsReportOpen} props={props} />
    </div>
  );
}

function ReportSituationDialog({
  open,
  onOpenChange,
  props,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  props: PmWorkspaceProps;
}) {
  const proactive = props.submittedReportRows.filter((row) => row.status.status === 'approved' || row.status.status === 'sent');
  const actionRows = props.dashboardRows.filter((row) => row.remainingHours > 0 || row.missingDeliverableActivityCount > 0 || row.hasDailyLimitIssue || row.hasMonthlyNormIssue);
  const finished = props.submittedReportRows.filter((row) => row.status.status === 'approved');
  const inProgress = props.submittedReportRows.filter((row) => row.status.status === 'sent' || row.status.status === 'in_review');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="bg-[#1f3f75] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Situație raportare - {getMonthName(props.selectedMonth)} {props.selectedYear}</DialogTitle>
              <p className="mt-1 text-xs text-blue-100">PEO 302141 - Confederația Patronală CONCORDIA - 23 zile lucrătoare</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <FileText className="h-4 w-4" />
                Print
              </Button>
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['Experți implicați', props.experts.length, 'raportează livrabile', 'bg-[#1f3f75] text-white'],
              ['Finalizate complet', finished.length, 'raport + livrabile OK', 'bg-emerald-50 text-emerald-700'],
              ['În curs / proactivi', inProgress.length, 'au trimis raportarea', 'bg-blue-50 text-blue-700'],
              ['În urmă', actionRows.length, 'necesită acțiune', 'bg-amber-50 text-amber-700'],
            ].map(([label, value, helper, className]) => (
              <div key={label} className={`rounded-lg border p-4 text-center ${className}`}>
                <div className="text-3xl font-bold">{value}</div>
                <div className="mt-2 text-xs font-bold uppercase">{label}</div>
                <div className="mt-1 text-[11px] opacity-80">{helper}</div>
              </div>
            ))}
          </div>
          <ReportDialogTable title="Proactivi - au trimis raportarea" rows={proactive} tone="emerald" props={props} />
          <section className="overflow-hidden rounded-lg border border-amber-200">
            <div className="flex justify-between bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              <span>În curs / necesită acțiune</span>
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">{actionRows.length} experți</Badge>
            </div>
            <div className="divide-y">
              {actionRows.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Nu există experți în urmă.</div>
              ) : (
                actionRows.map((row) => {
                  const expert = props.experts.find((item) => item.id === row.expertId);
                  const status = props.reportStatusByExpertId.get(row.expertId)?.status || 'draft';
                  return (
                    <div key={row.expertId} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1.3fr_1fr_1fr_1fr]">
                      <div className="flex items-center gap-2">{expert ? <MiniAvatar expert={expert} /> : null}<span className="font-semibold">{row.expertName}</span></div>
                      <div><Progress value={pct(row.utilizationPercent)} className="h-1.5" /><span className="mt-1 block text-slate-500">{row.totalHours}h/{row.monthlyNorm}h</span></div>
                      <Badge variant="outline" className={statusClass(status)}>{props.statusLabels[status]?.label || status}</Badge>
                      <span className="font-semibold text-amber-700">În curs</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialogTable({ title, rows, tone, props }: { title: string; rows: PmSubmittedReportRow[]; tone: 'emerald'; props: PmWorkspaceProps }) {
  return (
    <section className="overflow-hidden rounded-lg border border-emerald-200">
      <div className="flex justify-between bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        <span>{title}</span>
        <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">{rows.length} experți</Badge>
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Nu există raportări trimise.</div>
        ) : (
          rows.map((row) => (
            <div key={row.status.id || row.expert.id} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[1.3fr_1fr_1fr_1fr]">
              <div className="flex items-center gap-2"><MiniAvatar expert={row.expert} /><span className="font-semibold">{row.expert.name}</span></div>
              <div><Progress value={pct(row.utilizationPercent)} className="h-1.5" /><span className="mt-1 block text-slate-500">{row.utilizationPercent}% · {row.totalHours}h</span></div>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Toate trimise</Badge>
              <span className="font-semibold text-emerald-700">{row.status.status === 'approved' ? 'Finalizat' : props.statusLabels[row.status.status]?.label}</span>
            </div>
          ))
        )}
      </div>
    </section>
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

type TimesheetViewProps = PmWorkspaceProps & {
  onOpenEligibilityRules: (document: DocumentMetadata) => void;
};

function TimesheetView(props: TimesheetViewProps) {
  const [selectedExpertId, setSelectedExpertId] = useState(props.experts[0]?.id || '');
  const selectedExpert = props.experts.find((expert) => expert.id === selectedExpertId) || props.experts[0];
  const selectedRow = props.dashboardRows.find((row) => row.expertId === selectedExpert?.id);
  const selectedActivities = props.activities.filter((activity) => activity.expertId === selectedExpert?.id);
  const selectedActivityIds = new Set(selectedActivities.map((activity) => activity.id));
  const isDocumentInSelectedMonth = (document: DocumentMetadata) => {
    if (document.uploadedByExpertId !== selectedExpert?.id) return false;
    if (document.sourceActivityId && selectedActivityIds.has(document.sourceActivityId)) return true;
    const uploadedAt = document.uploadDate ? new Date(document.uploadDate) : null;
    return Boolean(uploadedAt && uploadedAt.getMonth() === props.selectedMonth && uploadedAt.getFullYear() === props.selectedYear);
  };
  const selectedActiveBlockedDocuments = props.pmUnlockRequests.filter(isDocumentInSelectedMonth);
  const selectedAutoResolvedDocuments = props.resolvedPmUnlockRequests.filter(isDocumentInSelectedMonth);
  const activeBlockedByActivityId = new Map<string, DocumentMetadata[]>();
  selectedActiveBlockedDocuments.forEach((document) => {
    if (!document.sourceActivityId) return;
    activeBlockedByActivityId.set(document.sourceActivityId, [...(activeBlockedByActivityId.get(document.sourceActivityId) || []), document]);
  });
  const isActivityBlockedByEligibility = (activity: Activity) => {
    if (activeBlockedByActivityId.has(activity.id)) return true;
    return (activity.deliverables || []).some((deliverable) => isActivePmUnlockRequest(deliverable.eligibilityCheck));
  };
  const activitiesByDay = new Map<string, Activity[]>();
  selectedActivities.forEach((activity) => activitiesByDay.set(activity.date, [...(activitiesByDay.get(activity.date) || []), activity]));
  const days = new Date(props.selectedYear, props.selectedMonth + 1, 0).getDate();
  const leading = (new Date(props.selectedYear, props.selectedMonth, 1).getDay() + 6) % 7;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Calendar ore - {getMonthName(props.selectedMonth)} {props.selectedYear}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.experts.map((expert) => {
            const row = props.dashboardRows.find((item) => item.expertId === expert.id);
            const active = expert.id === selectedExpert?.id;
            return (
              <button key={expert.id} type="button" onClick={() => setSelectedExpertId(expert.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${active ? 'border-[#1f3f75] bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
                <MiniAvatar expert={expert} />
                <span><span className="block font-semibold">{expert.name.split(' ')[0]}</span><span className="text-slate-500">{row?.totalHours || 0}h - {pct(row?.utilizationPercent || 0)}%</span></span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="flex items-center gap-3">{selectedExpert ? <MiniAvatar expert={selectedExpert} /> : null}<h3 className="font-semibold">{selectedExpert?.name || 'Expert'}</h3><span className="text-xs text-slate-500">{selectedExpert?.role}</span></div>
          </div>
          <div className="grid grid-cols-7 border-b bg-slate-50 text-xs font-semibold text-slate-500">
            {['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'].map((day) => <div key={day} className="border-r p-2 last:border-r-0">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: leading }).map((_, index) => <div key={`empty-${index}`} className="min-h-[5.5rem] border-b border-r bg-slate-50/50" />)}
            {Array.from({ length: days }).map((_, index) => {
              const day = index + 1;
              const date = isoDate(props.selectedYear, props.selectedMonth, day);
              const dayActivities = activitiesByDay.get(date) || [];
              const hours = dayActivities.reduce((sum, activity) => sum + (activity.hours || 0), 0);
              return (
                <div key={date} className="min-h-[5.5rem] border-b border-r p-2 text-xs">
                  <div className="flex justify-between"><span className="font-medium">{day}</span><span className={hours > 0 ? 'font-semibold text-blue-700' : 'text-slate-300'}>{hours || '-'}/{Math.round((selectedRow?.monthlyNorm || 0) / 23)}h</span></div>
                  {dayActivities.slice(0, 2).map((activity) => {
                    const blocked = isActivityBlockedByEligibility(activity);
                    return (
                      <div
                        key={activity.id}
                        className={`mt-1 truncate rounded px-1.5 py-1 text-[10px] ${
                          blocked
                            ? 'border border-amber-300 bg-amber-50 text-amber-900'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                        title={blocked ? 'Activitate afectată de livrabil neeligibil cu deblocare PM solicitată' : undefined}
                      >
                        {activity.title || activity.activityType}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between p-4">
            <div><span className="text-2xl font-bold text-[#1f3f75]">{selectedRow?.totalHours || 0}h</span><span className="ml-2 text-sm text-slate-500">/ {selectedRow?.monthlyNorm || 0}h normă</span></div>
            <Button className="bg-[#1f3f75]"><Download className="h-4 w-4" />Descarcă pontaj PEO</Button>
          </div>
        </section>
        <PmUnlockTimesheetPanel
          activeDocuments={selectedActiveBlockedDocuments}
          resolvedDocuments={selectedAutoResolvedDocuments}
          activities={selectedActivities}
          props={props}
        />
      </div>
    </div>
  );
}

function PmUnlockTimesheetPanel({
  activeDocuments,
  resolvedDocuments,
  activities,
  props,
}: {
  activeDocuments: DocumentMetadata[];
  resolvedDocuments: DocumentMetadata[];
  activities: Activity[];
  props: TimesheetViewProps;
}) {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const openDocument = (document: DocumentMetadata, issueType = 'pm_unlock_requests') => {
    props.onOpenDossierById(document.uploadedByExpertId, {
      activityId: document.sourceActivityId,
      documentId: document.id,
      issueType,
    });
  };

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Livrabile blocate</h3>
            <p className="text-xs text-amber-700">Afectează pontajul până la decizia PM.</p>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">{activeDocuments.length}</Badge>
        </div>
        <div className="divide-y">
          {activeDocuments.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nu există blocaje active pentru expertul selectat.</div>
          ) : activeDocuments.map((document) => {
            const activity = document.sourceActivityId ? activityById.get(document.sourceActivityId) : undefined;
            return (
              <div key={document.id} className="space-y-3 p-4">
                <div>
                  <div className="font-semibold text-[#1f3f75]">{document.declaredTitle || document.originalFileName}</div>
                  <div className="mt-1 text-xs text-slate-500">{activity?.title || activity?.activityType || document.eligibilityCheck?.checkedActivityName || 'Activitate neidentificată'}</div>
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{document.eligibilityCheck?.summary || 'Livrabil neeligibil cu deblocare PM solicitată.'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDocument(document)}><FileText className="h-4 w-4" />Deschide livrabil</Button>
                  <Button size="sm" variant="outline" onClick={() => openDocument(document, 'eligibility_manual_review')}>Verifică manual</Button>
                  <Button size="sm" onClick={() => props.onApprovePmUnlock(document)}><Check className="h-4 w-4" />Deblochează PM</Button>
                  <Button size="sm" variant="outline" onClick={() => props.onOpenEligibilityRules(document)}>Actualizează reguli</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-emerald-800">Rezolvate prin corectare expert</h3>
            <p className="text-xs text-slate-500">Tracking păstrat, fără impact de blocaj PM.</p>
          </div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{resolvedDocuments.length}</Badge>
        </div>
        <div className="divide-y">
          {resolvedDocuments.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nu există corectări auto-rezolvate pentru expertul selectat.</div>
          ) : resolvedDocuments.map((document) => (
            <div key={document.id} className="space-y-3 p-4">
              <div>
                <div className="font-semibold text-[#1f3f75]">{document.declaredTitle || document.originalFileName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Inițial: {document.eligibilityCheck?.pmUnlockOriginalStatus || 'neeligibil'} · Acum: {document.eligibilityCheck?.status || 'eligibil'}
                </div>
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{document.eligibilityCheck?.summary || 'Livrabilul a devenit eligibil după corectarea expertului.'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openDocument(document)}><FileText className="h-4 w-4" />Deschide livrabil</Button>
                <Button size="sm" variant="outline" onClick={() => openDocument(document, 'eligibility_ai_review')}>Vezi verificarea AI</Button>
                <Button size="sm" variant="outline" onClick={() => props.onOpenEligibilityRules(document)}>Actualizează reguli</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function ReportsView(props: PmWorkspaceProps) {
  const clean = props.submittedReportRows.filter((row) => row.status.status === 'approved' && row.issuesCount === 0);
  const waiting = props.submittedReportRows.filter((row) => row.status.status === 'sent' || row.status.status === 'in_review');
  const clarifications = props.submittedReportRows.filter((row) => row.status.status === 'clarifications');
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <ReportGroup title="Verificate - fără neconformități" tone="emerald" rows={clean} props={props} />
        <ReportGroup title="Trimise - în așteptarea verificării PM" tone="blue" rows={waiting} props={props} />
        <ReportGroup title="Verificate - cu clarificări deschise" tone="amber" rows={clarifications} props={props} />
      </div>
      <aside className="space-y-4">
        <SideCard title="Activitate recentă" items={props.submittedReportRows.slice(0, 5).map((row) => `${row.expert.name} - ${props.statusLabels[row.status.status]?.label || row.status.status}`)} />
        <SideCard title="Clarificări recente" items={props.clarificationThreads.slice(0, 5).map((thread) => thread.pmMessage)} />
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

function DeliverablesView(props: PmWorkspaceProps) {
  const [filter, setFilter] = useState('all');
  const filtered = props.documents.filter((document) => {
    if (filter === 'all') return true;
    if (filter === 'approved') return document.titleMatch === true || document.titleCheckStatus === 'matched';
    if (filter === 'clarifications') return document.titleMatch === false || document.titleCheckStatus === 'mismatch';
    if (filter === 'draft') return !document.titleCheckStatus && !document.titleMatch;
    return true;
  });
  const grouped = props.experts.map((expert) => ({ expert, docs: filtered.filter((doc) => doc.uploadedByExpertId === expert.id) })).filter((group) => group.docs.length > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">{[['all', 'Toate'], ['approved', 'Aprobat'], ['sent', 'Trimis'], ['clarifications', 'Clarificări'], ['draft', 'Draft']].map(([id, label]) => <Button key={id} size="sm" variant={filter === id ? 'default' : 'outline'} onClick={() => setFilter(id)}>{label}</Button>)}</div>
        <div className="flex items-center gap-3 text-xs text-slate-500"><span>{filtered.length} livrabile</span><Button size="sm" onClick={props.onDownloadTotalOpisXls} disabled={props.isExportingOpisTotal}><Download className="h-4 w-4" />OPIS total XLS</Button></div>
      </div>
      {grouped.length === 0 ? <EmptyState text="Nu există livrabile pentru filtrul selectat." /> : grouped.map(({ expert, docs }) => (
        <section key={expert.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-3"><div className="flex items-center gap-3"><MiniAvatar expert={expert} /><div className="font-semibold">{expert.name}</div><span className="text-xs text-slate-500">{expert.role}</span></div><Badge variant="secondary">{docs.length} livrabile</Badge></div>
          <table className="w-full text-xs"><tbody className="divide-y">{docs.map((doc) => <tr key={doc.id}><td className="px-4 py-3 font-semibold">{doc.declaredTitle || doc.extractedTitle || doc.originalFileName}</td><td>{doc.deliverableType || 'Document'}</td><td>{doc.uploadDate?.slice(0, 10) || '-'}</td><td><Badge variant="outline" className={doc.titleMatch === false ? statusClass('clarifications') : statusClass('sent')}>{doc.titleMatch === false ? 'Clarificări' : doc.titleCheckStatus || 'Trimis'}</Badge></td><td><Button size="sm" variant="outline" onClick={() => props.onOpenDossierById(doc.uploadedByExpertId, { documentId: doc.id })}><FileText className="h-4 w-4" />Deschide livrabil</Button></td></tr>)}</tbody></table>
        </section>
      ))}
    </div>
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
  const subactivityGroups = Array.from(
    props.activities.reduce((groups, activity) => {
      const key = activity.saCode || activity.activityType || 'Fără SA';
      groups.set(key, [...(groups.get(key) || []), activity]);
      return groups;
    }, new Map<string, Activity[]>()).entries(),
  ).sort(([a], [b]) => a.localeCompare(b));

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
            {subactivityGroups.map(([code, activities]) => (
              <div key={code} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-sm font-bold text-[#1f3f75]">{code}</div>
                <div className="mt-1 text-xs text-slate-500">{activities.length} intrări</div>
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
                subactivityGroups.flatMap(([code, activities]) => (
                  activities.slice(0, 4).map((activity) => {
                    const expert = props.experts.find((item) => item.id === activity.expertId);
                    return (
                      <div key={activity.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {expert ? <MiniAvatar expert={expert} /> : null}
                            <div>
                              <div className="text-sm font-semibold">{expert?.name || activity.expertName || 'Expert'}</div>
                              <div className="text-xs text-slate-500">{getMonthName(props.selectedMonth)} {props.selectedYear} · {code}</div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" disabled><ClipboardList className="h-4 w-4" />Copy-paste în RA</Button>
                        </div>
                        <p className="mt-3 rounded-md border bg-slate-50 p-3 text-xs italic leading-5 text-slate-700">
                          {activity.description || activity.title || 'Descrierea activității nu este disponibilă.'}
                        </p>
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
  );
}

function SideCard({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-lg border bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-3">{items.length === 0 ? <p className="text-xs text-slate-500">Nu există activitate.</p> : items.map((item, index) => <div key={`${item}-${index}`} className="rounded-md border p-3 text-xs text-slate-600">{item}</div>)}</div></section>;
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
