'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AlertTriangle, Check, FileText, Image, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_DELIVERABLE_TYPES, DOCUMENT_STADIU_OPTIONS, inferDeliverableStadiuFromEligibility, type DeliverableSlot } from '@/lib/deliverable-types';
import { extractDocxFirstPageText, extractDocxTextWithSource, extractHtmlTextWithSource, extractImageTextWithSource, extractPdfFirstPageTextWithSource, extractPdfTextWithSource, extractXlsxTextWithSource, isImageFile } from '@/lib/document-utils';
import { DELIVERABLE_ELIGIBILITY_UI_MESSAGE, isDeliverableEligibilityCheckEnabledClient } from '@/lib/feature-flags';
import { hasSufficientDeliverableEvidenceForEligibility } from '@/lib/deliverable-eligibility';
import { mergeEligibilityCheckWithPmUnlockTracking } from '@/lib/pm-unlock-status';
import { applyAutomaticTitleSuggestion, formatTitleFromFilename, getTitleValidationText, shouldUseAiTitleSuggestion, suggestTitleFromFirstPage, validateDeclaredTitleInDocumentText } from '@/lib/title-suggestion';
import { EligibilityAttemptError, getDeclaredTitleEligibilityIssue, getDisplayEligibilityScore, getEligibilityAttemptState, getEligibilityFailureSummary, isReusableEligibilityCheck, type EligibilityFailurePhase } from '@/lib/deliverable-check-state';
import { buildDeliverableGroupAssessmentPatches } from '@/lib/deliverable-group-state';
import {
  getDocumentAuditTitle,
  getDuplicateAlertGuidance,
  getDuplicateAlertTitle,
  getDuplicateIssueLabel,
  hashFirstPageText,
  normalizeDocumentTextForFingerprint,
  sha256Hex,
  type DuplicateIssueType,
} from '@/lib/document-sharing';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import type { ActivityCatalog } from '@/lib/types';
import { EligibilityAssessmentDetails } from './eligibility-assessment-details';
import { limitEligibilityDocumentText } from '@/lib/eligibility-assessment';

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

const ELIGIBILITY_CHECK_WAITING_MESSAGE = 'Verificarea eligibilitatii dureaza putin, te rugam sa astepti.';
const ELIGIBILITY_REQUEST_TIMEOUT_MS = 90000;

async function requestDeliverableEligibility(body: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // The server decides whether the current session permits evaluation.
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ELIGIBILITY_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('/api/ai/check-deliverable-eligibility', {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || `Serviciul de evaluare a raspuns cu eroarea HTTP ${response.status}`);
    }
    if (!result || typeof result.status !== 'string' || typeof result.summary !== 'string') {
      throw new Error('Serviciul de evaluare a returnat un raspuns incomplet');
    }
    return result;
  } catch (error) {
    throw new EligibilityAttemptError('evaluation', controller.signal.aborted
      ? 'Serviciul nu a raspuns in 90 de secunde'
      : error instanceof Error ? error.message : 'Serviciul de evaluare nu a raspuns');
  } finally {
    clearTimeout(timeoutId);
  }
}

// Discard late responses after a document, activity, scope or expert edit.
function useEligibilityAttemptGuard(context: unknown[]) {
  const key = JSON.stringify(context);
  const latest = useRef({ key, version: 0 });
  if (latest.current.key !== key) latest.current = { key, version: latest.current.version + 1 };
  useEffect(() => () => { latest.current.version += 1; }, []);
  return () => {
    const version = ++latest.current.version;
    return () => latest.current.key === key && latest.current.version === version;
  };
}

function getEligibilityDocumentContext(deliverable: DeliverableSlot) {
  return [deliverable.id, deliverable.fileHash, deliverable.s3Key, deliverable.filename,
    deliverable.fileHash ? undefined : deliverable.fileData, deliverable.documentId,
    deliverable.declaredTitle, deliverable.type, deliverable.deliverableType, deliverable.slotType,
    deliverable.stadiu, deliverable.uploaded];
}

function getAiStatusForEligibilityResult(status: string | undefined) {
  if (status === 'eligibil' || status === 'eligibil_cu_observatii') return 'eligible';
  if (status === 'neeligibil') return 'ineligible';
  if (status === 'neconcludent') return 'review';
  return undefined;
}

function HourglassIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 2h12" />
      <path d="M6 22h12" />
      <path d="M17 2v4.2a5 5 0 0 1-1.46 3.54L13.28 12l2.26 2.26A5 5 0 0 1 17 17.8V22" />
      <path d="M7 2v4.2a5 5 0 0 0 1.46 3.54L10.72 12l-2.26 2.26A5 5 0 0 0 7 17.8V22" />
      <path d="M9 5h6" />
      <path d="M9 19h6" />
    </svg>
  );
}

function EligibilityCheckingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-2 ${compact ? 'text-xs' : 'rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900 shadow-sm'}`}>
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200">
        <span className="absolute inset-1 rounded-full bg-indigo-100/70" />
        <HourglassIcon className="relative h-4 w-4 animate-spin" />
      </span>
      <span className="font-medium leading-snug">{ELIGIBILITY_CHECK_WAITING_MESSAGE}</span>
    </span>
  );
}

function hasEnoughExtractedTextForEligibility(deliverable: DeliverableSlot, expertCategory?: string) {
  return hasSufficientDeliverableEvidenceForEligibility({
    extractedText: deliverable.docText,
    firstPageText: deliverable.firstPageText,
    documentTitle: deliverable.declaredTitle || deliverable.suggestedTitle,
    titleConfirmed: deliverable.titleConfirmed,
    fileName: deliverable.filename || deliverable.name,
    fileType: deliverable.fileType,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    expertCategory,
  });
}

function getEligibilityDeliverables(deliverable: DeliverableSlot, relatedDeliverables?: DeliverableSlot[]) {
  return (relatedDeliverables && relatedDeliverables.length > 0
    ? relatedDeliverables
    : [deliverable]
  ).filter((item) => item.uploaded && !item.isPhoto);
}

function canAttemptTextExtractionFromStoredFile(deliverable: DeliverableSlot) {
  if (!deliverable.fileData && !deliverable.s3Key) return false;

  const fileName = (deliverable.filename || deliverable.name || '').toLowerCase();
  const fileType = deliverable.fileType || '';
  return isImageFile(fileName)
    || fileType.startsWith('image/')
    || fileName.endsWith('.pdf')
    || fileType === 'application/pdf'
    || fileName.endsWith('.docx')
    || fileName.endsWith('.xlsx')
    || fileName.endsWith('.xls')
    || fileName.endsWith('.html')
    || fileName.endsWith('.htm');
}

function getTextExtractionGateReason(deliverable: DeliverableSlot, relatedDeliverables?: DeliverableSlot[], expertCategory?: string) {
  const eligibilityDeliverables = getEligibilityDeliverables(deliverable, relatedDeliverables);
  if (eligibilityDeliverables.some((item) => hasEnoughExtractedTextForEligibility(item, expertCategory))) return null;
  if (eligibilityDeliverables.some(canAttemptTextExtractionFromStoredFile)) return null;
  if (eligibilityDeliverables.length > 1) {
    return 'Textul extras din livrabilele incarcate pentru grupul activitatii este prea scurt pentru verificarea AI. Reincarca documentele ca PDF/DOCX cu text selectabil sau exporta-le cu OCR.';
  }
  if (deliverable.slotType === 'event_mom') {
    return 'Raportul de eveniment este atasat, dar textul extras este prea scurt pentru verificarea AI. Daca documentul este corect, poti continua; pentru verificare AI completa, reincarca PDF/DOCX cu text selectabil sau OCR.';
  }
  if ((deliverable.filename || deliverable.name || '').toLowerCase().endsWith('.doc')) {
    return 'Documentul este in format Word vechi (.doc), iar aplicatia nu poate extrage text suficient din el pentru verificarea AI. Salveaza-l din Word ca .docx sau exporta-l ca PDF cu text selectabil, apoi reincarca-l.';
  }
  const hasConfirmedTitle = Boolean(deliverable.titleConfirmed || deliverable.declaredTitle || deliverable.suggestedTitle);
  if (hasConfirmedTitle) {
    return 'Titlul a fost identificat, dar textul extras din livrabil este prea scurt pentru verificarea AI. Reincarca documentul ca PDF/DOCX cu text selectabil sau exporta-l cu OCR.';
  }
  if (/\.(ppt|pptx)$/i.test(deliverable.filename || deliverable.name || '')) {
    return 'Nu exista text extras suficient din prezentare. Exporta prezentarea in PDF pentru verificare AI.';
  }
  return 'Nu exista text extras suficient din livrabil. Reincarca documentul ca PDF/DOCX cu text selectabil sau cu imagini clare pentru OCR.';
}

function blobFromDataUrl(dataUrl: string, fallbackType: string) {
  const [header, data] = dataUrl.split(',');
  const contentType = header.match(/data:(.*?);base64/)?.[1] || fallbackType || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

async function getDeliverableFileForTextExtraction(deliverable: DeliverableSlot) {
  const fileName = deliverable.filename || deliverable.name || `livrabil-${deliverable.id}`;
  const fileType = deliverable.fileType || 'application/octet-stream';

  if (deliverable.fileData) {
    return new File([blobFromDataUrl(deliverable.fileData, fileType)], fileName, { type: fileType });
  }

  if (!deliverable.s3Key) return null;

  try {
    const secureDocument = await getSecureDocumentUrl({
      s3Key: deliverable.s3Key,
      originalFileName: fileName,
    });
    const response = await fetch(secureDocument.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return new File([await response.blob()], fileName, { type: fileType });
  } catch (error) {
    throw new EligibilityAttemptError('download', `${fileName}: ${error instanceof Error ? error.message : 'Descarcare nereusita'}`);
  }
}

async function extractDeliverableTextForEligibility(deliverable: DeliverableSlot, expertCategory?: string): Promise<Partial<DeliverableSlot> | null> {
  try {
    return await readDeliverableTextForEligibility(deliverable, expertCategory);
  } catch (error) {
    if (error instanceof EligibilityAttemptError) throw error;
    const fileName = deliverable.filename || deliverable.name || deliverable.id;
    throw new EligibilityAttemptError('extraction', `${fileName}: ${error instanceof Error ? error.message : 'Citire nereusita'}`);
  }
}

async function readDeliverableTextForEligibility(deliverable: DeliverableSlot, expertCategory?: string): Promise<Partial<DeliverableSlot> | null> {
  if (deliverable.textExtractionScope === 'full_document' && hasEnoughExtractedTextForEligibility(deliverable, expertCategory) && deliverable.firstPageText?.trim()) return null;

  const file = await getDeliverableFileForTextExtraction(deliverable);
  if (!file) return null;

  const fileName = file.name || deliverable.filename || deliverable.name || '';
  const lowerFileName = fileName.toLowerCase();
  const isPhoto = isImageFile(fileName) || file.type.startsWith('image/');
  const isPdf = lowerFileName.endsWith('.pdf') || file.type === 'application/pdf';
  const isWordDocument = lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc');
  const isSpreadsheet = lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls');
  const isHtml = lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm');

  let docText: string | null = null;
  let firstPageText: string | null = null;
  let textExtractionSource: DeliverableSlot['textExtractionSource'];
  let fullDocumentRead = false;

  if (isPhoto) {
    const ocrResult = await extractImageTextWithSource(file);
    firstPageText = ocrResult.text;
    docText = ocrResult.text;
    textExtractionSource = ocrResult.source;
    fullDocumentRead = Boolean(ocrResult.text);
  } else if (isWordDocument) {
    firstPageText = await extractDocxFirstPageText(file);
    const docxResult = await extractDocxTextWithSource(file);
    docText = docxResult.text || firstPageText;
    textExtractionSource = docxResult.source || (firstPageText ? 'native' : undefined);
    fullDocumentRead = Boolean(docxResult.text) && docxResult.complete !== false;
  } else if (isPdf) {
    const pdfResult = await extractPdfFirstPageTextWithSource(file);
    const fullPdfResult = await extractPdfTextWithSource(file, { requireComplete: true });
    firstPageText = pdfResult.text || null;
    docText = fullPdfResult.text || firstPageText;
    textExtractionSource = fullPdfResult.source || pdfResult.source;
    fullDocumentRead = Boolean(fullPdfResult.text) && fullPdfResult.complete !== false;
  } else if (isSpreadsheet) {
    const spreadsheetResult = await extractXlsxTextWithSource(file);
    firstPageText = spreadsheetResult.text?.slice(0, 5000) || null;
    docText = spreadsheetResult.text;
    textExtractionSource = spreadsheetResult.source;
    fullDocumentRead = Boolean(spreadsheetResult.text);
  } else if (isHtml) {
    const htmlResult = await extractHtmlTextWithSource(file);
    firstPageText = htmlResult.text?.slice(0, 5000) || null;
    docText = htmlResult.text;
    textExtractionSource = htmlResult.source;
    fullDocumentRead = Boolean(htmlResult.text);
  }

  const readableText = firstPageText || docText;
  if (!readableText) return null;

  return {
    docText,
    firstPageText,
    textExtractionSource,
    textExtractionScope: fullDocumentRead ? 'full_document' : 'first_page',
    firstPageTextHash: await hashFirstPageText(readableText),
    contentFingerprint: normalizeDocumentTextForFingerprint(readableText).slice(0, 500),
    duplicateStatus: 'fingerprinted',
  };
}

function buildEligibilityDocumentPayload(deliverable: DeliverableSlot, activityGroupId: string, isPrimary: boolean) {
  const extractedText = deliverable.docText || deliverable.firstPageText || '';
  const limitedText = limitEligibilityDocumentText(extractedText);
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
    extractedText: limitedText,
    fileHash: deliverable.fileHash,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    duplicateStatus: deliverable.duplicateStatus,
    possibleDuplicateOfDocumentId: deliverable.possibleDuplicateOfDocumentId,
    textScope: limitedText.length < extractedText.length
      ? `Primele ${limitedText.length} caractere analizate; restul documentului nu a fost transmis evaluatorului.`
      : deliverable.textExtractionScope === 'full_document'
        ? 'Text integral extras'
      : 'Text partial / completitudine necunoscuta',
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

function buildTitleEligibilityFailure(reason: string, deliverable: DeliverableSlot, context: {
  subActivity: string;
  activityTitle: string;
  selectedActivityId?: string;
  expertName?: string;
}) {
  return mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
    status: 'neconcludent',
    score: 0,
    summary: reason,
    checks: [
      {
        criterion: 'Titlu declarat',
        status: 'fail',
        explanation: reason,
      },
    ],
    missingElements: ['Titlu declarat regasit in prima pagina'],
    recommendations: ['Corecteaza titlul declarat sau solicita suprascriere de administrator, apoi reia verificarea eligibilitatii.'],
    riskFlags: ['Verificarea eligibilitatii este blocata de validarea titlului.'],
    checkedAt: new Date().toISOString(),
    checkedBy: context.expertName,
    checkedActivityId: context.selectedActivityId || context.subActivity,
    checkedSaCode: context.subActivity,
    checkedActivityName: context.activityTitle,
    checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  });
}

interface DeliverableItemProps {
  deliverable: DeliverableSlot;
  subActivity: string;
  activityTitle: string;
  classificationMode?: 'automatic' | 'manual';
  currentDescription?: string;
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
  onAddDeliverables?: (patches: Partial<DeliverableSlot>[]) => void;
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
  classificationMode = 'manual',
  currentDescription,
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
  onAddDeliverables,
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
  const startEligibilityAttempt = useEligibilityAttemptGuard([subActivity, selectedActivityId, activityTitle, classificationMode, currentDescription, expertId, expertCategory, workBlockId, getEligibilityDocumentContext(deliverable)]);
  const [isEditingConfirmedTitle, setIsEditingConfirmedTitle] = useState(false);
  const hydratedTitleSuggestionRef = useRef<string | null>(null);
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
  const visibleEligibilityCheck = isEligibilityCheckObsoleteForCurrentActivity(deliverable.eligibilityCheck, {
    subActivity,
    activityTitle,
    selectedActivityId,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  }) ? null : deliverable.eligibilityCheck;
  const hasReusableEligibilityCheck = isReusableEligibilityCheck(visibleEligibilityCheck);
  const metadataLocked = Boolean(deliverable.lockedExistingMetadata);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  useEffect(() => {
    if (!deliverable.uploaded || deliverable.isPhoto || deliverable.suggestedTitle) return;

    const titleText = deliverable.firstPageText;
    if (!titleText || titleText.trim().length < 20) return;

    const fileName = deliverable.filename || deliverable.name || '';
    const hydrationKey = [
      deliverable.id,
      deliverable.firstPageTextHash,
      fileName,
      deliverable.declaredTitle,
      deliverable.titleSource,
    ].join('|');
    if (hydratedTitleSuggestionRef.current === hydrationKey) return;
    hydratedTitleSuggestionRef.current = hydrationKey;

    let cancelled = false;
    const applyHydratedSuggestion = async () => {
      let titleSuggestion = suggestTitleFromFirstPage(titleText);

      if (shouldUseAiTitleSuggestion({ text: titleText, suggestion: titleSuggestion })) {
        try {
          const response = await fetch('/api/ai/suggest-document-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName,
              firstPageText: titleText,
              selectedActivityId: selectedActivityId || subActivity,
              selectedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
              projectCode,
              expertName,
            }),
          });
          if (response.ok) {
            const aiSuggestion = await response.json();
            titleSuggestion = {
              suggestedTitle: typeof aiSuggestion.suggestedTitle === 'string' && aiSuggestion.suggestedTitle.trim()
                ? aiSuggestion.suggestedTitle.trim()
                : null,
              confidence: ['high', 'medium', 'low'].includes(aiSuggestion.confidence)
                ? aiSuggestion.confidence
                : titleSuggestion.confidence,
              alternatives: Array.isArray(aiSuggestion.alternatives)
                ? aiSuggestion.alternatives.filter((item: unknown): item is string => typeof item === 'string')
                : titleSuggestion.alternatives,
              reason: typeof aiSuggestion.reason === 'string' && aiSuggestion.reason.trim()
                ? aiSuggestion.reason.trim()
                : titleSuggestion.reason,
            };
          }
        } catch (error) {
          console.warn('AI title suggestion unavailable during hydration:', error);
        }
      }

      const suggestedTitle = titleSuggestion.suggestedTitle;
      if (cancelled || !suggestedTitle) return;

      const titleSuggestionPatch = applyAutomaticTitleSuggestion({
        currentDeclaredTitle: deliverable.declaredTitle,
        currentTitleSource: deliverable.titleSource,
        suggestedTitle,
        confidence: titleSuggestion.confidence,
        documentText: titleText,
        fileName,
      });
      const validation = titleSuggestionPatch.declaredTitle
        ? validateDeclaredTitleInDocumentText({
            documentText: titleText,
            declaredTitle: titleSuggestionPatch.declaredTitle,
            titleSource: titleSuggestionPatch.titleSource,
          })
        : null;

      onUpdate({
        docTitle: suggestedTitle,
        suggestedTitle,
        titleSuggestionConfidence: titleSuggestion.confidence,
        titleSuggestionAlternatives: titleSuggestion.alternatives,
        titleSuggestionReason: titleSuggestion.reason,
        declaredTitle: titleSuggestionPatch.declaredTitle,
        titleSource: titleSuggestionPatch.titleSource,
        titleMatch: validation?.titleMatch ?? null,
        titleCheckStatus: validation?.titleCheckStatus,
        titleCheckMessage: validation?.titleCheckMessage,
        titleConfirmed: titleSuggestionPatch.autoFilled ? false : deliverable.titleConfirmed,
      });
    };

    void applyHydratedSuggestion();

    return () => {
      cancelled = true;
    };
  }, [
    deliverable.declaredTitle,
    deliverable.deliverableType,
    deliverable.docText,
    deliverable.filename,
    deliverable.firstPageText,
    deliverable.firstPageTextHash,
    deliverable.id,
    deliverable.isPhoto,
    deliverable.name,
    deliverable.slotType,
    deliverable.suggestedTitle,
    deliverable.titleConfirmed,
    deliverable.titleSource,
    deliverable.type,
    expertName,
    onUpdate,
    projectCode,
    selectedActivityId,
    subActivity,
  ]);

  const buildFilePatch = async (file: File, currentDeclaredTitle: string): Promise<Partial<DeliverableSlot> | null> => {
    const raw = file.name.replace(/\.[^.]+$/, '');
    const isPhoto = isImageFile(file.name) || file.type.startsWith('image/');
    const lowerFileName = file.name.toLowerCase();
    const isPdf = lowerFileName.endsWith('.pdf');
    const isWordDocument = lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc');
    const isSpreadsheet = lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls');
    const isHtml = lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm');
    const isPresentation = lowerFileName.endsWith('.ppt') || lowerFileName.endsWith('.pptx');

    if (isPresentation) {
      alert('Prezentarile PPT/PPTX nu pot fi incarcate ca livrabile. Exporta prezentarea ca PDF cu text selectabil si reincarca fisierul.');
      return null;
    }

    let docTitle: string | null = null;
    let docText: string | null = null;
    let firstPageText: string | null = null;
    let titleSuggestion = suggestTitleFromFirstPage(null);
    let textExtractionSource: DeliverableSlot['textExtractionSource'];

    setExtractingText(true);
    try {
      if (isPhoto) {
        textExtractionSource = undefined;
        docTitle = formatTitleFromFilename(file.name) || null;
        titleSuggestion = {
          suggestedTitle: docTitle,
          confidence: 'low',
          alternatives: [],
          reason: 'Fotografie atasata ca dovada de eveniment; uploadul nu asteapta extragere OCR.',
        };
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

      if (!titleSuggestion.suggestedTitle && firstPageText) {
        titleSuggestion = suggestTitleFromFirstPage(firstPageText);
        docTitle = titleSuggestion.suggestedTitle;
      }

      const titleText = firstPageText;
      if (shouldUseAiTitleSuggestion({ text: titleText, suggestion: titleSuggestion })) {
        try {
          const response = await fetch('/api/ai/suggest-document-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              firstPageText: titleText,
              selectedActivityId: selectedActivityId || subActivity,
              selectedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
              projectCode,
              expertName,
            }),
          });
          if (response.ok) {
            const aiSuggestion = await response.json();
            titleSuggestion = {
              suggestedTitle: typeof aiSuggestion.suggestedTitle === 'string' && aiSuggestion.suggestedTitle.trim()
                ? aiSuggestion.suggestedTitle.trim()
                : null,
              confidence: ['high', 'medium', 'low'].includes(aiSuggestion.confidence)
                ? aiSuggestion.confidence
                : titleSuggestion.confidence,
              alternatives: Array.isArray(aiSuggestion.alternatives)
                ? aiSuggestion.alternatives.filter((item: unknown): item is string => typeof item === 'string')
                : titleSuggestion.alternatives,
              reason: typeof aiSuggestion.reason === 'string' && aiSuggestion.reason.trim()
                ? aiSuggestion.reason.trim()
                : titleSuggestion.reason,
            };
            docTitle = titleSuggestion.suggestedTitle;
          }
        } catch (error) {
          console.warn('AI title suggestion unavailable:', error);
        }
      }

      if (!docTitle) {
        const hasExtractedText = Boolean(titleText && titleText.trim());
        docTitle = formatTitleFromFilename(file.name) || null;
        titleSuggestion = {
          suggestedTitle: docTitle,
          confidence: 'low',
          alternatives: titleSuggestion.alternatives,
          reason: hasExtractedText
            ? 'Nu a fost identificat un titlu clar sustinut de textul extras din document; propunere orientativa din numele fisierului.'
            : 'Titlu propus din numele fisierului; textul extras nu a oferit un titlu clar.',
        };
      }

      const titleSuggestionPatch = applyAutomaticTitleSuggestion({
        currentDeclaredTitle,
        currentTitleSource: deliverable.titleSource,
        suggestedTitle: docTitle,
        confidence: titleSuggestion.confidence,
        documentText: firstPageText,
        fileName: file.name || deliverable.filename || deliverable.name,
      });
      const validation = isPhoto || !titleSuggestionPatch.declaredTitle
        ? null
        : validateDeclaredTitleInDocumentText({
            documentText: [firstPageText, docText].filter(Boolean).join('\n'),
            declaredTitle: titleSuggestionPatch.declaredTitle,
            titleSource: titleSuggestionPatch.titleSource,
          });
      const fileData = await readFileAsDataUrl(file);
      const fileHash = await sha256Hex(await file.arrayBuffer());
      const firstPageTextHash = await hashFirstPageText(firstPageText || docText);
      const contentFingerprint = normalizeDocumentTextForFingerprint(firstPageText || docText).slice(0, 500);

      return {
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
        textExtractionScope: 'unknown',
        fileHash,
        firstPageTextHash,
        contentFingerprint,
        suggestedTitle: docTitle,
        titleSuggestionConfidence: titleSuggestion.confidence,
        titleSuggestionAlternatives: titleSuggestion.alternatives,
        titleSuggestionReason: titleSuggestion.reason,
        titleSource: titleSuggestionPatch.titleSource,
        titleMatch: validation?.titleMatch ?? null,
        titleCheckStatus: validation?.titleCheckStatus,
        titleCheckMessage: validation?.titleCheckMessage,
        aiCheck: null,
        eligibilityCheck: null,
        titleConfirmed: false,
        declaredTitle: titleSuggestionPatch.declaredTitle,
        duplicateStatus: firstPageTextHash ? 'fingerprinted' : undefined,
        uploadError: undefined,
        possibleDuplicateOfDocumentId: undefined,
      };
    } catch (error) {
      console.error('Error reading deliverable file:', error);
      alert(`Nu am putut citi fisierul ${file.name}. Reincarca documentul sau incearca un alt format.`);
      return null;
    }
  };

  const handleFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(ev.target.files || []);
    if (selectedFiles.length === 0) return;

    setExtractingText(true);
    try {
      const patches: Partial<DeliverableSlot>[] = [];

      for (const [index, file] of selectedFiles.entries()) {
        const patch = await buildFilePatch(file, index === 0 ? deliverable.declaredTitle : '');
        if (patch) patches.push(patch);
      }

      if (patches.length === 0) return;

      onUpdate(patches[0]);
      if (patches.length > 1) {
        onAddDeliverables?.(patches.slice(1).map((patch) => ({
          slotType: deliverable.slotType,
          type: deliverable.type,
          deliverableType: deliverable.deliverableType,
          stadiu: deliverable.stadiu,
          ...patch,
        })));
      }
    } finally {
      setExtractingText(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAiCheck = async () => {
    if (!eligibilityCheckEnabled) return;
    const isCurrentAttempt = startEligibilityAttempt();

    setAiLoading(true);
    const pendingEligibilityCheck = mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
      status: 'neconcludent',
      score: 0,
      executionStatus: 'pending' as const,
      summary: 'Verificarea eligibilitatii a fost pornita. Daca AI nu raspunde, salveaza ciorna pentru verificare PM.',
      checks: [],
      missingElements: [],
      recommendations: ['Poti salva ciorna pentru verificare PM daca analiza automata nu raspunde.'],
      riskFlags: ['Verificare automata in curs sau indisponibila.'],
      checkedAt: new Date().toISOString(),
      checkedBy: expertName,
      checkedActivityId: selectedActivityId || subActivity,
      checkedSaCode: subActivity,
      checkedActivityName: activityTitle,
      checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    });
    onUpdate({
      eligibilityCheck: pendingEligibilityCheck,
      aiStatus: 'review',
      aiCheck: {
        eligible: null,
        reason: 'Verificarea eligibilitatii a fost pornita.',
        issues: ['Verificare automata in curs sau indisponibila.'],
      },
    });
    let failurePhase: EligibilityFailurePhase = 'extraction';
    try {
      const extractionPatch = await extractDeliverableTextForEligibility(deliverable, expertCategory);
      if (!isCurrentAttempt()) return;
      const eligibilityDeliverable = extractionPatch ? { ...deliverable, ...extractionPatch } : deliverable;
      if (extractionPatch) {
        onUpdate(extractionPatch);
      }
      const titleIssue = getDeclaredTitleEligibilityIssue(eligibilityDeliverable);
      if (titleIssue) {
        onUpdate({
          eligibilityCheck: buildTitleEligibilityFailure(titleIssue, eligibilityDeliverable, { subActivity, activityTitle, selectedActivityId, expertName }),
          aiStatus: 'review',
          aiCheck: { eligible: null, reason: titleIssue, issues: [titleIssue] },
        });
        return;
      }
      const extractedText = eligibilityDeliverable.docText || eligibilityDeliverable.firstPageText || '';
      failurePhase = 'evaluation';
      const result = await requestDeliverableEligibility(JSON.stringify({
          documentTitle: getDocumentAuditTitle({
            ...eligibilityDeliverable,
            fileName: eligibilityDeliverable.filename || eligibilityDeliverable.name,
            originalFileName: eligibilityDeliverable.filename || eligibilityDeliverable.name,
          }),
          fileName: eligibilityDeliverable.filename || eligibilityDeliverable.name,
          extractedText: limitEligibilityDocumentText(extractedText),
          deliverables: [
            buildEligibilityDocumentPayload(eligibilityDeliverable, selectedActivityId || subActivity, true),
          ],
          primaryDeliverableId: deliverable.id,
          activityGroupId: selectedActivityId || subActivity,
          periodGroupId,
          workingGroupId,
          workBlockId,
          workingGroupActivities,
          collaborators,
          selectedActivityId,
          currentSaCode: subActivity,
          classificationMode,
          currentDescription,
          selectedActivityName: activityTitle,
          deliverableType: eligibilityDeliverable.type || eligibilityDeliverable.deliverableType || eligibilityDeliverable.slotType,
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
          textScope: buildEligibilityDocumentPayload(eligibilityDeliverable, selectedActivityId || subActivity, true).textScope,
      }));

      if (!isCurrentAttempt()) return;
      const nextEligibilityCheck = mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
        ...result,
        checkedAt: new Date().toISOString(),
        checkedBy: expertName,
        checkedActivityId: result.checkedActivityId || selectedActivityId || subActivity,
        checkedSaCode: subActivity,
        checkedActivityName: result.checkedActivityName || activityTitle,
        checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
        modelAuditId: result.modelAuditId,
        analyzedDeliverables: result.analyzedDeliverables,
      });
      onUpdate({
        eligibilityCheck: nextEligibilityCheck,
        stadiu: inferDeliverableStadiuFromEligibility(deliverable.stadiu, nextEligibilityCheck),
        aiStatus: getAiStatusForEligibilityResult(result.status),
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
      if (!isCurrentAttempt()) return;
      const failureSummary = getEligibilityFailureSummary(error, failurePhase);
      onUpdate({
        eligibilityCheck: mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
          status: 'neconcludent',
          score: 0,
          executionStatus: 'failed' as const,
          summary: failureSummary,
          checks: [],
          missingElements: [],
          recommendations: ['Reincearca verificarea sau salveaza ciorna pentru verificare PM.'],
          riskFlags: ['Eroare tehnica; nu reprezinta o evaluare a eligibilitatii.'],
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
        }),
        aiStatus: 'review',
        aiCheck: { eligible: null, reason: failureSummary, issues: ['Verificare nefinalizata. Reincearca.'] },
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

  const handleRequestPmUnlock = () => {
    if (!visibleEligibilityCheck || visibleEligibilityCheck.status !== 'neeligibil') return;

    onUpdate({
      eligibilityCheck: {
        ...visibleEligibilityCheck,
        pmUnlockRequested: true,
        pmUnlockRequestedAt: new Date().toISOString(),
        pmUnlockRequestedBy: expertName,
        pmUnlockReason: visibleEligibilityCheck.summary,
      },
    });
  };

  const titleValidationText = getTitleValidationText(deliverable.firstPageText, deliverable.docText);

  const validateTitle = (title: string, source: DeliverableSlot['titleSource']) =>
    validateDeclaredTitleInDocumentText({
      documentText: titleValidationText,
      declaredTitle: title,
      titleSource: source,
    });

  const validateTitleForConfirmation = (title: string, source: DeliverableSlot['titleSource']) =>
    validateDeclaredTitleInDocumentText({
      documentText: titleValidationText,
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

  const hasPendingUpload = deliverable.duplicateStatus === 'pending_upload' || Boolean(deliverable.uploadError);
  const step1ok = deliverable.uploaded && !hasPendingUpload;
  const currentTitleValidation = deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle
    ? validateDeclaredTitleInDocumentText({
        documentText: titleValidationText,
        declaredTitle: deliverable.declaredTitle,
        titleSource: deliverable.titleSource,
      })
    : null;
  const hasInvalidConfirmedTitle = Boolean(
    deliverable.titleConfirmed
    && !deliverable.isPhoto
    && (
      currentTitleValidation?.titleCheckStatus === 'mismatch'
      || currentTitleValidation?.titleCheckStatus === 'extraction_failed'
    ),
  );
  const effectiveTitleConfirmed = Boolean(deliverable.titleConfirmed && !hasInvalidConfirmedTitle);
  const effectiveTitleMatch = hasInvalidConfirmedTitle ? false : deliverable.titleMatch;
  const effectiveTitleCheckStatus = hasInvalidConfirmedTitle
    ? (currentTitleValidation?.titleCheckStatus || 'mismatch')
    : deliverable.titleCheckStatus;
  const effectiveTitleCheckMessage = hasInvalidConfirmedTitle
    ? (currentTitleValidation?.titleCheckMessage || 'Titlul confirmat anterior nu mai trece validarea curenta.')
    : deliverable.titleCheckMessage;
  const canConfirmCurrentTitle = effectiveTitleCheckStatus !== 'mismatch'
    && effectiveTitleCheckStatus !== 'extraction_failed';
  const step2ok = deliverable.isPhoto || (deliverable.uploaded && effectiveTitleConfirmed);
  const step3ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.stadiu);
  const step4ok = deliverable.isPhoto || !eligibilityCheckEnabled || (deliverable.uploaded && Boolean(deliverable.aiCheck) && (!visibleEligibilityCheck || hasReusableEligibilityCheck));
  const titleEligibilityIssue = hasReusableEligibilityCheck ? null : getDeclaredTitleEligibilityIssue(deliverable, canAttemptTextExtractionFromStoredFile(deliverable));
  const textExtractionGateReason = visibleEligibilityCheck ? null : getTextExtractionGateReason(deliverable, undefined, expertCategory);
  const eligibilityGateReason = titleEligibilityIssue
    || textExtractionGateReason
    || (!deliverable.stadiu
      ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
      : eligibilityBlockedReason);
  const canRunEligibilityCheck = canCheckEligibility && !eligibilityGateReason && !hasReusableEligibilityCheck;
  const allOk = step1ok && step2ok && step3ok && step4ok;
  const auditTitle = getDocumentAuditTitle({
    ...deliverable,
    fileName: deliverable.filename || deliverable.name,
    originalFileName: deliverable.filename || deliverable.name,
  });
  const hasDocumentTitle = Boolean((deliverable.declaredTitle || deliverable.suggestedTitle || deliverable.docTitle || '').trim());
  const visibleAuditTitle = hasDocumentTitle ? auditTitle : 'Titlu neidentificat in document';
  const hasDuplicateSignal = Boolean(duplicateInfo || deliverable.possibleDuplicateOfDocumentId || (
    deliverable.duplicateStatus
    && deliverable.duplicateStatus !== 'fingerprinted'
    && deliverable.duplicateStatus !== 'pending_upload'
  ));
  const duplicateAlertTitle = getDuplicateAlertTitle({
    issues: duplicateInfo?.issues,
    status: duplicateInfo?.status || deliverable.duplicateStatus,
    isOtherExpert: duplicateInfo?.isOtherExpert,
  });
  const duplicateAlertGuidance = getDuplicateAlertGuidance({
    issues: duplicateInfo?.issues,
    status: duplicateInfo?.status || deliverable.duplicateStatus,
    isOtherExpert: duplicateInfo?.isOtherExpert,
  });
  const showCompactConfirmedTitle = deliverable.uploaded && effectiveTitleConfirmed && !isEditingConfirmedTitle;
  const hasSideNotes = renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && Boolean(
    (!effectiveTitleConfirmed && (deliverable.docText || deliverable.firstPageText || deliverable.suggestedTitle || deliverable.declaredTitle))
    || hasDuplicateSignal
    || hasPendingUpload
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
            value={deliverable.type || deliverable.deliverableType || ''}
            onValueChange={(value: string) => onUpdate({
              type: value,
              deliverableType: value,
              aiCheck: null,
              eligibilityCheck: null,
            })}
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
            type="button"
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
          multiple
          accept=".pdf,.doc,.docx,.html,.htm,.xlsx,.png,.jpg,.jpeg,.gif,.bmp,.webp,image/*"
          onChange={handleFile}
          className="hidden"
        />

        {!deliverable.uploaded ? (
          <Button
            type="button"
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
              type="button"
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

      {renderInlineNotes && deliverable.uploaded && !effectiveTitleConfirmed && (deliverable.docText || deliverable.firstPageText) && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-800 xl:col-start-2">
          {deliverable.textExtractionSource === 'ocr'
            ? 'Text OCR extras pentru autocompletare.'
            : 'Text extras disponibil pentru autocompletare.'}
        </div>
      )}

      {deliverable.uploaded && hasPendingUpload && (
        <div className={`rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900 ${renderInlineNotes ? 'xl:col-start-2' : ''}`}>
          <div className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>Livrabil in asteptare upload S3</span>
          </div>
          <div className="mt-1">
            {deliverable.uploadError || 'Fisierul nu a fost confirmat in S3. Sterge atasarea si reincarca documentul.'}
          </div>
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
          {deliverable.uploaded && !effectiveTitleConfirmed && (
            <div className={`rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700 ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
              <div className="font-medium text-slate-900">Titlu auditabil document</div>
              <div className="mt-0.5 break-words text-xs font-semibold text-slate-950">{visibleAuditTitle}</div>
              {!hasDocumentTitle && (
                <div className="mt-0.5 break-words text-[10px] text-slate-500">
                  Fisier: {deliverable.filename || deliverable.name || 'neatasat'}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="bg-white text-[10px]">
                  {effectiveTitleConfirmed ? 'titlu confirmat' : 'neconfirmat'}
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

          {renderInlineNotes && !effectiveTitleConfirmed && deliverable.suggestedTitle && (
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
          {!renderInlineNotes && !effectiveTitleConfirmed && deliverable.suggestedTitle && deliverable.suggestedTitle !== deliverable.declaredTitle && (
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

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && !effectiveTitleConfirmed && deliverable.declaredTitle && (
        <div className={`rounded p-1.5 text-[10px] xl:col-start-2 ${
          effectiveTitleMatch === true
            ? 'bg-green-100 text-green-700'
            : effectiveTitleMatch === false
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-600'
        }`}>
          {effectiveTitleMatch === true
            ? (effectiveTitleCheckMessage || 'Titlul se regaseste in document.')
            : (effectiveTitleCheckMessage || 'Titlul nu a fost gasit in document.')}
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && hasDuplicateSignal && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900 xl:col-start-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-semibold">{duplicateAlertTitle}</span>
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
              <div>{duplicateAlertGuidance}</div>
            </div>
          ) : (
            <div className="mt-1 space-y-0.5">
              <div>Document asociat: {deliverable.possibleDuplicateOfDocumentId || deliverable.duplicateStatus}</div>
              <div>{duplicateAlertGuidance}</div>
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

      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && !effectiveTitleConfirmed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleConfirmTitle}
          disabled={metadataLocked || !canConfirmCurrentTitle}
          className={`justify-self-start text-xs ${
            canConfirmCurrentTitle
              ? 'border-green-400 text-green-700 hover:bg-green-50'
              : 'border-amber-300 text-amber-700 hover:bg-amber-50 disabled:border-amber-300 disabled:text-amber-700'
          } ${renderInlineNotes ? 'xl:col-start-1' : ''}`}
        >
          {effectiveTitleCheckStatus === 'mismatch' || effectiveTitleCheckStatus === 'extraction_failed' ? (
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
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAiCheck}
              disabled={aiLoading}
              className="h-auto max-w-full whitespace-normal border-indigo-300 py-2 text-xs text-indigo-700 hover:bg-indigo-50"
            >
              {aiLoading ? (
                <EligibilityCheckingIndicator compact />
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Verifică eligibilitatea livrabilului
                </>
              )}
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
                type="button"
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
              classificationMode={classificationMode}
              check={visibleEligibilityCheck}
              isLoading={aiLoading}
              onApplySuggestedSettings={handleApplyEligibilitySuggestion}
              onRequestPmUnlock={handleRequestPmUnlock}
              onRecheck={eligibilityCheckEnabled && canCheckEligibility ? handleAiCheck : undefined}
            />
          )}
        </div>
      )}
      {showEligibilityControl && !renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && eligibilityCheckEnabled && canRunEligibilityCheck && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAiCheck}
          disabled={aiLoading}
          className="h-auto w-fit max-w-full whitespace-normal border-indigo-300 py-2 text-xs text-indigo-700 hover:bg-indigo-50"
        >
          {aiLoading ? (
            <EligibilityCheckingIndicator compact />
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              Verifică eligibilitatea livrabilului
            </>
          )}
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
            type="button"
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
          classificationMode={classificationMode}
          check={visibleEligibilityCheck}
          isLoading={aiLoading}
          onApplySuggestedSettings={handleApplyEligibilitySuggestion}
          onRequestPmUnlock={handleRequestPmUnlock}
              onRecheck={eligibilityCheckEnabled && canCheckEligibility ? handleAiCheck : undefined}
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
  classificationMode?: 'automatic' | 'manual';
  currentDescription?: string;
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
  onUpdateRelatedDeliverable?: (id: string, patch: Partial<DeliverableSlot>) => void;
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
  classificationMode = 'manual',
  currentDescription,
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
  onUpdateRelatedDeliverable,
  deliverableOptions,
  activityCatalogCandidates = [],
  canCheckEligibility = true,
  eligibilityBlockedReason,
  onApplyEligibilitySuggestion,
  className = 'space-y-2',
}: DeliverableEligibilityControlProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const startEligibilityAttempt = useEligibilityAttemptGuard([subActivity, selectedActivityId, activityTitle, classificationMode, currentDescription, expertId, expertCategory, workBlockId, getEligibilityDocumentContext(deliverable), getEligibilityDeliverables(deliverable, relatedDeliverables).map(getEligibilityDocumentContext)]);
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const visibleEligibilityCheck = isEligibilityCheckObsoleteForCurrentActivity(deliverable.eligibilityCheck, {
    subActivity,
    activityTitle,
    selectedActivityId,
    deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
  }) ? null : deliverable.eligibilityCheck;
  const hasReusableEligibilityCheck = isReusableEligibilityCheck(visibleEligibilityCheck);

  if (!deliverable.uploaded || deliverable.isPhoto) return null;

  const textExtractionGateReason = visibleEligibilityCheck ? null : getTextExtractionGateReason(deliverable, relatedDeliverables, expertCategory);
  const titleEligibilityIssue = hasReusableEligibilityCheck ? null : getDeclaredTitleEligibilityIssue(deliverable, canAttemptTextExtractionFromStoredFile(deliverable));
  const eligibilityGateReason = titleEligibilityIssue
    || textExtractionGateReason
    || (!deliverable.stadiu
      ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
      : eligibilityBlockedReason);
  const canRunEligibilityCheck = canCheckEligibility && !eligibilityGateReason && !hasReusableEligibilityCheck;

  const handleAiCheck = async () => {
    if (!eligibilityCheckEnabled) return;
    const isCurrentAttempt = startEligibilityAttempt();

    setAiLoading(true);
    const pendingEligibilityCheck = mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
      status: 'neconcludent',
      score: 0,
      executionStatus: 'pending' as const,
      summary: 'Verificarea eligibilitatii a fost pornita. Daca AI nu raspunde, salveaza ciorna pentru verificare PM.',
      checks: [],
      missingElements: [],
      recommendations: ['Poti salva ciorna pentru verificare PM daca analiza automata nu raspunde.'],
      riskFlags: ['Verificare automata in curs sau indisponibila.'],
      checkedAt: new Date().toISOString(),
      checkedBy: expertName,
      checkedActivityId: selectedActivityId || subActivity,
      checkedSaCode: subActivity,
      checkedActivityName: activityTitle,
      checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
    });
    onUpdate({
      eligibilityCheck: pendingEligibilityCheck,
      aiStatus: 'review',
      aiCheck: {
        eligible: null,
        reason: 'Verificarea eligibilitatii a fost pornita.',
        issues: ['Verificare automata in curs sau indisponibila.'],
      },
    });
    let failurePhase: EligibilityFailurePhase = 'extraction';
    try {
      const activityGroupId = selectedActivityId || subActivity;
      const eligibilityDeliverables = await Promise.all(
        getEligibilityDeliverables(deliverable, relatedDeliverables).map(async (item) => {
          const extractionPatch = await extractDeliverableTextForEligibility(item, expertCategory);
          const nextItem = extractionPatch ? { ...item, ...extractionPatch } : item;
          if (!isCurrentAttempt()) throw new Error('Contextul verificarii s-a schimbat');
          if (extractionPatch) {
            if (item.id === deliverable.id) onUpdate(extractionPatch);
            else onUpdateRelatedDeliverable?.(item.id, extractionPatch);
          }
          return nextItem;
        }),
      );
      if (!isCurrentAttempt()) return;
      const primaryEligibilityDeliverable = eligibilityDeliverables.find((item) => item.id === deliverable.id) || deliverable;
      const titleIssue = getDeclaredTitleEligibilityIssue(primaryEligibilityDeliverable);
      if (titleIssue) {
        onUpdate({
          eligibilityCheck: buildTitleEligibilityFailure(titleIssue, primaryEligibilityDeliverable, { subActivity, activityTitle, selectedActivityId, expertName }),
          aiStatus: 'review',
          aiCheck: { eligible: null, reason: titleIssue, issues: [titleIssue] },
        });
        return;
      }
      const extractedText = primaryEligibilityDeliverable.docText || primaryEligibilityDeliverable.firstPageText || '';
      failurePhase = 'evaluation';
      const result = await requestDeliverableEligibility(JSON.stringify({
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
            ...primaryEligibilityDeliverable,
            fileName: primaryEligibilityDeliverable.filename || primaryEligibilityDeliverable.name,
            originalFileName: primaryEligibilityDeliverable.filename || primaryEligibilityDeliverable.name,
          }),
          fileName: primaryEligibilityDeliverable.filename || primaryEligibilityDeliverable.name,
          extractedText: limitEligibilityDocumentText(extractedText),
          selectedActivityId,
          currentSaCode: subActivity,
          classificationMode,
          currentDescription,
          selectedActivityName: activityTitle,
          deliverableType: primaryEligibilityDeliverable.type || primaryEligibilityDeliverable.deliverableType || primaryEligibilityDeliverable.slotType,
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
          textScope: buildEligibilityDocumentPayload(primaryEligibilityDeliverable, activityGroupId, true).textScope,
      }));

      if (!isCurrentAttempt()) return;
      const assessmentPatches = buildDeliverableGroupAssessmentPatches({
        deliverables: eligibilityDeliverables,
        result,
        checkedAt: new Date().toISOString(),
        checkedBy: expertName,
        selectedActivityId,
        saCode: subActivity,
        activityTitle,
      });
      for (const update of assessmentPatches) {
        if (!isCurrentAttempt()) return;
        if (update.id === deliverable.id) onUpdate(update.patch);
        else onUpdateRelatedDeliverable?.(update.id, update.patch);
      }
    } catch (error) {
      if (!isCurrentAttempt()) return;
      const failureSummary = getEligibilityFailureSummary(error, failurePhase);
      onUpdate({
        eligibilityCheck: mergeEligibilityCheckWithPmUnlockTracking(deliverable.eligibilityCheck, {
          status: 'neconcludent',
          score: 0,
          executionStatus: 'failed' as const,
          summary: failureSummary,
          checks: [],
          missingElements: [],
          recommendations: ['Reincearca verificarea sau salveaza ciorna pentru verificare PM.'],
          riskFlags: ['Eroare tehnica; nu reprezinta o evaluare a eligibilitatii.'],
          checkedAt: new Date().toISOString(),
          checkedBy: expertName,
          checkedActivityId: selectedActivityId || subActivity,
          checkedSaCode: subActivity,
          checkedActivityName: activityTitle,
          checkedDeliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
        }),
        aiStatus: 'review',
        aiCheck: { eligible: null, reason: failureSummary, issues: ['Verificare nefinalizata. Reincearca.'] },
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

  const handleRequestPmUnlock = () => {
    if (!visibleEligibilityCheck || visibleEligibilityCheck.status !== 'neeligibil') return;

    onUpdate({
      eligibilityCheck: {
        ...visibleEligibilityCheck,
        pmUnlockRequested: true,
        pmUnlockRequestedAt: new Date().toISOString(),
        pmUnlockRequestedBy: expertName,
        pmUnlockReason: visibleEligibilityCheck.summary,
      },
    });
  };

  return (
    <div className={className}>
      {eligibilityCheckEnabled && hasReusableEligibilityCheck ? null : eligibilityCheckEnabled && canRunEligibilityCheck ? (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAiCheck}
            disabled={aiLoading}
            className="h-auto w-fit max-w-full whitespace-normal border-indigo-300 py-2 text-xs text-indigo-700 hover:bg-indigo-50"
          >
            {aiLoading ? (
              <EligibilityCheckingIndicator compact />
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                Verifica eligibilitatea livrabilelor
              </>
            )}
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
            type="button"
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
          classificationMode={classificationMode}
          check={visibleEligibilityCheck}
          isLoading={aiLoading}
          onApplySuggestedSettings={handleApplyEligibilitySuggestion}
          onRequestPmUnlock={handleRequestPmUnlock}
              onRecheck={eligibilityCheckEnabled && canCheckEligibility ? handleAiCheck : undefined}
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
  classificationMode = 'manual',
  isLoading = false,
  onApplySuggestedSettings,
  onRequestPmUnlock,
  onRecheck,
}: {
  check: NonNullable<DeliverableSlot['eligibilityCheck']>;
  classificationMode?: 'automatic' | 'manual';
  isLoading?: boolean;
  onApplySuggestedSettings?: (
    settings: EligibilitySuggestedSettings,
    change: EligibilitySuggestedSettingsChange,
  ) => void;
  onRequestPmUnlock?: () => void;
  onRecheck?: () => void;
}) {
  const warning = check.status === 'neeligibil' || check.status === 'neconcludent';
  const isNeeligibil = check.status === 'neeligibil';
  const isNeconcludent = check.status === 'neconcludent';
  const attemptState = getEligibilityAttemptState(check);
  const displayScore = getDisplayEligibilityScore(check);
  const isCheckingInProgress = isLoading && attemptState === 'pending';
  const isUnfinishedAttempt = attemptState !== 'result';
  const pmUnlockRequested = Boolean(check.pmUnlockRequested);
  const suggestedSettings = check.suggestedSettings;
  const canApplyActivity = Boolean(
    (classificationMode !== 'automatic' || check.classification?.requiresSaConfirmation)
    && suggestedSettings?.changes?.includes('activity')
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
        <div className="font-semibold">{isCheckingInProgress ? 'Verificare in curs' : isUnfinishedAttempt ? 'Verificare nefinalizata' : getEligibilityLabel(check.status)}</div>
        {displayScore !== null && <div className="font-medium">Scor: {displayScore}/100</div>}
      </div>
      {onRecheck && !isUnfinishedAttempt && (
        <Button type="button" variant="outline" size="sm" disabled={isLoading} onClick={onRecheck} className="mt-2 h-7 text-xs">
          Reevalueaza cu documentele si contextul actual
        </Button>
      )}
      <div className="mt-1">{check.summary}</div>
      <EligibilityAssessmentDetails check={check} />
      {check.analyzedDeliverables && check.analyzedDeliverables.length > 0 && (
        <div className="mt-1">
          <span className="font-medium">Livrabile analizate:</span>{' '}
          {check.analyzedDeliverables.map((item) => (
            `${item.documentTitle || item.fileName || item.id || 'livrabil'}${item.isPrimary ? ' (principal)' : ''}`
          )).join('; ')}
        </div>
      )}
      {warning && !isUnfinishedAttempt && (
        <div className="mt-1 font-medium">
          Verifică manual livrabilul înainte de validare.
        </div>
      )}
      {isCheckingInProgress ? (
        <div className="mt-2">
          <EligibilityCheckingIndicator />
        </div>
      ) : isNeconcludent && (
        <div className="mt-1 rounded border border-amber-200 bg-white/80 p-2 text-slate-800">
          {isUnfinishedAttempt
            ? 'Nu exista un rezultat final al evaluarii. Corecteaza problema indicata si reincearca verificarea.'
            : 'Rezultatul este neconcludent. Verifica observatiile evaluarii si completeaza documentatia necesara.'}
        </div>
      )}
      {isNeeligibil && !pmUnlockRequested && onRequestPmUnlock && (
        <div className="mt-2 rounded border border-red-200 bg-white/80 p-2 text-slate-800">
          <div className="text-[10px] text-slate-700">
            Daca livrabilul trebuie pastrat in raportare, solicita deblocare PM. Cererea permite continuarea activitatii, dar nu aproba livrabilul automat.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 border-red-300 px-2 text-[10px] text-red-700 hover:bg-red-50"
            onClick={onRequestPmUnlock}
          >
            Solicita deblocare PM
          </Button>
        </div>
      )}
      {isNeeligibil && pmUnlockRequested && (
        <div className="mt-2 rounded border border-amber-200 bg-white/80 p-2 text-[10px] text-slate-700">
          Deblocare PM solicitata
          {check.pmUnlockRequestedAt ? ` la ${check.pmUnlockRequestedAt}` : ''}
          {check.pmUnlockRequestedBy ? ` de ${check.pmUnlockRequestedBy}` : ''}.
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
                {classificationMode === 'automatic' ? 'Confirma schimbarea SA si reia analiza' : check.classification?.requiresSaConfirmation ? 'Confirma schimbarea SA si activitatii' : 'Aplica activitatea sugerata'} ({suggestedSettings.saCode})
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
