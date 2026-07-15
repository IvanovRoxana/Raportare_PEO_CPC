'use client';

import { useMemo } from 'react';
import { AlertTriangle, CalendarDays, FileText, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildWorkBlocks, calculateWorkBlockHours, validateWorkBlockAllocation, type ReportingWorkBlockBundle } from '@/lib/activity-report/work-blocks';
import { formatDayCluster } from '@/lib/activity-report/day-cluster';
import { getMonthName } from '@/lib/app-utils';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { Activity } from '@/lib/types';

interface ReportingWorkBlocksPanelProps {
  activities: Activity[];
  month: number;
  year: number;
  persistedBundles?: ReportingWorkBlockBundle[];
}

export function ReportingWorkBlocksPanel({ activities, month, year, persistedBundles = [] }: ReportingWorkBlocksPanelProps) {
  const monthName = getMonthName(month);
  const activityBundles = useMemo(() => buildWorkBlocks(activities), [activities]);
  const bundles = persistedBundles.length > 0 ? persistedBundles : activityBundles;
  const problems = useMemo(() => validateWorkBlockAllocation(activities, bundles), [activities, bundles]);
  const totalHours = bundles.reduce((sum, bundle) => sum + calculateWorkBlockHours(bundle.activityLinks), 0);
  const unassociatedDeliverableCount = activities.reduce((count, activity) => (
    count + (activity.deliverables?.filter((deliverable) => !deliverable.id && !deliverable.documentId).length ?? 0)
  ), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Activitati raportabile
        </CardTitle>
        <CardDescription>
          Previzualizare read-only a work block-urilor construite din pontajul si livrabilele lunii.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Work block-uri" value={bundles.length} />
          <Metric label="Ore alocate" value={totalHours} />
          <Metric label="Probleme" value={problems.length} tone={problems.length > 0 ? 'warning' : 'default'} />
          <Metric label="Livrabile fara id" value={unassociatedDeliverableCount} tone={unassociatedDeliverableCount > 0 ? 'warning' : 'default'} />
        </div>

        {problems.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Validari care trebuie rezolvate inainte de exportul oficial
            </div>
            <ul className="list-disc space-y-1 pl-5">
              {problems.slice(0, 6).map((problem, index) => (
                <li key={`${problem.code}-${problem.activityId ?? problem.workBlockId ?? index}`}>{problem.message}</li>
              ))}
            </ul>
          </div>
        )}

        {bundles.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nu exista activitati pentru luna selectata.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flux raportabil</TableHead>
                  <TableHead>SA</TableHead>
                  <TableHead>Zile si ore</TableHead>
                  <TableHead>Livrabile</TableHead>
                  <TableHead className="text-right">Total ore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((bundle) => {
                  const blockActivities = getBundleActivities(bundle.activityLinks.map((link) => link.activityId), activities);
                  const deliverableTitles = getBundleDeliverableTitles(blockActivities);
                  return (
                    <TableRow key={bundle.workBlock.id}>
                      <TableCell className="min-w-[220px]">
                        <div className="font-medium">{bundle.workBlock.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline">{bundle.workBlock.reportingFlowType}</Badge>
                          <Badge variant="secondary">{bundle.workBlock.status}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>{bundle.workBlock.saCode}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex items-start gap-2 text-sm">
                          <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <span>{formatDayCluster(blockActivities.map((activity) => ({ date: activity.date, hours: Number(activity.hours) || 0 })), monthName, year)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[240px]">
                        {deliverableTitles.length > 0 ? (
                          <div className="space-y-1">
                            {deliverableTitles.slice(0, 4).map((title) => (
                              <div key={title} className="flex items-start gap-2 text-sm">
                                <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                <span>{title}</span>
                              </div>
                            ))}
                            {deliverableTitles.length > 4 && (
                              <div className="text-xs text-muted-foreground">+{deliverableTitles.length - 4} livrabile</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Fara livrabil asociat</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {calculateWorkBlockHours(bundle.activityLinks)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'bg-muted/30'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function getBundleActivities(activityIds: string[], activities: Activity[]) {
  const activityIdSet = new Set(activityIds);
  return activities
    .filter((activity) => activityIdSet.has(activity.id))
    .sort((first, second) => first.date.localeCompare(second.date));
}

function getBundleDeliverableTitles(activities: Activity[]) {
  return [...new Set(activities.flatMap((activity) => (
    activity.deliverables?.map((deliverable) => getDocumentAuditTitle(deliverable)).filter(Boolean) ?? []
  )))];
}
