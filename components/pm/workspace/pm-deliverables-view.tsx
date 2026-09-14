'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileText, FolderOpen, MoreHorizontal, ShieldCheck, MessageSquare, Sparkles, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import {
  getPmDeliverableStatus,
  PM_DELIVERABLE_STATUS_LABELS,
  type PmDeliverableStatus,
} from '@/lib/pm-deliverable-status';
import {
  buildPmDeliverableActionModel,
  buildPmDeliverableActionModelForClarification,
  buildPmDeliverablesViewModel,
  buildPmDocumentClarificationState,
  type PmDeliverableAction,
  type PmDeliverableActionId,
  type PmDeliverableFilterId,
  type PmDocumentClarificationState,
  type PmDocumentClarificationStateId,
} from '@/lib/pm-deliverables-view';
import type { DocumentMetadata, Expert } from '@/lib/types';
import type { PmWorkspaceProps } from './pm-workspace';

function deliverableStatusClass(status: PmDeliverableStatus) {
  if (status === 'approved' || status === 'pm_unlocked' || status === 'auto_resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarifications') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'sent') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'ineligible') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function clarificationStateClass(state: PmDocumentClarificationStateId) {
  if (state === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'answered' || state === 'ready_to_resolve') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'realerted') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (state === 'requested') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function formatClarificationDetail(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function MiniAvatar({ expert }: { expert: Expert }) {
  return <ExpertAvatar expert={expert} className="h-7 w-7 bg-[#1f73d8] text-[10px] text-white" />;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border bg-white p-6 text-sm text-slate-500 shadow-sm">{text}</div>;
}

export function DeliverablesView(props: PmWorkspaceProps) {
  const [filter, setFilter] = useState<PmDeliverableFilterId>('all');
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const documentClarificationStates = useMemo(() => {
    const threadsByDocumentId = new Map(
      props.clarificationThreads
        .filter((thread) => (
          thread.targetType === 'document'
          && thread.month === props.selectedMonth
          && thread.year === props.selectedYear
        ))
        .map((thread) => [thread.targetId, thread])
    );
    const ticketsByDocumentId = new Map(
      (props.supportTickets || [])
        .filter((ticket) => (
          ticket.module === 'pm'
          && ticket.relatedDocumentId
          && ticket.selectedMonth === props.selectedMonth
          && ticket.selectedYear === props.selectedYear
        ))
        .map((ticket) => [ticket.relatedDocumentId as string, ticket])
    );

    return new Map(props.documents.map((document) => [
      document.id,
      buildPmDocumentClarificationState({
        document,
        thread: threadsByDocumentId.get(document.id),
        ticket: ticketsByDocumentId.get(document.id),
      }),
    ]));
  }, [props.clarificationThreads, props.documents, props.selectedMonth, props.selectedYear, props.supportTickets]);

  const registry = buildPmDeliverablesViewModel({
    experts: props.experts,
    documents: props.documents,
    filter,
    documentClarificationStates,
  });

  const openDocumentFile = async (document: DocumentMetadata) => {
    setDocumentActionId(`open_file-${document.id}`);
    const previewWindow = window.open('', '_blank');
    try {
      const result = await getSecureDocumentUrl(document);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error('Fișierul nu a putut fi deschis.');
      const objectUrl = URL.createObjectURL(await response.blob());
      if (previewWindow) previewWindow.location.href = objectUrl;
      else window.open(objectUrl, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      window.alert(error instanceof Error ? error.message : 'Fișierul nu a putut fi deschis.');
    } finally {
      setDocumentActionId(null);
    }
  };

  const openDocumentDossier = (document: DocumentMetadata, action: PmDeliverableAction) => {
    if (!document.uploadedByExpertId) return;
    props.onOpenDossierById(document.uploadedByExpertId, {
      documentId: document.id,
      activityId: document.sourceActivityId,
      issueType: action.issueType || 'problems',
    });
  };

  const runDocumentAction = async (
    document: DocumentMetadata,
    action: PmDeliverableAction,
    clarificationState?: PmDocumentClarificationState,
  ) => {
    if (action.id === 'open_file') {
      await openDocumentFile(document);
      return;
    }

    if (action.id === 'open_dossier' || action.id === 'view_ai_review') {
      openDocumentDossier(document, action);
      return;
    }

    setDocumentActionId(`${action.id}-${document.id}`);
    try {
      if (action.id === 'request_clarification') {
        await props.onRequestDocumentClarification(document);
      } else if (action.id === 'realert_clarification' && clarificationState?.thread) {
        await props.onRealertClarification(clarificationState.thread);
      } else if (action.id === 'realert_clarification') {
        await props.onRequestDocumentClarification(document);
      } else if (action.id === 'resolve_clarification') {
        await props.onResolveDocumentClarification(document, clarificationState?.thread);
      } else if (action.id === 'approve_pm_unlock') {
        await props.onApprovePmUnlock(document);
      } else if (action.id === 'mark_ineligible') {
        await props.onMarkDocumentIneligible(document);
      }
    } finally {
      setDocumentActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {registry.filters.map(({ id, label, count }) => (
            <Button key={id} size="sm" variant={filter === id ? 'default' : 'outline'} onClick={() => setFilter(id)}>
              {label}
              <span className="ml-1 text-[10px] opacity-70">{count}</span>
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{registry.filteredDocuments.length} livrabile</span>
          <Button size="sm" onClick={props.onDownloadTotalOpisXls} disabled={props.isExportingOpisTotal}>
            <Download className="h-4 w-4" />
            OPIS total XLS
          </Button>
        </div>
      </div>
      {registry.groups.length === 0 ? <EmptyState text="Nu există livrabile pentru filtrul selectat." /> : registry.groups.map(({ expert, documents }) => (
        <section key={expert.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <MiniAvatar expert={expert} />
              <div className="font-semibold">{expert.name}</div>
              <span className="text-xs text-slate-500">{expert.role}</span>
            </div>
            <Badge variant="secondary">{documents.length} livrabile</Badge>
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y">
              {documents.map((doc) => {
                const status = getPmDeliverableStatus(doc);
                const clarificationState = documentClarificationStates.get(doc.id);
                const actionModel = status === 'clarifications' && clarificationState
                  ? buildPmDeliverableActionModelForClarification(clarificationState)
                  : buildPmDeliverableActionModel(status);
                return (
                  <tr key={doc.id}>
                    <td className="px-4 py-3 font-semibold">{doc.declaredTitle || doc.extractedTitle || doc.originalFileName}</td>
                    <td>{doc.deliverableType || 'Document'}</td>
                    <td>{doc.uploadDate?.slice(0, 10) || '-'}</td>
                    <td>
                      <Badge variant="outline" className={deliverableStatusClass(status)}>
                        {PM_DELIVERABLE_STATUS_LABELS[status]}
                      </Badge>
                      {status === 'clarifications' && clarificationState ? (
                        <Badge variant="outline" className={`ml-2 ${clarificationStateClass(clarificationState.id)}`}>
                          {clarificationState.label}
                          {formatClarificationDetail(clarificationState.detail) ? (
                            <span className="ml-1 opacity-70">{formatClarificationDetail(clarificationState.detail)}</span>
                          ) : null}
                        </Badge>
                      ) : null}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={actionModel.primary.id === 'open_file' ? 'outline' : 'default'}
                          onClick={() => void runDocumentAction(doc, actionModel.primary, clarificationState)}
                          disabled={documentActionId !== null}
                        >
                          <DeliverableActionIcon id={actionModel.primary.id} />
                          {documentActionId === `${actionModel.primary.id}-${doc.id}` ? 'Se procesează...' : actionModel.primary.label}
                        </Button>
                        {actionModel.secondary.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" disabled={documentActionId !== null} aria-label="Mai multe acțiuni livrabil">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {actionModel.secondary.map((action) => (
                                <DropdownMenuItem key={action.id} onSelect={() => void runDocumentAction(doc, action, clarificationState)}>
                                  <DeliverableActionIcon id={action.id} />
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function DeliverableActionIcon({ id }: { id: PmDeliverableActionId }) {
  if (id === 'open_dossier') return <FolderOpen className="h-4 w-4" />;
  if (id === 'request_clarification') return <MessageSquare className="h-4 w-4" />;
  if (id === 'realert_clarification') return <MessageSquare className="h-4 w-4" />;
  if (id === 'resolve_clarification') return <CheckCircle2 className="h-4 w-4" />;
  if (id === 'approve_pm_unlock') return <ShieldCheck className="h-4 w-4" />;
  if (id === 'mark_ineligible') return <XCircle className="h-4 w-4" />;
  if (id === 'view_ai_review') return <Sparkles className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}
