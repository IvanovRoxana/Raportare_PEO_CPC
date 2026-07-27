'use client';

import { useCallback, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  buildActivityAutofillDeliverablesPayload,
  buildFallbackActivityAutofillSuggestion,
  getActivityAutofillMissingSteps,
  type ActivityAutofillCatalogCandidate,
  type ActivityAutofillCollaborationContext,
  type ActivityAutofillSuggestion,
} from '@/lib/activity-autofill';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { DeliverableSlot } from '@/lib/deliverable-types';
import { isActivityAgentEnabledClient } from '@/lib/feature-flags';
import type { ActivityCatalog, Expert } from '@/lib/types';

interface UseActivityAutofillParams {
  catalog: ActivityCatalog[];
  deliverables: DeliverableSlot[];
  expert?: Expert;
  expertId: string;
  expertName: string;
  month: number;
  hours?: number;
  selectedActivityId?: string;
  saCode: string;
  activityName: string;
  currentDescription: string;
  selectedDates: string[];
  collaborationContext?: ActivityAutofillCollaborationContext;
  setDescription: (value: string) => void;
  setActivitySummary?: (value: string) => void;
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
        ? 'Serverul nu a returnat un raspuns pentru descrierea asistata.'
        : `Descrierea asistata a esuat fara detalii de la server (${response.status}).`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Raspuns invalid de la server pentru descrierea asistata (${response.status}).`);
  }
}

function isServerSideAutofillFailure(response: Response, data: unknown) {
  const code = typeof data === 'object' && data !== null ? String((data as { code?: unknown }).code ?? '') : '';
  return response.status >= 500 && code !== 'OPENAI_API_KEY_MISSING';
}

function getUnavailableMessage({
  uploadedDeliverablesCount,
  incompleteDeliverableSteps,
  autofillDeliverablesCount,
  saCode,
  activityName,
  collaborationContext,
  catalogCandidatesCount,
}: {
  uploadedDeliverablesCount: number;
  incompleteDeliverableSteps: string[];
  autofillDeliverablesCount: number;
  saCode: string;
  activityName: string;
  collaborationContext?: ActivityAutofillCollaborationContext;
  catalogCandidatesCount: number;
}) {
  if (uploadedDeliverablesCount === 0) {
    return 'Incarca sau ataseaza un PDF/DOC/DOCX ori o imagine scanata; aplicatia va extrage textul nativ sau OCR pentru descrierea asistata.';
  }
  if (incompleteDeliverableSteps.length > 0) {
    return `Finalizeaza cei patru pasi ai livrabilului: ${incompleteDeliverableSteps.join(', ')}.`;
  }
  if (autofillDeliverablesCount === 0) {
    return 'Livrabilul atasat nu are text extras/OCR disponibil pentru descrierea asistata. Reincarca documentul sau ruleaza extragerea textului.';
  }
  if (!saCode || !activityName) {
    return 'Selecteaza subactivitatea si activitatea inainte de rescrierea descrierii cu AI.';
  }
  if (collaborationContext?.isCommonActivity && collaborationContext.collaborators.length === 0) {
    return 'Selecteaza cel putin un colaborator pentru activitatea comuna inainte de generarea descrierii finale.';
  }
  if (catalogCandidatesCount === 0) {
    return 'Nu exista activitati de catalog disponibile pentru rolul curent.';
  }
  return null;
}

export function useActivityAutofill({
  catalog,
  deliverables,
  expert,
  expertId,
  expertName,
  month,
  hours,
  selectedActivityId,
  saCode,
  activityName,
  currentDescription,
  selectedDates,
  collaborationContext,
  setDescription,
  setActivitySummary,
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

  const incompleteDeliverableSteps = useMemo(
    () => getActivityAutofillMissingSteps(deliverables),
    [deliverables],
  );
  const uploadedDeliverablesCount = useMemo(
    () => deliverables.filter((deliverable) => deliverable.uploaded).length,
    [deliverables],
  );

  const unavailableMessage = getUnavailableMessage({
    uploadedDeliverablesCount,
    incompleteDeliverableSteps,
    autofillDeliverablesCount: autofillDeliverables.length,
    saCode,
    activityName,
    collaborationContext,
    catalogCandidatesCount: catalogCandidates.length,
  });

  const suggest = useCallback(async (deliverablesOverride?: DeliverableSlot[]) => {
    const sourceDeliverables = deliverablesOverride ?? deliverables;
    const requestDeliverables = deliverablesOverride
      ? buildActivityAutofillDeliverablesPayload(deliverablesOverride.map((deliverable) => ({
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
      : autofillDeliverables;
    const requestUnavailableMessage = getUnavailableMessage({
      uploadedDeliverablesCount: sourceDeliverables.filter((deliverable) => deliverable.uploaded).length,
      incompleteDeliverableSteps: getActivityAutofillMissingSteps(sourceDeliverables),
      autofillDeliverablesCount: requestDeliverables.length,
      saCode,
      activityName,
      collaborationContext,
      catalogCandidatesCount: catalogCandidates.length,
    });

    if (requestUnavailableMessage) {
      setError(requestUnavailableMessage);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      const headers = await getJsonAuthHeaders();
      const requestPayload = {
        deliverables: requestDeliverables,
        catalogCandidates,
        selectedActivityId,
        saCode,
        activityName,
        title: activityName,
        currentDescription,
        expertName,
        expertId,
        expertRole: expert?.positionInProject || expert?.role,
        expertReportingInstructions: expert?.aiReportingInstructions,
        expertReportingInstructionsUpdatedAt: expert?.updatedAt,
        category: expert?.category,
        projectCode: expert?.projectCode,
        month,
        year,
        hours,
        selectedDates,
        collaborationContext,
      };
      const postAutofill = (endpoint: string) => fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
      });
      const legacyEndpoint = '/api/ai/suggest-activity-from-deliverables';
      const agentEndpoint = '/api/ai/activity-agent';
      const shouldUseAgent = isActivityAgentEnabledClient();
      let response = await postAutofill(shouldUseAgent ? agentEndpoint : legacyEndpoint);

      const data = await readJsonResponse(response);
      if (
        shouldUseAgent
        && !response.ok
        && typeof data === 'object'
        && data !== null
        && (data as { code?: unknown }).code === 'ACTIVITY_AGENT_DISABLED'
      ) {
        response = await postAutofill(legacyEndpoint);
        const legacyData = await readJsonResponse(response);
        if (!response.ok || legacyData.error) {
          throw new Error(legacyData.error || 'Rescrierea descrierii a esuat.');
        }
        setSuggestion(legacyData);
        return;
      }
      if (!response.ok || data.error) {
        if (isServerSideAutofillFailure(response, data)) {
          const fallback = buildFallbackActivityAutofillSuggestion({
            deliverables: requestDeliverables,
            catalogCandidates,
            selectedActivityId,
            saCode,
            activityName,
            currentDescription,
            expertName,
            expertId,
            expertRole: expert?.positionInProject || expert?.role,
            expertReportingInstructions: expert?.aiReportingInstructions,
            category: expert?.category,
            projectCode: expert?.projectCode,
            month,
            year,
            selectedDates,
            collaborationContext,
          });
          if (fallback) {
            setSuggestion(fallback);
            return;
          }
        }
        throw new Error(data.error || 'Rescrierea descrierii a esuat.');
      }

      setSuggestion(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Eroare la rescrierea descrierii.');
    } finally {
      setIsLoading(false);
    }
  }, [
    autofillDeliverables,
    catalogCandidates,
    collaborationContext,
    deliverables,
    expert,
    expertId,
    expertName,
    hours,
    selectedActivityId,
    saCode,
    activityName,
    currentDescription,
    month,
    selectedDates,
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
          finalSaCode: saCode,
          finalActivityName: activityName,
          finalDescriptionPreview: appliedSuggestion.description.slice(0, 500),
        }),
      });
    })().catch((caughtError) => {
      console.warn('Nu s-a putut marca auditul AI ca aplicat.', caughtError);
    });
  }, [activityName, saCode]);

  const apply = useCallback(() => {
    if (!suggestion) return;

    const catalogMatch = catalogCandidates.find((candidate) => (
      candidate.saCode === saCode
      && candidate.activityName === activityName
    ));

    if (!catalogMatch) {
      setError('Activitatea selectata nu mai exista in catalogul disponibil pentru rolul curent.');
      return;
    }

    setDescription(suggestion.description);
    if (suggestion.shortSummary?.trim()) {
      setActivitySummary?.(suggestion.shortSummary.trim());
    }
    setError(null);
    setSuggestion(null);
    onApplied?.(suggestion);
    markSuggestionApplied(suggestion);
  }, [
    catalogCandidates,
    saCode,
    activityName,
    markSuggestionApplied,
    onApplied,
    setActivitySummary,
    setDescription,
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
    unavailableMessage,
    suggest,
    apply,
    dismiss,
  };
}
