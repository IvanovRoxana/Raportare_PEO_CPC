'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createDeliverableSlot, type DeliverableSlot } from '@/lib/deliverable-types';
import { generateId } from '@/lib/app-utils';
import {
  buildDefaultGdprMeta,
  buildBusinessHubGdprMeta,
  buildGdprActivityDescription,
  buildGdprDeliverableDocx,
  buildGdprObjectVerification,
  createGeneratedGdprDeliverableSlot,
  getGdprFieldDefinitions,
  getGdprTemplate,
  parseGdprMetaJson,
  validateGdprActivityDraft,
  type GdprMeta,
  type GdprMetaValue,
} from '@/lib/gdpr-reporting';
import { normalizePontajHoursValue } from '@/lib/pontaj-rules';
import type { Activity, Expert } from '@/lib/types';
import { parseBusinessHubPvRows as parseBusinessHubPvRowsShared, type GdprBusinessHubEvent } from '@/lib/business-hub-reporting';

interface UseGdprActivityOptions {
  activitySeed?: Partial<Activity>;
  reportMonthLabel: string;
  year: number;
  month: number;
  selectedDates: string[];
  defaultHours: number;
  description: string;
  expertName: string;
  expert?: Expert;
  setDescription: (description: string) => void;
  setValidationError: (message: string | null) => void;
  setSaCode: (saCode: string) => void;
  setActivityTitle: (activityTitle: string) => void;
  setHours: (hours: string) => void;
  setHoursPerDay: Dispatch<SetStateAction<Record<string, string>>>;
  setDeliverables: Dispatch<SetStateAction<DeliverableSlot[]>>;
  onSelectedHoursChange?: (hours: Record<string, string>) => void;
}

export function useGdprActivity({
  activitySeed,
  reportMonthLabel,
  year,
  month,
  selectedDates,
  defaultHours,
  description,
  expertName,
  expert,
  setDescription,
  setValidationError,
  setSaCode,
  setActivityTitle,
  setHours,
  setHoursPerDay,
  setDeliverables,
  onSelectedHoursChange,
}: UseGdprActivityOptions) {
  const selectedActivityDates = Array.isArray(selectedDates) ? selectedDates : [];
  const [gdprTemplateCode, setGdprTemplateCode] = useState(activitySeed?.gdprTemplateCode || '');
  const [gdprMeta, setGdprMeta] = useState<GdprMeta>(() =>
    buildDefaultGdprMeta(
      activitySeed?.gdprTemplateCode,
      parseGdprMetaJson(activitySeed?.gdprMetaJson),
      `${reportMonthLabel} ${year}`,
    ),
  );
  const [gdprGeneratedText, setGdprGeneratedText] = useState(activitySeed?.gdprGeneratedText || '');
  const [gdprConclusionCode, setGdprConclusionCode] = useState(
    activitySeed?.gdprConclusionCode
      || String(parseGdprMetaJson(activitySeed?.gdprMetaJson).concluzie || 'conform_fara_neconformitati'),
  );
  const [isGeneratingGdprDocx, setIsGeneratingGdprDocx] = useState(false);
  const [isImprovingGdprText, setIsImprovingGdprText] = useState(false);

  const selectedTemplate = useMemo(() => getGdprTemplate(gdprTemplateCode), [gdprTemplateCode]);
  const fieldDefinitions = useMemo(
    () => getGdprFieldDefinitions(gdprTemplateCode, gdprMeta),
    [gdprTemplateCode, gdprMeta],
  );
  const isBusinessHubGdpr = selectedTemplate?.code === 'GDPR_BUSINESS_HUB';

  const state = {
    gdprTemplateCode,
    gdprMeta,
    gdprGeneratedText,
    gdprConclusionCode,
    isGeneratingGdprDocx,
    isImprovingGdprText,
    isBusinessHubGdpr,
  };

  const updateMeta = useCallback((key: string, value: GdprMetaValue) => {
    setGdprMeta((prev) => {
      const next = { ...prev, [key]: value };
      if (selectedTemplate && key !== 'obiectVerificare') {
        const previousGeneratedObject = buildGdprObjectVerification(selectedTemplate.code, prev);
        const currentObject = typeof prev.obiectVerificare === 'string' ? prev.obiectVerificare.trim() : '';
        if (!currentObject || currentObject === previousGeneratedObject) {
          next.obiectVerificare = buildGdprObjectVerification(selectedTemplate.code, next);
        }
      }
      return buildDefaultGdprMeta(gdprTemplateCode, next, `${reportMonthLabel} ${year}`);
    });
  }, [gdprTemplateCode, reportMonthLabel, selectedTemplate, year]);

  const changeConclusion = useCallback((code: string) => {
    setGdprConclusionCode(code);
    updateMeta('concluzie', code);
  }, [updateMeta]);

  const changeTemplate = useCallback((code: string) => {
    const template = getGdprTemplate(code);
    setGdprTemplateCode(code);
    setGdprGeneratedText('');

    if (!template) return;

    setSaCode(template.saCode);
    setActivityTitle(template.activityTitle);
    setGdprMeta((prev) => buildDefaultGdprMeta(code, {
      ...prev,
      concluzie: gdprConclusionCode || 'conform_fara_neconformitati',
    }, `${reportMonthLabel} ${year}`));

    const templateHours = normalizePontajHoursValue(Math.min(template.defaultHours, defaultHours), defaultHours);
    setHours(templateHours);
    setHoursPerDay((prev) => {
      const next = { ...prev };
      selectedActivityDates.forEach((date) => {
        next[date] = templateHours;
      });
      onSelectedHoursChange?.(next);
      return next;
    });
  }, [
    defaultHours,
    gdprConclusionCode,
    onSelectedHoursChange,
    reportMonthLabel,
    selectedActivityDates,
    setActivityTitle,
    setHours,
    setHoursPerDay,
    setSaCode,
    year,
  ]);

  const buildGdprInput = useCallback(() => {
    if (!selectedTemplate) return null;
    return {
      templateCode: selectedTemplate.code,
      meta: {
        ...gdprMeta,
        concluzie: gdprConclusionCode,
      },
      date: selectedActivityDates[0] || '',
      expertName,
      expertRole: expert?.positionInProject || expert?.role,
      projectCode: expert?.projectCode,
      projectTitle: expert?.projectTitle,
    };
  }, [expert, expertName, gdprConclusionCode, gdprMeta, selectedActivityDates, selectedTemplate]);

  const generateDescription = useCallback(() => {
    const input = buildGdprInput();
    if (!input) {
      setValidationError('Selecteaza mai intai tipul de activitate GDPR.');
      return;
    }
    const generated = buildGdprActivityDescription(input);
    setDescription(generated);
    setGdprGeneratedText(generated);
    setValidationError(null);
  }, [buildGdprInput, setDescription, setValidationError]);

  const improveDescription = useCallback(async () => {
    const input = buildGdprInput();
    const textToImprove = gdprGeneratedText || description || (input ? buildGdprActivityDescription(input) : '');
    if (!input || !textToImprove.trim()) {
      setValidationError('Genereaza descrierea GDPR inainte de imbunatatirea cu AI.');
      return;
    }

    setIsImprovingGdprText(true);
    setValidationError(null);
    try {
      const response = await fetch('/api/ai/improve-gdpr-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToImprove,
          templateLabel: selectedTemplate?.label,
          expertName,
          month,
          year,
          projectCode: expert?.projectCode,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Nu am putut imbunatati textul cu AI.');
      }
      setDescription(data.text);
      setGdprGeneratedText(data.text);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Eroare la imbunatatirea textului GDPR.');
    } finally {
      setIsImprovingGdprText(false);
    }
  }, [
    buildGdprInput,
    description,
    expert?.projectCode,
    expertName,
    gdprGeneratedText,
    month,
    selectedTemplate?.label,
    setDescription,
    setValidationError,
    year,
  ]);

  const generateDeliverable = useCallback(async (businessHubPvFile?: File) => {
    if (businessHubPvFile) {
      await generateBusinessHubDeliverable({
        file: businessHubPvFile,
        gdprMeta,
        gdprConclusionCode,
        reportMonthLabel,
        year,
        selectedDates: selectedActivityDates,
        expertName,
        expert,
        setGdprTemplateCode,
        setSaCode,
        setActivityTitle,
        setHours,
        setHoursPerDay,
        onSelectedHoursChange,
        setGdprConclusionCode,
        setGdprMeta,
        setDescription,
        setGdprGeneratedText,
        setDeliverables,
        setValidationError,
        setIsGeneratingGdprDocx,
      });
      return;
    }

    const input = buildGdprInput();
    if (!input) {
      setValidationError('Selecteaza mai intai tipul de activitate GDPR.');
      return;
    }

    const draftValidation = validateGdprActivityDraft({
      templateCode: gdprTemplateCode,
      meta: input.meta,
      description,
      hasDeliverable: true,
    });
    if (draftValidation.missingFields.length > 0) {
      setValidationError(`Completeaza campurile GDPR obligatorii: ${draftValidation.missingFields.join(', ')}.`);
      return;
    }

    setIsGeneratingGdprDocx(true);
    setValidationError(null);
    try {
      const blob = await buildGdprDeliverableDocx(input);
      const fileData = await blobToDataUrl(blob);
      const generatedSlot = createGeneratedGdprDeliverableSlot({
        ...input,
        fileData,
        fileSize: blob.size,
      });

      setDeliverables((prev) => [
        ...prev.filter((deliverable) =>
          deliverable.declaredTitle !== generatedSlot.declaredTitle || !deliverable.documentId?.startsWith('doc_gdpr_'),
        ),
        generatedSlot,
      ]);

      const generated = gdprGeneratedText || buildGdprActivityDescription(input);
      setDescription(generated);
      setGdprGeneratedText(generated);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Eroare la generarea livrabilului GDPR.');
    } finally {
      setIsGeneratingGdprDocx(false);
    }
  }, [
    buildGdprInput,
    description,
    expert,
    expertName,
    gdprConclusionCode,
    gdprGeneratedText,
    gdprMeta,
    gdprTemplateCode,
    onSelectedHoursChange,
    reportMonthLabel,
    selectedActivityDates,
    setActivityTitle,
    setDeliverables,
    setDescription,
    setHours,
    setHoursPerDay,
    setSaCode,
    setValidationError,
    year,
  ]);

  return {
    state,
    selectedTemplate,
    fieldDefinitions,
    updateMeta,
    changeTemplate,
    changeConclusion,
    generateDescription,
    improveDescription,
    generateDeliverable,
  };
}

interface GenerateBusinessHubDeliverableOptions {
  file: File;
  gdprMeta: GdprMeta;
  gdprConclusionCode: string;
  reportMonthLabel: string;
  year: number;
  selectedDates: string[];
  expertName: string;
  expert?: Expert;
  setGdprTemplateCode: (code: string) => void;
  setSaCode: (code: string) => void;
  setActivityTitle: (title: string) => void;
  setHours: (hours: string) => void;
  setHoursPerDay: Dispatch<SetStateAction<Record<string, string>>>;
  onSelectedHoursChange?: (hours: Record<string, string>) => void;
  setGdprConclusionCode: (code: string) => void;
  setGdprMeta: (meta: GdprMeta) => void;
  setDescription: (description: string) => void;
  setGdprGeneratedText: (text: string) => void;
  setDeliverables: Dispatch<SetStateAction<DeliverableSlot[]>>;
  setValidationError: (message: string | null) => void;
  setIsGeneratingGdprDocx: (isGenerating: boolean) => void;
}

async function generateBusinessHubDeliverable({
  file,
  gdprMeta,
  gdprConclusionCode,
  reportMonthLabel,
  year,
  selectedDates,
  expertName,
  expert,
  setGdprTemplateCode,
  setSaCode,
  setActivityTitle,
  setHours,
  setHoursPerDay,
  onSelectedHoursChange,
  setGdprConclusionCode,
  setGdprMeta,
  setDescription,
  setGdprGeneratedText,
  setDeliverables,
  setValidationError,
  setIsGeneratingGdprDocx,
}: GenerateBusinessHubDeliverableOptions) {
  const selectedActivityDates = Array.isArray(selectedDates) ? selectedDates : [];
  setIsGeneratingGdprDocx(true);
  setValidationError(null);
  try {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
    const parsed = parseBusinessHubPvRowsShared(rows);
    const pvDataUrl = await fileToDataUrl(file);
    const fallbackMonthLabel = `${reportMonthLabel} ${year}`;
    const completedMeta = buildBusinessHubGdprMeta({
      ...gdprMeta,
      concluzie: gdprConclusionCode || 'fara_prelucrari_directe',
    }, {
      monthLabel: parsed.monthLabel,
      reportMonth: fallbackMonthLabel,
      events: parsed.events,
      sourceFileName: file.name,
    });
    setGdprTemplateCode('GDPR_BUSINESS_HUB');
    setSaCode('SA1.1');
    setActivityTitle('Verificare GDPR Business HUB');
    setHours('6');
    setHoursPerDay((prev) => {
      const next = { ...prev };
      selectedActivityDates.forEach((date) => {
        next[date] = '6';
      });
      onSelectedHoursChange?.(next);
      return next;
    });
    setGdprConclusionCode(String(completedMeta.concluzie || 'fara_prelucrari_directe'));
    setGdprMeta(completedMeta);

    const input = {
      templateCode: 'GDPR_BUSINESS_HUB' as const,
      meta: completedMeta,
      date: selectedActivityDates[0] || '',
      expertName,
      expertRole: expert?.positionInProject || expert?.role,
      projectCode: expert?.projectCode,
      projectTitle: expert?.projectTitle,
    };
    const generatedDescription = buildGdprActivityDescription(input);
    const generatedBlob = await buildGdprDeliverableDocx(input);
    const generatedDataUrl = await blobToDataUrl(generatedBlob);
    const generatedSlot = createGeneratedGdprDeliverableSlot({
      ...input,
      fileData: generatedDataUrl,
      fileSize: generatedBlob.size,
    });
    const pvSlot: DeliverableSlot = {
      ...createDeliverableSlot('justificativ', file.name),
      name: file.name,
      filename: file.name,
      rawFilename: file.name.replace(/\.[^.]+$/, ''),
      fileType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: file.size,
      fileData: pvDataUrl,
      uploadedAt: new Date().toISOString(),
      uploaded: true,
      declaredTitle: `Proces-verbal evenimente Business HUB - ${parsed.monthLabel || reportMonthLabel}`,
      docTitle: `Proces-verbal evenimente Business HUB - ${parsed.monthLabel || reportMonthLabel}`,
      titleConfirmed: true,
      titleSource: 'auto_detected',
      titleMatch: true,
      titleCheckStatus: 'matched',
      titleCheckMessage: 'Procesul-verbal Business HUB a fost atasat ca dovada minima.',
      documentId: `doc_bh_pv_${generateId()}`,
      isCommonDeliverable: false,
      sharedWithExpertIds: [],
    };

    setDescription(generatedDescription);
    setGdprGeneratedText(generatedDescription);
    setDeliverables((prev) => [
      ...prev.filter((deliverable) =>
        !deliverable.documentId?.startsWith('doc_bh_pv_')
        && (deliverable.declaredTitle !== generatedSlot.declaredTitle || !deliverable.documentId?.startsWith('doc_gdpr_')),
      ),
      pvSlot,
      generatedSlot,
    ]);
  } catch (error) {
    setValidationError(error instanceof Error ? error.message : 'Nu am putut citi procesul-verbal Business HUB.');
  } finally {
    setIsGeneratingGdprDocx(false);
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function parseBusinessHubPvRows(rows: unknown[][]): { monthLabel: string; events: GdprBusinessHubEvent[] } {
  const textRows = rows.map((row) => row.map((cell) => formatSpreadsheetCell(cell)));
  const allText = textRows.flat().join(' ');
  const monthMatch = allText.match(/luna\s+([A-Za-zĂÂÎȘȚăâîșț]+)\s+(\d{4})/i);
  const monthLabel = monthMatch ? `${monthMatch[1]} ${monthMatch[2]}` : '';
  const headerIndex = textRows.findIndex((row) =>
    row.some((cell) => /federa/i.test(cell))
    && row.some((cell) => /eveniment/i.test(cell))
    && row.some((cell) => /^data$/i.test(cell)),
  );
  if (headerIndex < 0) {
    throw new Error('Nu am gasit tabelul de evenimente in procesul-verbal Business HUB.');
  }

  const header = textRows[headerIndex];
  const federationIndex = findHeaderIndex(header, /federa|asocia/i);
  const eventIndex = findHeaderIndex(header, /eveniment/i);
  const dateIndex = findHeaderIndex(header, /^data$/i);
  const roomIndex = findHeaderIndex(header, /sala/i);
  const intervalIndex = findHeaderIndex(header, /interval/i);
  const signatureIndex = findHeaderIndex(header, /semn/i);
  const events: GdprBusinessHubEvent[] = [];
  let currentFederation = '';

  for (const row of textRows.slice(headerIndex + 1)) {
    const federation = row[federationIndex] || '';
    const event = row[eventIndex] || '';
    const date = row[dateIndex] || '';
    const room = row[roomIndex] || '';
    const interval = row[intervalIndex] || '';
    const signature = row[signatureIndex] || '';
    if (federation) currentFederation = federation;
    if (!event && !date && !room && !interval) continue;
    if (!event || !date) continue;
    events.push({
      federation: currentFederation,
      event,
      date,
      room,
      interval,
      signature,
    });
  }

  if (events.length === 0) {
    throw new Error('Procesul-verbal a fost citit, dar nu am gasit evenimente cu data completata.');
  }

  return { monthLabel, events };
}

function findHeaderIndex(row: string[], pattern: RegExp) {
  const index = row.findIndex((cell) => pattern.test(cell));
  if (index < 0) {
    throw new Error('Tabelul din PV nu are coloanele asteptate pentru Business HUB.');
  }
  return index;
}

function formatSpreadsheetCell(value: unknown) {
  if (value instanceof Date) {
    return value.toLocaleDateString('ro-RO');
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
