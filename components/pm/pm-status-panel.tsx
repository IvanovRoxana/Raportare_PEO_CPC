import { AlertCircle, CheckCircle, Eye, FileWarning, FolderOpen, Loader2, MessageSquare, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReportStatus } from '@/lib/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

type StatusMeta = {
  label: string;
  variant: BadgeVariant;
};

type PmStatusPanelProps = {
  statusMeta: StatusMeta;
  reportStatus?: ReportStatus | null;
  reportStatusLoading: boolean;
  verificationLoading: boolean;
  canManagePmReview: boolean;
  pontajVerified: number;
  pontajTotal: number;
  raportVerified: number;
  raportTotal: number;
  livrabileMatched: number;
  livrabileTotal: number;
  unresolvedIssues: number;
  onSetInReview: () => void;
  onRequestClarifications: () => void;
  onRejectMonth: () => void;
  onApproveMonth: () => void;
  onToggleExpertAccess: () => void;
  onOpenPmExceptionDialog: () => void;
};

function VerificationBadge({ value, total }: { value: number; total: number }) {
  const complete = total > 0 && value === total;
  return <Badge variant={complete ? 'default' : 'secondary'}>{value}/{total}</Badge>;
}

export function PmStatusPanel({
  statusMeta,
  reportStatus,
  reportStatusLoading,
  verificationLoading,
  canManagePmReview,
  pontajVerified,
  pontajTotal,
  raportVerified,
  raportTotal,
  livrabileMatched,
  livrabileTotal,
  unresolvedIssues,
  onSetInReview,
  onRequestClarifications,
  onRejectMonth,
  onApproveMonth,
  onToggleExpertAccess,
  onOpenPmExceptionDialog,
}: PmStatusPanelProps) {
  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 py-5">
        <div className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Eye className="h-4 w-4 text-primary" />
                Control status lună
                {(reportStatusLoading || verificationLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Verificări operaționale, acces expert și acțiuni PM pentru luna selectată.
              </p>
            </div>

            {canManagePmReview && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onSetInReview}>
                  <Eye className="h-4 w-4" />
                  În verificare
                </Button>
                <Button variant="outline" size="sm" onClick={onRequestClarifications}>
                  <MessageSquare className="h-4 w-4" />
                  Cere clarificări
                </Button>
                <Button variant="outline" size="sm" onClick={onRejectMonth}>
                  <XCircle className="h-4 w-4" />
                  Respinge
                </Button>
                <Button size="sm" onClick={onApproveMonth}>
                  <CheckCircle className="h-4 w-4" />
                  Aprobă luna
                </Button>
                <Button variant="outline" size="sm" onClick={onToggleExpertAccess}>
                  <FolderOpen className="h-4 w-4" />
                  {reportStatus?.expertAccessApproved ? 'Revocă acces expert' : 'Permite acces expert'}
                </Button>
                <Button variant="outline" size="sm" onClick={onOpenPmExceptionDialog}>
                  <FileWarning className="h-4 w-4" />
                  Adaugă CO/CM/Altele
                </Button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Status lună</p>
              <Badge className="mt-2" variant={statusMeta.variant}>{statusMeta.label}</Badge>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Acces expert</p>
              <Badge className="mt-2" variant={reportStatus?.expertAccessApproved ? 'default' : 'secondary'}>
                {reportStatus?.expertAccessApproved ? 'Permis' : 'Blocat'}
              </Badge>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Pontaj verificat</p>
              <div className="mt-2"><VerificationBadge value={pontajVerified} total={pontajTotal} /></div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Raport verificat</p>
              <div className="mt-2"><VerificationBadge value={raportVerified} total={raportTotal} /></div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Livrabile verificate</p>
              <div className="mt-2"><VerificationBadge value={livrabileMatched} total={livrabileTotal} /></div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Neconformități nerezolvate</p>
              <Badge className="mt-2" variant={unresolvedIssues > 0 ? 'destructive' : 'secondary'}>
                {unresolvedIssues}
              </Badge>
            </div>
          </div>

          {reportStatus?.pmNotes && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                <AlertCircle className="h-4 w-4 text-primary" />
                Observații status
              </div>
              {reportStatus.pmNotes}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
