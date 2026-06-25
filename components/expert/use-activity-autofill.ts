'use client';

import { useCallback, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import type {
  ActivityAutofillCatalogCandidate,
  ActivityAutofillDeliverable,
  ActivityAutofillSuggestion,
} from '@/lib/activity-autofill';

interface UseActivityAutofillParams {
  catalogCandidates: ActivityAutofillCatalogCandidate[];
  category?: string;
  deliverables: ActivityAutofillDeliverable[];
  expertId: string;
  expertName: string;
  expertRole?: string;
  month: number;
  onApplySuggestion: (suggestion: ActivityAutofillSuggestion) => void;
  projectCode?: string;
  selectedDates: string[];
  year: number;
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

export function useActivityAutofill({
  catalogCandidates,
  category,
  deliverables,
  expertId,
  expertName,
  expertRole,
  month,
  onApplySuggestion,
  projectCode,
  selectedDates,
  year,
}: UseActivityAutofillParams) {
  const [isAutofillingActivity, setIsAutofillingActivity] = useState(false);
  const [activityAutofillSuggestion, setActivityAutofillSuggestion] = useState<ActivityAutofillSuggestion | null>(null);
  const [activityAutofillError, setActivityAutofillError] = useState<string | null>(null);

  const activityAutofillUnavailableMessage = deliverables.length === 0
    ? 'Incarca un PDF/DOC/DOCX sau o imagine scanata; aplicatia va extrage textul nativ sau OCR pentru autocompletare.'
    : catalogCandidates.length === 0
      ? 'Nu exista activitati de catalog disponibile pentru rolul curent.'
      : null;

  const suggestActivityFromDeliverables = useCallback(async () => {
    if (activityAutofillUnavailableMessage) return;

    setIsAutofillingActivity(true);
    setActivityAutofillError(null);
    setActivityAutofillSuggestion(null);

    try {
      const headers = await getJsonAuthHeaders();
      const response = await fetch('/api/ai/suggest-activity-from-deliverables', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deliverables,
          catalogCandidates,
          expertName,
          expertId,
          expertRole,
          category,
          projectCode,
          month,
          year,
          selectedDates,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Autocompletarea activitatii a esuat.');
      }

      setActivityAutofillSuggestion(data);
    } catch (error) {
      setActivityAutofillError(error instanceof Error ? error.message : 'Eroare la autocompletarea activitatii.');
    } finally {
      setIsAutofillingActivity(false);
    }
  }, [
    activityAutofillUnavailableMessage,
    catalogCandidates,
    category,
    deliverables,
    expertId,
    expertName,
    expertRole,
    month,
    projectCode,
    selectedDates,
    year,
  ]);

  const markActivityAutofillSuggestionApplied = useCallback((suggestion: ActivityAutofillSuggestion) => {
    if (!suggestion.modelAuditId) return;

    void (async () => {
      const headers = await getJsonAuthHeaders();
      await fetch('/api/ai/suggest-activity-from-deliverables/applied', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          modelAuditId: suggestion.modelAuditId,
          finalSaCode: suggestion.recommended.saCode,
          finalActivityName: suggestion.recommended.activityName,
          finalDescriptionPreview: suggestion.recommended.description.slice(0, 500),
        }),
      });
    })().catch((error) => {
      console.warn('Nu s-a putut marca auditul AI ca aplicat.', error);
    });
  }, []);

  const applyActivityAutofillSuggestion = useCallback(() => {
    if (!activityAutofillSuggestion) return;

    const catalogMatch = catalogCandidates.find((candidate) => (
      candidate.saCode === activityAutofillSuggestion.recommended.saCode
      && candidate.activityName === activityAutofillSuggestion.recommended.activityName
    ));

    if (!catalogMatch) {
      setActivityAutofillError('Sugestia nu mai exista in catalogul disponibil pentru rolul curent.');
      return;
    }

    onApplySuggestion(activityAutofillSuggestion);
    setActivityAutofillError(null);
    setActivityAutofillSuggestion(null);
    markActivityAutofillSuggestionApplied(activityAutofillSuggestion);
  }, [
    activityAutofillSuggestion,
    catalogCandidates,
    markActivityAutofillSuggestionApplied,
    onApplySuggestion,
  ]);

  return {
    activityAutofillError,
    activityAutofillSuggestion,
    activityAutofillUnavailableMessage,
    applyActivityAutofillSuggestion,
    isAutofillingActivity,
    suggestActivityFromDeliverables,
  };
}
