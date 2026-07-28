import type React from 'react';
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Eye, FileWarning, FolderOpen, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import { getDocumentAuditTitle, isActivitySuggestionRelation } from '@/lib/document-sharing';
import { clarificationStatusLabel } from '@/lib/pm-clarification-flow';
import type { Activity, DashboardComplianceRow, DocumentMetadata, Expert, Neconformitate, PmClarificationThread, SharedDeliverable } from '@/lib/types';

type PendingSharedDeliverable = {
  relation: SharedDeliverable;
  document?: DocumentMetadata;
  sourceActivity?: Activity;
  sourceExpert?: Expert;
  targetExpert?: Expert;
};

type PmAlertsPanelProps = {
  titleIssues: DocumentMetadata[];
  pendingSharedDeliverables: PendingSharedDeliverable[];
  eventDocumentIssues: Activity[];
  unresolvedNeconformitati: Neconformitate[];
  dashboardRows: DashboardComplianceRow[];
  clarificationThreads?: PmClarificationThread[];
  activeAlertFilter?: 'title_mismatch' | 'shared_deliverables' | 'event_documents' | 'all';
  onOpenDossier?: (expertId: string, options?: { activityId?: string; documentId?: string; issueType?: string }) => void;
  onRequestDocumentClarification?: (document: DocumentMetadata) => void;
  onOpenProblemsForExpert?: (expertId: string) => void;
};

export function PmAlertsPanel({
  titleIssues,
  pendingSharedDeliverables,
  eventDocumentIssues,
  unresolvedNeconformitati,
  dashboardRows,
  clarificationThreads = [],
  activeAlertFilter = 'all',
  onOpenDossier,
  onRequestDocumentClarification,
  onOpenProblemsForExpert,
}: PmAlertsPanelProps) {
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
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
  const showTitleIssues = activeAlertFilter === 'all' || activeAlertFilter === 'title_mismatch';
  const showSharedDeliverables = activeAlertFilter === 'all' || activeAlertFilter === 'shared_deliverables';
  const showEventDocuments = activeAlertFilter === 'all' || activeAlertFilter === 'event_documents';
  const sharedDeliverableGroups = groupPendingSharedDeliverables(pendingSharedDeliverables.slice(0, 4));
  const documentClarificationById = new Map(
    clarificationThreads
      .filter((thread) => thread.targetType === 'document')
      .map((thread) => [thread.targetId, thread]),
  );

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const openDocument = async (documentMeta: DocumentMetadata) => {
    setDocumentActionId(`open-${documentMeta.id}`);
    const previewWindow = window.open('', '_blank');
    try {
      const result = await getSecureDocumentUrl(documentMeta);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error('Fisierul nu a putut fi deschis.');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = objectUrl;
      else window.open(objectUrl, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      window.alert(error instanceof Error ? error.message : 'Fisierul nu a putut fi deschis.');
    } finally {
      setDocumentActionId(null);
    }
  };

  const downloadDocument = async (documentMeta: DocumentMetadata) => {
    setDocumentActionId(`download-${documentMeta.id}`);
    try {
      const result = await getSecureDocumentUrl(documentMeta);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error('Fisierul nu a putut fi descarcat.');
      saveBlob(await response.blob(), result.fileName || documentMeta.originalFileName);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Fisierul nu a putut fi descarcat.');
    } finally {
      setDocumentActionId(null);
    }
  };

  return (
    <section id="pm-document-alerts" className="mb-6 scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            {alertCount > 0 ? <AlertCircle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
            Atentie PM
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Semnale agregate din documente, livrabile comune, neconformitati si randurile dashboard-ului.
          </p>
        </div>
        <Badge variant={alertCount > 0 ? 'destructive' : 'secondary'}>{alertCount} alerte</Badge>
      </div>

      {alertCount === 0 ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-medium text-foreground">
          Nu sunt alerte critice pentru luna selectata.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {showTitleIssues && titleIssues.length > 0 && (
            <AlertCard title={`Documente cu title_mismatch (${titleIssues.length})`} tone="destructive">
              {titleIssues.slice(0, 6).map((document) => {
                const clarificationThread = documentClarificationById.get(document.id);

                return (
                  <div key={document.id} className="rounded-md border bg-background/80 p-3 text-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{document.originalFileName}</span>
                          {clarificationThread && (
                            <Badge variant="secondary">{clarificationStatusLabel(clarificationThread.status)}</Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {document.uploadedByExpertName || document.uploadedByExpertId}
                          {document.activityDate ? ` / ${document.activityDate}` : ''}
                          {document.saCode ? ` / ${document.saCode}` : ''}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs">
                          <span>Denumire OPIS: {document.originalFileName}</span>
                          <span>Titlu detectat/declarat: {getDocumentAuditTitle(document)}</span>
                          {clarificationThread && (
                            <span className="line-clamp-2 text-foreground/80">
                              Clarificare PM: {clarificationThread.pmMessage}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openDocument(document)} disabled={documentActionId !== null}>
                          {documentActionId === `open-${document.id}` ? <FileWarning className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          Deschide
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadDocument(document)} disabled={documentActionId !== null}>
                          {documentActionId === `download-${document.id}` ? <FileWarning className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                          Descarca
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onRequestDocumentClarification?.(document)}>
                          <MessageSquare className="h-4 w-4" />
                          Cere clarificari
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onOpenDossier?.(document.uploadedByExpertId, { documentId: document.id, activityId: document.sourceActivityId, issueType: 'title_mismatch' })}>
                          <FolderOpen className="h-4 w-4" />
                          Dosar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </AlertCard>
          )}

          {showEventDocuments && eventDocumentIssues.length > 0 && (
            <AlertCard title={`Evenimente fara MOM sau dovada eveniment (${eventDocumentIssues.length})`} tone="warning">
              {eventDocumentIssues.slice(0, 4).map((activity) => (
                <div key={activity.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{activity.date} - {activity.expertName}: {activity.title || activity.activityType}</span>
                  <Button variant="outline" size="sm" onClick={() => onOpenDossier?.(activity.expertId, { activityId: activity.id, issueType: 'event_documents' })}>
                    <FolderOpen className="h-4 w-4" />
                    Dosar
                  </Button>
                </div>
              ))}
            </AlertCard>
          )}

          {showSharedDeliverables && pendingSharedDeliverables.length > 0 && (
            <AlertCard title={`Activitati/livrabile comune de verificat (${pendingSharedDeliverables.length})`} tone="warning">
              <div className="grid gap-3">
                {sharedDeliverableGroups.map((group) => (
                  <div key={group.label} className="grid gap-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{group.label}</div>
                    {group.items.map(({ relation, document, sourceActivity, sourceExpert, targetExpert }, index) => (
                      <div key={relation.id} className="rounded-md border bg-background/70 p-3">
                        <div className="flex items-start gap-2">
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full border bg-background text-xs font-semibold">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium">
                              {isActivitySuggestionRelation(relation)
                                ? 'Sugestie activitate comuna'
                                : document ? document.originalFileName : relation.documentId}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {isActivitySuggestionRelation(relation)
                                ? `Sugerata de ${sourceExpert?.name || relation.sourceExpertId} pentru ${targetExpert?.name || relation.targetExpertId}`
                                : `Incarcat de ${sourceExpert?.name || relation.sourceExpertId} pentru ${targetExpert?.name || relation.targetExpertId}`}
                            </div>
                            {getSharedActivitySummary({ relation, sourceActivity }) && (
                              <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/80">
                                {getSharedActivitySummary({ relation, sourceActivity })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {document?.projectId && <Badge variant="outline">{document.projectId}</Badge>}
                          {document?.saCode && <Badge variant="outline">{document.saCode}</Badge>}
                          {relation.sourceActivitySaCode && relation.sourceActivitySaCode !== document?.saCode && (
                            <Badge variant="outline">{relation.sourceActivitySaCode}</Badge>
                          )}
                          {document?.activityDate && <Badge variant="outline">{document.activityDate}</Badge>}
                          <Badge variant={relation.status === 'ignored_by_target' ? 'outline' : 'secondary'}>{relation.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {pendingSharedDeliverables.length > 4 && (
                  <div className="text-xs text-muted-foreground">
                    Se afiseaza primele 4 alerte; restul raman incluse in contor.
                  </div>
                )}
              </div>
            </AlertCard>
          )}

          {unresolvedNeconformitati.length > 0 && (
            <AlertCard title={`Neconformitati nerezolvate (${unresolvedNeconformitati.length})`} tone="destructive">
              {unresolvedNeconformitati.slice(0, 4).map((item) => (
                <div key={item.id}>{item.description || item.type || item.id}</div>
              ))}
            </AlertCard>
          )}

          {complianceRowsWithIssues.length > 0 && (
            <AlertCard title={`Norma/ore/zile lipsa (${complianceRowsWithIssues.length})`} tone="warning">
              {complianceRowsWithIssues.slice(0, 5).map((row) => (
                <div key={row.expertId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.expertName}</span>
                  {row.hasDailyLimitIssue && <Badge variant="outline">8h/zi</Badge>}
                  {row.hasMonthlyNormIssue && <Badge variant="outline">norma lunara</Badge>}
                  {row.hasProjectNormIssue && <Badge variant="outline">norma proiect</Badge>}
                  {row.missingActivityDays.length > 0 && <Badge variant="outline">{row.missingActivityDays.length} zile lipsa</Badge>}
                  {row.blockedDays.length > 0 && <Badge variant="outline">{row.blockedDays.length} zile blocate</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => onOpenProblemsForExpert?.(row.expertId)}>
                    <FolderOpen className="h-4 w-4" />
                    Vezi probleme
                  </Button>
                </div>
              ))}
            </AlertCard>
          )}
        </div>
      )}
    </section>
  );
}

function groupPendingSharedDeliverables(items: PendingSharedDeliverable[]) {
  const groups: Array<{ label: string; items: PendingSharedDeliverable[] }> = [];
  const groupByLabel = new Map<string, PendingSharedDeliverable[]>();

  items.forEach((item) => {
    const label = getSharedDeliverableWorkingGroup(item);
    const existingItems = groupByLabel.get(label);
    if (existingItems) {
      existingItems.push(item);
      return;
    }

    const groupedItems = [item];
    groupByLabel.set(label, groupedItems);
    groups.push({ label, items: groupedItems });
  });

  return groups;
}

function getSharedDeliverableWorkingGroup({ relation, document }: PendingSharedDeliverable) {
  const groupCode = relation.sourceActivitySaCode || document?.saCode || relation.projectId;
  return groupCode ? `Working group ${groupCode}` : 'Fara working group';
}

function getSharedActivitySummary({ relation, sourceActivity }: Pick<PendingSharedDeliverable, 'relation' | 'sourceActivity'>) {
  if (!isActivitySuggestionRelation(relation)) return null;

  return sourceActivity?.activitySummary
    || relation.sourceActivityDescription
    || sourceActivity?.description
    || relation.sourceActivityEventExtendedDescription
    || null;
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
