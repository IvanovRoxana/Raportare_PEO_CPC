'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, FileText, Image, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_DELIVERABLE_TYPES, DOCUMENT_STADIU_OPTIONS, type DeliverableSlot } from '@/lib/deliverable-types';
import { extractDocxFirstPageText, extractDocxTextWithSource, extractHtmlTextWithSource, extractImageTextWithSource, extractPdfFirstPageTextWithSource, extractPdfTextWithSource, extractXlsxTextWithSource, isImageFile } from '@/lib/document-utils';
import { DELIVERABLE_ELIGIBILITY_UI_MESSAGE, isDeliverableEligibilityCheckEnabledClient } from '@/lib/feature-flags';
import { hasSufficientDeliverableEvidenceForEligibility } from '@/lib/deliverable-eligibility';
import { applyAutomaticTitleSuggestion, formatTitleFromFilename, suggestTitleFromFirstPage, validateDeclaredTitleOnFirstPage } from '@/lib/title-suggestion';
import { getDocumentAuditTitle, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex, type DuplicateIssueType } from '@/lib/document-sharing';
import type { ActivityCatalog } from '@/lib/types';

export interface DeliverableDuplicateInfo {
  documentId: string;
  title: string;
  uploadedByExpertName?: string;
  activityDate?: string;
  status?: string;
  issues: DuplicateIssueType[];
  isPreviousPeriod: boolean;
  isOtherExpert: boolean;
}

type EligibilitySuggestedSettings = NonNullable<NonNullable<DeliverableSlot['eligibilityCheck']>['suggestedSettings']>;
type EligibilitySuggestedSettingsChange = 'activity' | 'deliverableType';
function hasEnoughExtractedTextForEligibility(deliverable: DeliverableSlot) {
  return hasSufficientDeliverableEvidenceForEligibility({
    extractedText: deliverable.docText,
    firstPageText: deliverable.firstPageText,
    documentTitle: deliverable.declaredTitle || deliverable.suggestedTitle,
    titleConfirmed: deliverable.titleConfirmed,
    fileName: deliverable.filename || deliverable.name,
    fileType: deliverable.fileType,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  });
}

function getEligibilityDeliverables(deliverable: DeliverableSlot, relatedDeliverables?: DeliverableSlot[]) {
  return (relatedDeliverables && relatedDeliverables.length > 0
    ? relatedDeliverables
    : [deliverable]
  ).filter((item) => item.uploaded && !item.isPhoto);
}

function getTextExtractionGateReason(deliverable: DeliverableSlot, relatedDeliverables?: DeliverableSlot[]) {
  const eligibilityDeliverables = getEligibilityDeliverables(deliverable, relatedDeliverables);
  if (eligibilityDeliverables.some(hasEnoughExtractedTextForEligibility)) return null;
  if (eligibilityDeliverables.length > 1) {
    return 'Textul extras din livrabilele incarcate pentru grupul activitatii este prea scurt pentru verificarea AI. Reincarca documentele ca PDF/DOCX cu text selectabil sau exporta-le cu OCR.';
  }
  const hasConfirmedTitle = Boolean(deliverable.titleConfirmed || deliverable.declaredTitle || deliverable.suggestedTitle);
  if (hasConfirmedTitle) {
    return 'Titlul a fost identificat, dar textul extras din livrabil este prea scurt pentru verificarea AI. Reincarca documentul ca PDF/DOCX cu text selectabil sau exporta-l cu OCR.';
  }
  if ((deliverable.filename || deliverable.name || '').toLowerCase().endsWith('.doc')) {
    return 'Nu s-a putut extrage text suficient din documentul .doc. Reincarca documentul ca .docx/PDF cu text selectabil sau verifica manual.';
  }
  if (/\.(ppt|pptx)$/i.test(deliverable.filename || deliverable.name || '')) {
    return 'Nu exista text extras suficient din prezentare. Exporta prezentarea in PDF pentru verificare AI.';
  }
  return 'Nu exista text extras suficient din livrabil. Reincarca documentul ca PDF/DOCX cu text selectabil sau cu imagini clare pentru OCR.';
}

function buildEligibilityDocumentPayload(deliverable: DeliverableSlot, activityGroupId: string, isPrimary: boolean) {
  return {
    id: deliverable.id,
    activityGroupId,
    isPrimary,
    documentTitle: getDocumentAuditTitle({
      ...deliverable,
      fileName: deliverable.filename || deliverable.name,
      originalFileName: deliverable.filename || deliverable.name,
    }),
    fileName: deliverable.filename || deliverable.name,
    extractedText: (deliverable.docText || deliverable.firstPageText || '').slice(0, 12000),
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    duplicateStatus: deliverable.duplicateStatus,
    possibleDuplicateOfDocumentId: deliverable.possibleDuplicateOfDocumentId,
    textScope: deliverable.docText && deliverable.docText !== deliverable.firstPageText
      ? 'Text extras disponibil din document'
      : 'Prima pagina / inceputul documentului',
  };
}

function normalizeEligibilityContextValue(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function isEligibilityCheckObsoleteForCurrentActivity(
  check: DeliverableSlot['eligibilityCheck'] | undefined | null,
  context: {
    subActivity: string;
    activityTitle: string;
    selectedActivityId?: string;
    deliverableType?: string;
  },
) {
  if (check?.checkedActivityId || check?.checkedSaCode || check?.checkedActivityName || check?.checkedDeliverableType) {
    const checkedActivityMatches = !check.checkedActivityId
      || !context.selectedActivityId
      || check.checkedActivityId === context.selectedActivityId;
    const checkedSaMatches = !check.checkedSaCode
      || normalizeEligibilityContextValue(check.checkedSaCode) === normalizeEligibilityContextValue(context.subActivity);
    const checkedActivityNameMatches = !check.checkedActivityName
      || normalizeEligibilityContextValue(check.checkedActivityName) === normalizeEligibilityContextValue(context.activityTitle);
    const checkedDeliverableTypeMatches = !check.checkedDeliverableType
      || !context.deliverableType
      || normalizeEligibilityContextValue(check.checkedDeliverableType) === normalizeEligibilityContextValue(context.deliverableType);

    return !checkedActivityMatches
      || !checkedSaMatches
      || !checkedActivityNameMatches
      || !checkedDeliverableTypeMatches;
  }

  const suggestedSettings = check?.suggestedSettings;
  if (!suggestedSettings?.changes?.includes('activity')) return false;
  if (check?.status !== 'neeligibil' && check?.status !== 'neconcludent') return false;

  const suggestedIdMatches = Boolean(
    suggestedSettings.selectedActivityId
    && context.selectedActivityId
    && suggestedSettings.selectedActivityId === context.selectedActivityId,
  );
  const suggestedActivityMatches = normalizeEligibilityContextValue(suggestedSettings.saCode)
    === normalizeEligibilityContextValue(context.subActivity)
    && normalizeEligibilityContextValue(suggestedSettings.activityName)
      === normalizeEligibilityContextValue(context.activityTitle);

  return suggestedIdMatches || suggestedActivityMatches;
}

interface DeliverableItemProps {
  deliverable: DeliverableSlot;
  subActivity: string;
  activityTitle: string;
  selectedActivityId?: string;
  catalogDescription?: string;
  catalogObjectives?: string;
  catalogComponent?: string;
  catalogBeneficiaries?: string;
  catalogExpectedResults?: string;
  catalogDeliverables?: string;
  catalogIndicators?: string;
  projectCode?: string;
  month?: number;
  year?: number;
  expertId?: string;
  expertCategory?: string;
  expertFunction?: string;
  expertProjectRole?: string;
  workingGroupId?: string;
  periodGroupId?: string;
  workBlockId?: string;
  workingGroupActivities?: Array<{
    id?: string;
    date?: string;
    activityType?: string;
    title?: string;
    saCode?: string;
    expertId?: string;
    expertName?: string;
  }>;
  collaborators?: Array<{
    id?: string;
    name?: string;
    role?: string;
    positionInProject?: string;
  }>;
  catalogSource?: string;
  ruleVersionId?: string;
  expertName?: string;
  onUpdate: (patch: Partial<DeliverableSlot>) => void;
  onRemove?: () => void;
  showSteps?: boolean;
  required?: boolean;
  label?: string;
  hint?: string;
  deliverableOptions?: string[];
  activityCatalogCandidates?: ActivityCatalog[];
  duplicateInfo?: DeliverableDuplicateInfo;
  canCheckEligibility?: boolean;
  eligibilityBlockedReason?: string;
  onApplyEligibilitySuggestion?: (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
    deliverableId: string,
  ) => void;
  notesMode?: 'inline' | 'external';
  showEligibilityControl?: boolean;
}

export function DeliverableItem({
  deliverable,
  subActivity,
  activityTitle,
  selectedActivityId,
  catalogDescription,
  catalogObjectives,
  catalogComponent,
  catalogBeneficiaries,
  catalogExpectedResults,
  catalogDeliverables,
  catalogIndicators,
  projectCode,
  month,
  year,
  expertId,
  expertCategory,
  expertFunction,
  expertProjectRole,
  workingGroupId,
  periodGroupId,
  workBlockId,
  workingGroupActivities,
  collaborators,
  catalogSource,
  ruleVersionId,
  expertName,
  onUpdate,
  onRemove,
  showSteps = true,
  required = false,
  label,
  hint,
  deliverableOptions,
  activityCatalogCandidates = [],
  duplicateInfo,
  canCheckEligibility = true,
  eligibilityBlockedReason,
  onApplyEligibilitySuggestion,
  notesMode = 'inline',
  showEligibilityControl = true,
}: DeliverableItemProps) {
  const renderInlineNotes = notesMode === 'inline';
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const [isEditingConfirmedTitle, setIsEditingConfirmedTitle] = useState(false);
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
  const visibleEligibilityCheck = isEligibilityCheckObsoleteForCurrentActivity(deliverable.eligibilityCheck, {
    subActivity,
    activityTitle,
    selectedActivityId,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  }) ? null : deliverable.eligibilityCheck;
  const hasReusableEligibilityCheck = Boolean(visibleEligibilityCheck);
  const metadataLocked = Boolean(deliverable.lockedExistingMetadata);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    const raw = file.name.replace(/\.[^.]+$/, '');
    const isPhoto = isImageFile(file.name);
    const lowerFileName = file.name.toLowerCase();
    const isPdf = lowerFileName.endsWith('.pdf');
    const isWordDocument = lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc');
    const isSpreadsheet = lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls');
    const isHtml = lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm');
    const isPresentation = lowerFileName.endsWith('.ppt') || lowerFileName.endsWith('.pptx');

    if (isPresentation) {
      alert('Prezentarile PPT/PPTX nu pot fi incarcate ca livrabile. Exporta prezentarea ca PDF cu text selectabil si reincarca fisierul.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    let docTitle: string | null = null;
    let docText: string | null = null;
    let firstPageText: string | null = null;
    let titleSuggestion = suggestTitleFromFirstPage(null);
    let textExtractionSource: DeliverableSlot['textExtractionSource'];

    setExtractingText(true);
    try {
      if (isPhoto) {
        const ocrResult = await extractImageTextWithSource(file);
        firstPageText = ocrResult.text;
        docText = ocrResult.text;
        textExtractionSource = ocrResult.source;
        titleSuggestion = suggestTitleFromFirstPage(firstPageText);
        docTitle = titleSuggestion.suggestedTitle;
      } else if (isWordDocument) {
        firstPageText = await extractDocxFirstPageText(file);
        titleSuggestion = suggestTitleFromFirstPage(firstPageText);
        docTitle = titleSuggestion.suggestedTitle;
        const docxResult = await extractDocxTextWithSource(file);
        docText = docxResult.text || firstPageText;
        textExtractionSource = docxResult.source || (firstPageText ? 'native' : undefined);
      } else if (isPdf) {
        const pdfResult = await extractPdfFirstPageTextWithSource(file);
        const fullPdfResult = await extractPdfTextWithSource(file);
        firstPageText = pdfResult.text;
        if (!firstPageText && fullPdfResult.text) {
          firstPageText = fullPdfResult.text.slice(0, 5000);
        }
        titleSuggestion = suggestTitleFromFirstPage(firstPageText);
        docTitle = titleSuggestion.suggestedTitle;
        docText = fullPdfResult.text || firstPageText;
        textExtractionSource = fullPdfResult.source || pdfResult.source;
      } else if (isSpreadsheet) {
        const spreadsheetResult = await extractXlsxTextWithSource(file);
        firstPageText = spreadsheetResult.text?.slice(0, 5000) || null;
        docText = spreadsheetResult.text;
        textExtractionSource = spreadsheetResult.source;
      } else if (isHtml) {
        const htmlResult = await extractHtmlTextWithSource(file);
        firstPageText = htmlResult.text?.slice(0, 5000) || null;
        docText = htmlResult.text;
        textExtractionSource = htmlResult.source;
      }

      if (!titleSuggestion.suggestedTitle && docText) {
        titleSuggestion = suggestTitleFromFirstPage(docText.slice(0, 8000));
        docTitle = titleSuggestion.suggestedTitle;
      }

      if (!docTitle) {
        docTitle = formatTitleFromFilename(file.name) || null;
        titleSuggestion = {
          suggestedTitle: docTitle,
          confidence: 'low',
          alternatives: titleSuggestion.alternatives,
          reason: titleSuggestion.reason || 'Titlu propus din numele fisierului; textul extras nu a oferit un titlu clar.',
        };
      }

      const suggestion = applyAutomaticTitleSuggestion({
        currentDeclaredTitle: deliverable.declaredTitle,
        suggestedTitle: docTitle,
      });
      const validation = isPhoto || !suggestion.declaredTitle
        ? null
        : validateDeclaredTitleOnFirstPage({
            firstPageText: firstPageText || docText,
            declaredTitle: suggestion.declaredTitle,
            titleSource: suggestion.titleSource,
          });
      const fileData = await readFileAsDataUrl(file);
      const fileHash = await sha256Hex(await file.arrayBuffer());
      const firstPageTextHash = await hashFirstPageText(firstPageText || docText);
      const contentFingerprint = normalizeDocumentTextForFingerprint(firstPageText || docText).slice(0, 500);

      onUpdate({
        documentId: undefined,
        filename: file.name,
        rawFilename: raw,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        filePath: undefined,
        s3Bucket: undefined,
        s3Key: undefined,
        fileData,
        uploadedAt: new Date().toISOString(),
        uploaded: true,
        isPhoto,
        docTitle,
        docText,
        firstPageText,
        textExtractionSource,
        fileHash,
        firstPageTextHash,
        contentFingerprint,
        suggestedTitle: docTitle,
        titleSuggestionConfidence: titleSuggestion.confidence,
        titleSuggestionAlternatives: titleSuggestion.alternatives,
        titleSuggestionReason: titleSuggestion.reason,
        titleSource: suggestion.titleSource,
        titleMatch: validation?.titleMatch ?? null,
        titleCheckStatus: validation?.titleCheckStatus,
        titleCheckMessage: validation?.titleCheckMessage,
        aiCheck: null,
        eligibilityCheck: null,
        titleConfirmed: false,
        declaredTitle: suggestion.declaredTitle,
        duplicateStatus: firstPageTextHash ? 'fingerprinted' : undefined,
        possibleDuplicateOfDocumentId: undefined,
      });
    } catch (error) {
      console.error('Error reading deliverable file:', error);
      alert('Nu am putut citi fisierul. Reincarca documentul sau incearca un alt format.');
    } finally {
      setExtractingText(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAiCheck = async () => {
    if (!eligibilityCheckEnabled) return;

    setAiLoading(true);
    try {
      const extractedText = (deliverable.docText || deliverable.firstPageText || '').slice(0, 12000);
      const response = await fetch('/api/ai/check-deliverable-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentTitle: getDocumentAuditTitle({
            ...deliverable,
            fileName: deliverable.filename || deliverable.name,
            originalFileName: deliverable.filename || deliverable.name,
          }),
          fileName: deliverable.filename || deliverable.name,
          extractedText,
          deliverables: [
            buildEligibilityDocumentPayload(deliverable, selectedActivityId || subActivity, true),
          ],
          primaryDeliverableId: deliverable.id,
          activityGroupId: selectedActivityId || subActivity,
          periodGroupId,
          workingGroupId,
          workBlockId,
          workingGroupActivities,
          collaborators,
          selectedActivityId: selectedActivityId || subActivity,
          currentSaCode: subActivity,
          selectedActivityName: activityTitle,
          deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
          activityCatalogCandidates,
          deliverableOptions: typeOptions,
          catalogDescription,
          catalogObjectives,
          catalogComponent,
          catalogBeneficiaries,
          catalogExpectedResults,
          catalogDeliverables,
          catalogIndicators,
          projectCode,
          month,
          year,
          expertId,
          expertCategory,
          expertFunction,
          expertProjectRole,
          catalogSource,
          ruleVersionId,
          expertName,
          textScope: deliverable.docText && deliverable.docText !== deliverable.firstPageText
            ? 'Text extras disponibil din document'
            : 'Prima pagină / începutul documentului',
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Verificarea eligibilității a eșuat');

      onUpdate({
        eligibilityCheck: {
          ...result,
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
          modelAuditId: result.modelAuditId,
          analyzedDeliverables: result.analyzedDeliverables,
        },
        aiCheck: {
          eligible: result.status === 'eligibil' || result.status === 'eligibil_cu_observatii'
            ? true
            : result.status === 'neeligibil'
              ? false
              : null,
          reason: result.summary || 'Verificare eligibilitate finalizată.',
          issues: [...(result.missingElements || []), ...(result.riskFlags || [])],
        },
      });
    } catch (error) {
      onUpdate({
        eligibilityCheck: {
          status: 'neconcludent',
          score: 0,
          summary: 'Eroare: ' + (error instanceof Error ? error.message : 'Eroare necunoscută'),
          checks: [],
          missingElements: [],
          recommendations: ['Reîncearcă verificarea sau validează manual livrabilul.'],
          riskFlags: ['Verificarea API nu a putut fi finalizată.'],
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyEligibilitySuggestion = (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
  ) => {
    if (change === 'deliverableType' && settings.deliverableType) {
      onUpdate({
        type: settings.deliverableType,
        deliverableType: settings.deliverableType,
        eligibilityCheck: null,
        aiCheck: null,
      });
      return;
    }

    onApplyEligibilitySuggestion?.(settings, change, deliverable.id);
  };

  const validateTitle = (title: string, source: DeliverableSlot['titleSource']) =>
    validateDeclaredTitleOnFirstPage({
      firstPageText: deliverable.firstPageText || deliverable.docText,
      declaredTitle: title,
      titleSource: source,
    });

  const validateTitleForConfirmation = (title: string, source: DeliverableSlot['titleSource']) =>
    validateDeclaredTitleOnFirstPage({
      firstPageText: deliverable.firstPageText || deliverable.docText,
      declaredTitle: title,
      titleSource: source,
      allowManualConfirmationWithoutExtractedText: true,
    });

  const handleTitleChange = (title: string) => {
    const validation = validateTitle(title, 'edited_by_expert');
    onUpdate({
      declaredTitle: title,
      titleSource: 'edited_by_expert',
      titleMatch: validation.titleMatch,
      titleCheckStatus: validation.titleCheckStatus,
      titleCheckMessage: validation.titleCheckMessage,
      titleConfirmed: false,
    });
  };

  const handleUseSuggestedTitle = () => {
    if (!deliverable.suggestedTitle) return;
    const validation = validateTitle(deliverable.suggestedTitle, 'auto_detected');
    onUpdate({
      declaredTitle: deliverable.suggestedTitle,
      titleSource: 'auto_detected',
      titleMatch: validation.titleMatch,
      titleCheckStatus: validation.titleCheckStatus,
      titleCheckMessage: validation.titleCheckMessage,
      titleConfirmed: false,
    });
  };

  const handleConfirmTitle = () => {
    const validation = validateTitleForConfirmation(deliverable.declaredTitle, deliverable.titleSource);
    if (validation.titleCheckStatus === 'mismatch') {
      onUpdate({
        titleMatch: validation.titleMatch,
        titleCheckStatus: validation.titleCheckStatus,
        titleCheckMessage: validation.titleCheckMessage,
        titleConfirmed: false,
      });
      alert(validation.titleCheckMessage);
      return;
    }

    onUpdate({
      titleConfirmed: true,
      titleMatch: validation.titleMatch,
      titleCheckStatus: validation.titleCheckStatus,
      titleCheckMessage: validation.titleCheckMessage,
    });
    setIsEditingConfirmedTitle(false);
  };

  const handleRemoveFile = () => {
    onUpdate({
      uploaded: false,
      filename: '',
      rawFilename: '',
      fileType: '',
      fileSize: 0,
      filePath: undefined,
      fileData: undefined,
      fileHash: undefined,
      firstPageTextHash: undefined,
      contentFingerprint: undefined,
      docTitle: null,
      docText: null,
      textExtractionSource: undefined,
      firstPageText: null,
      suggestedTitle: null,
      titleSource: undefined,
      titleMatch: null,
      titleCheckStatus: undefined,
      titleCheckMessage: undefined,
      titleSuggestionConfidence: undefined,
      titleSuggestionAlternatives: [],
      titleSuggestionReason: undefined,
      aiCheck: null,
      eligibilityCheck: null,
      titleConfirmed: false,
      duplicateStatus: undefined,
      possibleDuplicateOfDocumentId: undefined,
    });
    setIsEditingConfirmedTitle(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const step1ok = deliverable.uploaded;
  const step2ok = deliverable.isPhoto || (deliverable.uploaded && deliverable.titleConfirmed);
  const step3ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.stadiu);
  const step4ok = deliverable.isPhoto || !eligibilityCheckEnabled || (deliverable.uploaded && !!deliverable.aiCheck);
  const textExtractionGateReason = visibleEligibilityCheck ? null : getTextExtractionGateReason(deliverable);
  const eligibilityGateReason = textExtractionGateReason
    || (!deliverable.titleConfirmed
      ? 'Confirma titlul livrabilului inainte de verificarea eligibilitatii.'
      : !deliverable.stadiu
        ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
        : eligibilityBlockedReason);
  const canRunEligibilityCheck = canCheckEligibility && !eligibilityGateReason && !hasReusableEligibilityCheck;
  const allOk = step1ok && step2ok && step3ok && step4ok;
  const auditTitle = getDocumentAuditTitle({
    ...deliverable,
    fileName: deliverable.filename || deliverable.name,
    originalFileName: deliverable.filename || deliverable.name,
  });
  const hasDuplicateSignal = Boolean(duplicateInfo || deliverable.possibleDuplicateOfDocumentId || (
    deliverable.duplicateStatus
    && deliverable.duplicateStatus !== 'fingerprinted'
    && deliverable.duplicateStatus !== 'pending_upload'
  ));
  const showCompactConfirmedTitle = deliverable.uploaded && deliverable.titleConfirmed && !isEditingConfirmedTitle;
  const hasSideNotes = renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && Boolean(
    (!deliverable.titleConfirmed && (deliverable.docText || deliverable.firstPageText || deliverable.suggestedTitle || deliverable.declaredTitle))
    || hasDuplicateSignal
    || deliverable.common
    || deliverable.isCommonDeliverable
    || (showEligibilityControl && eligibilityCheckEnabled)
    || (showEligibilityControl && deliverable.eligibilityCheck)
  );

  const borderColor = !step1ok
    ? (required ? 'border-red-300' : 'border-slate-300')
    : !allOk
      ? 'border-amber-400'
      : 'border-green-400';

  const bgColor = !step1ok
    ? (required ? 'bg-red-50' : 'bg-white')
    : !allOk
      ? 'bg-amber-50'
      : 'bg-green-50';

  return (
    <div className={`${renderInlineNotes ? 'grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start' : 'flex flex-col'} gap-2 rounded-lg border p-3 ${borderColor} ${bgColor}`}>
      {showSteps && !deliverable.isPhoto && (
        <div className={`mb-1 flex flex-wrap gap-3 rounded-md bg-white/50 p-2 ${renderInlineNotes ? 'xl:col-span-2' : ''}`}>
          <StepBadge ok={step1ok} n={1} label="Fisier incarcat" />
          <StepBadge ok={step2ok} n={2} label="Titlu confirmat" />
          <StepBadge ok={step3ok} n={3} label="Stadiu selectat" />
          <StepBadge ok={step4ok} n={4} label={eligibilityCheckEnabled ? 'Eligibilitate verificata' : 'Verificare manuala PM'} />
        </div>
      )}

      <div className={`flex items-center gap-2 ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
        {label ? (
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-900">
              {label}
              {required && <span className="text-xs text-red-600 ml-1">obligatoriu</span>}
            </div>
            {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
          </div>
        ) : metadataLocked ? (
          <div className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            {deliverable.type || deliverable.deliverableType || 'Livrabil existent'}
          </div>
        ) : (
          <Select
            value={deliverable.type}
            onValueChange={(value: string) => onUpdate({ type: value, aiCheck: null, eligibilityCheck: null })}
          >
            <SelectTrigger className="flex-1 text-xs">
              <SelectValue placeholder="Tip livrabil" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type} className="text-xs">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {onRemove && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className={renderInlineNotes ? 'xl:col-start-1' : ''}>
        <input
          type="file"
          ref={fileRef}
          accept=".pdf,.doc,.docx,.html,.htm,.xlsx,.png,.jpg,.jpeg,.gif"
          onChange={handleFile}
          className="hidden"
        />

        {!deliverable.uploaded ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={extractingText}
            className="w-full text-xs border-dashed"
          >
            {extractingText ? (
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
            ) : (
              <Upload className="h-3 w-3 mr-2" />
            )}
            {extractingText ? 'Se citeste documentul...' : 'Alege fisier'}
          </Button>
        ) : (
          <div className="flex gap-2 items-center p-2 rounded-md bg-white/60 border border-slate-200/50">
            {deliverable.isPhoto ? (
              <Image className="h-4 w-4 text-slate-500" />
            ) : (
              <FileText className="h-4 w-4 text-slate-500" />
            )}
            <span className="text-[10px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-slate-900">
              {deliverable.filename}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              className="h-6 px-2 text-slate-500 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {hasSideNotes && (
        <div className="rounded-md border border-slate-200 bg-white/70 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 xl:col-start-2 xl:row-start-2">
          Observatii si atentionari
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.titleConfirmed && (deliverable.docText || deliverable.firstPageText) && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-800 xl:col-start-2">
          {deliverable.textExtractionSource === 'ocr'
            ? 'Text OCR extras pentru autocompletare.'
            : 'Text extras disponibil pentru autocompletare.'}
        </div>
      )}

      {showCompactConfirmedTitle && !deliverable.isPhoto && (
        <div className={`flex min-w-0 items-center justify-between gap-3 rounded-md border border-green-200 bg-white px-3 py-2 text-xs ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
          <div className="flex min-w-0 items-center gap-2 text-green-800">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium text-slate-950">
              {deliverable.declaredTitle || auditTitle}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingConfirmedTitle(true)}
            className="h-7 shrink-0 px-2 text-[10px] text-slate-600 hover:text-slate-950"
          >
            Editeaza
          </Button>
        </div>
      )}

      {!deliverable.isPhoto && (
        <div className={`space-y-1.5 ${renderInlineNotes ? 'xl:contents' : ''}`}>
          {deliverable.uploaded && !deliverable.titleConfirmed && (
            <div className={`rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700 ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
              <div className="font-medium text-slate-900">Titlu auditabil document</div>
              <div className="mt-0.5 break-words text-xs font-semibold text-slate-950">{auditTitle}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="bg-white text-[10px]">
                  {deliverable.titleConfirmed ? 'titlu confirmat' : 'neconfirmat'}
                </Badge>
                {deliverable.titleSource && (
                  <Badge variant="outline" className="bg-white text-[10px]">
                    sursa: {getTitleSourceLabel(deliverable.titleSource)}
                  </Badge>
                )}
                {deliverable.firstPageTextHash && (
                  <Badge variant="outline" className="bg-white text-[10px]">
                    prima pagina amprentata
                  </Badge>
                )}
                {deliverable.textExtractionSource === 'ocr' && (
                  <Badge variant="outline" className="bg-blue-50 text-[10px] text-blue-700">
                    OCR
                  </Badge>
                )}
              </div>
            </div>
          )}

          {renderInlineNotes && !deliverable.titleConfirmed && deliverable.suggestedTitle && (
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[10px] text-blue-900 xl:col-start-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">Titlu sugerat automat{deliverable.titleSuggestionConfidence ? ` (${deliverable.titleSuggestionConfidence})` : ''}</div>
                  <div className="mt-0.5">{deliverable.suggestedTitle}</div>
                  {deliverable.titleSuggestionConfidence === 'low' && (
                    <div className="mt-1 text-amber-700">
                      Nu am putut identifica sigur titlul documentului. Te rugăm să îl verifici manual.
                    </div>
                  )}
                  {(deliverable.titleSuggestionAlternatives?.length ?? 0) > 0 && (
                    <div className="mt-1 text-blue-700">
                      Alternative: {deliverable.titleSuggestionAlternatives?.join(' · ')}
                    </div>
                  )}
                </div>
                {deliverable.suggestedTitle !== deliverable.declaredTitle && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseSuggestedTitle}
                    className="h-7 shrink-0 border-blue-300 px-2 text-[10px] text-blue-800 hover:bg-blue-100"
                  >
                    Foloseste titlul sugerat
                  </Button>
                )}
              </div>
            </div>
          )}

          {!showCompactConfirmedTitle && (
          <div className={`relative ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
            <Input
              value={deliverable.declaredTitle}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder={deliverable.uploaded ? 'Titlul livrabilului - se poate edita manual' : 'Titlul documentului se completeaza dupa upload'}
              className="text-xs pr-24"
            />
            {deliverable.titleSource && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-medium pointer-events-none">
                {deliverable.titleSource === 'auto_detected'
                  ? 'detectat'
                  : deliverable.titleSource === 'edited_by_expert'
                    ? 'editat'
                    : deliverable.titleSource === 'admin_override'
                      ? 'admin'
                      : 'manual'}
              </span>
            )}
          </div>
          )}
          {!renderInlineNotes && !deliverable.titleConfirmed && deliverable.suggestedTitle && deliverable.suggestedTitle !== deliverable.declaredTitle && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseSuggestedTitle}
              className="h-8 w-fit border-blue-300 px-2 text-[10px] text-blue-800 hover:bg-blue-100"
            >
              Foloseste titlul sugerat
            </Button>
          )}
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && !deliverable.titleConfirmed && deliverable.declaredTitle && (
        <div className={`rounded p-1.5 text-[10px] xl:col-start-2 ${
          deliverable.titleMatch === true
            ? 'bg-green-100 text-green-700'
            : deliverable.titleMatch === false
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-600'
        }`}>
          {deliverable.titleMatch === true
            ? (deliverable.titleCheckMessage || 'Titlul se regaseste in prima pagina.')
            : (deliverable.titleCheckMessage || 'Titlul nu a fost gasit in prima pagina.')}
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && hasDuplicateSignal && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900 xl:col-start-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-semibold">Posibila reutilizare / document existent</span>
            {duplicateInfo?.isPreviousPeriod && (
              <Badge variant="outline" className="border-amber-300 bg-white text-[10px] text-amber-800">
                luna anterioara
              </Badge>
            )}
            {duplicateInfo?.isOtherExpert && (
              <Badge variant="outline" className="border-amber-300 bg-white text-[10px] text-amber-800">
                alt expert
              </Badge>
            )}
          </div>
          {duplicateInfo ? (
            <div className="mt-1 space-y-0.5">
              <div className="break-words font-medium">{duplicateInfo.title}</div>
              <div>
                {duplicateInfo.uploadedByExpertName || 'Expert necunoscut'}
                {duplicateInfo.activityDate ? ` / ${duplicateInfo.activityDate}` : ''}
              </div>
              <div>Semnale: {duplicateInfo.issues.map(getDuplicateIssueLabel).join(', ')}</div>
            </div>
          ) : (
            <div className="mt-1">
              Document asociat: {deliverable.possibleDuplicateOfDocumentId || deliverable.duplicateStatus}
            </div>
          )}
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && Boolean(deliverable.common || deliverable.isCommonDeliverable) && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[10px] text-blue-900 xl:col-start-2">
          <div className="font-semibold">Document comun / cross-expert</div>
          <div>
            {deliverable.sharedWithExpertIds?.length
              ? `Va fi propus catre ${deliverable.sharedWithExpertIds.length} colaboratori.`
              : 'Document marcat comun; colaboratorii se confirma in sectiunea de colaborare.'}
          </div>
        </div>
      )}

      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && !deliverable.titleConfirmed && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleConfirmTitle}
          disabled={metadataLocked || deliverable.titleCheckStatus === 'mismatch'}
          className={`justify-self-start border-green-400 text-xs text-green-700 hover:bg-green-50 disabled:border-amber-300 disabled:text-amber-700 ${renderInlineNotes ? 'xl:col-start-1' : ''}`}
        >
          {deliverable.titleCheckStatus === 'mismatch' || deliverable.titleCheckStatus === 'extraction_failed' ? (
            <AlertTriangle className="h-3 w-3 mr-1" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          Confirma titlul
        </Button>
      )}

      {deliverable.uploaded && !deliverable.isPhoto && (
        <div className={renderInlineNotes ? 'xl:col-start-1' : ''}>
          {metadataLocked ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              {DOCUMENT_STADIU_OPTIONS.find((opt) => opt.value === deliverable.stadiu)?.label || 'Stadiu existent'}
            </div>
          ) : (
            <Select
              value={deliverable.stadiu}
              onValueChange={(value: string) => onUpdate({ stadiu: value })}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Stadiu document" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_STADIU_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {showEligibilityControl && renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && (
        <div className="space-y-2 xl:col-start-2">
          {eligibilityCheckEnabled && hasReusableEligibilityCheck ? null : eligibilityCheckEnabled && canRunEligibilityCheck ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiCheck}
              disabled={aiLoading}
              className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              {aiLoading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {aiLoading ? 'Se verifică...' : 'Verifică eligibilitatea livrabilului'}
            </Button>
          ) : eligibilityCheckEnabled ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {eligibilityGateReason || 'Completeaza contextul activitatii inainte de verificarea eligibilitatii.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="text-xs border-slate-300 text-slate-600"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Verificare eligibilitate suspendata temporar
              </Button>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
                {DELIVERABLE_ELIGIBILITY_UI_MESSAGE}
              </div>
            </div>
          )}

          {visibleEligibilityCheck && (
            <EligibilityResultCard
              check={visibleEligibilityCheck}
              onApplySuggestedSettings={handleApplyEligibilitySuggestion}
            />
          )}
        </div>
      )}
      {showEligibilityControl && !renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && eligibilityCheckEnabled && canRunEligibilityCheck && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAiCheck}
          disabled={aiLoading}
          className="w-fit border-indigo-300 text-xs text-indigo-700 hover:bg-indigo-50"
        >
          {aiLoading ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          {aiLoading ? 'Se verifică...' : 'Verifică eligibilitatea livrabilului'}
        </Button>
      )}
      {showEligibilityControl && !renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && eligibilityCheckEnabled && !hasReusableEligibilityCheck && !canRunEligibilityCheck && (
        <div className="w-fit max-w-full rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {eligibilityGateReason || 'Completeaza contextul activitatii inainte de verificarea eligibilitatii.'}
            </span>
          </div>
        </div>
      )}
      {showEligibilityControl && !renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && !eligibilityCheckEnabled && (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled
            className="w-fit border-slate-300 text-xs text-slate-600"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Verificare eligibilitate suspendata temporar
          </Button>
          <div className="w-fit max-w-full rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
            {DELIVERABLE_ELIGIBILITY_UI_MESSAGE}
          </div>
        </div>
      )}
      {showEligibilityControl && !renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && visibleEligibilityCheck && (
        <EligibilityResultCard
          check={visibleEligibilityCheck}
          onApplySuggestedSettings={handleApplyEligibilitySuggestion}
        />
      )}
    </div>
  );
}

export interface DeliverableEligibilityControlProps {
  deliverable: DeliverableSlot;
  relatedDeliverables?: DeliverableSlot[];
  subActivity: string;
  activityTitle: string;
  selectedActivityId?: string;
  catalogDescription?: string;
  catalogObjectives?: string;
  catalogComponent?: string;
  catalogBeneficiaries?: string;
  catalogExpectedResults?: string;
  catalogDeliverables?: string;
  catalogIndicators?: string;
  projectCode?: string;
  month?: number;
  year?: number;
  expertId?: string;
  expertCategory?: string;
  expertFunction?: string;
  expertProjectRole?: string;
  workingGroupId?: string;
  periodGroupId?: string;
  workBlockId?: string;
  workingGroupActivities?: Array<{
    id?: string;
    date?: string;
    activityType?: string;
    title?: string;
    saCode?: string;
    expertId?: string;
    expertName?: string;
  }>;
  collaborators?: Array<{
    id?: string;
    name?: string;
    role?: string;
    positionInProject?: string;
  }>;
  catalogSource?: string;
  ruleVersionId?: string;
  expertName?: string;
  onUpdate: (patch: Partial<DeliverableSlot>) => void;
  deliverableOptions?: string[];
  activityCatalogCandidates?: ActivityCatalog[];
  canCheckEligibility?: boolean;
  eligibilityBlockedReason?: string;
  onApplyEligibilitySuggestion?: (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
    deliverableId: string,
  ) => void;
  className?: string;
}

export function DeliverableEligibilityControl({
  deliverable,
  relatedDeliverables,
  subActivity,
  activityTitle,
  selectedActivityId,
  catalogDescription,
  catalogObjectives,
  catalogComponent,
  catalogBeneficiaries,
  catalogExpectedResults,
  catalogDeliverables,
  catalogIndicators,
  projectCode,
  month,
  year,
  expertId,
  expertCategory,
  expertFunction,
  expertProjectRole,
  workingGroupId,
  periodGroupId,
  workBlockId,
  workingGroupActivities,
  collaborators,
  catalogSource,
  ruleVersionId,
  expertName,
  onUpdate,
  deliverableOptions,
  activityCatalogCandidates = [],
  canCheckEligibility = true,
  eligibilityBlockedReason,
  onApplyEligibilitySuggestion,
  className = 'space-y-2',
}: DeliverableEligibilityControlProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const visibleEligibilityCheck = isEligibilityCheckObsoleteForCurrentActivity(deliverable.eligibilityCheck, {
    subActivity,
    activityTitle,
    selectedActivityId,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  }) ? null : deliverable.eligibilityCheck;
  const hasReusableEligibilityCheck = Boolean(visibleEligibilityCheck);

  if (!deliverable.uploaded || deliverable.isPhoto) return null;

  const textExtractionGateReason = visibleEligibilityCheck ? null : getTextExtractionGateReason(deliverable, relatedDeliverables);
  const eligibilityGateReason = textExtractionGateReason
    || (!deliverable.titleConfirmed
      ? 'Confirma titlul livrabilului inainte de verificarea eligibilitatii.'
      : !deliverable.stadiu
        ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
        : eligibilityBlockedReason);
  const canRunEligibilityCheck = canCheckEligibility && !eligibilityGateReason && !hasReusableEligibilityCheck;

  const handleAiCheck = async () => {
    if (!eligibilityCheckEnabled) return;

    setAiLoading(true);
    try {
      const extractedText = (deliverable.docText || deliverable.firstPageText || '').slice(0, 12000);
      const activityGroupId = selectedActivityId || subActivity;
      const eligibilityDeliverables = getEligibilityDeliverables(deliverable, relatedDeliverables);
      const response = await fetch('/api/ai/check-deliverable-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliverables: eligibilityDeliverables.map((item) => (
            buildEligibilityDocumentPayload(item, activityGroupId, item.id === deliverable.id)
          )),
          primaryDeliverableId: deliverable.id,
          activityGroupId,
          periodGroupId,
          workingGroupId,
          workBlockId,
          workingGroupActivities,
          collaborators,
          documentTitle: getDocumentAuditTitle({
            ...deliverable,
            fileName: deliverable.filename || deliverable.name,
            originalFileName: deliverable.filename || deliverable.name,
          }),
          fileName: deliverable.filename || deliverable.name,
          extractedText,
          selectedActivityId: selectedActivityId || subActivity,
          currentSaCode: subActivity,
          selectedActivityName: activityTitle,
          deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
          activityCatalogCandidates,
          deliverableOptions: typeOptions,
          catalogDescription,
          catalogObjectives,
          catalogComponent,
          catalogBeneficiaries,
          catalogExpectedResults,
          catalogDeliverables,
          catalogIndicators,
          projectCode,
          month,
          year,
          expertId,
          expertCategory,
          expertFunction,
          expertProjectRole,
          catalogSource,
          ruleVersionId,
          expertName,
          textScope: deliverable.docText && deliverable.docText !== deliverable.firstPageText
            ? 'Text extras disponibil din document'
            : 'Prima pagina / inceputul documentului',
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Verificarea eligibilitatii a esuat');

      onUpdate({
        eligibilityCheck: {
          ...result,
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
          modelAuditId: result.modelAuditId,
          analyzedDeliverables: result.analyzedDeliverables,
        },
        aiCheck: {
          eligible: result.status === 'eligibil' || result.status === 'eligibil_cu_observatii'
            ? true
            : result.status === 'neeligibil'
              ? false
              : null,
          reason: result.summary || 'Verificare eligibilitate finalizata.',
          issues: [...(result.missingElements || []), ...(result.riskFlags || [])],
        },
      });
    } catch (error) {
      onUpdate({
        eligibilityCheck: {
          status: 'neconcludent',
          score: 0,
          summary: 'Eroare: ' + (error instanceof Error ? error.message : 'Eroare necunoscuta'),
          checks: [],
          missingElements: [],
          recommendations: ['Reincearca verificarea sau valideaza manual livrabilul.'],
          riskFlags: ['Verificarea API nu a putut fi finalizata.'],
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyEligibilitySuggestion = (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
  ) => {
    if (change === 'deliverableType' && settings.deliverableType) {
      onUpdate({
        type: settings.deliverableType,
        deliverableType: settings.deliverableType,
        eligibilityCheck: null,
        aiCheck: null,
      });
      return;
    }

    onApplyEligibilitySuggestion?.(settings, change, deliverable.id);
  };

  return (
    <div className={className}>
      {eligibilityCheckEnabled && hasReusableEligibilityCheck ? null : eligibilityCheckEnabled && canRunEligibilityCheck ? (
        <div className="space-y-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiCheck}
            disabled={aiLoading}
            className="w-fit border-indigo-300 text-xs text-indigo-700 hover:bg-indigo-50"
          >
            {aiLoading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            {aiLoading ? 'Se verifica...' : 'Verifica eligibilitatea livrabilelor'}
          </Button>
          {relatedDeliverables && relatedDeliverables.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Verifica {relatedDeliverables.length} livrabile incarcate pentru grupul activitatii.
            </p>
          )}
        </div>
      ) : eligibilityCheckEnabled ? (
        <div className="w-fit max-w-full rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {eligibilityGateReason || 'Completeaza contextul activitatii inainte de verificarea eligibilitatii.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled
            className="w-fit border-slate-300 text-xs text-slate-600"
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Verificare eligibilitate suspendata temporar
          </Button>
          <div className="w-fit max-w-full rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
            {DELIVERABLE_ELIGIBILITY_UI_MESSAGE}
          </div>
        </div>
      )}

      {visibleEligibilityCheck && (
        <EligibilityResultCard
          check={visibleEligibilityCheck}
          onApplySuggestedSettings={handleApplyEligibilitySuggestion}
        />
      )}
    </div>
  );
}

function StepBadge({ ok, n, label }: { ok: boolean; n: number; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${ok ? 'text-green-700 font-medium' : 'text-amber-700'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ${
        ok ? 'bg-green-600' : 'bg-amber-500'
      }`}>
        {ok ? <Check className="h-3 w-3" /> : n}
      </div>
      {label}
    </div>
  );
}


function getTitleSourceLabel(source: string) {
  if (source === 'auto_detected') return 'detectat automat';
  if (source === 'edited_by_expert') return 'editat de expert';
  if (source === 'admin_override') return 'suprascris admin';
  if (source === 'manual') return 'manual';
  return source;
}

function getDuplicateIssueLabel(issue: DuplicateIssueType) {
  if (issue === 'same_file_hash') return 'fisier identic';
  if (issue === 'same_first_page_hash') return 'prima pagina identica';
  if (issue === 'similar_extracted_title') return 'titlu similar';
  if (issue === 'similar_content_fingerprint') return 'continut similar';
  if (issue === 'possible_common_unmarked') return 'posibil comun nemarcat';
  if (issue === 'duplicate_detected') return 'duplicat detectat';
  if (issue === 'possible_duplicate') return 'posibil duplicat';
  return issue;
}

function getEligibilityLabel(status: string) {
  if (status === 'eligibil') return 'Eligibil';
  if (status === 'eligibil_cu_observatii') return 'Eligibil cu observații';
  if (status === 'neeligibil') return 'Neeligibil';
  return 'Neconcludent';
}

function getEligibilityClass(status: string) {
  if (status === 'eligibil') return 'bg-green-100 text-green-800 border-green-300';
  if (status === 'eligibil_cu_observatii') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (status === 'neeligibil') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

function EligibilityResultCard({
  check,
  onApplySuggestedSettings,
}: {
  check: NonNullable<DeliverableSlot['eligibilityCheck']>;
  onApplySuggestedSettings?: (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
  ) => void;
}) {
  const warning = check.status === 'neeligibil' || check.status === 'neconcludent';
  const suggestedSettings = check.suggestedSettings;
  const canApplyActivity = Boolean(
    suggestedSettings?.changes?.includes('activity')
    && suggestedSettings.saCode
    && suggestedSettings.activityName
    && onApplySuggestedSettings,
  );
  const canApplyDeliverableType = Boolean(
    suggestedSettings?.changes?.includes('deliverableType')
    && suggestedSettings.deliverableType
    && onApplySuggestedSettings,
  );

  return (
    <div className={`rounded border p-2 text-[10px] ${getEligibilityClass(check.status)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{getEligibilityLabel(check.status)}</div>
        <div className="font-medium">Scor: {check.score}/100</div>
      </div>
      <div className="mt-1">{check.summary}</div>
      {check.analyzedDeliverables && check.analyzedDeliverables.length > 0 && (
        <div className="mt-1">
          <span className="font-medium">Livrabile analizate:</span>{' '}
          {check.analyzedDeliverables.map((item) => (
            `${item.documentTitle || item.fileName || item.id || 'livrabil'}${item.isPrimary ? ' (principal)' : ''}`
          )).join('; ')}
        </div>
      )}
      {warning && (
        <div className="mt-1 font-medium">
          Verifică manual livrabilul înainte de validare.
        </div>
      )}
      {check.checks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.checks.map((item, index) => (
            <li key={`${item.criterion}-${index}`}>
              <span className="font-medium">{item.criterion}</span> ({item.status}): {item.explanation}
            </li>
          ))}
        </ul>
      )}
      {suggestedSettings && (canApplyActivity || canApplyDeliverableType) && (
        <div className="mt-2 rounded border border-indigo-200 bg-white/70 p-2 text-slate-800">
          <div className="font-medium text-indigo-800">Setari sugerate</div>
          <div className="mt-1 text-[10px] text-slate-700">
            {suggestedSettings.reason}
            <span className="ml-1 font-medium">Incredere: {suggestedSettings.confidence}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {canApplyActivity && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-indigo-300 px-2 text-[10px] text-indigo-700 hover:bg-indigo-50"
                onClick={() => onApplySuggestedSettings?.(suggestedSettings, 'activity')}
              >
                Aplica activitatea sugerata ({suggestedSettings.saCode})
              </Button>
            )}
            {canApplyDeliverableType && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-indigo-300 px-2 text-[10px] text-indigo-700 hover:bg-indigo-50"
                onClick={() => onApplySuggestedSettings?.(suggestedSettings, 'deliverableType')}
              >
                Aplica tipul livrabilului
              </Button>
            )}
          </div>
          {canApplyActivity && (
            <div className="mt-1 text-[10px] text-slate-600">
              Activitate propusa: {suggestedSettings.saCode} - {suggestedSettings.activityName}
            </div>
          )}
          {canApplyDeliverableType && (
            <div className="mt-1 text-[10px] text-slate-600">
              Tip livrabil propus: {suggestedSettings.deliverableType}
            </div>
          )}
        </div>
      )}
      {check.missingElements.length > 0 && (
        <div className="mt-2">
          <span className="font-medium">Elemente lipsă:</span> {check.missingElements.join('; ')}
        </div>
      )}
      {check.recommendations.length > 0 && (
        <div className="mt-1">
          <span className="font-medium">Recomandări:</span> {check.recommendations.join('; ')}
        </div>
      )}
      {check.riskFlags.length > 0 && (
        <div className="mt-1">
          <span className="font-medium">Riscuri:</span> {check.riskFlags.join('; ')}
        </div>
      )}
    </div>
  );
}
