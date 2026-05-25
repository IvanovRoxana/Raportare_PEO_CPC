'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, FileText, Image, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_DELIVERABLE_TYPES, DOCUMENT_STADIU_OPTIONS, type DeliverableSlot } from '@/lib/deliverable-types';
import { extractDocxFirstPageText, extractDocxText, extractPdfFirstPageText, isImageFile } from '@/lib/document-utils';
import { DELIVERABLE_ELIGIBILITY_UI_MESSAGE, isDeliverableEligibilityCheckEnabledClient } from '@/lib/feature-flags';
import { applyAutomaticTitleSuggestion, suggestTitleFromFirstPage, validateDeclaredTitleOnFirstPage } from '@/lib/title-suggestion';

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
}: DeliverableItemProps) {
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState(false);
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

    if (!isPhoto && isDocx) {
      firstPageText = await extractDocxFirstPageText(file);
      titleSuggestion = suggestTitleFromFirstPage(firstPageText);
      docTitle = titleSuggestion.suggestedTitle;
      docText = await extractDocxText(file);
    } else if (!isPhoto && isPdf) {
      firstPageText = await extractPdfFirstPageText(file);
      titleSuggestion = suggestTitleFromFirstPage(firstPageText);
      docTitle = titleSuggestion.suggestedTitle;
      docText = firstPageText;
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
    });
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
          documentTitle: deliverable.declaredTitle || deliverable.suggestedTitle || deliverable.docTitle,
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
      docTitle: null,
      docText: null,
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
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const step1ok = deliverable.uploaded;
  const step2ok = deliverable.isPhoto || (deliverable.uploaded && deliverable.titleConfirmed);
  const step3ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.stadiu);
  const step4ok = deliverable.isPhoto || !eligibilityCheckEnabled || (deliverable.uploaded && !!deliverable.aiCheck);
  const allOk = step1ok && step2ok && step3ok && step4ok;

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
    <div className={`border rounded-lg p-3 ${borderColor} ${bgColor} flex flex-col gap-2`}>
      {showSteps && !deliverable.isPhoto && (
        <div className="flex gap-3 flex-wrap p-2 rounded-md bg-white/50 mb-1">
          <StepBadge ok={step1ok} n={1} label="Fisier incarcat" />
          <StepBadge ok={step2ok} n={2} label="Titlu confirmat" />
          <StepBadge ok={step3ok} n={3} label="Stadiu selectat" />
          <StepBadge ok={step4ok} n={4} label={eligibilityCheckEnabled ? 'Eligibilitate verificata' : 'Verificare manuala PM'} />
        </div>
      )}

      <div className="flex gap-2 items-center">
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

      <div>
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
            className="w-full text-xs border-dashed"
          >
            <Upload className="h-3 w-3 mr-2" />
            Alege fisier
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

      {!deliverable.isPhoto && (
        <div className="space-y-1.5">
          {deliverable.suggestedTitle && (
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[10px] text-blue-900">
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

          <div className="relative">
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
        </div>
      )}

      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && (
        <div className={`text-[10px] p-1.5 rounded ${
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

      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && !deliverable.titleConfirmed && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleConfirmTitle}
          disabled={deliverable.titleCheckStatus === 'mismatch' || deliverable.titleCheckStatus === 'extraction_failed'}
          className="text-xs border-green-400 text-green-700 hover:bg-green-50 disabled:border-amber-300 disabled:text-amber-700"
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
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-[10px]">
          <Check className="h-3 w-3 mr-1" />
          Titlu confirmat
        </Badge>
      )}

      {deliverable.uploaded && !deliverable.isPhoto && (
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

      {deliverable.uploaded && !deliverable.isPhoto && (
        <div className="space-y-2">
          {eligibilityCheckEnabled ? (
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
