'use client';

import { useMemo } from 'react';
import { DELIVERABLE_ELIGIBILITY_UI_MESSAGE } from '@/lib/feature-flags';
import { getDocumentAuditTitle, type DuplicateIssueType } from '@/lib/document-sharing';
import {
  buildExistingDeliverableSourceSuggestions,
  type ExistingDeliverableSourceContext,
} from '@/lib/existing-deliverable-context';
import type { DeliverableSlot } from '@/lib/deliverable-types';

export type ActivityResolutionSection = 'details' | 'deliverables' | 'gdpr';

export interface ActivityResolutionHint {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  section?: ActivityResolutionSection;
  deliverableId?: string;
}

export interface ObservationRailActivityContext {
  hasEventMomAsMainDeliverable: boolean;
  isException: boolean;
  isLeave: boolean;
  isWorkspaceLayout: boolean;
  mainDeliverablesCount: number;
  saCode?: string;
  activityName?: string;
}

export interface ObservationRailEligibilityContext {
  blockedReason?: string;
  checkEnabled: boolean;
}

export interface ObservationRailWarningContext {
  activityAutofillError: string | null;
  activityAutofillUnavailableMessage?: string | null;
  isSaveDisabled: boolean;
  isSaving?: boolean;
  saveBlockers: string[];
  validationError: string | null;
}

export type ObservationGroup = 'form' | 'deliverables' | 'ai';
export type ObservationTone = 'info' | 'success' | 'warning' | 'danger';

export interface ObservationRailItem {
  id: string;
  group: ObservationGroup;
  tone: ObservationTone;
  title: string;
  detail?: string;
  meta?: string[];
  actions?: Array<{
    id: string;
    label: string;
  }>;
}

export interface ObservationRailDuplicateInfo {
  documentId: string;
  title: string;
  uploadedByExpertName?: string;
  activityDate?: string;
  status?: string;
  issues: DuplicateIssueType[];
  isPreviousPeriod: boolean;
  isOtherExpert: boolean;
}

interface UseObservationRailParams {
  activity: ObservationRailActivityContext;
  deliverables: DeliverableSlot[];
  duplicateInfoByDeliverableId: ReadonlyMap<string, ObservationRailDuplicateInfo>;
  eligibility: ObservationRailEligibilityContext;
  existingDeliverableContexts?: ExistingDeliverableSourceContext[];
  resolutionHint?: ActivityResolutionHint;
  warnings: ObservationRailWarningContext;
}

function getRailDuplicateIssueLabel(issue: string) {
  if (issue === 'same_file_hash') return 'fisier identic';
  if (issue === 'same_first_page_hash') return 'prima pagina identica';
  if (issue === 'similar_extracted_title') return 'titlu similar';
  if (issue === 'similar_content_fingerprint') return 'continut similar';
  if (issue === 'possible_common_unmarked') return 'posibil comun nemarcat';
  if (issue === 'duplicate_detected') return 'duplicat detectat';
  if (issue === 'possible_duplicate') return 'posibil duplicat';
  return issue;
}

function getEligibilityRailTone(status?: string): ObservationTone {
  if (status === 'eligibil') return 'success';
  if (status === 'neeligibil') return 'danger';
  if (status === 'neconcludent') return 'warning';
  return 'warning';
}

function getEligibilityRailLabel(status?: string) {
  if (status === 'eligibil') return 'Eligibil';
  if (status === 'eligibil_cu_observatii') return 'Eligibil cu observatii';
  if (status === 'neeligibil') return 'Neeligibil';
  if (status === 'neconcludent') return 'Neconcludent';
  return 'Verificare eligibilitate';
}

export function useObservationRail({
  activity,
  deliverables,
  duplicateInfoByDeliverableId,
  eligibility,
  existingDeliverableContexts = [],
  resolutionHint,
  warnings,
}: UseObservationRailParams) {
  return useMemo<ObservationRailItem[]>(() => {
    if (!activity.isWorkspaceLayout) return [];

    const items: ObservationRailItem[] = [];

    if (resolutionHint) {
      items.push({
        id: `form-resolution-${resolutionHint.id}`,
        group: 'form',
        tone: 'warning',
        title: `Rezolvi blocajul: ${resolutionHint.title}`,
        detail: resolutionHint.detail,
        meta: resolutionHint.meta ? [resolutionHint.meta] : undefined,
      });
    }

    if (
      !activity.isLeave
      && !activity.isException
      && activity.mainDeliverablesCount === 0
      && !activity.hasEventMomAsMainDeliverable
    ) {
      items.push({
        id: 'form-missing-main-deliverable',
        group: 'form',
        tone: 'warning',
        title: 'Lipseste livrabilul principal',
        detail: 'Activitatea necesita cel putin un livrabil principal.',
      });
    }

    if (warnings.validationError) {
      items.push({
        id: 'form-validation-error',
        group: 'form',
        tone: 'danger',
        title: 'Atentionare salvare',
        detail: warnings.validationError,
      });
    }

    if (warnings.isSaveDisabled && !warnings.isSaving) {
      warnings.saveBlockers.forEach((blocker, index) => {
        items.push({
          id: `form-save-blocker-${index}`,
          group: 'form',
          tone: 'warning',
          title: 'Activitatea nu poate fi salvata inca',
          detail: blocker,
        });
      });
    }

    deliverables.forEach((deliverable) => {
      if (!deliverable.uploaded || deliverable.isPhoto) return;

      const deliverableTitle = getDocumentAuditTitle({
        ...deliverable,
        fileName: deliverable.filename || deliverable.name,
        originalFileName: deliverable.filename || deliverable.name,
      });
      const notePrefix = deliverableTitle || deliverable.filename || deliverable.name || 'Livrabil';
      const duplicateInfo = duplicateInfoByDeliverableId.get(deliverable.id);
      const hasDuplicateSignal = Boolean(duplicateInfo || deliverable.possibleDuplicateOfDocumentId || (
        deliverable.duplicateStatus
        && deliverable.duplicateStatus !== 'fingerprinted'
        && deliverable.duplicateStatus !== 'pending_upload'
      ));
      const sourceContext = existingDeliverableContexts.find((context) => context.deliverableId === deliverable.id);

      if (sourceContext) {
        const sourceMeta = [
          sourceContext.sourceExpertName ? `Expert sursa: ${sourceContext.sourceExpertName}` : null,
          sourceContext.sourceActivityDate ? `Data sursa: ${sourceContext.sourceActivityDate}` : null,
          sourceContext.sourceSaCode && sourceContext.sourceActivityName
            ? `${sourceContext.sourceSaCode} - ${sourceContext.sourceActivityName}`
            : sourceContext.sourceSaCode || sourceContext.sourceActivityName || null,
          sourceContext.deliverableType ? `Tip livrabil: ${sourceContext.deliverableType}` : null,
          sourceContext.stadiu ? `Stadiu: ${sourceContext.stadiu}` : null,
          sourceContext.hasExtractedText ? 'Text extras disponibil' : null,
        ].filter((item): item is string => Boolean(item));
        items.push({
          id: `deliverable-source-context-${deliverable.id}`,
          group: 'deliverables',
          tone: 'info',
          title: 'Context din raportarea sursa',
          detail: sourceContext.title,
          meta: sourceMeta,
        });

        const suggestions = buildExistingDeliverableSourceSuggestions({
          context: sourceContext,
          currentSaCode: activity.saCode,
          currentActivityName: activity.activityName,
          currentDeliverable: deliverable,
        });
        if (suggestions.length > 0) {
          items.push({
            id: `deliverable-source-suggestions-${deliverable.id}`,
            group: 'deliverables',
            tone: 'success',
            title: 'Setari sugerate',
            detail: suggestions.map((suggestion) => suggestion.detail).join('\n'),
            actions: suggestions.map((suggestion) => ({
              id: `existing-source:${suggestion.deliverableId}:${suggestion.action}`,
              label: suggestion.label,
            })),
          });
        }
      }

      if (!deliverable.titleConfirmed && (deliverable.docText || deliverable.firstPageText)) {
        items.push({
          id: `deliverable-text-${deliverable.id}`,
          group: 'deliverables',
          tone: 'info',
          title: notePrefix,
          detail: deliverable.textExtractionSource === 'ocr'
            ? 'Text OCR extras pentru autocompletare.'
            : 'Text extras disponibil pentru autocompletare.',
        });
      }

      if (!deliverable.titleConfirmed && deliverable.suggestedTitle) {
        const meta = [
          deliverable.titleSuggestionConfidence ? `Incredere: ${deliverable.titleSuggestionConfidence}` : null,
          ...(deliverable.titleSuggestionAlternatives?.length
            ? [`Alternative: ${deliverable.titleSuggestionAlternatives.join(' / ')}`]
            : []),
        ].filter((item): item is string => Boolean(item));
        items.push({
          id: `deliverable-suggested-title-${deliverable.id}`,
          group: 'deliverables',
          tone: deliverable.titleSuggestionConfidence === 'low' ? 'warning' : 'info',
          title: 'Titlu sugerat automat',
          detail: deliverable.suggestedTitle,
          meta,
        });
      }

      const hasTitleProblem = deliverable.titleMatch === false
        || deliverable.titleCheckStatus === 'mismatch'
        || deliverable.titleCheckStatus === 'extraction_failed';

      if (deliverable.declaredTitle && (!deliverable.titleConfirmed || hasTitleProblem)) {
        items.push({
          id: `deliverable-title-match-${deliverable.id}`,
          group: 'deliverables',
          tone: deliverable.titleMatch === true
            ? 'success'
            : deliverable.titleMatch === false
              ? 'warning'
              : 'info',
          title: notePrefix,
          detail: deliverable.titleMatch === true
            ? (deliverable.titleCheckMessage || 'Titlul se regaseste in prima pagina.')
            : (deliverable.titleCheckMessage || 'Titlul nu a fost gasit in prima pagina.'),
        });
      }

      if (hasDuplicateSignal) {
        const duplicateMeta = duplicateInfo
          ? [
              duplicateInfo.uploadedByExpertName || 'Expert necunoscut',
              duplicateInfo.activityDate,
              `Semnale: ${duplicateInfo.issues.map(getRailDuplicateIssueLabel).join(', ')}`,
            ].filter((item): item is string => Boolean(item))
          : [String(deliverable.possibleDuplicateOfDocumentId || deliverable.duplicateStatus || '')].filter(Boolean);
        items.push({
          id: `deliverable-duplicate-${deliverable.id}`,
          group: 'deliverables',
          tone: 'warning',
          title: 'Posibila reutilizare / document existent',
          detail: duplicateInfo?.title || notePrefix,
          meta: duplicateMeta,
        });
      }

      if (deliverable.common || deliverable.isCommonDeliverable) {
        items.push({
          id: `deliverable-common-${deliverable.id}`,
          group: 'deliverables',
          tone: 'info',
          title: 'Document comun / cross-expert',
          detail: deliverable.sharedWithExpertIds?.length
            ? `Va fi propus catre ${deliverable.sharedWithExpertIds.length} colaboratori.`
            : 'Document marcat comun; colaboratorii se confirma in sectiunea de colaborare.',
          meta: [notePrefix],
        });
      }

      const deliverableEligibilityGateReason = !deliverable.titleConfirmed
        ? 'Confirma titlul livrabilului inainte de verificarea eligibilitatii.'
        : !deliverable.stadiu
          ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
          : eligibility.blockedReason;

      if (eligibility.checkEnabled && deliverableEligibilityGateReason) {
        items.push({
          id: `deliverable-eligibility-gate-${deliverable.id}`,
          group: 'deliverables',
          tone: 'warning',
          title: 'Eligibilitatea nu poate fi verificata inca',
          detail: deliverableEligibilityGateReason,
          meta: [notePrefix],
        });
      } else if (!eligibility.checkEnabled) {
        items.push({
          id: `deliverable-eligibility-disabled-${deliverable.id}`,
          group: 'deliverables',
          tone: 'warning',
          title: 'Verificare eligibilitate suspendata temporar',
          detail: DELIVERABLE_ELIGIBILITY_UI_MESSAGE,
          meta: [notePrefix],
        });
      }

      if (deliverable.eligibilityCheck) {
        const check = deliverable.eligibilityCheck;
        const isPmUnlockRequested = check.status === 'neeligibil' && check.pmUnlockRequested;
        const isManualEntryRequired = check.status === 'neconcludent';
        const meta = [
          typeof check.score === 'number' ? `Scor: ${check.score}/100` : null,
          isPmUnlockRequested ? 'Deblocare PM solicitata' : null,
          isManualEntryRequired ? 'Introducere manuala / eroare citire livrabil' : null,
          ...(check.missingElements || []).slice(0, 3),
          ...(check.riskFlags || []).slice(0, 3),
          ...(check.recommendations || []).slice(0, 2),
        ].filter((item): item is string => Boolean(item));
        items.push({
          id: `deliverable-eligibility-result-${deliverable.id}`,
          group: 'deliverables',
          tone: getEligibilityRailTone(check.status),
          title: sourceContext
            ? `Verificat anterior - ${getEligibilityRailLabel(check.status)}`
            : `${getEligibilityRailLabel(check.status)} - ${notePrefix}`,
          detail: sourceContext
            ? `Verificare preluata din raportarea sursa: ${check.summary}`
            : isManualEntryRequired
              ? 'Verificarea automata nu a putut citi/analiza livrabilul. Continua cu introducere manuala si verificare PM.'
              : check.summary,
          meta,
        });
      }
    });

    if (warnings.activityAutofillUnavailableMessage) {
      items.push({
        id: 'ai-autofill-unavailable',
        group: 'ai',
        tone: 'warning',
        title: 'Autocompletare indisponibila',
        detail: warnings.activityAutofillUnavailableMessage,
      });
    }

    if (warnings.activityAutofillError) {
      items.push({
        id: 'ai-autofill-error',
        group: 'ai',
        tone: 'danger',
        title: 'Eroare autocompletare',
        detail: warnings.activityAutofillError,
      });
    }

    return items;
  }, [
    activity,
    deliverables,
    duplicateInfoByDeliverableId,
    eligibility,
    existingDeliverableContexts,
    resolutionHint,
    warnings,
  ]);
}
