'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import {
  getPmDeliverableStatus,
  PM_DELIVERABLE_STATUS_LABELS,
  type PmDeliverableStatus,
} from '@/lib/pm-deliverable-status';
import { buildPmDeliverablesViewModel, type PmDeliverableFilterId } from '@/lib/pm-deliverables-view';
import type { DocumentMetadata, Expert } from '@/lib/types';
import type { PmWorkspaceProps } from './pm-workspace';

function deliverableStatusClass(status: PmDeliverableStatus) {
  if (status === 'approved' || status === 'pm_unlocked' || status === 'auto_resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarifications') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'sent') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'ineligible') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
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
  const registry = buildPmDeliverablesViewModel({
    experts: props.experts,
    documents: props.documents,
    filter,
  });

  const openDocumentFile = async (document: DocumentMetadata) => {
    setDocumentActionId(document.id);
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
                return (
                  <tr key={doc.id}>
                    <td className="px-4 py-3 font-semibold">{doc.declaredTitle || doc.extractedTitle || doc.originalFileName}</td>
                    <td>{doc.deliverableType || 'Document'}</td>
                    <td>{doc.uploadDate?.slice(0, 10) || '-'}</td>
                    <td>
                      <Badge variant="outline" className={deliverableStatusClass(status)}>
                        {PM_DELIVERABLE_STATUS_LABELS[status]}
                      </Badge>
                    </td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => openDocumentFile(doc)} disabled={documentActionId !== null}>
                        <FileText className="h-4 w-4" />
                        {documentActionId === doc.id ? 'Se deschide...' : 'Deschide fișier'}
                      </Button>
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
