'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, X, FileText, Image, Check, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { ALL_DELIVERABLE_TYPES, DOCUMENT_STADIU_OPTIONS, type DeliverableSlot, titleContains } from '@/lib/deliverable-types';
import { extractDocxTitle, extractDocxText, extractPdfTitle, isImageFile } from '@/lib/document-utils';

interface DeliverableItemProps {
  deliverable: DeliverableSlot;
  apiKey: string | null;
  subActivity: string;
  activityTitle: string;
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
  apiKey,
  subActivity,
  activityTitle,
  onUpdate,
  onRemove,
  showSteps = true,
  required = false,
  label,
  hint,
  deliverableOptions,
}: DeliverableItemProps) {
  // Use provided options or fall back to default
  const typeOptions = deliverableOptions || ALL_DELIVERABLE_TYPES;
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    const raw = file.name.replace(/\.[^.]+$/, '');
    const isPhoto = isImageFile(file.name);
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

    let docTitle: string | null = null;
    let docText: string | null = null;

    if (!isPhoto && isDocx) {
      docTitle = await extractDocxTitle(file);
      docText = await extractDocxText(file);
    } else if (!isPhoto && isPdf) {
      docTitle = await extractPdfTitle(file);
    }

    const existingTitle = deliverable.declaredTitle || '';
    const suggestedTitle = docTitle && !existingTitle ? docTitle : existingTitle;
    const tm = isPhoto ? null : (docTitle && suggestedTitle ? titleContains(docTitle, suggestedTitle) : null);

    onUpdate({
      filename: file.name,
      rawFilename: raw,
      uploaded: true,
      isPhoto,
      docTitle,
      docText,
      titleMatch: tm,
      aiCheck: null,
      titleConfirmed: false,
      declaredTitle: suggestedTitle,
    });
  };

  const handleAiCheck = async () => {
    if (!apiKey) {
      alert('Configurează cheia API Claude (butonul Setări din header)');
      return;
    }

    setAiLoading(true);
    try {
      const response = await fetch('/api/ai/verify-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          subActivity,
          activityTitle,
          deliverableType: deliverable.type,
          declaredTitle: deliverable.declaredTitle,
          docText: deliverable.docText,
        }),
      });

      if (!response.ok) throw new Error('AI verification failed');
      const result = await response.json();
      onUpdate({ aiCheck: result });
    } catch (error) {
      onUpdate({
        aiCheck: {
          eligible: null,
          reason: 'Eroare: ' + (error instanceof Error ? error.message : 'Unknown error'),
          issues: [],
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleTitleChange = (title: string) => {
    const tm = deliverable.docTitle ? titleContains(deliverable.docTitle, title) : null;
    onUpdate({ declaredTitle: title, titleMatch: tm });
  };

  const handleConfirmTitle = () => {
    onUpdate({ titleConfirmed: true });
  };

  const handleRemoveFile = () => {
    onUpdate({
      uploaded: false,
      filename: '',
      rawFilename: '',
      docTitle: null,
      docText: null,
      titleMatch: null,
      aiCheck: null,
      titleConfirmed: false,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  // Step completion status
  const step1ok = deliverable.uploaded;
  const step2ok = deliverable.isPhoto || (deliverable.uploaded && deliverable.titleConfirmed);
  const step3ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.stadiu);
  const step4ok = deliverable.isPhoto || (deliverable.uploaded && !!deliverable.aiCheck);
  const allOk = step1ok && step2ok && step3ok && step4ok;

  // Border and background colors based on status
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
      {/* Progress Steps */}
      {showSteps && !deliverable.isPhoto && (
        <div className="flex gap-3 flex-wrap p-2 rounded-md bg-white/50 mb-1">
          <StepBadge ok={step1ok} n={1} label="Fișier încărcat" />
          <StepBadge ok={step2ok} n={2} label="Titlu confirmat" />
          <StepBadge ok={step3ok} n={3} label="Stadiu selectat" />
          <StepBadge ok={step4ok} n={4} label="Eligibilitate verificată" />
        </div>
      )}

      {/* Type selector + Remove button */}
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
            onValueChange={(value) => onUpdate({ type: value, aiCheck: null })}
          >
            <SelectTrigger className="flex-1 text-xs">
              <SelectValue placeholder="— Tip livrabil —" />
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

      {/* File Upload */}
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
            Alege fișier
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

      {/* Title Input (for documents, not photos) */}
      {!deliverable.isPhoto && (
        <div className="relative">
          <Input
            value={deliverable.declaredTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={deliverable.uploaded 
              ? "Titlul extras automat — poți modifica..." 
              : "Titlul documentului (se completează automat după upload)..."
            }
            className="text-xs pr-16"
          />
          {deliverable.docTitle && deliverable.declaredTitle && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-green-700 font-medium pointer-events-none">
              ↑ extras
            </span>
          )}
        </div>
      )}

      {/* Title Match Status */}
      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && deliverable.docTitle && (
        <div className={`text-[10px] p-1.5 rounded ${
          deliverable.titleMatch === true 
            ? 'bg-green-100 text-green-700' 
            : deliverable.titleMatch === false 
            ? 'bg-amber-100 text-amber-700' 
            : 'bg-slate-100 text-slate-600'
        }`}>
          {deliverable.titleMatch === true 
            ? '✓ Titlul găsit pe prima pagină' 
            : `⚠ Titlul NU găsit: "${deliverable.docTitle?.slice(0, 60)}"`
          }
        </div>
      )}

      {/* Confirm Title Button */}
      {deliverable.uploaded && !deliverable.isPhoto && deliverable.declaredTitle && !deliverable.titleConfirmed && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleConfirmTitle}
          className="text-xs border-green-400 text-green-700 hover:bg-green-50"
        >
          <Check className="h-3 w-3 mr-1" />
          Confirmă titlul
        </Button>
      )}

      {deliverable.titleConfirmed && (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-[10px]">
          <Check className="h-3 w-3 mr-1" />
          Titlu confirmat
        </Badge>
      )}

      {/* Stadiu Selector */}
      {deliverable.uploaded && !deliverable.isPhoto && (
        <Select
          value={deliverable.stadiu}
          onValueChange={(value) => onUpdate({ stadiu: value })}
        >
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="— Stadiu document —" />
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

      {/* AI Check Button */}
      {deliverable.uploaded && apiKey && (
        <div className="flex gap-2 items-center">
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
            {aiLoading ? 'Verific...' : 'Verifică eligibilitate AI'}
          </Button>
          
          {deliverable.aiCheck && (
            <div className={`flex-1 text-[10px] p-1.5 rounded ${
              deliverable.aiCheck.eligible === true 
                ? 'bg-green-100 text-green-700' 
                : deliverable.aiCheck.eligible === false 
                ? 'bg-red-100 text-red-700' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              {deliverable.aiCheck.eligible === true 
                ? '✓ Eligibil' 
                : deliverable.aiCheck.eligible === false 
                ? '✗ Neeligibil' 
                : '?'
              } — {deliverable.aiCheck.reason}
            </div>
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
        {ok ? '✓' : n}
      </div>
      {label}
    </div>
  );
}
