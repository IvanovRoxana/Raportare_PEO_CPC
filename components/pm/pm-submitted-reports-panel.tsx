import { AlertTriangle, FolderOpen, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Expert, ReportStatus } from '@/lib/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

type StatusMeta = {
  label: string;
  variant: BadgeVariant;
};

export type PmSubmittedReportRow = {
  expert: Expert;
  status: ReportStatus;
  totalHours: number;
  totalDeliverables: number;
  issuesCount: number;
  utilizationPercent: number;
};

type PmSubmittedReportsPanelProps = {
  rows: PmSubmittedReportRow[];
  statusLabels: Record<ReportStatus['status'], StatusMeta>;
  onOpenReport: (expert: Expert) => void;
};

function formatSentDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PmSubmittedReportsPanel({ rows, statusLabels, onOpenReport }: PmSubmittedReportsPanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Raportari trimise</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rapoartele lunii selectate care pot fi verificate de PM.
          </p>
        </div>
        <Badge variant="secondary">{rows.length} raportari</Badge>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          Nu exista raportari trimise pentru luna selectata.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Expert</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Trimis</th>
                <th className="px-4 py-3 font-medium">Ore</th>
                <th className="px-4 py-3 font-medium">Livrabile</th>
                <th className="px-4 py-3 font-medium">Probleme</th>
                <th className="px-4 py-3 font-medium">Actiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const statusMeta = statusLabels[row.status.status] || statusLabels.draft;

                return (
                  <tr key={row.status.id || `${row.status.expertId}-${row.status.month}-${row.status.year}`} className="bg-card transition-colors hover:bg-muted/30">
                    <td className="px-4 py-4">
                      <div className="font-medium">{row.expert.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.expert.role || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{formatSentDate(row.status.sentDate)}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{row.totalHours}h</div>
                      <div className="text-xs text-muted-foreground">{row.utilizationPercent}% completare</div>
                    </td>
                    <td className="px-4 py-4">{row.totalDeliverables}</td>
                    <td className="px-4 py-4">
                      {row.issuesCount > 0 ? (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                          <AlertTriangle className="h-3 w-3" />
                          {row.issuesCount}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Button variant="outline" size="sm" onClick={() => onOpenReport(row.expert)}>
                        <FolderOpen className="h-4 w-4" />
                        Deschide raportarea
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
