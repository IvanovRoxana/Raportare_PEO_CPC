'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateRo } from '@/lib/app-utils';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { DeliverableSlot } from '@/lib/deliverable-types';
import type { Activity, DocumentMetadata } from '@/lib/types';

export type ExistingDeliverableSource = 'mine' | 'shared';

export interface ExistingDeliverableCandidate {
  key: string;
  source: ExistingDeliverableSource;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentId?: string;
  s3Bucket?: string;
  s3Key?: string;
  fileHash?: string;
  firstPageTextHash?: string;
  contentFingerprint?: string;
  uploadedByExpertId?: string;
  uploadedByExpertName?: string;
  uploadDate?: string;
  sourceActivityId?: string;
  activityDate?: string;
  saCode?: string;
  deliverableType?: string;
  declaredTitle?: string;
  docTitle?: string;
  docText?: string | null;
  suggestedTitle?: string | null;
  firstPageText?: string | null;
  titleSuggestionConfidence?: string;
  titleSuggestionAlternatives?: string[];
  titleSuggestionReason?: string;
  titleSource?: string;
  titleMatch?: boolean | null;
  titleConfirmed?: boolean;
  titleCheckStatus?: string;
  titleCheckMessage?: string;
  eligibilityCheck?: DeliverableSlot['eligibilityCheck'];
  isCommonDeliverable?: boolean;
  aiStatus?: string;
  aiReason?: string;
}

interface ExistingDeliverablePickerProps {
  activities: Activity[];
  attachedDeliverables: DeliverableSlot[];
  currentExpertId: string;
  documents: DocumentMetadata[];
  excludedActivityId?: string;
  month: number;
  onAttach: (candidate: ExistingDeliverableCandidate) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  year: number;
}

export function ExistingDeliverablePicker({
  activities,
  attachedDeliverables,
  currentExpertId,
  documents,
  excludedActivityId,
  month,
  onAttach,
  onOpenChange,
  open,
  year,
}: ExistingDeliverablePickerProps) {
  const [source, setSource] = useState<ExistingDeliverableSource>('mine');
  const [query, setQuery] = useState('');

  const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const attachedDeliverableKeys = useMemo(() => new Set(
    attachedDeliverables
      .map((deliverable) => deliverable.documentId || deliverable.s3Key || deliverable.filePath || deliverable.filename || deliverable.name)
      .filter((key): key is string => Boolean(key)),
  ), [attachedDeliverables]);

  const candidates = useMemo<ExistingDeliverableCandidate[]>(() => {
    const nextCandidates = new Map<string, ExistingDeliverableCandidate>();

    const addCandidate = (candidate: ExistingDeliverableCandidate) => {
      const monthKey = (candidate.activityDate || candidate.uploadDate || '').slice(0, 7);
      if (monthKey && monthKey !== currentMonthKey) return;
      if (attachedDeliverableKeys.has(candidate.key)) return;
      if (candidate.documentId && attachedDeliverableKeys.has(candidate.documentId)) return;
      if (candidate.s3Key && attachedDeliverableKeys.has(candidate.s3Key)) return;
      if (!candidate.documentId && !candidate.s3Key && !candidate.fileName) return;

      nextCandidates.set(candidate.key, candidate);
    };

    activities.forEach((activity) => {
      if (activity.id === excludedActivityId) return;

      (activity.deliverables ?? []).forEach((deliverable) => {
        const fileName = deliverable.originalFileName || deliverable.fileName;
        const key = deliverable.documentId || deliverable.s3Key || deliverable.filePath || `${activity.id}:${deliverable.id}`;
        const ownerId = deliverable.uploadedByExpertId || activity.expertId;
        const isMine = ownerId === currentExpertId;
        const isShared = !isMine && Boolean(
          deliverable.isCommonDeliverable
          || deliverable.sharedWithExpertIds?.includes(currentExpertId)
          || activity.takenByExperts?.includes(currentExpertId)
          || activity.shareStatus === 'shared',
        );
        if (!isMine && !isShared) return;

        addCandidate({
          key,
          source: isMine ? 'mine' : 'shared',
          title: getDocumentAuditTitle(deliverable),
          fileName,
          fileType: deliverable.fileType || '',
          fileSize: deliverable.fileSize || 0,
          documentId: deliverable.documentId,
          s3Bucket: deliverable.s3Bucket,
          s3Key: deliverable.s3Key || deliverable.filePath,
          fileHash: deliverable.fileHash,
          firstPageTextHash: deliverable.firstPageTextHash,
          contentFingerprint: deliverable.contentFingerprint,
          uploadedByExpertId: ownerId,
          uploadedByExpertName: deliverable.uploadedByExpertName || activity.expertName,
          uploadDate: deliverable.uploadedAt,
          sourceActivityId: deliverable.sourceActivityId || activity.id,
          activityDate: deliverable.activityDate || activity.date,
          saCode: deliverable.saCode || activity.saCode,
          deliverableType: deliverable.deliverableType,
          declaredTitle: deliverable.declaredTitle,
          docTitle: deliverable.docTitle,
          docText: deliverable.docText,
          suggestedTitle: deliverable.suggestedTitle,
          firstPageText: deliverable.firstPageText,
          titleSuggestionConfidence: deliverable.titleSuggestionConfidence,
          titleSuggestionAlternatives: deliverable.titleSuggestionAlternatives,
          titleSuggestionReason: deliverable.titleSuggestionReason,
          titleSource: deliverable.titleSource,
          titleMatch: deliverable.titleMatch,
          titleConfirmed: deliverable.titleConfirmed,
          titleCheckStatus: deliverable.titleCheckStatus,
          titleCheckMessage: deliverable.titleCheckMessage,
          eligibilityCheck: deliverable.eligibilityCheck,
          isCommonDeliverable: deliverable.isCommonDeliverable,
          aiStatus: deliverable.aiStatus,
          aiReason: deliverable.aiReason,
        });
      });
    });

    documents.forEach((document) => {
      const isMine = document.uploadedByExpertId === currentExpertId;
      const isShared = !isMine && document.isCommonDeliverable === true;
      if (!isMine && !isShared) return;

      const key = document.id || document.s3Key;
      addCandidate({
        key,
        source: isMine ? 'mine' : 'shared',
        title: document.declaredTitle || document.extractedTitle || document.suggestedTitle || document.originalFileName,
        fileName: document.originalFileName,
        fileType: document.mimeType || '',
        fileSize: document.fileSize || 0,
        documentId: document.id,
        s3Bucket: document.s3Bucket,
        s3Key: document.s3Key,
        fileHash: document.fileHash,
        firstPageTextHash: document.firstPageTextHash,
        contentFingerprint: document.contentFingerprint,
        uploadedByExpertId: document.uploadedByExpertId,
        uploadedByExpertName: document.uploadedByExpertName,
        uploadDate: document.uploadDate,
        sourceActivityId: document.sourceActivityId,
        activityDate: document.activityDate,
        saCode: document.saCode,
        deliverableType: document.deliverableType,
        declaredTitle: document.declaredTitle,
        docTitle: document.extractedTitle,
        suggestedTitle: document.suggestedTitle,
        titleSuggestionConfidence: document.titleSuggestionConfidence,
        titleSuggestionAlternatives: document.titleSuggestionAlternatives,
        titleSuggestionReason: document.titleSuggestionReason,
        titleMatch: document.titleMatch,
        titleConfirmed: document.titleCheckStatus === 'matched',
        titleCheckStatus: document.titleCheckStatus,
        eligibilityCheck: document.eligibilityCheck,
        isCommonDeliverable: document.isCommonDeliverable,
      });
    });

    return Array.from(nextCandidates.values()).sort((first, second) =>
      (second.activityDate || second.uploadDate || '').localeCompare(first.activityDate || first.uploadDate || ''),
    );
  }, [activities, attachedDeliverableKeys, currentExpertId, currentMonthKey, documents, excludedActivityId]);

  const mineCount = candidates.filter((candidate) => candidate.source === 'mine').length;
  const sharedCount = candidates.filter((candidate) => candidate.source === 'shared').length;
  const visibleCandidates = candidates
    .filter((candidate) => candidate.source === source)
    .filter((candidate) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return true;
      return [
        candidate.title,
        candidate.fileName,
        candidate.uploadedByExpertName,
        candidate.saCode,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 8);

  const attachCandidate = (candidate: ExistingDeliverableCandidate) => {
    onAttach(candidate);
    setQuery('');
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="mb-3 rounded-md border bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-md border bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setSource('mine')}
            className={`rounded px-2.5 py-1 text-xs font-medium ${source === 'mine' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Ale mele ({mineCount})
          </button>
          <button
            type="button"
            onClick={() => setSource('shared')}
            className={`rounded px-2.5 py-1 text-xs font-medium ${source === 'shared' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Comune ({sharedCount})
          </button>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cauta titlu, fisier, SA"
          className="h-8 text-xs sm:max-w-64"
        />
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto rounded-md border">
        {visibleCandidates.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nu exista livrabile disponibile pentru filtrul curent.
          </div>
        ) : (
          visibleCandidates.map((candidate) => (
            <div key={candidate.key} className="flex flex-col gap-2 border-b px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {candidate.title || candidate.fileName}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{candidate.fileName}</span>
                  {candidate.activityDate && <span>{formatDateRo(candidate.activityDate)}</span>}
                  {candidate.saCode && <span>{candidate.saCode}</span>}
                  {candidate.uploadedByExpertName && <span>{candidate.uploadedByExpertName}</span>}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => attachCandidate(candidate)}
              >
                Ataseaza
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
