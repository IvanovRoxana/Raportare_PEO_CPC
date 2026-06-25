'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, FileText, Image, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_DELIVERABLE_TYPES, DOCUMENT_STADIU_OPTIONS, type DeliverableSlot } from '@/lib/deliverable-types';
import { extractDocxFirstPageText, extractDocxText, extractImageTextWithSource, extractPdfFirstPageTextWithSource, extractPdfTextWithSource, isImageFile } from '@/lib/document-utils';
import { DELIVERABLE_ELIGIBILITY_UI_MESSAGE, isDeliverableEligibilityCheckEnabledClient } from '@/lib/feature-flags';
import { applyAutomaticTitleSuggestion, suggestTitleFromFirstPage, validateDeclaredTitleOnFirstPage } from '@/lib/title-suggestion';
import { getDocumentAuditTitle, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex, type DuplicateIssueType } from '@/lib/document-sharing';

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
  expertName?: string;
  onUpdate: (patch: Partial<DeliverableSlot>) => void;
  onRemove?: () => void;
  showSteps?: boolean;
  required?: boolean;
  label?: string;
  hint?: string;
  deliverableOptions?: string[];
  duplicateInfo?: DeliverableDuplicateInfo;
  canCheckEligibility?: boolean;
  eligibilityBlockedReason?: string;
  notesMode?: 'inline' | 'external';
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
  expertName,
  onUpdate,
  onRemove,
  showSteps = true,
  required = false,
  label,
  hint,
  deliverableOptions,
  duplicateInfo,
  canCheckEligibility = true,
  eligibilityBlockedReason,
  notesMode = 'inline',
}: DeliverableItemProps) {
  const renderInlineNotes = notesMode === 'inline';
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();

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
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

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
      } else if (isDocx) {
        firstPageText = await extractDocxFirstPageText(file);
        titleSuggestion = suggestTitleFromFirstPage(firstPageText);
        docTitle = titleSuggestion.suggestedTitle;
        docText = await extractDocxText(file);
        textExtractionSource = docText || firstPageText ? 'native' : undefined;
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
      }

      const suggestion = applyAutomaticTitleSuggestion({
        currentDeclaredTitle: deliverable.declaredTitle,
        suggestedTitle: docTitle,
      });
      const validation = isPhoto || !suggestion.declaredTitle
        ? null
        : validateDeclaredTitleOnFirstPage({
            firstPageText,
            declaredTitle: suggestion.declaredTitle,
            titleSource: suggestion.titleSource,
          });
      const fileData = await readFileAsDataUrl(file);
      const fileHash = await sha256Hex(await file.arrayBuffer());
      const firstPageTextHash = await hashFirstPageText(firstPageText || docText);
      const contentFingerprint = normalizeDocumentTextForFingerprint(firstPageText || docText).slice(0, 500);

      onUpdate({
        filename: file.name,
        rawFilename: raw,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
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
          selectedActivityId: selectedActivityId || subActivity,
          selectedActivityName: activityTitle,
          deliverableType: deliverable.type || deliverable.deliverableType || deliverable.slotType,
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
          modelAuditId: result.modelAuditId,
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
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  const validateTitle = (title: string, source: DeliverableSlot['titleSource']) =>
    validateDeclaredTitleOnFirstPage({
      firstPageText: deliverable.firstPageText || deliverable.docText || deliverable.docTitle,
      declaredTitle: title,
      titleSource: source,
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
    const validation = validateTitle(deliverable.declaredTitle, deliverable.titleSource);
    if (validation.titleCheckStatus === 'mismatch' || validation.titleCheckStatus === 'extraction_failed') {
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
    if (fileRef.current) fileRef.current.value = '';
  };

  const step1ok = deliverable.uploaded;
  const step2ok = deliverable.isPhoto || (deliverable.uploaded && deliverable.titleConfirmed);
  const step3ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.stadiu);
  const step4ok = deliverable.isPhoto || !eligibilityCheckEnabled || (deliverable.uploaded && !!deliverable.aiCheck);
  const eligibilityGateReason = !deliverable.titleConfirmed
    ? 'Confirma titlul livrabilului inainte de verificarea eligibilitatii.'
    : !deliverable.stadiu
      ? 'Selecteaza stadiul documentului inainte de verificarea eligibilitatii.'
      : eligibilityBlockedReason;
  const canRunEligibilityCheck = canCheckEligibility && !eligibilityGateReason;
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
  const hasSideNotes = renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && Boolean(
    deliverable.docText
    || deliverable.firstPageText
    || deliverable.suggestedTitle
    || deliverable.declaredTitle
    || hasDuplicateSignal
    || deliverable.common
    || deliverable.isCommonDeliverable
    || eligibilityCheckEnabled
    || deliverable.eligibilityCheck
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
          accept=".pdf,.doc,.docx,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif"
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

      {renderInlineNotes && deliverable.uploaded && (deliverable.docText || deliverable.firstPageText) && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-800 xl:col-start-2">
          {deliverable.textExtractionSource === 'ocr'
            ? 'Text OCR extras pentru autocompletare.'
            : 'Text extras disponibil pentru autocompletare.'}
        </div>
      )}

      {!deliverable.isPhoto && (
        <div className={`space-y-1.5 ${renderInlineNotes ? 'xl:contents' : ''}`}>
          {deliverable.uploaded && (
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

          {renderInlineNotes && deliverable.suggestedTitle && (
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
          {!renderInlineNotes && deliverable.suggestedTitle && deliverable.suggestedTitle !== deliverable.declaredTitle && (
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

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && (
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
          disabled={deliverable.titleCheckStatus === 'mismatch' || deliverable.titleCheckStatus === 'extraction_failed'}
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

      {deliverable.titleConfirmed && (
        <Badge variant="outline" className={`w-fit border-green-300 bg-green-50 text-[10px] text-green-700 ${renderInlineNotes ? 'xl:col-start-1' : ''}`}>
          <Check className="h-3 w-3 mr-1" />
          Titlu confirmat
        </Badge>
      )}

      {deliverable.uploaded && !deliverable.isPhoto && (
        <div className={renderInlineNotes ? 'xl:col-start-1' : ''}>
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
        </div>
      )}

      {renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && (
        <div className="space-y-2 xl:col-start-2">
          {eligibilityCheckEnabled && canRunEligibilityCheck ? (
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

          {deliverable.eligibilityCheck && (
            <EligibilityResultCard check={deliverable.eligibilityCheck} />
          )}
        </div>
      )}
      {!renderInlineNotes && deliverable.uploaded && !deliverable.isPhoto && eligibilityCheckEnabled && canRunEligibilityCheck && (
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

function EligibilityResultCard({ check }: { check: NonNullable<DeliverableSlot['eligibilityCheck']> }) {
  const warning = check.status === 'neeligibil' || check.status === 'neconcludent';

  return (
    <div className={`rounded border p-2 text-[10px] ${getEligibilityClass(check.status)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{getEligibilityLabel(check.status)}</div>
        <div className="font-medium">Scor: {check.score}/100</div>
      </div>
      <div className="mt-1">{check.summary}</div>
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
