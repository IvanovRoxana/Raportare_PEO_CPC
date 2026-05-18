import { AlertTriangle, CalendarX, Clock3, FileWarning, LockKeyhole, Users } from 'lucide-react';
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
  pendingSharedDeliverablesCount: number;
  eventDocumentIssuesCount: number;
};

export function PmDashboardKpiCards({
  hasExtendedExpertAccess,
  pmSummary,
  dashboardTotals,
  titleIssuesCount,
  pendingSharedDeliverablesCount,
  eventDocumentIssuesCount,
}: PmDashboardKpiCardsProps) {
  const cards = [
    {
      label: hasExtendedExpertAccess ? 'Experți monitorizați' : 'Raportare vizibilă',
      value: pmSummary.totalExperts,
      helper: `Draft ${pmSummary.statusCounts.draft} / Trimis ${pmSummary.statusCounts.sent} / Aprobat ${pmSummary.statusCounts.approved}`,
      icon: Users,
    },
    {
      label: 'Ore pontate',
      value: `${dashboardTotals.totalHours}h`,
      helper: `Rămase ${dashboardTotals.totalRemaining}h • ${dashboardTotals.issues} experți cu norme de verificat`,
      icon: Clock3,
    },
    {
      label: 'Zile fără activitate',
      value: dashboardTotals.missingDays,
      helper: 'Total zile lucrătoare fără pontaj în luna selectată',
      icon: CalendarX,
    },
    {
      label: 'Zile blocate',
      value: dashboardTotals.blockedDays,
      helper: 'Zile cu limită zilnică atinsă sau depășită',
      icon: LockKeyhole,
    },
    {
      label: 'Alerte documente',
      value: titleIssuesCount + pendingSharedDeliverablesCount + eventDocumentIssuesCount,
      helper: `Titlu ${titleIssuesCount} / comune ${pendingSharedDeliverablesCount} / evenimente ${eventDocumentIssuesCount}`,
      icon: FileWarning,
      warning: titleIssuesCount + pendingSharedDeliverablesCount + eventDocumentIssuesCount > 0,
    },
  ];

  return (
    <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ label, value, helper, icon: Icon, warning }) => (
        <Card key={label} className="overflow-hidden py-0">
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
