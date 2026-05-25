'use client';

import { FileText, Loader2, Sparkles, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  GDPR_CONCLUSION_OPTIONS,
  GDPR_TEMPLATES,
  getGdprDeliverableRequirementLabel,
  getGdprMinimumEvidenceLabels,
  getGdprOptionLabel,
  getGdprOptionValue,
  type GdprFieldDefinition,
  type GdprMeta,
  type GdprMetaValue,
  type GdprTemplate,
} from '@/lib/gdpr-reporting';

interface GdprActivitySectionProps {
  gdprTemplateCode: string;
  selectedGdprTemplate: GdprTemplate | null;
  gdprMeta: GdprMeta;
  gdprConclusionCode: string;
  gdprFieldDefinitions: GdprFieldDefinition[];
  isBusinessHubGdpr: boolean;
  isGeneratingGdprDocx: boolean;
  isImprovingGdprText: boolean;
  businessHubPvInputRef: React.RefObject<HTMLInputElement | null>;
  onTemplateChange: (code: string) => void;
  onConclusionChange: (code: string) => void;
  onMetaChange: (key: string, value: GdprMetaValue) => void;
  onBusinessHubPvUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateDescription: () => void;
  onImproveDescription: () => void;
  onGenerateDeliverable: () => void;
}

export function GdprActivitySection({
  gdprTemplateCode,
  selectedGdprTemplate,
  gdprMeta,
  gdprConclusionCode,
  gdprFieldDefinitions,
  isBusinessHubGdpr,
  isGeneratingGdprDocx,
  isImprovingGdprText,
  businessHubPvInputRef,
  onTemplateChange,
  onConclusionChange,
  onMetaChange,
  onBusinessHubPvUpload,
  onGenerateDescription,
  onImproveDescription,
  onGenerateDeliverable,
}: GdprActivitySectionProps) {
  const renderGdprField = (field: GdprFieldDefinition) => {
    const value = gdprMeta[field.key];
    const label = (
      <FieldLabel htmlFor={`gdpr-${field.key}`}>
        {field.label}
        {field.required && <span className="ml-1 text-red-600">*</span>}
      </FieldLabel>
    );

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className="flex items-center gap-2 rounded-md border bg-white p-3">
          <Checkbox
            id={`gdpr-${field.key}`}
            checked={value === true}
            onCheckedChange={(checked: boolean | 'indeterminate') => onMetaChange(field.key, checked === true)}
          />
          <label htmlFor={`gdpr-${field.key}`} className="cursor-pointer text-sm">{field.label}</label>
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <Field key={field.key}>
          {label}
          <Select value={typeof value === 'string' ? value : ''} onValueChange={(next: string) => onMetaChange(field.key, next)}>
            <SelectTrigger id={`gdpr-${field.key}`}><SelectValue placeholder="Selecteaza" /></SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={getGdprOptionValue(option)} value={getGdprOptionValue(option)}>{getGdprOptionLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
    }

    if (field.type === 'checkbox_with_other') {
      const selectedValue = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { selected?: string[] }).selected)
        ? value as { selected: string[]; altele?: string }
        : { selected: Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [], altele: '' };
      const selected = selectedValue.selected || [];
      const hasOther = selected.includes('altele');
      const updateSelection = (nextSelected: string[], altele = selectedValue.altele || '') => {
        onMetaChange(field.key, { selected: nextSelected, altele });
      };
      return (
        <Field key={field.key} className="space-y-2">
          {label}
          <div className="flex flex-wrap gap-2">
            {(field.options || []).map((option) => {
              const optionValue = getGdprOptionValue(option);
              const isSelected = selected.includes(optionValue);
              return (
                <label
                  key={optionValue}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                    isSelected ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'bg-white text-slate-700'
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked: boolean | 'indeterminate') => {
                      updateSelection(
                        checked === true
                          ? Array.from(new Set([...selected, optionValue]))
                          : selected.filter((item) => item !== optionValue),
                      );
                    }}
                    className="h-3 w-3"
                  />
                  {getGdprOptionLabel(option)}
                </label>
              );
            })}
          </div>
          {hasOther && (
            <Input
              value={selectedValue.altele || ''}
              onChange={(event) => updateSelection(selected, event.target.value)}
              placeholder="Descrie alte materiale/documente"
              className="bg-white"
            />
          )}
        </Field>
      );
    }

    if (field.type === 'multi' && field.options?.length) {
      const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
      return (
        <Field key={field.key} className="space-y-2">
          {label}
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => {
              const optionValue = getGdprOptionValue(option);
              const isSelected = selected.includes(optionValue);
              return (
                <label
                  key={optionValue}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                    isSelected ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'bg-white text-slate-700'
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked: boolean | 'indeterminate') => {
                      onMetaChange(
                        field.key,
                        checked === true
                          ? Array.from(new Set([...selected, optionValue]))
                          : selected.filter((item) => item !== optionValue),
                      );
                    }}
                    className="h-3 w-3"
                  />
                  {getGdprOptionLabel(option)}
                </label>
              );
            })}
          </div>
        </Field>
      );
    }

    if (field.type === 'multi') {
      const selectedText = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(', ') : (typeof value === 'string' ? value : '');
      return (
        <Field key={field.key}>
          {label}
          <Input
            id={`gdpr-${field.key}`}
            value={selectedText}
            onChange={(event) => onMetaChange(field.key, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
            placeholder={field.placeholder || 'Valori separate prin virgula'}
          />
        </Field>
      );
    }

    if (field.type === 'textarea') {
      return (
        <Field key={field.key}>
          {label}
          <Textarea
            id={`gdpr-${field.key}`}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onMetaChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            rows={3}
          />
        </Field>
      );
    }

    return (
      <Field key={field.key}>
        {label}
        <Input
          id={`gdpr-${field.key}`}
          type={field.type === 'number' ? 'number' : 'text'}
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(event) => onMetaChange(field.key, field.type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
          placeholder={field.placeholder}
        />
      </Field>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-emerald-950">Asistent raportare GDPR</div>
          <p className="text-xs text-emerald-800">
            Alege tipul activitatii, completeaza campurile scurte, apoi genereaza descrierea si livrabilul DOCX.
          </p>
        </div>
        {selectedGdprTemplate && (
          <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
            {selectedGdprTemplate.deliverableType}
          </Badge>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="gdprTemplate">Ce tip de activitate GDPR ai desfasurat?</FieldLabel>
        <Select value={gdprTemplateCode} onValueChange={onTemplateChange}>
          <SelectTrigger id="gdprTemplate" className="bg-white">
            <SelectValue placeholder="Selecteaza activitatea GDPR" />
          </SelectTrigger>
          <SelectContent>
            {GDPR_TEMPLATES.map((template) => (
              <SelectItem key={template.code} value={template.code}>{template.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {selectedGdprTemplate && (
        <>
          <div className="grid gap-3 rounded-md border border-emerald-200 bg-white/70 p-3 text-xs text-emerald-950 md:grid-cols-3">
            <div><span className="font-medium">Subactivitate</span><div>{selectedGdprTemplate.saCode}</div></div>
            <div><span className="font-medium">Activitate</span><div>{selectedGdprTemplate.activityTitle}</div></div>
            <div><span className="font-medium">Regula livrabil</span><div>{getGdprDeliverableRequirementLabel(selectedGdprTemplate.deliverableRequirement)}</div></div>
          </div>

          <div className="rounded-md border border-emerald-200 bg-white p-3 text-xs text-emerald-950">
            <div className="font-medium">Dovada minima acceptata</div>
            <div>{getGdprMinimumEvidenceLabels(selectedGdprTemplate.minimumEvidenceTypes).join(', ') || 'Nu este necesara dovada suplimentara'}</div>
            {selectedGdprTemplate.deliverableRequirement === 'nu_este_necesar' && (
              <p className="mt-1 text-emerald-800">Aceasta activitate este eligibila fara livrabil suplimentar daca exista dovada minima si concluzie de conformitate.</p>
            )}
            {selectedGdprTemplate.deliverableTitle && selectedGdprTemplate.deliverableRequirement !== 'nu_este_necesar' && (
              <p className="mt-1 text-emerald-800">Livrabil recomandat: {selectedGdprTemplate.deliverableTitle}</p>
            )}
          </div>

          {isBusinessHubGdpr && (
            <div className="rounded-md border border-emerald-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-950">Generator rapid RP Business HUB</div>
                  <p className="mt-1 text-xs text-emerald-800">
                    Incarca procesul-verbal Excel. Aplicatia extrage luna si tabelul evenimentelor, ataseaza PV-ul ca dovada minima si genereaza automat raportul preliminar DOCX.
                  </p>
                </div>
                <Button type="button" onClick={() => businessHubPvInputRef.current?.click()} disabled={isGeneratingGdprDocx}>
                  {isGeneratingGdprDocx ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload PV si genereaza RP
                </Button>
              </div>
              <input ref={businessHubPvInputRef} type="file" className="hidden" accept=".xls,.xlsx" onChange={onBusinessHubPvUpload} />
              <div className="mt-3 grid gap-3 text-xs text-slate-700 md:grid-cols-3">
                <div className="rounded-md bg-emerald-50 p-2"><span className="font-medium">Luna detectata</span><div>{typeof gdprMeta.lunaAnalizata === 'string' ? gdprMeta.lunaAnalizata : 'se completeaza din PV'}</div></div>
                <div className="rounded-md bg-emerald-50 p-2"><span className="font-medium">Evenimente detectate</span><div>{typeof gdprMeta.numarEvenimente === 'number' ? gdprMeta.numarEvenimente : 'se calculeaza automat'}</div></div>
                <div className="rounded-md bg-emerald-50 p-2"><span className="font-medium">Status</span><div>{gdprMeta.businessHubEvents ? 'PV citit si RP generat' : 'asteapta upload PV'}</div></div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="gdprConclusion">Concluzie conformitate *</FieldLabel>
              <Select value={gdprConclusionCode} onValueChange={onConclusionChange}>
                <SelectTrigger id="gdprConclusion" className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GDPR_CONCLUSION_OPTIONS.map((option) => (
                    <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {!isBusinessHubGdpr && gdprFieldDefinitions.slice(0, 1).map(renderGdprField)}
          </div>

          {!isBusinessHubGdpr && (
            <div className="grid gap-4 md:grid-cols-2">{gdprFieldDefinitions.slice(1).map(renderGdprField)}</div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-emerald-200 pt-3">
            <Button type="button" variant="outline" onClick={onGenerateDescription}>
              <FileText className="mr-2 h-4 w-4" />
              Genereaza descriere
            </Button>
            <Button type="button" variant="outline" onClick={onImproveDescription} disabled={isImprovingGdprText}>
              {isImprovingGdprText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Imbunatateste cu AI
            </Button>
            <Button type="button" onClick={onGenerateDeliverable} disabled={isGeneratingGdprDocx}>
              {isGeneratingGdprDocx ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Genereaza livrabil DOCX si ataseaza
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
