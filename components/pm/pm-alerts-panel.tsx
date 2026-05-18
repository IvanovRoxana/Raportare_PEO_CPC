import type React from 'react';
import { AlertCircle, CheckCircle2, FileWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isActivitySuggestionRelation } from '@/lib/document-sharing';
import type { Activity, DashboardComplianceRow, DocumentMetadata, Expert, Neconformitate, SharedDeliverable } from '@/lib/types';

type PendingSharedDeliverable = {
  relation: SharedDeliverable;
  document?: DocumentMetadata;
  sourceExpert?: Expert;
  targetExpert?: Expert;
};

type PmAlertsPanelProps = {
  titleIssues: DocumentMetadata[];
  pendingSharedDeliverables: PendingSharedDeliverable[];
  eventDocumentIssues: Activity[];
  unresolvedNeconformitati: Neconformitate[];
  dashboardRows: DashboardComplianceRow[];
};

export function PmAlertsPanel({
  titleIssues,
  pendingSharedDeliverables,
  eventDocumentIssues,
  unresolvedNeconformitati,
  dashboardRows,
}: PmAlertsPanelProps) {
  const complianceRowsWithIssues = dashboardRows.filter(
    (row) =>
      row.hasDailyLimitIssue ||
      row.hasMonthlyNormIssue ||
      row.hasProjectNormIssue ||
      row.missingActivityDays.length > 0 ||
      row.blockedDays.length > 0,
  );

  const alertCount =
    titleIssues.length +
    pendingSharedDeliverables.length +
    eventDocumentIssues.length +
    unresolvedNeconformitati.length +
    complianceRowsWithIssues.length;

  return (
    <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            {alertCount > 0 ? <AlertCircle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
            Atenție PM
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Semnale agregate din documente, livrabile comune, neconformități și rândurile dashboard-ului.
          </p>
        </div>
        <Badge variant={alertCount > 0 ? 'destructive' : 'secondary'}>{alertCount} alerte</Badge>
      </div>

      {alertCount === 0 ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-medium text-foreground">
          Nu sunt alerte critice pentru luna selectată.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {titleIssues.length > 0 && (
            <AlertCard title={`Documente cu title_mismatch (${titleIssues.length})`} tone="destructive">
              {titleIssues.slice(0, 4).map((document) => (
                <div key={document.id}>{document.declaredTitle || document.originalFileName}</div>
              ))}
            </AlertCard>
          )}

          {eventDocumentIssues.length > 0 && (
            <AlertCard title={`Evenimente fără MOM sau dovadă eveniment (${eventDocumentIssues.length})`} tone="warning">
              {eventDocumentIssues.slice(0, 4).map((activity) => (
                <div key={activity.id}>{activity.date} - {activity.expertName}: {activity.title || activity.activityType}</div>
              ))}
            </AlertCard>
          )}

          {pendingSharedDeliverables.length > 0 && (
            <AlertCard title={`Activități/livrabile comune de verificat (${pendingSharedDeliverables.length})`} tone="warning">
              <div className="grid gap-2">
                {pendingSharedDeliverables.slice(0, 4).map(({ relation, document, sourceExpert, targetExpert }) => (
                  <div key={relation.id} className="rounded-md border bg-background/70 p-3">
                    <div className="font-medium">
                      {isActivitySuggestionRelation(relation)
                        ? 'Sugestie activitate comună'
                        : document?.declaredTitle || document?.suggestedTitle || document?.originalFileName || relation.documentId}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isActivitySuggestionRelation(relation)
                        ? `Sugerată de ${sourceExpert?.name || relation.sourceExpertId} pentru ${targetExpert?.name || relation.targetExpertId}`
                        : `Încărcat de ${sourceExpert?.name || relation.sourceExpertId} pentru ${targetExpert?.name || relation.targetExpertId}`}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {document?.projectId && <Badge variant="outline">{document.projectId}</Badge>}
                      {document?.saCode && <Badge variant="outline">{document.saCode}</Badge>}
                      {document?.activityDate && <Badge variant="outline">{document.activityDate}</Badge>}
                      <Badge variant={relation.status === 'ignored_by_target' ? 'outline' : 'secondary'}>{relation.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </AlertCard>
          )}

          {unresolvedNeconformitati.length > 0 && (
            <AlertCard title={`Neconformități nerezolvate (${unresolvedNeconformitati.length})`} tone="destructive">
              {unresolvedNeconformitati.slice(0, 4).map((item) => (
                <div key={item.id}>{item.description || item.type || item.id}</div>
              ))}
            </AlertCard>
          )}

          {complianceRowsWithIssues.length > 0 && (
            <AlertCard title={`Normă/ore/zile lipsă (${complianceRowsWithIssues.length})`} tone="warning">
              {complianceRowsWithIssues.slice(0, 5).map((row) => (
                <div key={row.expertId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.expertName}</span>
                  {row.hasDailyLimitIssue && <Badge variant="outline">8h/zi</Badge>}
                  {row.hasMonthlyNormIssue && <Badge variant="outline">normă lunară</Badge>}
                  {row.hasProjectNormIssue && <Badge variant="outline">normă proiect</Badge>}
                  {row.missingActivityDays.length > 0 && <Badge variant="outline">{row.missingActivityDays.length} zile lipsă</Badge>}
                  {row.blockedDays.length > 0 && <Badge variant="outline">{row.blockedDays.length} zile blocate</Badge>}
                </div>
              ))}
            </AlertCard>
          )}
        </div>
      )}
    </section>
  );
}

function AlertCard({ title, tone, children }: { title: string; tone: 'warning' | 'destructive'; children: React.ReactNode }) {
  const toneClasses =
    tone === 'destructive'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100';

  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 font-semibold">
        <FileWarning className="h-4 w-4" />
        {title}
      </div>
      <div className="mt-3 space-y-2 text-sm text-foreground/90">{children}</div>
    </div>
  );
}
