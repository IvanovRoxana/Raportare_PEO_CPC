'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  buildActivityAutofillDeliverablesPayload,
  type ActivityAutofillCatalogCandidate,
  type ActivityAutofillSuggestion,
} from '@/lib/activity-autofill';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { DeliverableSlot } from '@/lib/deliverable-types';
import type { ActivityCatalog, Expert } from '@/lib/types';

interface UseActivityAutofillParams {
  catalog: ActivityCatalog[];
  deliverables: DeliverableSlot[];
  expert?: Expert;
  expertId: string;
  expertName: string;
  month: number;
  selectedDates: string[];
  setActivityTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setDeliverables: Dispatch<SetStateAction<DeliverableSlot[]>>;
  setSaCode: (value: string) => void;
  year: number;
  onApplied?: (suggestion: ActivityAutofillSuggestion) => void;
}

async function getJsonAuthHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // AI endpoints still handle the no-token path; RAG retrieval/audit will be skipped server-side.
  }
  return headers;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? 'Serverul nu a returnat un raspuns pentru autocompletare.'
        : `Autocompletarea a esuat fara detalii de la server (${response.status}).`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Raspuns invalid de la server pentru autocompletare (${response.status}).`);
  }
}

export function useActivityAutofill({
  catalog,
  deliverables,
  expert,
  expertId,
  expertName,
  month,
  selectedDates,
  setActivityTitle,
  setDescription,
  setSaCode,
  year,
  onApplied,
}: UseActivityAutofillParams) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<ActivityAutofillSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autofillDeliverables = useMemo(() => (
    buildActivityAutofillDeliverablesPayload(deliverables.map((deliverable) => ({
      id: deliverable.id,
      fileName: deliverable.filename || deliverable.name,
      documentTitle: getDocumentAuditTitle({
        ...deliverable,
        fileName: deliverable.filename || deliverable.name,
        originalFileName: deliverable.filename || deliverable.name,
      }),
      deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
      stadiu: deliverable.stadiu,
      docText: deliverable.docText,
      firstPageText: deliverable.firstPageText,
      eligibilityStatus: deliverable.eligibilityCheck?.status,
      eligibilitySummary: deliverable.eligibilityCheck?.summary || deliverable.aiCheck?.reason,
    })))
  ), [deliverables]);

  const catalogCandidates = useMemo<ActivityAutofillCatalogCandidate[]>(() => (
    catalog.map((item) => ({
      id: item.id,
      category: item.category,
      saCode: item.saCode,
      serviceCategory: item.serviceCategory,
      activityNumber: item.activityNumber,
      activityName: item.activityName,
      description: item.description,
      objectives: item.objectives,
      serviceComponent: item.serviceComponent,
      beneficiaries: item.beneficiaries,
      expectedResults: item.expectedResults,
      deliverables: item.deliverables,
      indicators: item.indicators,
    }))
  ), [catalog]);

  const unavailableMessage = autofillDeliverables.length === 0
    ? 'Incarca un PDF/DOC/DOCX sau o imagine scanata; aplicatia va extrage textul nativ sau OCR pentru autocompletare.'
    : catalogCandidates.length === 0
      ? 'Nu exista activitati de catalog disponibile pentru rolul curent.'
      : null;

  const suggest = useCallback(async () => {
    if (unavailableMessage) {
      setError(unavailableMessage);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      const headers = await getJsonAuthHeaders();
      const response = await fetch('/api/ai/suggest-activity-from-deliverables', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deliverables: autofillDeliverables,
          catalogCandidates,
          expertName,
          expertId,
          expertRole: expert?.positionInProject || expert?.role,
          category: expert?.category,
          projectCode: expert?.projectCode,
          month,
          year,
          selectedDates,
        }),
      });

      const data = await readJsonResponse(response);
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Autocompletarea activitatii a esuat.');
      }

      setSuggestion(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Eroare la autocompletarea activitatii.');
    } finally {
      setIsLoading(false);
    }
  }, [
    autofillDeliverables,
    catalogCandidates,
    expert,
    expertId,
    expertName,
    month,
    selectedDates,
    unavailableMessage,
    year,
  ]);

  const markSuggestionApplied = useCallback((appliedSuggestion: ActivityAutofillSuggestion) => {
    if (!appliedSuggestion.modelAuditId) return;

    void (async () => {
      const headers = await getJsonAuthHeaders();
      await fetch('/api/ai/suggest-activity-from-deliverables/applied', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          modelAuditId: appliedSuggestion.modelAuditId,
          finalSaCode: appliedSuggestion.recommended.saCode,
          finalActivityName: appliedSuggestion.recommended.activityName,
          finalDescriptionPreview: appliedSuggestion.recommended.description.slice(0, 500),
        }),
      });
    })().catch((caughtError) => {
      console.warn('Nu s-a putut marca auditul AI ca aplicat.', caughtError);
    });
  }, []);

  const apply = useCallback(() => {
    if (!suggestion) return;

    const catalogMatch = catalogCandidates.find((candidate) => (
      candidate.saCode === suggestion.recommended.saCode
      && candidate.activityName === suggestion.recommended.activityName
    ));

    if (!catalogMatch) {
      setError('Sugestia nu mai exista in catalogul disponibil pentru rolul curent.');
      return;
    }

    setSaCode(suggestion.recommended.saCode);
    setActivityTitle(suggestion.recommended.activityName);
    setDescription(suggestion.recommended.description);
    setError(null);
    setSuggestion(null);
    onApplied?.(suggestion);
    markSuggestionApplied(suggestion);
  }, [
    catalogCandidates,
    markSuggestionApplied,
    onApplied,
    setActivityTitle,
    setDescription,
    setSaCode,
    suggestion,
  ]);

  const dismiss = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  return {
    suggestion,
    isLoading,
    error,
    suggest,
    apply,
    dismiss,
  };
}
