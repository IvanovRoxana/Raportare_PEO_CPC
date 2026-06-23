import { FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DashboardComplianceRow, Expert, ReportStatus } from '@/lib/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

type StatusMeta = {
  label: string;
  variant: BadgeVariant;
};

type PmMonthlyStatusTableProps = {
  hasExtendedExpertAccess: boolean;
  dashboardRows: DashboardComplianceRow[];
  visibleExperts: Expert[];
  reportStatusByExpertId: Map<string, ReportStatus>;
  statusLabels: Record<ReportStatus['status'], StatusMeta>;
  onOpenDossier: (expert: Expert) => void;
};

export function PmMonthlyStatusTable({
  hasExtendedExpertAccess,
  dashboardRows,
  visibleExperts,
  reportStatusByExpertId,
  statusLabels,
  onOpenDossier,
}: PmMonthlyStatusTableProps) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-4 md:p-5">
        <h2 className="text-base font-semibold">
          {hasExtendedExpertAccess ? 'Status lunar pentru toți experții' : 'Status lunar pentru raportarea mea'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasExtendedExpertAccess
            ? 'Centralizează rolul, categoria, norma, orele pontate, statusul raportării și problemele lunii selectate.'
            : 'Afișează strict rolul, norma, orele pontate, statusul raportării și problemele proprii pentru luna selectată.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Expert</th>
              <th className="px-4 py-3 font-medium">Categorie</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ore / normă</th>
              <th className="px-4 py-3 font-medium">Completare</th>
              <th className="px-4 py-3 font-medium">Probleme</th>
              <th className="px-4 py-3 font-medium">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dashboardRows.map((row) => {
              const expert = visibleExperts.find((item) => item.id === row.expertId);
              const monthlyStatus = reportStatusByExpertId.get(row.expertId)?.status || 'draft';
              const statusMeta = statusLabels[monthlyStatus] || statusLabels.draft;
              const issues = [
                row.hasDailyLimitIssue ? '8h/zi' : null,
                row.hasMonthlyNormIssue ? 'normă lunară' : null,
                row.hasProjectNormIssue ? 'normă proiect' : null,
                row.missingActivityDays.length > 0 ? `${row.missingActivityDays.length} zile lipsă` : null,
                row.blockedDays.length > 0 ? `${row.blockedDays.length} zile blocate` : null,
                row.adminInterventions > 0 ? `${row.adminInterventions} intervenții admin` : null,
              ].filter((issue): issue is string => Boolean(issue));
              const progressValue = Math.max(0, Math.min(row.utilizationPercent, 100));

              return (
                <tr key={row.expertId} className="bg-card transition-colors hover:bg-muted/30">
                  <td className="px-4 py-4">
                    <div className="font-medium">{row.expertName}</div>
                    {row.projectCode && <div className="mt-1 text-xs text-muted-foreground">{row.projectCode}</div>}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="outline">{row.category || '-'}</Badge>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{row.role || '-'}</td>
                  <td className="px-4 py-4">
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium">{row.totalHours}h / {row.monthlyNorm}h</div>
                    <div className="text-xs text-muted-foreground">Rămase {row.remainingHours}h</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[140px] items-center gap-3">
                      <Progress value={progressValue} className="h-2" />
                      <span className="w-10 text-right text-xs font-medium">{row.utilizationPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {issues.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {issues.map((issue) => (
                          <Badge key={issue} variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {expert && (
                      <Button variant="outline" size="sm" onClick={() => onOpenDossier(expert)}>
                        <FolderOpen className="h-4 w-4" />
                        {monthlyStatus === 'draft' ? 'Deschide dosar' : 'Deschide raportarea'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
