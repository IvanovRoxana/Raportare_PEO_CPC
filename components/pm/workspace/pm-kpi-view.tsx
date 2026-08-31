'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { getMonthName } from '@/lib/app-utils';
import { buildPmKpiMetrics, type PmKpiTone } from '@/lib/pm-kpi-metrics';
import { buildPmReportSituation } from '@/lib/pm-report-situation';
import {
  buildPmReportSituationXlsxBlob,
  buildPmReportSituationXlsxFilename,
} from '@/lib/pm-report-situation-export';
import {
  buildPmReportingPeriodSelection,
  resolvePmReportingPeriodChange,
} from '@/lib/pm-reporting-period-selector';
import { resolveDefaultReportingPeriod } from '@/lib/reporting-periods';
import type { Expert, ReportStatus } from '@/lib/types';
import type { PmSubmittedReportRow } from '@/components/pm/pm-submitted-reports-panel';
import type { PmWorkspaceProps } from './pm-workspace';

function pct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function KpiView(props: PmWorkspaceProps) {
  const reportingPeriods = useMemo(() => buildPmReportingPeriodSelection({
    reportingPeriods: props.reportingPeriods,
    selectedMonth: props.selectedMonth,
    selectedYear: props.selectedYear,
  }).reportingPeriods, [props.reportingPeriods, props.selectedMonth, props.selectedYear]);
  const defaultReportingPeriod = useMemo(
    () => resolveDefaultReportingPeriod(reportingPeriods, props.selectedMonth, props.selectedYear),
    [props.selectedMonth, props.selectedYear, reportingPeriods],
  );
  const [selectedReport, setSelectedReport] = useState(defaultReportingPeriod?.id ?? '');
  useEffect(() => {
    if (!selectedReport && defaultReportingPeriod) {
      setSelectedReport(defaultReportingPeriod.id);
    }
  }, [defaultReportingPeriod, selectedReport]);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const reportingPeriodSelection = buildPmReportingPeriodSelection({
    reportingPeriods,
    selectedReportId: selectedReport,
    selectedMonth: props.selectedMonth,
    selectedYear: props.selectedYear,
  });
  const cards = buildPmKpiMetrics({
    dashboardRows: props.dashboardRows,
    reportStatusByExpertId: props.reportStatusByExpertId,
    statusCounts: props.pmSummary.statusCounts,
    problemCount: props.pmSummary.problemCount,
  });
  const cardClassByTone: Record<PmKpiTone, string> = {
    primary: 'bg-[#1f3f75] text-white border-[#1f3f75]',
    neutral: 'bg-white text-slate-950 border-slate-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-white text-blue-700 border-slate-200',
    success: 'bg-white text-emerald-700 border-slate-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const handleReportChange = (periodId: string) => {
    const change = resolvePmReportingPeriodChange({
      reportingPeriods,
      periodId,
      selectedMonth: props.selectedMonth,
      selectedYear: props.selectedYear,
    });
    setSelectedReport(change.selectedReportId);
    if (change.nextYear !== undefined) props.onYearChange(change.nextYear);
    if (change.nextMonth !== undefined) props.onMonthChange(change.nextMonth);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-600">Raport de progres:</span>
            <Select value={reportingPeriodSelection.selectedReportId} onValueChange={handleReportChange}>
              <SelectTrigger className="h-9 w-[17rem] bg-white"><SelectValue placeholder="RP 12 - Mai 2026 / Iulie 2026" /></SelectTrigger>
              <SelectContent>
                {reportingPeriodSelection.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
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
        {cards.map((card) => (
          <div key={card.id} className={`rounded-lg border p-4 shadow-sm ${cardClassByTone[card.tone]}`}>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="mt-2 text-xs font-bold uppercase">{card.label}</div>
            <div className="mt-1 text-[11px] opacity-80">{card.helper}</div>
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
  const situation = buildPmReportSituation({
    experts: props.experts,
    submittedReportRows: props.submittedReportRows,
    dashboardRows: props.dashboardRows,
  });
  const downloadSituation = () => {
    const blob = buildPmReportSituationXlsxBlob({
      experts: props.experts,
      submittedReportRows: props.submittedReportRows,
      dashboardRows: props.dashboardRows,
      reportStatusByExpertId: props.reportStatusByExpertId,
      statusLabels: props.statusLabels,
      month: props.selectedMonth,
      year: props.selectedYear,
      projectCode: '302141',
    });
    triggerDownload(blob, buildPmReportSituationXlsxFilename(props.selectedMonth, props.selectedYear));
  };

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
              <Button size="sm" variant="secondary" onClick={downloadSituation}>
                <FileText className="h-4 w-4" />
                Export XLSX
              </Button>
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
            {situation.cards.map((card) => {
              const className = card.id === 'experts'
                ? 'bg-[#1f3f75] text-white'
                : card.id === 'finished'
                  ? 'bg-emerald-50 text-emerald-700'
                  : card.id === 'in_progress'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-amber-50 text-amber-700';
              return (
                <div key={card.id} className={`rounded-lg border p-4 text-center ${className}`}>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <div className="mt-2 text-xs font-bold uppercase">{card.label}</div>
                  <div className="mt-1 text-[11px] opacity-80">{card.helper}</div>
                </div>
              );
            })}
          </div>
          <ReportDialogTable title="Proactivi - au trimis raportarea" rows={situation.proactiveRows} props={props} />
          <section className="overflow-hidden rounded-lg border border-amber-200">
            <div className="flex justify-between bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              <span>În curs / necesită acțiune</span>
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">{situation.actionRows.length} experți</Badge>
            </div>
            <div className="divide-y">
              {situation.actionRows.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Nu există experți în urmă.</div>
              ) : (
                situation.actionRows.map((row) => {
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

function ReportDialogTable({ title, rows, props }: { title: string; rows: PmSubmittedReportRow[]; props: PmWorkspaceProps }) {
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
