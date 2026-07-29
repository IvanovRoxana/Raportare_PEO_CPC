import { AlertTriangle, CheckCircle2, FileWarning, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { buildPmDashboardSummary } from '@/lib/pm-dashboard';

type PmSummary = ReturnType<typeof buildPmDashboardSummary>;

type DashboardTotals = {
  totalHours: number;
  totalRemaining: number;
  missingDays: number;
  blockedDays: number;
  issues: number;
};

type PmDashboardKpiCardsProps = {
  hasExtendedExpertAccess: boolean;
  pmSummary: PmSummary;
  dashboardTotals: DashboardTotals;
  titleIssuesCount: number;
  pmUnlockRequestsCount: number;
  pendingSharedDeliverablesCount: number;
  eventDocumentIssuesCount: number;
  openClarificationsCount?: number;
  answeredClarificationsCount?: number;
  resolvedClarificationsCount?: number;
  onOpenDocumentAlerts?: () => void;
  onOpenProblems?: () => void;
  onOpenClarifications?: () => void;
};

export function PmDashboardKpiCards({
  hasExtendedExpertAccess,
  pmSummary,
  dashboardTotals,
  titleIssuesCount,
  pmUnlockRequestsCount,
  pendingSharedDeliverablesCount,
  eventDocumentIssuesCount,
  openClarificationsCount = pmSummary.openClarificationsCount,
  answeredClarificationsCount = pmSummary.answeredClarificationsCount,
  resolvedClarificationsCount = pmSummary.resolvedClarificationsCount,
  onOpenDocumentAlerts,
  onOpenProblems,
  onOpenClarifications,
}: PmDashboardKpiCardsProps) {
  const documentAlertsCount = titleIssuesCount + pmUnlockRequestsCount + pendingSharedDeliverablesCount + eventDocumentIssuesCount;
  const cards = [
    {
      label: hasExtendedExpertAccess ? 'Experti monitorizati' : 'Raportare vizibila',
      value: pmSummary.totalExperts,
      helper: `Draft ${pmSummary.statusCounts.draft} / Trimis ${pmSummary.statusCounts.sent} / In verificare ${pmSummary.statusCounts.in_review} / Aprobat ${pmSummary.statusCounts.approved}`,
      icon: Users,
    },
    {
      label: 'Raportari de verificat',
      value: pmSummary.statusCounts.sent + pmSummary.statusCounts.in_review,
      helper: `Trimise ${pmSummary.statusCounts.sent} / in verificare ${pmSummary.statusCounts.in_review}`,
      icon: ShieldCheck,
    },
    {
      label: 'Clarificari',
      value: openClarificationsCount,
      helper: `Raspunsuri ${answeredClarificationsCount} / rezolvate ${resolvedClarificationsCount}`,
      icon: MessageSquare,
      warning: openClarificationsCount > 0,
      onClick: onOpenClarifications,
    },
    {
      label: 'Aprobate',
      value: pmSummary.statusCounts.approved,
      helper: `${pmSummary.statusCounts.rejected} respinse / ${pmSummary.statusCounts.clarifications} cu clarificari`,
      icon: CheckCircle2,
    },
    {
      label: 'Alerte documente',
      value: documentAlertsCount,
      helper: `Titlu ${titleIssuesCount} / deblocari ${pmUnlockRequestsCount} / comune ${pendingSharedDeliverablesCount} / evenimente ${eventDocumentIssuesCount}`,
      icon: FileWarning,
      warning: documentAlertsCount > 0,
      onClick: onOpenDocumentAlerts,
    },
    {
      label: 'Probleme',
      value: pmSummary.problemCount + dashboardTotals.issues,
      helper: `Norme ${dashboardTotals.issues} / documente ${pmSummary.documentAlertsCount} / cross ${pmSummary.crossAlignmentIssues}`,
      icon: AlertTriangle,
      warning: pmSummary.problemCount + dashboardTotals.issues > 0,
      onClick: onOpenProblems,
    },
  ];

  return (
    <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {cards.map(({ label, value, helper, icon: Icon, warning, onClick }) => (
        <Card
          key={label}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onClick={onClick}
          onKeyDown={(event) => {
            if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            onClick();
          }}
          className={`overflow-hidden py-0 ${onClick ? 'cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
              </div>
              <div className="rounded-2xl border bg-muted/40 p-2 text-primary">
                {warning ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Icon className="h-5 w-5" />}
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{helper}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
