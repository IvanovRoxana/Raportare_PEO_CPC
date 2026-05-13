'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Filter, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import type { Activity, ConcurrentProject, Expert, ReportStatus } from '@/lib/types';

interface DoubleFundingTabProps {
  experts: Expert[];
  activities: Activity[];
  concurrentProjects: ConcurrentProject[];
  reportStatuses: ReportStatus[];
  month: number;
  year: number;
}

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
  reportStatuses,
  month,
  year,
}: DoubleFundingTabProps) {
  const [expertFilter, setExpertFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<DoubleFundingRiskStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState('');

  const rows = useMemo(
    () =>
      buildDoubleFundingRiskRows({
        experts,
        activities,
        concurrentProjects,
        reportStatuses,
        month,
        year,
      }),
    [activities, concurrentProjects, experts, month, reportStatuses, year]
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
