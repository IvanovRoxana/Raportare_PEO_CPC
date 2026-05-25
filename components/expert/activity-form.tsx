'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { generateId, formatDateRo } from '@/lib/app-utils';
import { createDeliverableSlot, type DeliverableSlot } from '@/lib/deliverable-types';
import { 
  ACTS, 
  isEventActivity, 
  isExceptionActivity,
  getActivityOptions,
  getDeliverableOptions 
} from '@/lib/peo-constants';
import { useActivityCatalog } from '@/hooks/use-backend-data';
import type { Activity, GrupTintaEntry, Expert, ActivityCatalog } from '@/lib/types';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { buildDocumentS3Key, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import { shouldAttachUploadedDeliverablesToDate } from '@/lib/activity-deliverables';
import {
  MAX_PONTAJ_HOURS,
  buildSelectedHoursForDates,
  isValidPontajHours,
  normalizePontajHoursValue,
  type ActivityDraftForValidation,
} from '@/lib/pontaj-rules';
import {
  buildGdprActivityDescription,
  buildDefaultGdprMeta,
  buildGdprObjectVerification,
  buildGdprDeliverableDocx,
  createGeneratedGdprDeliverableSlot,
  getGdprFieldDefinitions,
  getGdprTemplate,
  parseGdprMetaJson,
  serializeGdprMeta,
  type GdprBusinessHubEvent,
  type GdprMeta,
  type GdprMetaValue,
} from '@/lib/gdpr-reporting';
import { validateDeliverablesDraft } from '@/lib/validations/deliverables';
import { validateGdprActivityDraft } from '@/lib/validations/gdpr-activity';
import { validateGrupTintaActivityDraft } from '@/lib/validations/grup-tinta-activity';
import { validateStandardActivityDraft } from '@/lib/validations/standard-activity';
import { ActivityBasicFields } from './activity-form/ActivityBasicFields';
import { ActivitySavePanel } from './activity-form/ActivitySavePanel';
import { CollaboratorsSection } from './activity-form/CollaboratorsSection';
import { DeliverablesSection } from './activity-form/DeliverablesSection';
import { GdprActivitySection } from './activity-form/GdprActivitySection';
import { GrupTintaSection } from './activity-form/GrupTintaSection';
import { HoursPerDaySection } from './activity-form/HoursPerDaySection';

interface ActivityFormProps {
  selectedDates: string[];
  selectedHours?: Record<string, string>;
  onSelectedHoursChange?: (hours: Record<string, string>) => void;
  expertId: string;
  expertName: string;
  expert?: Expert;
  allExperts?: Expert[];
  allActivities?: Activity[];
  month: number;
  year: number;
  onSave: (activities: Activity[]) => void | Promise<void>;
  onCancel: () => void;
  initialActivity?: Activity;
  prefillActivity?: Partial<Activity>;
  isSaving?: boolean;
  apiKey?: string | null;
}

export function ActivityForm({
  selectedDates,
  selectedHours,
  onSelectedHoursChange,
  expertId,
  expertName,
  expert,
  allExperts = [],
  allActivities = [],
  month,
  year,
  onSave,
  onCancel,
  initialActivity,
  prefillActivity,
  isSaving = false,
  apiKey = null,
}: ActivityFormProps) {
  // Fetch activity catalog from database
  const { catalog, isLoading: catalogLoading } = useActivityCatalog();

  const fallbackCatalog = useMemo<ActivityCatalog[]>(() => {
    return Object.entries(ACTS).flatMap(([saCode, activityNames]) =>
      activityNames.map((activityName, index) => ({
        id: `fallback-${saCode}-${index}`,
        category: expert?.category || 'peo',
        saCode,
        serviceCategory: saCode,
        activityNumber: index + 1,
        activityName,
        deliverables: getActivityOptions(saCode).includes(activityName)
          ? getDeliverableOptions(expert?.category || 'ap').join('\n')
          : undefined,
      }))
    );
  }, [expert?.category]);

  const effectiveCatalog = catalog.length > 0 ? catalog : fallbackCatalog;
  
  // Get expert's assigned SA codes (based on their role)
  const expertSaCodes = expert?.saCodes || [];
  const expertCategory = normalizePeoCategory(expert?.category);
  const isGtExpert = isGtExpertCategory(expert?.category);
  const isGdprExpert = expertCategory === 'gdpr';
  const reportMonthName = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'][month] || 'luna de raportare';
  
  // Filter catalog by expert category from PEO_Experti and then by assigned SA codes.
  const filteredCatalog = useMemo(() => {
    if (!effectiveCatalog || effectiveCatalog.length === 0) return [];
    return effectiveCatalog.filter((item) => {
      const itemCategory = normalizePeoCategory(item.category);
      const matchesCategory = !expertCategory || itemCategory === expertCategory;
      const matchesSaCode = expertSaCodes.length === 0 || expertSaCodes.includes(item.saCode);
      return matchesCategory && matchesSaCode;
    });
  }, [effectiveCatalog, expertCategory, expertSaCodes]);
  
  // Get unique SA codes available for this expert from the catalog
  const availableSaCodes = useMemo(() => {
    const saCodes = [...new Set(filteredCatalog.map(item => item.saCode))];
    return saCodes.sort();
  }, [filteredCatalog]);
  
  const expertNorma = expert?.norma || 8;
  // Default hours = min(norma, 8) - experts usually fill their daily norm
  const defaultHours = Number(normalizePontajHoursValue(Math.min(expertNorma, MAX_PONTAJ_HOURS)));
  const hourOptions = useMemo(() => Array.from({ length: MAX_PONTAJ_HOURS }, (_, index) => index + 1), []);
  const activitySeed = initialActivity || prefillActivity;
  
  // Per-day hours state - each day can have different hours
  const [hoursPerDay, setHoursPerDay] = useState<Record<string, string>>(() => {
    const seedHours = activitySeed?.hours !== undefined
      ? Object.fromEntries(selectedDates.map((date) => [date, normalizePontajHoursValue(activitySeed.hours, defaultHours)]))
      : selectedHours;
    return buildSelectedHoursForDates(selectedDates, seedHours, defaultHours);
  });
  
  // Legacy single hours for backward compatibility (used when saving)
  const [hours, setHours] = useState(normalizePontajHoursValue(activitySeed?.hours, defaultHours));
  const [saCode, setSaCode] = useState(activitySeed?.saCode || '');
  
  // Set or reset default SA code when available SA codes load after category filtering.
  useEffect(() => {
    if (availableSaCodes.length === 0) {
      if (saCode) setSaCode('');
      return;
    }

    if (!saCode || !availableSaCodes.includes(saCode)) {
      setSaCode(availableSaCodes[0]);
    }
  }, [saCode, availableSaCodes]);
  
  // Update hoursPerDay when selectedDates change (add new dates with default hours)
  useEffect(() => {
    setHoursPerDay(prev => {
      const baseHours = { ...prev, ...selectedHours };
      return buildSelectedHoursForDates(selectedDates, baseHours, defaultHours);
    });
  }, [selectedDates, defaultHours, selectedHours]);

  const updateHoursForDate = (date: string, value: string) => {
    if (!isValidPontajHours(value)) return;
    setHoursPerDay(prev => {
      const next = { ...prev, [date]: normalizePontajHoursValue(value, prev[date] || defaultHours) };
      onSelectedHoursChange?.(next);
      return next;
    });
  };
  const [activityTitle, setActivityTitle] = useState(activitySeed?.activityType || '');
  const [dayType, setDayType] = useState<'lucratoare' | 'CO' | 'CM'>(
    (activitySeed?.dayType as 'lucratoare' | 'CO' | 'CM') || 'lucratoare'
  );
  const [description, setDescription] = useState(activitySeed?.description || '');
  const [location, setLocation] = useState(activitySeed?.location || 'Birou');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [gdprTemplateCode, setGdprTemplateCode] = useState(activitySeed?.gdprTemplateCode || '');
  const [gdprMeta, setGdprMeta] = useState<GdprMeta>(() => buildDefaultGdprMeta(activitySeed?.gdprTemplateCode, parseGdprMetaJson(activitySeed?.gdprMetaJson), `${reportMonthName} ${year}`));
  const [gdprGeneratedText, setGdprGeneratedText] = useState(activitySeed?.gdprGeneratedText || '');
  const [gdprConclusionCode, setGdprConclusionCode] = useState(
    activitySeed?.gdprConclusionCode || String(parseGdprMetaJson(activitySeed?.gdprMetaJson).concluzie || 'conform_fara_neconformitati')
  );
  const [isGeneratingGdprDocx, setIsGeneratingGdprDocx] = useState(false);
  const [isImprovingGdprText, setIsImprovingGdprText] = useState(false);
  
  // Deliverables state with slots
  const [deliverables, setDeliverables] = useState<DeliverableSlot[]>(
    initialActivity?.deliverables?.map(d => ({
      id: d.id,
      slotType: 'livrabil' as const,
      name: d.fileName,
      filename: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      filePath: d.filePath,
      documentId: d.documentId,
      s3Bucket: d.s3Bucket,
      s3Key: d.s3Key,
      fileHash: d.fileHash,
      firstPageTextHash: d.firstPageTextHash,
      contentFingerprint: d.contentFingerprint,
      uploadedByExpertId: d.uploadedByExpertId,
      uploadedByExpertName: d.uploadedByExpertName,
      projectId: d.projectId,
      projectName: d.projectName,
      sourceActivityId: d.sourceActivityId,
      activityDate: d.activityDate,
      saCode: d.saCode,
      deliverableType: d.deliverableType,
      isCommonDeliverable: d.isCommonDeliverable,
      sharedWithExpertIds: d.sharedWithExpertIds,
      common: Boolean(d.isCommonDeliverable),
      possibleDuplicateOfDocumentId: d.possibleDuplicateOfDocumentId,
      duplicateStatus: d.duplicateStatus,
      fileData: d.fileData,
      fileBlob: undefined,
      uploadStatus: d.filePath || d.s3Key ? 'uploaded' : 'idle',
      uploadError: undefined,
      uploadedAt: d.uploadedAt,
      uploaded: true,
      isPhoto: d.fileType?.startsWith('image/') || false,
      declaredTitle: d.declaredTitle || '',
      titleConfirmed: d.titleConfirmed ?? false,
      stadiu: '',
      aiCheck: d.aiStatus || d.aiReason
        ? {
            eligible: d.aiStatus === 'eligible' ? true : d.aiStatus === 'ineligible' ? false : null,
            reason: d.aiReason || '',
            issues: [],
          }
        : null,
      docTitle: d.docTitle || null,
      docText: d.docText || null,
      suggestedTitle: d.suggestedTitle || null,
      firstPageText: d.firstPageText || null,
      titleSource: d.titleSource as DeliverableSlot['titleSource'],
      titleMatch: d.titleMatch ?? null,
      titleCheckStatus: d.titleCheckStatus as DeliverableSlot['titleCheckStatus'],
      titleCheckMessage: d.titleCheckMessage,
      isPendingConfirm: false,
    })) || []
  );
  
  const initialCollaborators = useMemo(() => {
    const ids = new Set<string>(initialActivity?.takenByExperts || []);
    initialActivity?.deliverables?.forEach((deliverable) => {
      deliverable.sharedWithExpertIds?.forEach((id) => ids.add(id));
    });
    ids.delete(expertId);
    return Array.from(ids);
  }, [initialActivity, expertId]);

  // Common activity / collaboration
  const [activityCommon, setActivityCommon] = useState(
    () => initialActivity?.shareStatus === 'shared' || initialCollaborators.length > 0
  );
  const [collaborators, setCollaborators] = useState<string[]>(() => initialCollaborators);

  useEffect(() => {
    setActivityCommon(initialActivity?.shareStatus === 'shared' || initialCollaborators.length > 0);
    setCollaborators(initialCollaborators);
  }, [initialActivity?.id, initialActivity?.shareStatus, initialCollaborators]);
  
  // Event specific fields
  const [eventDuration, setEventDuration] = useState<string>('');
  const [eventExtendedDesc, setEventExtendedDesc] = useState('');
  
  // Grup tinta
  const [grupTinta, setGrupTinta] = useState<GrupTintaEntry[]>(initialActivity?.grupTinta || []);
  
  // Verification
  const [isVerifyingTitle, setIsVerifyingTitle] = useState(false);
  const [titleVerificationResult, setTitleVerificationResult] = useState<string | null>(null);

  const businessHubPvInputRef = useRef<HTMLInputElement>(null);
  
  // Get available activities for selected SA from catalog
  const availableActivities = useMemo(() => {
    if (!saCode || filteredCatalog.length === 0) return [];
    return filteredCatalog
      .filter(item => item.saCode === saCode)
      .map(item => item.activityName);
  }, [saCode, filteredCatalog]);
  
  // Get full activity catalog item for selected activity
  const selectedCatalogItem = useMemo(() => {
    if (!activityTitle || !saCode) return null;
    return filteredCatalog.find(item => 
      item.saCode === saCode && item.activityName === activityTitle
    ) || null;
  }, [activityTitle, saCode, filteredCatalog]);

  const collaboratorSuggestions = useMemo(() => {
    const suggestionScores = new Map<string, { score: number; reasons: Set<string> }>();
    const selectedDateSet = new Set(selectedDates);

    const addSuggestion = (id: string | undefined, score: number, reason: string) => {
      if (!id || id === expertId) return;
      if (!allExperts.some((candidate) => candidate.id === id)) return;
      const current = suggestionScores.get(id) || { score: 0, reasons: new Set<string>() };
      current.score += score;
      current.reasons.add(reason);
      suggestionScores.set(id, current);
    };

    initialCollaborators.forEach((id) => addSuggestion(id, 5, 'deja selectat anterior'));

    allActivities.forEach((activity) => {
      const activityCollaborators = new Set<string>(activity.takenByExperts || []);
      activity.deliverables?.forEach((deliverable) => {
        deliverable.sharedWithExpertIds?.forEach((id) => activityCollaborators.add(id));
      });

      if (activity.expertId === expertId) {
        activityCollaborators.forEach((id) => addSuggestion(id, 4, 'colaborare anterioara'));
        return;
      }

      const sameDate = selectedDateSet.has(activity.date);
      const sameSa = Boolean(saCode && activity.saCode === saCode);
      const sameActivity = Boolean(activityTitle && activity.activityType === activityTitle);
      const linkedToCurrentExpert = activityCollaborators.has(expertId);

      if (linkedToCurrentExpert) {
        addSuggestion(activity.expertId, 5, 'te-a marcat intr-o activitate comuna');
      } else if (sameDate && sameSa && sameActivity) {
        addSuggestion(activity.expertId, 4, 'aceeasi data, SA si activitate');
      } else if (sameDate && (sameSa || sameActivity)) {
        addSuggestion(activity.expertId, 2, 'activitate similara in aceeasi zi');
      }
    });

    return Array.from(suggestionScores.entries())
      .map(([id, info]) => {
        const expertOption = allExperts.find((candidate) => candidate.id === id);
        return expertOption
          ? {
              expert: expertOption,
              score: info.score,
              reason: Array.from(info.reasons).join(', '),
            }
          : null;
      })
      .filter((item): item is { expert: Expert; score: number; reason: string } => Boolean(item))
      .sort((a, b) => b.score - a.score || a.expert.name.localeCompare(b.expert.name));
  }, [allActivities, allExperts, activityTitle, expertId, initialCollaborators, saCode, selectedDates]);
  
  const deliverableOptions = useMemo(() => {
    return getDeliverableOptions(expertCategory || 'ap');
  }, [expertCategory]);

  const selectedGdprTemplate = useMemo(() => getGdprTemplate(gdprTemplateCode), [gdprTemplateCode]);
  const isBusinessHubGdpr = selectedGdprTemplate?.code === 'GDPR_BUSINESS_HUB';
  const effectiveActivityTitle = isGdprExpert && selectedGdprTemplate ? selectedGdprTemplate.activityTitle : activityTitle;
  const effectiveSaCode = isGdprExpert && selectedGdprTemplate ? selectedGdprTemplate.saCode : saCode;
  const gdprFieldDefinitions = useMemo(
    () => getGdprFieldDefinitions(gdprTemplateCode, gdprMeta),
    [gdprTemplateCode, gdprMeta]
  );
  
  // Check if current activity is exception (no deliverable required)
  const isException = isExceptionActivity(effectiveActivityTitle);
  
  // Check if current activity is event
  const isEvent = isEventActivity(effectiveActivityTitle);
  
  // Check if leave day
  const isLeave = dayType === 'CO' || dayType === 'CM';
  
  // Check if common description is needed
  const needsCommonDesc = activityCommon && (description || '').trim().length < 30;
  
  // Check if extended event description is needed
  const totalHours = Number(hours) || 0;
  const eventDur = parseFloat(eventDuration) || 0;
  const needsExtendedDesc = isEvent && eventDur > 0 && totalHours > eventDur && (eventExtendedDesc || '').trim().length < 20;
  const saveBlockers = [
    (!effectiveActivityTitle.trim() && !isLeave) ? 'Selecteaza tipul activitatii.' : null,
    isSaving ? 'Salvarea este deja in curs.' : null,
    (isException && (description || '').length < 15) ? 'Completeaza descrierea pentru activitatea exceptata.' : null,
    needsCommonDesc ? 'Pentru activitate comuna, descrierea trebuie sa aiba minimum 30 de caractere.' : null,
    needsExtendedDesc ? 'Pentru evenimente cu ore peste durata evenimentului, completeaza descrierea extinsa.' : null,
  ].filter((message): message is string => Boolean(message));
  const isSaveDisabled = saveBlockers.length > 0;

  // Update activity when SA changes
  useEffect(() => {
    if (isGdprExpert && gdprTemplateCode) return;
    if (availableActivities.length > 0 && !availableActivities.includes(activityTitle)) {
      setActivityTitle('');
    }
  }, [saCode, availableActivities, activityTitle, isGdprExpert, gdprTemplateCode]);

  const handleBusinessHubPvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsGeneratingGdprDocx(true);
    setValidationError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
      const parsed = parseBusinessHubPvRows(rows);
      const nextMeta: GdprMeta = buildDefaultGdprMeta('GDPR_BUSINESS_HUB', {
        ...gdprMeta,
        lunaAnalizata: parsed.monthLabel || `${reportMonthName} ${year}`,
        numarEvenimente: parsed.events.length,
        inregistrareBd: file.name,
        responsabilHub: gdprMeta.responsabilHub || 'Alexandru Enache',
        rolHub: gdprMeta.rolHub || 'suport logistic',
        documenteAnalizate: { selected: ['proces_verbal', 'altele'], altele: 'Proces-verbal evenimente Business HUB' },
        datePersonale: ['nume si prenume', 'functie', 'organizatie', 'semnatura'],
        temeiGdpr: ['interes legitim', 'interes public / implementare proiect'],
        concluzie: gdprConclusionCode || 'fara_prelucrari_directe',
        businessHubEvents: parsed.events,
      }, parsed.monthLabel || `${reportMonthName} ${year}`);
      const objectText = buildGdprObjectVerification('GDPR_BUSINESS_HUB', nextMeta);
      const completedMeta: GdprMeta = {
        ...nextMeta,
        obiectVerificare: objectText,
      };
      setGdprTemplateCode('GDPR_BUSINESS_HUB');
      setSaCode('SA1.1');
      setActivityTitle('Verificare GDPR Business HUB');
      setHours('6');
      setHoursPerDay((prev) => {
        const next = { ...prev };
        selectedDates.forEach((date) => {
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
        date: selectedDates[0] || '',
        expertName,
        expertRole: expert?.positionInProject || expert?.role,
        projectCode: expert?.projectCode,
        projectTitle: expert?.projectTitle,
      };
      const generatedDescription = buildGdprActivityDescription(input);
      const generatedBlob = await buildGdprDeliverableDocx(input);
      const generatedSlot = createGeneratedGdprDeliverableSlot({
        ...input,
        fileSize: generatedBlob.size,
      });
      generatedSlot.fileBlob = generatedBlob;
      generatedSlot.uploadStatus = 'idle';
      const pvSlot: DeliverableSlot = {
        ...createDeliverableSlot('livrabil', file.name),
        name: file.name,
        filename: file.name,
        rawFilename: file.name.replace(/\.[^.]+$/, ''),
        fileType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: file.size,
        fileBlob: file,
        uploadedAt: new Date().toISOString(),
        uploaded: true,
        uploadStatus: 'idle',
        declaredTitle: `Proces-verbal evenimente Business HUB - ${parsed.monthLabel || reportMonthName}`,
        docTitle: `Proces-verbal evenimente Business HUB - ${parsed.monthLabel || reportMonthName}`,
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
      if (businessHubPvInputRef.current) {
        businessHubPvInputRef.current.value = '';
      }
    }
  };

  const addDeliverableSlot = (type: 'livrabil' | 'raport_preliminar' | 'justificativ') => {
    const newSlot = createDeliverableSlot(type, '');
    setDeliverables(prev => [...prev, newSlot]);
  };

  const updateDeliverable = (id: string, patch: Partial<DeliverableSlot>) => {
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const removeDeliverable = (id: string) => {
    setDeliverables(prev => prev.filter((d) => d.id !== id));
  };
  
  const upsertEventSlot = (slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => {
    const existing = deliverables.find(d => d.slotType === slotType);
    if (existing) {
      updateDeliverable(existing.id, patch);
    } else {
      const newSlot: DeliverableSlot = {
        ...createDeliverableSlot(slotType, name),
        ...patch,
      };
      setDeliverables(prev => [...prev, newSlot]);
    }
  };

  const addGrupTintaEntry = () => {
    setGrupTinta([
      ...grupTinta,
      {
        id: generateId(),
        expertId,
        date: selectedDates[0] || new Date().toISOString().split('T')[0],
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        activityType: activityTitle,
        organizations: [],
        participantsCount: 0,
      },
    ]);
  };

  const updateGrupTintaEntry = (id: string, field: keyof GrupTintaEntry, value: string | number | string[]) => {
    setGrupTinta(grupTinta.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };

  const removeGrupTintaEntry = (id: string) => {
    setGrupTinta(grupTinta.filter((g) => g.id !== id));
  };

  const verifyTitleWithAI = async () => {
    if (!activityTitle.trim() || !apiKey) return;

    setIsVerifyingTitle(true);
    setTitleVerificationResult(null);

    try {
      const response = await fetch('/api/ai/verify-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activityTitle,
          saCode,
          description,
        }),
      });

      const data = await response.json();
      setTitleVerificationResult(data.result || data.error);
    } catch {
      setTitleVerificationResult('Eroare la verificarea titlului');
    } finally {
      setIsVerifyingTitle(false);
    }
  };

  const dataUrlToBlob = (dataUrl: string, fallbackType: string) => {
    const [header, data] = dataUrl.split(',');
    const contentType = header.match(/data:(.*?);base64/)?.[1] || fallbackType || 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: contentType });
  };

  const uploadDeliverableFile = async (deliverable: DeliverableSlot): Promise<DeliverableSlot> => {
    if ((!deliverable.fileBlob && !deliverable.fileData) || deliverable.filePath) {
      return deliverable;
    }

    const documentId = deliverable.documentId || `doc_${deliverable.id}`;
    const fileName = deliverable.filename || deliverable.name || `livrabil-${deliverable.id}`;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = deliverable.fileBlob
      ? deliverable.fileBlob
      : dataUrlToBlob(deliverable.fileData!, deliverable.fileType || 'application/octet-stream');
    const fileHash = await sha256Hex(await blob.arrayBuffer());
    const firstPageTextHash = await hashFirstPageText(deliverable.firstPageText || deliverable.docText);
    const contentFingerprint = normalizeDocumentTextForFingerprint(deliverable.firstPageText || deliverable.docText).slice(0, 500);
    const projectId = expert?.projectCode || '302141';
    const projectName = expert?.projectTitle || 'Consolidarea capacitatii Concordia pentru dialog social';
    const s3Key = buildDocumentS3Key({
      projectId,
      documentId,
      originalFileName: safeName,
    });
    const result = await uploadData({
      path: s3Key,
      data: blob,
      options: {
        contentType: deliverable.fileType || blob.type || 'application/octet-stream',
      },
    }).result;

    return {
      ...deliverable,
      documentId,
      filePath: result.path,
      s3Key: result.path,
      fileHash,
      firstPageTextHash,
      contentFingerprint,
      uploadedByExpertId: expertId,
      uploadedByExpertName: expertName,
      projectId,
      projectName,
      activityDate: selectedDates[0],
      saCode,
      deliverableType: deliverable.type || deliverable.slotType,
      isCommonDeliverable: Boolean(deliverable.common),
      sharedWithExpertIds: deliverable.common ? collaborators : [],
      duplicateStatus: firstPageTextHash ? 'fingerprinted' : undefined,
      uploadStatus: 'uploaded',
      uploadError: undefined,
    };
  };

  const setDeliverableUploadStatus = (
    id: string,
    uploadStatus: DeliverableSlot['uploadStatus'],
    uploadError?: string,
  ) => {
    setDeliverables((prev) => prev.map((deliverable) =>
      deliverable.id === id ? { ...deliverable, uploadStatus, uploadError } : deliverable,
    ));
  };

  const uploadDeliverablesWithLimit = async (items: DeliverableSlot[], limit = 3) => {
    const results: DeliverableSlot[] = new Array(items.length);
    let cursor = 0;

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const deliverable = items[index];
        setDeliverableUploadStatus(deliverable.id, 'uploading');
        try {
          results[index] = await uploadDeliverableFile(deliverable);
          setDeliverableUploadStatus(deliverable.id, 'uploaded');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Eroare necunoscuta la upload.';
          setDeliverableUploadStatus(deliverable.id, 'failed', errorMessage);
          results[index] = {
            ...deliverable,
            uploadStatus: 'failed',
            uploadError: errorMessage,
            duplicateStatus: 'pending_upload',
            titleCheckStatus: deliverable.titleCheckStatus || 'extraction_failed',
            titleCheckMessage: deliverable.titleCheckMessage || 'Upload incomplet. Reincarca livrabilul pentru validare completa.',
          };
        }
      }
    }));

    return results;
  };

  const handleSave = async () => {
    setValidationError(null);
    const reportingWarnings: string[] = [];

    reportingWarnings.push(...validateDeliverablesDraft(deliverables).warnings);

    if (isGdprExpert && !isLeave) {
      const gdprValidation = validateGdprActivityDraft({
        templateCode: gdprTemplateCode,
        meta: {
          ...gdprMeta,
          concluzie: gdprConclusionCode,
        },
        description,
        hasDeliverable: deliverables.some((deliverable) => deliverable.uploaded && (deliverable.filename || deliverable.name)),
      });

      if (!gdprValidation.ok) {
        reportingWarnings.push(`Activitatea GDPR are campuri/dovezi lipsa: ${gdprValidation.missingFields.join(', ')}.`);
      }
    }

    const newActivityDrafts: ActivityDraftForValidation[] = selectedDates.map((date) => ({
      id: initialActivity?.id,
      expertId,
      date,
      hours: isLeave ? 0 : Number(normalizePontajHoursValue(hoursPerDay[date], defaultHours)),
      status: initialActivity?.status,
      projectCode: expert?.projectCode,
    }));
    const existingActivityDrafts: ActivityDraftForValidation[] = allActivities
      .filter((activity) => activity.expertId === expertId)
      .filter((activity) => !initialActivity || activity.id !== initialActivity.id)
      .map((activity) => ({
        id: activity.id,
        expertId: activity.expertId,
        date: activity.date,
        hours: Number(activity.hours) || 0,
        status: activity.status,
        projectCode: activity.projectCode,
      }));
    const validationInput = {
      expert: expert ?? { id: expertId, name: expertName, norma: expertNorma },
      existingActivities: existingActivityDrafts,
      newActivities: newActivityDrafts,
      month,
      year,
    };
    const validation = isGtExpert
      ? validateGrupTintaActivityDraft({ ...validationInput, grupTinta })
      : validateStandardActivityDraft(validationInput);

    if (!validation.ok) {
      setValidationError(validation.message || 'Activitatea nu respecta regulile de pontaj.');
      return;
    }

    const deliverablesToProcess = deliverables.filter((d) => d.uploaded && (d.filename || d.name));
    deliverablesToProcess.forEach((deliverable) => setDeliverableUploadStatus(deliverable.id, 'queued'));
    const uploadedDeliverables = await uploadDeliverablesWithLimit(deliverablesToProcess, 3);

    uploadedDeliverables.forEach((deliverable) => {
      if (deliverable.uploadStatus === 'failed') {
        const deliverableLabel = deliverable.filename || deliverable.name || 'livrabil';
        reportingWarnings.push(
          `Livrabilul "${deliverableLabel}" nu a putut fi incarcat in S3 (${deliverable.uploadError || 'eroare necunoscuta'}). Activitatea se salveaza ca draft si livrabilul poate fi reincarcat ulterior.`,
        );
      }
    });

    if (reportingWarnings.length > 0) {
      const warningMessage = [
        'Activitatea se va salva, dar raportul de activitate nu va putea fi transmis pana la remedierea urmatoarelor probleme:',
        ...reportingWarnings.map((warning) => `- ${warning}`),
      ].join('\n');
      setValidationError(warningMessage);
      if (typeof window !== 'undefined') {
        window.alert(warningMessage);
      }
    }

    const activities: Activity[] = selectedDates.map((date) => {
      // Get hours for this specific date, fallback to default
      const dateHours = isLeave ? 0 : Number(normalizePontajHoursValue(hoursPerDay[date], defaultHours));
      const shouldAttachDeliverables = shouldAttachUploadedDeliverablesToDate(selectedDates, date);
      
      return {
        id: initialActivity?.id || generateId(),
        date,
        expertId,
        expertName,
        hours: dateHours,
        activityType: effectiveActivityTitle,
        saCode: effectiveSaCode,
        catalogActivityId: selectedCatalogItem?.id,
        title: effectiveActivityTitle,
        description,
        deliverables: shouldAttachDeliverables ? uploadedDeliverables
          .map(d => ({
            id: d.id,
            activityId: initialActivity?.id || '',
            fileName: d.filename || d.name || '',
            fileType: d.fileType || '',
            fileSize: d.fileSize || 0,
            filePath: d.filePath,
            documentId: d.documentId,
            s3Bucket: d.s3Bucket,
            s3Key: d.s3Key || d.filePath,
            originalFileName: d.filename || d.name || '',
            fileHash: d.fileHash,
            firstPageTextHash: d.firstPageTextHash,
            contentFingerprint: d.contentFingerprint,
            uploadedByExpertId: d.uploadedByExpertId,
            uploadedByExpertName: d.uploadedByExpertName,
            projectId: d.projectId,
            projectName: d.projectName,
            sourceActivityId: d.sourceActivityId,
            activityDate: date,
            saCode,
            deliverableType: d.deliverableType || d.type || d.slotType,
            isCommonDeliverable: Boolean(d.common || d.isCommonDeliverable),
            sharedWithExpertIds: d.common ? collaborators : (d.sharedWithExpertIds || []),
            possibleDuplicateOfDocumentId: d.possibleDuplicateOfDocumentId,
            duplicateStatus: d.duplicateStatus,
            uploadedAt: d.uploadedAt,
            declaredTitle: d.declaredTitle,
            docTitle: d.docTitle || undefined,
            docText: d.docText || undefined,
            suggestedTitle: d.suggestedTitle || undefined,
            titleSuggestionConfidence: d.titleSuggestionConfidence,
            titleSuggestionAlternatives: d.titleSuggestionAlternatives,
            titleSuggestionReason: d.titleSuggestionReason,
            firstPageText: d.firstPageText || undefined,
            titleSource: d.titleSource,
            titleMatch: d.titleMatch,
            titleConfirmed: d.titleConfirmed,
            titleCheckStatus: d.titleCheckStatus,
            titleCheckMessage: d.titleCheckMessage,
            aiStatus: d.aiCheck?.eligible === true
              ? 'eligible'
              : d.aiCheck?.eligible === false
                ? 'ineligible'
                : d.aiCheck
                  ? 'review'
                  : undefined,
            aiReason: d.aiCheck?.reason,
            eligibilityCheck: d.eligibilityCheck || undefined,
          })) : [],
        location,
        dayType,
        shareStatus: activityCommon ? 'shared' : 'private',
        takenByExperts: activityCommon ? collaborators : [],
        gdprTemplateCode: isGdprExpert ? gdprTemplateCode : undefined,
        gdprMetaJson: isGdprExpert ? serializeGdprMeta({ ...gdprMeta, concluzie: gdprConclusionCode }) : undefined,
        gdprGeneratedText: isGdprExpert ? (gdprGeneratedText || description) : undefined,
        gdprConclusionCode: isGdprExpert ? gdprConclusionCode : undefined,
        grupTinta,
        createdAt: initialActivity?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    await onSave(activities);
  };

  const setCollaboratorChecked = (id: string, checked: boolean) => {
    setCollaborators((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((collaboratorId) => collaboratorId !== id);
    });
  };

  const addAllSuggestedCollaborators = () => {
    setCollaborators((prev) => Array.from(new Set([
      ...prev,
      ...collaboratorSuggestions.map((suggestion) => suggestion.expert.id),
    ])));
  };

  const updateGdprMeta = (key: string, value: GdprMetaValue) => {
    setGdprMeta((prev) => {
      const next = { ...prev, [key]: value };
      if (selectedGdprTemplate && key !== 'obiectVerificare') {
        const previousGeneratedObject = buildGdprObjectVerification(selectedGdprTemplate.code, prev);
        const currentObject = typeof prev.obiectVerificare === 'string' ? prev.obiectVerificare.trim() : '';
        if (!currentObject || currentObject === previousGeneratedObject) {
          next.obiectVerificare = buildGdprObjectVerification(selectedGdprTemplate.code, next);
        }
      }
      return buildDefaultGdprMeta(gdprTemplateCode, next, `${reportMonthName} ${year}`);
    });
  };

  const handleGdprConclusionChange = (code: string) => {
    setGdprConclusionCode(code);
    updateGdprMeta('concluzie', code);
  };

  const handleGdprTemplateChange = (code: string) => {
    const template = getGdprTemplate(code);
    setGdprTemplateCode(code);
    setGdprGeneratedText('');
    if (!template) return;
    setSaCode(template.saCode);
    setActivityTitle(template.activityTitle);
    setGdprMeta((prev) => buildDefaultGdprMeta(code, { ...prev, concluzie: gdprConclusionCode || 'conform_fara_neconformitati' }, `${reportMonthName} ${year}`));
    const templateHours = normalizePontajHoursValue(Math.min(template.defaultHours, defaultHours), defaultHours);
    setHours(templateHours);
    setHoursPerDay((prev) => {
      const next = { ...prev };
      selectedDates.forEach((date) => { next[date] = templateHours; });
      onSelectedHoursChange?.(next);
      return next;
    });
  };

  const buildGdprInput = () => {
    if (!selectedGdprTemplate) return null;
    return {
      templateCode: selectedGdprTemplate.code,
      meta: { ...gdprMeta, concluzie: gdprConclusionCode },
      date: selectedDates[0] || '',
      expertName,
      expertRole: expert?.positionInProject || expert?.role,
      projectCode: expert?.projectCode,
      projectTitle: expert?.projectTitle,
    };
  };

  const generateGdprDescription = () => {
    const input = buildGdprInput();
    if (!input) {
      setValidationError('Selecteaza mai intai tipul de activitate GDPR.');
      return;
    }
    const generated = buildGdprActivityDescription(input);
    setDescription(generated);
    setGdprGeneratedText(generated);
    setValidationError(null);
  };

  const improveGdprDescriptionWithAI = async () => {
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
        body: JSON.stringify({ text: textToImprove, templateLabel: selectedGdprTemplate?.label, expertName, month, year, projectCode: expert?.projectCode }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Nu am putut imbunatati textul cu AI.');
      setDescription(data.text);
      setGdprGeneratedText(data.text);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Eroare la imbunatatirea textului GDPR.');
    } finally {
      setIsImprovingGdprText(false);
    }
  };

  const generateGdprDeliverable = async () => {
    const input = buildGdprInput();
    if (!input) {
      setValidationError('Selecteaza mai intai tipul de activitate GDPR.');
      return;
    }
    const draftValidation = validateGdprActivityDraft({ templateCode: gdprTemplateCode, meta: input.meta, description, hasDeliverable: true });
    if (draftValidation.missingFields.length > 0) {
      setValidationError(`Completeaza campurile GDPR obligatorii: ${draftValidation.missingFields.join(', ')}.`);
      return;
    }
    setIsGeneratingGdprDocx(true);
    setValidationError(null);
    try {
      const blob = await buildGdprDeliverableDocx(input);
      const generatedSlot = createGeneratedGdprDeliverableSlot({ ...input, fileSize: blob.size });
      generatedSlot.fileBlob = blob;
      generatedSlot.uploadStatus = 'idle';
      setDeliverables((prev) => [
        ...prev.filter((deliverable) => deliverable.declaredTitle !== generatedSlot.declaredTitle || !deliverable.documentId?.startsWith('doc_gdpr_')),
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
  };

  const mainDeliverables = deliverables.filter((deliverable) => !deliverable.slotType || deliverable.slotType === 'livrabil');
  const prelimDeliverables = deliverables.filter((deliverable) => deliverable.slotType === 'raport_preliminar');
  const justifDeliverables = deliverables.filter((deliverable) => deliverable.slotType === 'justificativ');

  const handleActivityCommonChange = (checked: boolean) => {
    setActivityCommon(checked);
    if (!checked) {
      setCollaborators([]);
      setDeliverables((prev) => prev.map((deliverable) => ({ ...deliverable, common: false })));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{initialActivity ? 'Editare Activitate' : 'Adaugare Activitate'}</CardTitle>
        {selectedDates.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedDates.length === 1 ? `Data: ${formatDateRo(selectedDates[0])}` : `${selectedDates.length} zile selectate`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <HoursPerDaySection selectedDates={selectedDates} dayType={dayType} onDayTypeChange={setDayType} hoursPerDay={hoursPerDay} defaultHours={defaultHours} expertNorma={expertNorma} hourOptions={hourOptions} onHoursChange={updateHoursForDate} />

        {!isLeave && (
          <>
            {isGdprExpert && (
              <GdprActivitySection gdprTemplateCode={gdprTemplateCode} selectedGdprTemplate={selectedGdprTemplate} gdprMeta={gdprMeta} gdprConclusionCode={gdprConclusionCode} gdprFieldDefinitions={gdprFieldDefinitions} isBusinessHubGdpr={isBusinessHubGdpr} isGeneratingGdprDocx={isGeneratingGdprDocx} isImprovingGdprText={isImprovingGdprText} businessHubPvInputRef={businessHubPvInputRef} onTemplateChange={handleGdprTemplateChange} onConclusionChange={handleGdprConclusionChange} onMetaChange={updateGdprMeta} onBusinessHubPvUpload={handleBusinessHubPvUpload} onGenerateDescription={generateGdprDescription} onImproveDescription={improveGdprDescriptionWithAI} onGenerateDeliverable={generateGdprDeliverable} />
            )}

            <ActivityBasicFields isGdprExpert={isGdprExpert} role={expert?.role} saCode={saCode} onSaCodeChange={setSaCode} availableSaCodes={availableSaCodes} catalogLoading={catalogLoading} catalogCount={catalog.length} location={location} onLocationChange={setLocation} activityTitle={activityTitle} onActivityTitleChange={setActivityTitle} availableActivities={availableActivities} selectedCatalogItem={selectedCatalogItem} apiKey={apiKey} isVerifyingTitle={isVerifyingTitle} titleVerificationResult={titleVerificationResult} onVerifyTitle={verifyTitleWithAI} description={description} onDescriptionChange={setDescription} activityCommon={activityCommon} isException={isException} needsCommonDesc={needsCommonDesc} isEvent={isEvent} eventDuration={eventDuration} onEventDurationChange={setEventDuration} totalHours={totalHours} eventDur={eventDur} needsExtendedDesc={needsExtendedDesc} eventExtendedDesc={eventExtendedDesc} onEventExtendedDescChange={setEventExtendedDesc} selectedGdprSaCode={selectedGdprTemplate?.saCode} expert={expert} />

            {!isException && (
              <>
                <DeliverablesSection deliverables={deliverables} mainDeliverables={mainDeliverables} prelimDeliverables={prelimDeliverables} justifDeliverables={justifDeliverables} onAddSlot={addDeliverableSlot} onUpdateDeliverable={updateDeliverable} onRemoveDeliverable={removeDeliverable} isEvent={isEvent} saCode={saCode} activityTitle={activityTitle} selectedCatalogItem={selectedCatalogItem} deliverableOptions={deliverableOptions} apiKey={apiKey} projectCode={expert?.projectCode} month={month} year={year} expertName={expertName} allExperts={allExperts} expertId={expertId} selectedDate={selectedDates[0] || ''} description={description} onUpsertEventSlot={upsertEventSlot} />
                <CollaboratorsSection activityCommon={activityCommon} onActivityCommonChange={handleActivityCommonChange} collaborators={collaborators} allExperts={allExperts} expertId={expertId} collaboratorSuggestions={collaboratorSuggestions} onCollaboratorChecked={setCollaboratorChecked} onAddAllSuggestedCollaborators={addAllSuggestedCollaborators} mainDeliverables={mainDeliverables} onUpdateDeliverable={updateDeliverable} />
              </>
            )}

            {isGtExpert && saCode === 'SA1.1' && (
              <GrupTintaSection entries={grupTinta} onAddEntry={addGrupTintaEntry} onUpdateEntry={updateGrupTintaEntry} onRemoveEntry={removeGrupTintaEntry} />
            )}
          </>
        )}

        <ActivitySavePanel isLeave={isLeave} isException={isException} mainDeliverablesCount={mainDeliverables.length} validationError={validationError} saveBlockers={saveBlockers} isSaving={isSaving} isEditing={Boolean(initialActivity)} onCancel={onCancel} onSave={handleSave} />
      </CardContent>
    </Card>
  );
}

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
