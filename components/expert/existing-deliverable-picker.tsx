'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateRo } from '@/lib/app-utils';
import type { DeliverableSlot } from '@/lib/deliverable-types';

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
  candidates: ExistingDeliverableCandidate[];
  mineCount: number;
  onAttach: (candidate: ExistingDeliverableCandidate) => void;
  onQueryChange: (query: string) => void;
  onSourceChange: (source: ExistingDeliverableSource) => void;
  query: string;
  sharedCount: number;
  source: ExistingDeliverableSource;
}

export function ExistingDeliverablePicker({
  candidates,
  mineCount,
  onAttach,
  onQueryChange,
  onSourceChange,
  query,
  sharedCount,
  source,
}: ExistingDeliverablePickerProps) {
  return (
    <div className="mb-3 rounded-md border bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-md border bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => onSourceChange('mine')}
            className={`rounded px-2.5 py-1 text-xs font-medium ${source === 'mine' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Ale mele ({mineCount})
          </button>
          <button
            type="button"
            onClick={() => onSourceChange('shared')}
            className={`rounded px-2.5 py-1 text-xs font-medium ${source === 'shared' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Comune ({sharedCount})
          </button>
        </div>
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Cauta titlu, fisier, SA"
          className="h-8 text-xs sm:max-w-64"
        />
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto rounded-md border">
        {candidates.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nu exista livrabile disponibile pentru filtrul curent.
          </div>
        ) : (
          candidates.map((candidate) => (
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
                onClick={() => onAttach(candidate)}
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
