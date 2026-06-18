'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, X, FileText, Loader2, Users, Plus, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';
import { uploadData } from 'aws-amplify/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { generateId, formatDateRo } from '@/lib/app-utils';
import { EventDocsPanel } from './event-docs-panel';
import { DeliverableItem } from './deliverable-item';
import { createDeliverableSlot, type DeliverableSlot } from '@/lib/deliverable-types';
import { 
  ACTS, 
  isEventActivity, 
  isExceptionActivity,
  getActivityOptions,
  getDeliverableOptions 
} from '@/lib/peo-constants';
import { useActivityCatalog } from '@/hooks/use-backend-data';
import type { Activity, Deliverable, GrupTintaEntry, Expert, ActivityCatalog } from '@/lib/types';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { mergeActivityCatalogs } from '@/lib/activity-catalog-merge';
import { buildDocumentS3Key, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import { shouldAttachUploadedDeliverablesToDate } from '@/lib/activity-deliverables';
import {
  MAX_PONTAJ_HOURS,
  buildSelectedHoursForDates,
  isValidPontajHours,
  normalizePontajHoursValue,
  validateActivitiesBeforeCreate,
  type ActivityDraftForValidation,
} from '@/lib/pontaj-rules';
import {
  GDPR_CONCLUSION_OPTIONS,
  GDPR_TEMPLATES,
  buildGdprActivityDescription,
  buildDefaultGdprMeta,
  buildGdprObjectVerification,
  buildGdprDeliverableDocx,
  createGeneratedGdprDeliverableSlot,
  getGdprDeliverableRequirementLabel,
  getGdprFieldDefinitions,
  getGdprMinimumEvidenceLabels,
  getGdprOptionLabel,
  getGdprOptionValue,
  getGdprTemplate,
  parseGdprMetaJson,
  serializeGdprMeta,
  validateGdprActivityDraft,
  type GdprBusinessHubEvent,
  type GdprFieldDefinition,
  type GdprMeta,
  type GdprMetaValue,
} from '@/lib/gdpr-reporting';

const SAVED_SLOT_TYPES = new Set<DeliverableSlot['slotType']>([
  'livrabil',
  'main',
  'raport_preliminar',
  'event_mom',
  'event_proof',
  'justificativ',
]);

function resolveSavedSlotType(deliverableType?: string, category?: string): DeliverableSlot['slotType'] {
  const savedType = category || deliverableType;
  return SAVED_SLOT_TYPES.has(savedType as DeliverableSlot['slotType'])
    ? (savedType as DeliverableSlot['slotType'])
    : 'livrabil';
}

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

  const effectiveCatalog = useMemo(
    () => mergeActivityCatalogs(fallbackCatalog, catalog),
    [fallbackCatalog, catalog],
  );
  
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
  const [, setHours] = useState(normalizePontajHoursValue(activitySeed?.hours, defaultHours));
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
      slotType: resolveSavedSlotType(d.deliverableType, d.category),
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

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const lastAutoDescriptionRef = useRef('');

  useEffect(() => {
    if (initialActivity?.id || prefillActivity?.description?.trim()) return;
    if (!selectedCatalogItem) return;

    const standardDescription = selectedCatalogItem.description?.trim() ?? '';
    setDescription((currentDescription) => {
      const currentWasAutoFilled =
        !currentDescription.trim() || currentDescription === lastAutoDescriptionRef.current;

      if (!currentWasAutoFilled) return currentDescription;

      lastAutoDescriptionRef.current = standardDescription;
      return standardDescription;
    });
  }, [initialActivity?.id, prefillActivity?.description, selectedCatalogItem]);

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
  const totalHours = selectedDates.reduce((sum, date) => (
    sum + Number(normalizePontajHoursValue(hoursPerDay[date], defaultHours))
  ), 0);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const newDeliverable: DeliverableSlot = {
          id: generateId(),
          slotType: 'livrabil',
          name: file.name,
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileData: reader.result as string,
          uploadedAt: new Date().toISOString(),
          uploaded: true,
          isPhoto: file.type.startsWith('image/'),
          declaredTitle: '',
          titleConfirmed: false,
          stadiu: '',
          aiCheck: null,
          docTitle: null,
          docText: null,
          documentId: `doc_${generateId()}`,
          isCommonDeliverable: false,
          sharedWithExpertIds: [],
          suggestedTitle: null,
          firstPageText: null,
          titleSource: undefined,
          titleMatch: null,
          titleCheckStatus: undefined,
          titleCheckMessage: undefined,
          isPendingConfirm: false,
        };
        setDeliverables(prev => [...prev, newDeliverable]);
      };
      reader.readAsDataURL(file);
    }
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

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
      const pvDataUrl = await fileToDataUrl(file);
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
      const generatedDataUrl = await blobToDataUrl(generatedBlob);
      const generatedSlot = createGeneratedGdprDeliverableSlot({
        ...input,
        fileData: generatedDataUrl,
        fileSize: generatedBlob.size,
      });
      const pvSlot: DeliverableSlot = {
        ...createDeliverableSlot('livrabil', file.name),
        name: file.name,
        filename: file.name,
        rawFilename: file.name.replace(/\.[^.]+$/, ''),
        fileType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: file.size,
        fileData: pvDataUrl,
        uploadedAt: new Date().toISOString(),
        uploaded: true,
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
    if (!activityTitle.trim()) return;

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
    if (!deliverable.fileData || deliverable.filePath) {
      return deliverable;
    }

    const documentId = deliverable.documentId || `doc_${deliverable.id}`;
    const fileName = deliverable.filename || deliverable.name || `livrabil-${deliverable.id}`;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = dataUrlToBlob(deliverable.fileData, deliverable.fileType || 'application/octet-stream');
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
    };
  };

  const handleSave = async () => {
    setValidationError(null);
    const reportingWarnings: string[] = [];

    const invalidTitleDeliverable = deliverables.find((d) => (
      d.uploaded
      && !d.isPhoto
      && (
        !d.titleConfirmed
        || d.titleCheckStatus === 'mismatch'
        || d.titleCheckStatus === 'extraction_failed'
        || d.titleMatch === false
      )
    ));

    if (invalidTitleDeliverable) {
      reportingWarnings.push(
        invalidTitleDeliverable.titleCheckMessage
        || 'Titlul livrabilului trebuie confirmat si trebuie sa se regaseasca in prima pagina.',
      );
    }

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
    const validation = validateActivitiesBeforeCreate({
      expert: expert ?? { id: expertId, name: expertName, norma: expertNorma },
      existingActivities: existingActivityDrafts,
      newActivities: newActivityDrafts,
      month,
      year,
    });

    if (!validation.ok) {
      setValidationError(validation.message || 'Activitatea nu respecta regulile de pontaj.');
      return;
    }

    const deliverablesToProcess = deliverables.filter((d) => d.uploaded && (d.filename || d.name));
    const uploadedDeliverables: DeliverableSlot[] = [];

    for (const deliverable of deliverablesToProcess) {
      try {
        const uploadedDeliverable = await uploadDeliverableFile(deliverable);
        uploadedDeliverables.push(uploadedDeliverable);
      } catch (error) {
        const deliverableLabel = deliverable.filename || deliverable.name || 'livrabil';
        const errorMessage = error instanceof Error ? error.message : 'Eroare necunoscuta la upload.';
        reportingWarnings.push(
          `Livrabilul "${deliverableLabel}" nu a putut fi incarcat in S3 (${errorMessage}). Activitatea se salveaza ca draft si livrabilul poate fi reincarcat ulterior.`,
        );

        uploadedDeliverables.push({
          ...deliverable,
          duplicateStatus: 'pending_upload',
          titleCheckStatus: deliverable.titleCheckStatus || 'extraction_failed',
          titleCheckMessage: deliverable.titleCheckMessage || 'Upload incomplet. Reincarca livrabilul pentru validare completa.',
        });
      }
    }

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
            category: d.slotType,
            deliverableType: d.deliverableType || d.type || d.slotType,
            uploaded: true,
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
            fileData: d.fileData,
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const setCollaboratorChecked = (id: string, checked: boolean) => {
    setCollaborators((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
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
    setGdprMeta((prev) => buildDefaultGdprMeta(code, {
      ...prev,
      concluzie: gdprConclusionCode || 'conform_fara_neconformitati',
    }, `${reportMonthName} ${year}`));

    const templateHours = normalizePontajHoursValue(Math.min(template.defaultHours, defaultHours), defaultHours);
    setHours(templateHours);
    setHoursPerDay((prev) => {
      const next = { ...prev };
      selectedDates.forEach((date) => {
        next[date] = templateHours;
      });
      onSelectedHoursChange?.(next);
      return next;
    });
  };

  const buildGdprInput = () => {
    if (!selectedGdprTemplate) return null;
    return {
      templateCode: selectedGdprTemplate.code,
      meta: {
        ...gdprMeta,
        concluzie: gdprConclusionCode,
      },
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
        body: JSON.stringify({
          text: textToImprove,
          templateLabel: selectedGdprTemplate?.label,
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
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const generateGdprDeliverable = async () => {
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

  // Filter deliverables by type
  const mainDeliverables = deliverables.filter(d => !d.slotType || d.slotType === 'livrabil');
  const prelimDeliverables = deliverables.filter(d => d.slotType === 'raport_preliminar');
  const justifDeliverables = deliverables.filter(d => d.slotType === 'justificativ');
  const hasEventMomAsMainDeliverable = isEvent && deliverables.some((deliverable) => (
    deliverable.slotType === 'event_mom'
    && deliverable.uploaded
    && !deliverable.isPendingConfirm
    && Boolean(deliverable.filename || deliverable.name || deliverable.declaredTitle)
  ));

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
            onCheckedChange={(checked) => updateGdprMeta(field.key, checked === true)}
          />
          <label htmlFor={`gdpr-${field.key}`} className="cursor-pointer text-sm">
            {field.label}
          </label>
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <Field key={field.key}>
          {label}
          <Select value={typeof value === 'string' ? value : ''} onValueChange={(next) => updateGdprMeta(field.key, next)}>
            <SelectTrigger id={`gdpr-${field.key}`}>
              <SelectValue placeholder="Selecteaza" />
            </SelectTrigger>
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
        updateGdprMeta(field.key, { selected: nextSelected, altele });
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
                    onCheckedChange={(checked) => {
                      updateSelection(
                        checked === true
                          ? Array.from(new Set([...selected, optionValue]))
                          : selected.filter((item) => item !== optionValue)
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
                    onCheckedChange={(checked) => {
                      updateGdprMeta(
                        field.key,
                        checked === true
                          ? Array.from(new Set([...selected, optionValue]))
                          : selected.filter((item) => item !== optionValue)
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
            onChange={(event) => updateGdprMeta(field.key, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
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
            onChange={(event) => updateGdprMeta(field.key, event.target.value)}
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
          onChange={(event) => updateGdprMeta(field.key, field.type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
          placeholder={field.placeholder}
        />
      </Field>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {initialActivity ? 'Editare Activitate' : 'Adaugare Activitate'}
        </CardTitle>
        {selectedDates.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedDates.length === 1
              ? `Data: ${formatDateRo(selectedDates[0])}`
              : `${selectedDates.length} zile selectate`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Day Type and Hours */}
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="dayType">Tip zi</FieldLabel>
            <Select value={dayType} onValueChange={(v) => setDayType(v as typeof dayType)}>
              <SelectTrigger id="dayType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lucratoare">Lucratoare</SelectItem>
                <SelectItem value="CO">CO - Concediu odihna</SelectItem>
                <SelectItem value="CM">CM - Concediu medical</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {!isLeave && selectedDates.length === 1 && (
            <Field>
              <FieldLabel htmlFor="hours">Ore lucrate (max 8h/zi, norma {expertNorma}h)</FieldLabel>
              <Select 
                value={hoursPerDay[selectedDates[0]] || defaultHours.toString()} 
                onValueChange={(v) => updateHoursForDate(selectedDates[0], v)}
              >
                <SelectTrigger id="hours">
                  <SelectValue placeholder="Selecteaza orele" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions
                    .map(h => (
                      <SelectItem key={h} value={h.toString()}>
                        {h} {h === 1 ? 'ora' : 'ore'}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        {/* Per-day hours when multiple days selected */}
        {!isLeave && selectedDates.length > 1 && (
          <div className="space-y-3">
            <FieldLabel>Ore pentru fiecare zi (max 8h/zi, norma {expertNorma}h)</FieldLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {selectedDates.sort().map(date => (
                <div key={date} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                  <span className="text-xs font-medium min-w-[70px]">
                    {formatDateRo(date)}
                  </span>
                  <Select 
                    value={hoursPerDay[date] || defaultHours.toString()} 
                    onValueChange={(v) => updateHoursForDate(date, v)}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hourOptions
                        .map(h => (
                          <SelectItem key={h} value={h.toString()}>
                            {h}h
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Total: {selectedDates.reduce((sum, date) => sum + Number(normalizePontajHoursValue(hoursPerDay[date], defaultHours)), 0)}h pentru {selectedDates.length} zile
            </p>
          </div>
        )}

        {!isLeave && (
          <>
            {isGdprExpert && (
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
                  <Select value={gdprTemplateCode} onValueChange={handleGdprTemplateChange}>
                    <SelectTrigger id="gdprTemplate" className="bg-white">
                      <SelectValue placeholder="Selecteaza activitatea GDPR" />
                    </SelectTrigger>
                    <SelectContent>
                      {GDPR_TEMPLATES.map((template) => (
                        <SelectItem key={template.code} value={template.code}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {selectedGdprTemplate && (
                  <>
                    <div className="grid gap-3 rounded-md border border-emerald-200 bg-white/70 p-3 text-xs text-emerald-950 md:grid-cols-3">
                      <div>
                        <span className="font-medium">Subactivitate</span>
                        <div>{selectedGdprTemplate.saCode}</div>
                      </div>
                      <div>
                        <span className="font-medium">Activitate</span>
                        <div>{selectedGdprTemplate.activityTitle}</div>
                      </div>
                      <div>
                        <span className="font-medium">Regula livrabil</span>
                        <div>{getGdprDeliverableRequirementLabel(selectedGdprTemplate.deliverableRequirement)}</div>
                      </div>
                    </div>

                    <div className="rounded-md border border-emerald-200 bg-white p-3 text-xs text-emerald-950">
                      <div className="font-medium">Dovada minima acceptata</div>
                      <div>{getGdprMinimumEvidenceLabels(selectedGdprTemplate.minimumEvidenceTypes).join(', ') || 'Nu este necesara dovada suplimentara'}</div>
                      {selectedGdprTemplate.deliverableRequirement === 'nu_este_necesar' && (
                        <p className="mt-1 text-emerald-800">
                          Aceasta activitate este eligibila fara livrabil suplimentar daca exista dovada minima si concluzie de conformitate.
                        </p>
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
                          <Button
                            type="button"
                            onClick={() => businessHubPvInputRef.current?.click()}
                            disabled={isGeneratingGdprDocx}
                          >
                            {isGeneratingGdprDocx ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-2" />
                            )}
                            Upload PV si genereaza RP
                          </Button>
                        </div>
                        <input
                          ref={businessHubPvInputRef}
                          type="file"
                          className="hidden"
                          accept=".xls,.xlsx"
                          onChange={handleBusinessHubPvUpload}
                        />
                        <div className="mt-3 grid gap-3 text-xs text-slate-700 md:grid-cols-3">
                          <div className="rounded-md bg-emerald-50 p-2">
                            <span className="font-medium">Luna detectata</span>
                            <div>{typeof gdprMeta.lunaAnalizata === 'string' ? gdprMeta.lunaAnalizata : 'se completeaza din PV'}</div>
                          </div>
                          <div className="rounded-md bg-emerald-50 p-2">
                            <span className="font-medium">Evenimente detectate</span>
                            <div>{typeof gdprMeta.numarEvenimente === 'number' ? gdprMeta.numarEvenimente : 'se calculeaza automat'}</div>
                          </div>
                          <div className="rounded-md bg-emerald-50 p-2">
                            <span className="font-medium">Status</span>
                            <div>{gdprMeta.businessHubEvents ? 'PV citit si RP generat' : 'asteapta upload PV'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="gdprConclusion">Concluzie conformitate *</FieldLabel>
                        <Select value={gdprConclusionCode} onValueChange={handleGdprConclusionChange}>
                          <SelectTrigger id="gdprConclusion" className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GDPR_CONCLUSION_OPTIONS.map((option) => (
                              <SelectItem key={option.code} value={option.code}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {!isBusinessHubGdpr && gdprFieldDefinitions.slice(0, 1).map(renderGdprField)}
                    </div>

                    {!isBusinessHubGdpr && (
                      <div className="grid gap-4 md:grid-cols-2">
                        {gdprFieldDefinitions.slice(1).map(renderGdprField)}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-emerald-200 pt-3">
                      <Button type="button" variant="outline" onClick={generateGdprDescription}>
                        <FileText className="h-4 w-4 mr-2" />
                        Genereaza descriere
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={improveGdprDescriptionWithAI}
                        disabled={isImprovingGdprText}
                      >
                        {isImprovingGdprText ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Imbunatateste cu AI
                      </Button>
                      <Button
                        type="button"
                        onClick={generateGdprDeliverable}
                        disabled={isGeneratingGdprDocx}
                      >
                        {isGeneratingGdprDocx ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Genereaza livrabil DOCX si ataseaza
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Sub-activity and Activity */}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="saCode">Subactivitate (Rol: {expert?.role})</FieldLabel>
                {isGdprExpert ? (
                  <Input id="saCode" value={saCode || selectedGdprTemplate?.saCode || 'SA1.1'} disabled />
                ) : (
                  <Select value={saCode} onValueChange={setSaCode} disabled={catalogLoading && catalog.length === 0}>
                    <SelectTrigger id="saCode">
                      <SelectValue placeholder={catalogLoading && catalog.length === 0 ? "Se incarca..." : "Selecteaza SA"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSaCodes.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">Nicio subactivitate disponibila</div>
                      ) : (
                        availableSaCodes.map((sa) => (
                          <SelectItem key={sa} value={sa}>{sa}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                {availableSaCodes.length === 0 && !catalogLoading && (
                  <p className="text-xs text-amber-600 mt-1">
                    Nu exista subactivitati alocate pentru rolul tau. Contacteaza PM.
                  </p>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="location">Locatie</FieldLabel>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger id="location">
                    <SelectValue placeholder="Selecteaza locatia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Birou">Birou</SelectItem>
                    <SelectItem value="Teren">Teren</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Sediu CPC">Sediu CPC</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Activity from catalog */}
            {!isGdprExpert && (
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="activity">Activitate</FieldLabel>
                {activityTitle && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={verifyTitleWithAI}
                    disabled={isVerifyingTitle}
                  >
                    {isVerifyingTitle ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Verificare...
                      </>
                    ) : (
                      'Verifica cu AI'
                    )}
                  </Button>
                )}
              </div>
              <Select value={activityTitle} onValueChange={setActivityTitle} disabled={!saCode || availableActivities.length === 0}>
                <SelectTrigger id="activity">
                  <SelectValue placeholder={!saCode ? "Selecteaza SA mai intai" : "— Selecteaza activitatea —"} />
                </SelectTrigger>
                <SelectContent>
                  {availableActivities.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Nicio activitate pentru acest SA</div>
                  ) : (
                    availableActivities.map((act) => (
                      <SelectItem key={act} value={act}>{act}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedCatalogItem && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCatalogItem.serviceCategory} - {selectedCatalogItem.description}
                </p>
              )}
              {titleVerificationResult && (
                <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                  {titleVerificationResult}
                </p>
              )}
            </Field>
            )}

            {/* Description */}
            <Field>
              <FieldLabel htmlFor="description">
                {isException 
                  ? 'Descriere (obligatorie - min 15 caractere)' 
                  : activityCommon 
                    ? 'Descriere contributie individuala (obligatorie - min 30 caractere)'
                    : 'Descriere activitate'
                }
              </FieldLabel>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={activityCommon 
                  ? "Descrie specific ce AI realizat TU in aceasta activitate comuna (persoana I, contributie specifica)..." 
                  : "Ce anume ai realizat..."}
                rows={4}
                className={needsCommonDesc ? 'border-amber-500' : ''}
              />
              {isException && (description || '').length < 15 && (
                <div className="text-xs text-amber-700 mt-1">
                  {(description || '').length}/15 caractere
                </div>
              )}
              {needsCommonDesc && (
                <div className="text-xs text-amber-700 mt-1 p-2 bg-amber-50 rounded">
                  Activitate comuna - descriere obligatorie min. 30 caractere ({(description || '').trim().length}/30). 
                  Specifica contributia ta individuala.
                </div>
              )}
            </Field>

            {/* Event duration (for event activities) */}
            {isEvent && (
              <Field>
                <FieldLabel>Durata evenimentului (ore) - optional</FieldLabel>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    min="0.5"
                    max="8"
                    step="0.5"
                    value={eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    placeholder="ex: 2"
                    className="w-24"
                  />
                  {eventDur > 0 && totalHours > eventDur && (
                    <span className="text-xs text-amber-700">
                      Ai pontat {totalHours}h dar evenimentul a durat {eventDur}h - explica orele suplimentare
                    </span>
                  )}
                  {eventDur > 0 && totalHours <= eventDur && (
                    <span className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Ore pontate ({totalHours}h) = durata evenimentului ({eventDur}h)
                    </span>
                  )}
                </div>
                {needsExtendedDesc && (
                  <div className="mt-2">
                    <Label className="text-xs text-amber-700">Activitati conexe evenimentului - obligatoriu</Label>
                    <div className="text-xs text-amber-600 mb-2">
                      Ai pontat mai multe ore decat durata evenimentului. Descrie ce ai realizat in orele suplimentare.
                    </div>
                    <Textarea
                      value={eventExtendedDesc}
                      onChange={(e) => setEventExtendedDesc(e.target.value)}
                      rows={3}
                      placeholder="Ex: 1h pregatire materiale de prezentare inainte de eveniment, 1h redactare minuta si sinteza concluzii dupa eveniment..."
                      className="border-amber-500"
                    />
                  </div>
                )}
              </Field>
            )}

            {/* Main Deliverables */}
            {!isException && (
              <div className="space-y-4">
                {/* Livrabile principale */}
                <div className="bg-slate-50 rounded-lg p-4 border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Livrabile principale
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Outputurile directe ale activitatii - obligatorii
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addDeliverableSlot('livrabil')}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adauga livrabil
                    </Button>
                  </div>

                  {mainDeliverables.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-md">
                      Niciun livrabil. Apasa + pentru a adauga outputul activitatii.
                    </div>
                  )}

                  <div className="space-y-3">
                    {mainDeliverables.map((d) => (
                      <DeliverableItem
                        key={d.id}
                        deliverable={d}
                        subActivity={saCode}
                        activityTitle={activityTitle}
                        selectedActivityId={selectedCatalogItem?.id}
                        catalogDescription={selectedCatalogItem?.description}
                        catalogObjectives={selectedCatalogItem?.objectives}
                        catalogComponent={selectedCatalogItem?.serviceComponent}
                        catalogBeneficiaries={selectedCatalogItem?.beneficiaries}
                        catalogExpectedResults={selectedCatalogItem?.expectedResults}
                        catalogDeliverables={selectedCatalogItem?.deliverables}
                        catalogIndicators={selectedCatalogItem?.indicators}
                        projectCode={expert?.projectCode}
                        month={month}
                        year={year}
                        expertName={expertName}
                        onUpdate={(patch) => updateDeliverable(d.id, patch)}
                        onRemove={() => removeDeliverable(d.id)}
                        deliverableOptions={deliverableOptions}
                      />
                    ))}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                  />
                </div>

                {/* Colaborare */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Colaborare
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="activityCommon"
                        checked={activityCommon}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setActivityCommon(isChecked);
                          if (!isChecked) {
                            setCollaborators([]);
                            setDeliverables((prev) => prev.map((deliverable) => ({ ...deliverable, common: false })));
                          }
                        }}
                      />
                      <label
                        htmlFor="activityCommon"
                        className="text-sm text-blue-800 cursor-pointer"
                      >
                        Activitate desfasurata in comun cu alti experti
                      </label>
                    </div>

                    {activityCommon && (
                      <div className="space-y-3">
                        {collaboratorSuggestions.length > 0 && (
                          <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-blue-700">Sugestii experti</Label>
                              {collaboratorSuggestions.some(({ expert: suggestedExpert }) => !collaborators.includes(suggestedExpert.id)) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={addAllSuggestedCollaborators}
                                  className="h-7 border-blue-300 px-2 text-[10px] text-blue-800 hover:bg-blue-100"
                                >
                                  Adauga toate
                                </Button>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {collaboratorSuggestions.map(({ expert: suggestedExpert, reason }) => {
                                const selected = collaborators.includes(suggestedExpert.id);
                                return (
                                  <button
                                    key={suggestedExpert.id}
                                    type="button"
                                    onClick={() => setCollaboratorChecked(suggestedExpert.id, !selected)}
                                    className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                                      selected
                                        ? 'border-blue-500 bg-blue-100 text-blue-900'
                                        : 'border-blue-200 bg-white text-blue-800 hover:bg-blue-50'
                                    }`}
                                    title={reason}
                                  >
                                    <span className="font-medium">{suggestedExpert.name}</span>
                                    <span className="ml-1 text-blue-600">({reason})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Label className="text-xs text-blue-700">Experti implicati in aceasta activitate</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {allExperts.filter(ex => ex.id !== expertId).map(ex => (
                            <label
                              key={ex.id}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs cursor-pointer border transition-colors ${
                                collaborators.includes(ex.id)
                                  ? 'bg-blue-100 border-blue-400 text-blue-800'
                                  : 'bg-white border-blue-200 text-blue-700'
                              }`}
                            >
                              <Checkbox
                                checked={collaborators.includes(ex.id)}
                                onCheckedChange={(checked) => setCollaboratorChecked(ex.id, checked === true)}
                                className="h-3 w-3"
                              />
                              {ex.name}
                            </label>
                          ))}
                        </div>
                        {allExperts.filter(ex => ex.id !== expertId).length === 0 && (
                          <div className="text-xs text-blue-600">
                            Nu exista alti experti disponibili pentru selectie.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Common deliverables */}
                    {mainDeliverables.length > 0 && activityCommon && (
                      <div>
                        <div className="text-xs font-medium text-blue-700 mb-2">
                          Marcheaza livrabilele comune
                        </div>
                        <div className="text-xs text-blue-600 mb-2">
                          Un singur expert il incarca, ceilalti confirma.
                        </div>
                        <div className="space-y-1">
                          {mainDeliverables.map(d => (
                            <label
                              key={d.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded text-xs cursor-pointer border ${
                                d.common ? 'bg-blue-100 border-blue-400' : 'bg-white/60 border-blue-200'
                              }`}
                            >
                              <Checkbox
                                checked={!!d.common}
                                onCheckedChange={(checked) => updateDeliverable(d.id, { common: checked as boolean })}
                                className="h-3 w-3"
                              />
                              <span className="flex-1 truncate">
                                {d.declaredTitle || d.name || d.filename || 'Livrabil fara titlu'}
                              </span>
                              {d.common && (
                                <Badge variant="secondary" className="text-[10px]">comun</Badge>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Raport preliminar (optional) */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-purple-800 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Raport preliminar / descriptiv
                        <Badge variant="outline" className="text-[10px] text-purple-600">optional</Badge>
                      </div>
                      <div className="text-xs text-purple-600">
                        Context detaliat al activitatii (ex: raport de aliniere, nota interna)
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addDeliverableSlot('raport_preliminar')}
                      className="border-purple-300 text-purple-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adauga raport
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {prelimDeliverables.map((d) => (
                      <DeliverableItem
                        key={d.id}
                        deliverable={d}
                        subActivity={saCode}
                        activityTitle={activityTitle}
                        selectedActivityId={selectedCatalogItem?.id}
                        catalogDescription={selectedCatalogItem?.description}
                        catalogObjectives={selectedCatalogItem?.objectives}
                        catalogComponent={selectedCatalogItem?.serviceComponent}
                        catalogBeneficiaries={selectedCatalogItem?.beneficiaries}
                        catalogExpectedResults={selectedCatalogItem?.expectedResults}
                        catalogDeliverables={selectedCatalogItem?.deliverables}
                        catalogIndicators={selectedCatalogItem?.indicators}
                        projectCode={expert?.projectCode}
                        month={month}
                        year={year}
                        expertName={expertName}
                        onUpdate={(patch) => updateDeliverable(d.id, patch)}
                        onRemove={() => removeDeliverable(d.id)}
                        required={false}
                      />
                    ))}
                  </div>
                </div>

                {/* Alte documente justificative (optional) */}
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-amber-800 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Alte documente justificative
                        <Badge variant="outline" className="text-[10px] text-amber-600">optional</Badge>
                      </div>
                      <div className="text-xs text-amber-600">
                        Agende, invitatii, corespondenta, documente suport suplimentare
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addDeliverableSlot('justificativ')}
                      className="border-amber-300 text-amber-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adauga
                    </Button>
                  </div>
                  {justifDeliverables.length > 0 && (
                    <div className="space-y-3">
                      {justifDeliverables.map((d) => (
                        <DeliverableItem
                          key={d.id}
                          deliverable={d}
                          subActivity={saCode}
                          activityTitle={activityTitle}
                          onUpdate={(patch) => updateDeliverable(d.id, patch)}
                          onRemove={() => removeDeliverable(d.id)}
                          required={false}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Event Documents Panel */}
                {isEvent && (
                  <EventDocsPanel
                    deliverables={deliverables}
                    subActivity={saCode}
                    activityTitle={activityTitle}
                    date={selectedDates[0] || ''}
                    description={description}
                    allExperts={allExperts}
                    currentExpertId={expertId}
                    onUpdateDeliverable={updateDeliverable}
                    onUpsertSlot={upsertEventSlot}
                  />
                )}
              </div>
            )}

            {/* Grup Tinta Section (only for Expert Recrutare si Selectie GT) */}
            {isGtExpert && saCode === 'SA1.1' && (
              <div className="space-y-3 bg-teal-50 rounded-lg p-4 border border-teal-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-teal-800">Grup Tinta</div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={addGrupTintaEntry}
                    className="border-teal-300 text-teal-700"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adauga intrare GT
                  </Button>
                </div>

                {grupTinta.length > 0 && (
                  <div className="space-y-3">
                    {grupTinta.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 p-2 bg-white rounded-md border border-teal-200">
                        <Input
                          placeholder="Organizatii"
                          value={entry.organizations?.join(', ') || ''}
                          onChange={(e) => updateGrupTintaEntry(entry.id, 'organizations', e.target.value.split(',').map(s => s.trim()))}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Nr. participanti"
                          type="number"
                          value={entry.participantsCount || ''}
                          onChange={(e) => updateGrupTintaEntry(entry.id, 'participantsCount', parseInt(e.target.value) || 0)}
                          className="w-28"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGrupTintaEntry(entry.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Validation warnings */}
        {!isLeave && !isException && mainDeliverables.length === 0 && !hasEventMomAsMainDeliverable && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-800">
              Activitatea necesita cel putin un livrabil principal.
            </span>
          </div>
        )}

        {validationError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {isSaveDisabled && !isSaving && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Activitatea nu poate fi salvata inca:</div>
              <ul className="mt-1 list-disc pl-4">
                {saveBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Anuleaza
          </Button>
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={isSaveDisabled}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Se salveaza...
              </>
            ) : initialActivity ? 'Salveaza modificarile' : 'Adauga activitate'}
          </Button>
        </div>
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
