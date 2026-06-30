'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldLabel } from '@/components/ui/field';
import { generateId, formatDateRo } from '@/lib/app-utils';
import { EventDocsPanel } from './event-docs-panel';
import { DeliverableEligibilityControl, DeliverableItem, type DeliverableDuplicateInfo } from './deliverable-item';
import {
  ExistingDeliverablePicker,
  type ExistingDeliverableCandidate,
} from './existing-deliverable-picker';
import { createDeliverableSlot, type DeliverableSlot } from '@/lib/deliverable-types';
import { 
  ACTS, 
  isEventActivity, 
  isExceptionActivity,
  getActivityOptions,
  getDeliverableOptions 
} from '@/lib/peo-constants';
import { useActivityCatalog } from '@/hooks/use-backend-data';
import type { Activity, Deliverable, DocumentMetadata, GrupTintaEntry, Expert, ActivityCatalog } from '@/lib/types';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { mergeActivityCatalogs } from '@/lib/activity-catalog-merge';
import { buildDocumentS3Key, findDuplicateCandidates, getDocumentAuditTitle, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import { shouldAttachUploadedDeliverablesToDate } from '@/lib/activity-deliverables';
import { createActivityPeriodGroupId } from '@/lib/submit-readiness';
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
  getGdprDeliverableRequirementLabel,
  getGdprMinimumEvidenceLabels,
  getGdprOptionLabel,
  getGdprOptionValue,
  serializeGdprMeta,
  validateGdprActivityDraft,
  type GdprFieldDefinition,
} from '@/lib/gdpr-reporting';
import {
  type ActivityAutofillSuggestion,
} from '@/lib/activity-autofill';
import { isDeliverableEligibilityCheckEnabledClient } from '@/lib/feature-flags';
import {
  useActivityObservationRailItems,
  type ActivityResolutionHint,
  type ObservationGroup,
  type ObservationRailItem,
  type ObservationTone,
} from './use-activity-observation-rail';
import { useActivityAutofill } from '@/hooks/use-activity-autofill';
import { useGdprActivity } from '@/hooks/use-gdpr-activity';

export type { ActivityResolutionHint, ActivityResolutionSection } from './use-activity-observation-rail';

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
  documents?: DocumentMetadata[];
  month: number;
  year: number;
  onSave: (activities: Activity[]) => void | Promise<void>;
  onCancel: () => void;
  initialActivity?: Activity;
  prefillActivity?: Partial<Activity>;
  resolutionHint?: ActivityResolutionHint;
  isSaving?: boolean;
  layout?: 'card' | 'workspace';
}

const OBSERVATION_GROUP_LABELS: Record<ObservationGroup, string> = {
  form: 'Formular',
  deliverables: 'Livrabile',
  ai: 'AI',
};

function getObservationToneClass(tone: ObservationTone) {
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function getObservationBadgeClass(tone: ObservationTone) {
  if (tone === 'danger') return 'bg-red-600';
  if (tone === 'warning') return 'bg-amber-500';
  if (tone === 'success') return 'bg-emerald-600';
  return 'bg-blue-600';
}

function getAutofillConfidenceLabel(confidence: ActivityAutofillSuggestion['confidence']) {
  if (confidence === 'high') return 'incredere ridicata';
  if (confidence === 'medium') return 'incredere medie';
  return 'incredere scazuta';
}

function getAutofillRagLabel(suggestion: ActivityAutofillSuggestion) {
  if (!suggestion.rag) return 'RAG: necunoscut';
  if (!suggestion.rag.enabled) return 'RAG: inactiv';
  if (suggestion.rag.used) return `RAG: ${suggestion.rag.chunks} fragmente`;
  if (suggestion.rag.skippedReason === 'retrieval_failed') return 'RAG: indisponibil';
  return 'RAG: fara potriviri';
}

function formatAutofillRagSource(source: NonNullable<ActivityAutofillSuggestion['rag']>['sources'][number]) {
  return [
    source.sourceType,
    source.expertName,
    source.saCode,
    source.activityName,
    source.month && source.year ? `${source.month}/${source.year}` : undefined,
  ].filter(Boolean).join(' - ');
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
  documents = [],
  month,
  year,
  onSave,
  onCancel,
  initialActivity,
  prefillActivity,
  resolutionHint,
  isSaving = false,
  layout = 'card',
}: ActivityFormProps) {
  const isWorkspaceLayout = layout === 'workspace';
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
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
  const isEditingActivity = Boolean(initialActivity);
  
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
      if (isEditingActivity && initialActivity) {
        const savedHours = normalizePontajHoursValue(initialActivity.hours, defaultHours);
        const baseHours = Object.fromEntries(
          selectedDates.map((date) => [date, prev[date] || savedHours]),
        );
        return buildSelectedHoursForDates(selectedDates, baseHours, savedHours);
      }

      const baseHours = { ...prev, ...selectedHours };
      return buildSelectedHoursForDates(selectedDates, baseHours, defaultHours);
    });
  }, [selectedDates, defaultHours, selectedHours, isEditingActivity, initialActivity?.hours]);

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
  const [existingDeliverablePickerOpen, setExistingDeliverablePickerOpen] = useState(false);

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

  const gdprActivity = useGdprActivity({
    activitySeed,
    reportMonthLabel: reportMonthName,
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
  });
  const {
    gdprTemplateCode,
    gdprMeta,
    gdprGeneratedText,
    gdprConclusionCode,
    isGeneratingGdprDocx,
    isImprovingGdprText,
    isBusinessHubGdpr,
  } = gdprActivity.state;
  const selectedGdprTemplate = gdprActivity.selectedTemplate;
  const gdprFieldDefinitions = gdprActivity.fieldDefinitions;
  const updateGdprMeta = gdprActivity.updateMeta;
  const handleGdprTemplateChange = gdprActivity.changeTemplate;
  const handleGdprConclusionChange = gdprActivity.changeConclusion;
  const generateGdprDescription = gdprActivity.generateDescription;
  const improveGdprDescriptionWithAI = gdprActivity.improveDescription;
  const generateGdprDeliverable = gdprActivity.generateDeliverable;
  
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
  const resolutionTargetId = resolutionHint?.deliverableId
    ? `activity-form-deliverable-${resolutionHint.deliverableId}`
    : resolutionHint?.section === 'deliverables'
      ? 'activity-form-deliverables-section'
      : resolutionHint?.section === 'gdpr'
        ? 'activity-form-gdpr-section'
        : 'activity-form-details-section';

  useEffect(() => {
    if (!resolutionHint) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(resolutionTargetId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [resolutionHint, resolutionTargetId]);

  const duplicateInfoByDeliverableId = useMemo(() => {
    const referenceMonthKey = (selectedDates[0] || `${year}-${String(month + 1).padStart(2, '0')}-01`).slice(0, 7);
    const matches = new Map<string, DeliverableDuplicateInfo>();

    deliverables.forEach((deliverable) => {
      if (!deliverable.uploaded || deliverable.isPhoto) return;
      const documentId = deliverable.documentId || `doc_${deliverable.id}`;
      const duplicateMatches = findDuplicateCandidates(documents, {
        id: documentId,
        fileHash: deliverable.fileHash,
        firstPageTextHash: deliverable.firstPageTextHash,
        extractedTitleNormalized: normalizeDocumentTextForFingerprint(getDocumentAuditTitle({
          ...deliverable,
          fileName: deliverable.filename || deliverable.name,
          originalFileName: deliverable.filename || deliverable.name,
        })),
        contentFingerprint: deliverable.contentFingerprint,
        fileSize: deliverable.fileSize || 0,
        mimeType: deliverable.fileType || 'application/octet-stream',
      });
      const duplicate = duplicateMatches[0];
      if (!duplicate) return;

      const candidateDate = duplicate.document.activityDate || duplicate.document.uploadDate;
      const candidateMonthKey = candidateDate?.slice(0, 7);
      matches.set(deliverable.id, {
        documentId: duplicate.document.id,
        title: getDocumentAuditTitle(duplicate.document),
        uploadedByExpertName: duplicate.document.uploadedByExpertName,
        activityDate: duplicate.document.activityDate || duplicate.document.uploadDate,
        status: duplicate.issues.includes('same_file_hash')
          ? 'same_file_hash'
          : duplicate.issues.includes('same_first_page_hash')
            ? 'same_first_page_hash'
            : 'possible_common_unmarked',
        issues: duplicate.issues,
        isPreviousPeriod: Boolean(candidateMonthKey && candidateMonthKey < referenceMonthKey),
        isOtherExpert: Boolean(duplicate.document.uploadedByExpertId && duplicate.document.uploadedByExpertId !== expertId),
      });
    });

    return matches;
  }, [deliverables, documents, expertId, month, selectedDates, year]);

  useEffect(() => {
    if (duplicateInfoByDeliverableId.size === 0) return;
    setDeliverables((prev) => {
      let changed = false;
      const next = prev.map((deliverable) => {
        const duplicateInfo = duplicateInfoByDeliverableId.get(deliverable.id);
        if (!duplicateInfo) return deliverable;
        if (
          deliverable.possibleDuplicateOfDocumentId === duplicateInfo.documentId
          && deliverable.duplicateStatus === duplicateInfo.status
        ) {
          return deliverable;
        }
        changed = true;
        return {
          ...deliverable,
          possibleDuplicateOfDocumentId: duplicateInfo.documentId,
          duplicateStatus: duplicateInfo.status,
        };
      });
      return changed ? next : prev;
    });
  }, [duplicateInfoByDeliverableId]);
  
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
  const {
    error: activityAutofillError,
    suggestion: activityAutofillSuggestion,
    apply: applyActivityAutofillSuggestion,
    isLoading: isAutofillingActivity,
    suggest: handleSuggestActivityFromDeliverables,
    dismiss: dismissActivityAutofillSuggestion,
  } = useActivityAutofill({
    catalog: filteredCatalog,
    deliverables,
    expert,
    expertId,
    expertName,
    month,
    selectedDates,
    setActivityTitle,
    setDescription,
    setDeliverables,
    setSaCode,
    year,
    onApplied: () => {
      lastAutoDescriptionRef.current = '__activity_autofill_applied__';
      setTitleVerificationResult(null);
    },
  });

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

  const effectiveActivityTitle = isGdprExpert && selectedGdprTemplate ? selectedGdprTemplate.activityTitle : activityTitle;
  const effectiveSaCode = isGdprExpert && selectedGdprTemplate ? selectedGdprTemplate.saCode : saCode;
  
  // Check if current activity is exception (no deliverable required)
  const isException = isExceptionActivity(effectiveActivityTitle);
  
  // Check if current activity is event
  const isEvent = isEventActivity(effectiveActivityTitle);

  const [activityFormTab, setActivityFormTab] = useState<'standard' | 'event'>('standard');

  useEffect(() => {
    if (isEvent) {
      setActivityFormTab('event');
    } else if (effectiveActivityTitle.trim()) {
      setActivityFormTab('standard');
    }
  }, [effectiveActivityTitle, isEvent]);
  
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

  const handleBusinessHubPvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await generateGdprDeliverable(file);
    } finally {
      if (businessHubPvInputRef.current) {
        businessHubPvInputRef.current.value = '';
      }
    }
  };

  const addDeliverableSlot = (type: 'livrabil' | 'raport_preliminar' | 'justificativ') => {
    const newSlot = createDeliverableSlot(type, '');
    setDeliverables(prev => [...prev, newSlot]);
  };

  const addEventProofSlot = () => {
    const newSlot = createDeliverableSlot('event_proof', 'Fotografii eveniment');
    setDeliverables(prev => [...prev, newSlot]);
  };

  const updateDeliverable = (id: string, patch: Partial<DeliverableSlot>) => {
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const removeDeliverable = (id: string) => {
    setDeliverables(prev => prev.filter((d) => d.id !== id));
  };
  
  const upsertEventSlot = (slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => {
    const existing = slotType === 'event_proof' && patch.isCommonDeliverable !== undefined
      ? deliverables.find(d => d.slotType === slotType && d.isCommonDeliverable)
        || deliverables.find(d => d.slotType === slotType && !d.uploaded)
      : deliverables.find(d => d.slotType === slotType);
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
      activityDate: initialActivity?.date || selectedDates[0],
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

    const activityDatesForSave = initialActivity ? [initialActivity.date] : selectedDates;
    const newActivityDrafts: ActivityDraftForValidation[] = activityDatesForSave.map((date) => ({
      id: initialActivity?.id,
      expertId,
      date,
      hours: isLeave ? 0 : Number(normalizePontajHoursValue(hoursPerDay[date] || initialActivity?.hours, defaultHours)),
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

    const activityPeriodGroupId = !initialActivity && activityDatesForSave.length > 1
      ? createActivityPeriodGroupId(generateId())
      : initialActivity?.workingGroupId;

    const activities: Activity[] = activityDatesForSave.map((date) => {
      // Get hours for this specific date, fallback to default
      const dateHours = isLeave ? 0 : Number(normalizePontajHoursValue(hoursPerDay[date] || initialActivity?.hours, defaultHours));
      const shouldAttachDeliverables = shouldAttachUploadedDeliverablesToDate(activityDatesForSave, date);
      
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
        workingGroupId: activityPeriodGroupId,
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

  // Filter deliverables by type
  const mainDeliverables = deliverables.filter(d => !d.slotType || d.slotType === 'livrabil');
  const mainDeliverableForEligibility = mainDeliverables.find((d) => d.uploaded && !d.isPhoto);
  const prelimDeliverables = deliverables.filter(d => d.slotType === 'raport_preliminar');
  const justifDeliverables = deliverables.filter(d => d.slotType === 'justificativ');
  const descriptionTrimmed = (description || '').trim();
  const descriptionReadyForEligibility = activityCommon
    ? descriptionTrimmed.length >= 30
    : descriptionTrimmed.length >= 15;
  const eligibilityBlockedReason = !effectiveSaCode
    ? 'Selecteaza subactivitatea inainte de verificarea eligibilitatii.'
    : !effectiveActivityTitle
      ? 'Selecteaza activitatea inainte de verificarea eligibilitatii.'
      : !descriptionReadyForEligibility
        ? activityCommon
          ? 'Completeaza descrierea contributiei individuale, minimum 30 de caractere.'
          : 'Completeaza descrierea activitatii, minimum 15 caractere.'
        : undefined;
  const canCheckDeliverableEligibility = !eligibilityBlockedReason;
  const scrollToDeliverables = () => {
    window.setTimeout(() => {
      document.getElementById('activity-form-deliverables-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  };
  const startDeliverableFlow = () => {
    if (mainDeliverables.length === 0) {
      addDeliverableSlot('livrabil');
    }
    scrollToDeliverables();
  };
  const openExistingDeliverableFlow = () => {
    setExistingDeliverablePickerOpen(true);
    scrollToDeliverables();
  };
  const hasEventMomAsMainDeliverable = isEvent && deliverables.some((deliverable) => (
    deliverable.slotType === 'event_mom'
    && deliverable.uploaded
    && !deliverable.isPendingConfirm
    && Boolean(deliverable.filename || deliverable.name || deliverable.declaredTitle)
  ));
  const observationRailItems = useActivityObservationRailItems({
    activityAutofillError,
    activityAutofillUnavailableMessage: null,
    deliverables,
    duplicateInfoByDeliverableId,
    eligibilityBlockedReason,
    eligibilityCheckEnabled,
    hasEventMomAsMainDeliverable,
    isException,
    isLeave,
    isSaveDisabled,
    isSaving,
    isWorkspaceLayout,
    mainDeliverablesCount: mainDeliverables.length,
    resolutionHint,
    saveBlockers,
    validationError,
  });
  const attachExistingDeliverable = (candidate: ExistingDeliverableCandidate) => {
    const aiCheck = candidate.aiStatus
      ? {
          eligible: candidate.aiStatus === 'eligible'
            ? true
            : candidate.aiStatus === 'ineligible'
              ? false
              : null,
          reason: candidate.aiReason || '',
          issues: [],
        }
      : null;
    const slot: DeliverableSlot = {
      ...createDeliverableSlot('livrabil', candidate.fileName),
      id: generateId(),
      name: candidate.fileName,
      filename: candidate.fileName,
      rawFilename: candidate.fileName.replace(/\.[^.]+$/, ''),
      fileType: candidate.fileType,
      fileSize: candidate.fileSize,
      filePath: candidate.s3Key,
      documentId: candidate.documentId,
      s3Bucket: candidate.s3Bucket,
      s3Key: candidate.s3Key,
      fileHash: candidate.fileHash,
      firstPageTextHash: candidate.firstPageTextHash,
      contentFingerprint: candidate.contentFingerprint,
      uploadedByExpertId: candidate.uploadedByExpertId,
      uploadedByExpertName: candidate.uploadedByExpertName,
      sourceActivityId: candidate.sourceActivityId,
      activityDate: candidate.activityDate,
      saCode: candidate.saCode,
      deliverableType: candidate.deliverableType || 'livrabil',
      isCommonDeliverable: candidate.source === 'shared' || candidate.isCommonDeliverable === true,
      sharedWithExpertIds: [],
      uploadedAt: candidate.uploadDate,
      uploaded: true,
      isPhoto: candidate.fileType.startsWith('image/'),
      declaredTitle: candidate.declaredTitle || candidate.title,
      docTitle: candidate.docTitle || candidate.title,
      docText: candidate.docText || null,
      suggestedTitle: candidate.suggestedTitle,
      firstPageText: candidate.firstPageText || null,
      titleSuggestionConfidence: candidate.titleSuggestionConfidence as DeliverableSlot['titleSuggestionConfidence'],
      titleSuggestionAlternatives: candidate.titleSuggestionAlternatives || [],
      titleSuggestionReason: candidate.titleSuggestionReason,
      titleSource: candidate.titleSource as DeliverableSlot['titleSource'],
      titleMatch: candidate.titleMatch ?? null,
      titleConfirmed: candidate.titleConfirmed ?? candidate.titleCheckStatus === 'matched',
      titleCheckStatus: candidate.titleCheckStatus as DeliverableSlot['titleCheckStatus'],
      titleCheckMessage: candidate.titleCheckMessage || 'Livrabil selectat din documentele existente.',
      aiCheck,
      eligibilityCheck: candidate.eligibilityCheck,
      common: false,
      isPendingConfirm: false,
    };

    setDeliverables((prev) => [...prev, slot]);
    setExistingDeliverablePickerOpen(false);
  };

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

  const formPanel = (
    <Card id={isWorkspaceLayout ? undefined : 'activity-form-panel'} className={isWorkspaceLayout ? 'scroll-mt-24 overflow-hidden border-slate-200 shadow-sm' : 'scroll-mt-24'}>
      {isWorkspaceLayout ? (
        <div className="flex flex-col gap-3 border-b bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {initialActivity ? 'Editare activitate' : 'Activitate noua'}
            </p>
            <h2 className="truncate text-base font-semibold text-foreground">
              {initialActivity ? 'Actualizeaza raportarea' : 'Completeaza activitatea selectata'}
            </h2>
            {selectedDates.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedDates.length === 1
                  ? `Data: ${formatDateRo(selectedDates[0])}`
                  : `${selectedDates.length} zile selectate`}
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" />
            Inchide
          </Button>
        </div>
      ) : (
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
      )}
      <CardContent className={isWorkspaceLayout ? 'space-y-5 bg-slate-50/60 p-4 sm:p-5' : 'space-y-6'}>
        {!isWorkspaceLayout && resolutionHint && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">Rezolvi blocajul: {resolutionHint.title}</p>
              {resolutionHint.meta && (
                <p className="text-xs font-medium text-amber-800">{resolutionHint.meta}</p>
              )}
              <p className="text-xs text-amber-800">{resolutionHint.detail}</p>
            </div>
          </div>
        )}

        {isWorkspaceLayout && (
          <Tabs
            value={activityFormTab}
            onValueChange={(value) => setActivityFormTab(value as 'standard' | 'event')}
            className="rounded-lg border bg-white p-3 shadow-sm"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-lg">
              <TabsTrigger value="standard">Activitate standard</TabsTrigger>
              <TabsTrigger value="event">Eveniment</TabsTrigger>
            </TabsList>
            <TabsContent value="standard" className="pt-3">
              <p className="text-xs text-muted-foreground">
                Alege acest flux pentru activitati obisnuite, apoi foloseste livrabilul si AI pentru completare.
              </p>
            </TabsContent>
            <TabsContent value="event" className="space-y-3 pt-3">
              {!isEvent ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Selecteaza o activitate de tip eveniment ca sa completezi durata, explicatiile si documentele specifice.
                </div>
              ) : (
                <Field>
                  <FieldLabel>Durata evenimentului (ore) - optional</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <Input
                      type="number"
                      min="0.5"
                      max="8"
                      step="0.5"
                      value={eventDuration}
                      onChange={(e) => setEventDuration(e.target.value)}
                      placeholder="ex: 2"
                      className="w-28"
                    />
                    {eventDur > 0 && totalHours > eventDur && (
                      <span className="text-xs text-amber-700">
                        Ai pontat {totalHours}h dar evenimentul a durat {eventDur}h - explica orele suplimentare.
                      </span>
                    )}
                    {eventDur > 0 && totalHours <= eventDur && (
                      <span className="flex items-center gap-1 text-xs text-green-700">
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
            </TabsContent>
          </Tabs>
        )}

        {isWorkspaceLayout && !isLeave && !isException && (
          <div className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  Porneste de la livrabil
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Incarca sau ataseaza un livrabil existent, apoi foloseste AI pentru subactivitate, activitate si descriere. Completarea manuala ramane disponibila mai jos.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={openExistingDeliverableFlow}>
                  <FileText className="h-4 w-4 mr-1" />
                  Alege existent
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={startDeliverableFlow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adauga livrabil
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSuggestActivityFromDeliverables}
                  disabled={isAutofillingActivity}
                >
                  {isAutofillingActivity ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  Autocompletare cu AI
                </Button>
              </div>
            </div>
            {!isWorkspaceLayout && activityAutofillError && (
              <p className="mt-3 text-xs text-amber-700">{activityAutofillError}</p>
            )}
          </div>
        )}

        {/* Day Type and Hours */}
        <div id="activity-form-details-section" className="grid scroll-mt-24 grid-cols-2 gap-4">
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
              <div id="activity-form-gdpr-section" className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 scroll-mt-24">
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
                        onClick={() => generateGdprDeliverable()}
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

            {/* Main Deliverables */}
            {!isException && (
              <div className="space-y-4">
                {/* Livrabile principale */}
                <div id="activity-form-deliverables-section" className="bg-slate-50 rounded-lg p-4 border scroll-mt-24">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Livrabile principale
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Outputurile directe ale activitatii - obligatorii
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setExistingDeliverablePickerOpen((open) => !open)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Alege existent
                      </Button>
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
                  </div>

                  <ExistingDeliverablePicker
                    activities={allActivities}
                    attachedDeliverables={deliverables}
                    currentExpertId={expertId}
                    documents={documents}
                    excludedActivityId={initialActivity?.id}
                    month={month}
                    onAttach={attachExistingDeliverable}
                    onOpenChange={setExistingDeliverablePickerOpen}
                    open={existingDeliverablePickerOpen}
                    year={year}
                  />

                  {mainDeliverables.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-md">
                      Niciun livrabil. Apasa + pentru a adauga outputul activitatii.
                    </div>
                  )}

                  <div className="space-y-3">
                    {mainDeliverables.map((d) => {
                      const isResolutionDeliverable = resolutionHint?.deliverableId === d.id;
                      return (
                        <div
                          key={d.id}
                          id={`activity-form-deliverable-${d.id}`}
                          className={isResolutionDeliverable ? 'scroll-mt-24 rounded-lg ring-2 ring-amber-400 ring-offset-2' : 'scroll-mt-24'}
                        >
                          <DeliverableItem
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
                            duplicateInfo={duplicateInfoByDeliverableId.get(d.id)}
                            canCheckEligibility={canCheckDeliverableEligibility}
                            eligibilityBlockedReason={eligibilityBlockedReason}
                            notesMode={isWorkspaceLayout ? 'external' : 'inline'}
                            showEligibilityControl={false}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Autocompletare activitate</div>
                        <div className="text-xs text-slate-600">
                          Sugereaza subactivitatea, activitatea si descrierea pe baza tuturor livrabilelor citite.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSuggestActivityFromDeliverables}
                        disabled={isAutofillingActivity}
                      >
                        {isAutofillingActivity ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Autocompletare
                      </Button>
                    </div>

                    {!isWorkspaceLayout && activityAutofillError && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        {activityAutofillError}
                      </div>
                    )}

                    {activityAutofillSuggestion && (
                      <div className="mt-3 space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">Sugestie pregatita pentru revizuire</div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-800">
                              {getAutofillConfidenceLabel(activityAutofillSuggestion.confidence)}
                            </Badge>
                            <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-800">
                              {getAutofillRagLabel(activityAutofillSuggestion)}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-xs font-medium text-emerald-800">Subactivitate</div>
                            <div>{activityAutofillSuggestion.recommended.saCode}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-emerald-800">Activitate</div>
                            <div>{activityAutofillSuggestion.recommended.activityName}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-emerald-800">Descriere propusa</div>
                          <div className="mt-1 whitespace-pre-wrap rounded border border-emerald-200 bg-white p-2 text-xs text-slate-800">
                            {activityAutofillSuggestion.recommended.description}
                          </div>
                        </div>
                        {(activityAutofillSuggestion.evidence.length > 0 || activityAutofillSuggestion.warnings.length > 0) && (
                          <div className="grid gap-2 md:grid-cols-2">
                            {activityAutofillSuggestion.evidence.length > 0 && (
                              <div className="rounded border border-emerald-200 bg-white p-2 text-xs text-slate-800">
                                <div className="font-medium text-emerald-800">Dovezi folosite</div>
                                <ul className="mt-1 list-disc space-y-1 pl-4">
                                  {activityAutofillSuggestion.evidence.slice(0, 4).map((item, index) => (
                                    <li key={`activity-autofill-evidence-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {activityAutofillSuggestion.warnings.length > 0 && (
                              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                <div className="font-medium">Atentionari</div>
                                <ul className="mt-1 list-disc space-y-1 pl-4">
                                  {activityAutofillSuggestion.warnings.slice(0, 4).map((item, index) => (
                                    <li key={`activity-autofill-warning-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        {activityAutofillSuggestion.rag && (
                          <div className="rounded border border-emerald-200 bg-white p-2 text-xs text-slate-800">
                            <div className="font-medium text-emerald-800">Context RAG</div>
                            {activityAutofillSuggestion.rag.warnings.length > 0 && (
                              <div className="mt-1 text-amber-700">
                                {activityAutofillSuggestion.rag.warnings.join(' ')}
                              </div>
                            )}
                            {activityAutofillSuggestion.rag.sources.length > 0 ? (
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {activityAutofillSuggestion.rag.sources.map((source) => (
                                  <li key={`activity-autofill-rag-source-${source.rank}`}>
                                    #{source.rank} ({Math.round(source.score * 100)}%) {formatAutofillRagSource(source)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-1 text-slate-600">Nu au fost returnate fragmente RAG pentru aceasta sugestie.</div>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={dismissActivityAutofillSuggestion}>
                            Renunta
                          </Button>
                          <Button type="button" size="sm" onClick={applyActivityAutofillSuggestion}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Aplica sugestia
                          </Button>
                        </div>
                      </div>
                    )}
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

            {mainDeliverableForEligibility && !isLeave && !isException && (
              <div className="rounded-lg border border-indigo-100 bg-white p-3 shadow-sm">
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      Eligibilitate livrabil principal
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {mainDeliverableForEligibility.declaredTitle
                        || mainDeliverableForEligibility.docTitle
                        || mainDeliverableForEligibility.filename
                        || mainDeliverableForEligibility.name}
                    </div>
                  </div>
                </div>
                <DeliverableEligibilityControl
                  deliverable={mainDeliverableForEligibility}
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
                  onUpdate={(patch) => updateDeliverable(mainDeliverableForEligibility.id, patch)}
                  canCheckEligibility={canCheckDeliverableEligibility}
                  eligibilityBlockedReason={eligibilityBlockedReason}
                />
              </div>
            )}

            {/* Event duration (for event activities) */}
            {isEvent && !isWorkspaceLayout && (
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

            {/* Supporting deliverable settings */}
            {!isException && (
              <div className="space-y-4">
                {/* Colaborare */}
                <details open={activityCommon} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <summary className="text-sm font-medium text-blue-800 flex cursor-pointer list-none items-center gap-2">
                    <Users className="h-4 w-4" />
                    Colaborare
                  </summary>
                  
                  <div className="mt-3 space-y-3">
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
                                {getDocumentAuditTitle({
                                  ...d,
                                  fileName: d.filename || d.name,
                                  originalFileName: d.filename || d.name,
                                })}
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
                </details>

                {/* Raport preliminar (optional) */}
                <details open={prelimDeliverables.length > 0} className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <summary className="cursor-pointer list-none text-sm font-medium text-purple-800">
                    Raport preliminar / descriptiv
                    <Badge variant="outline" className="ml-2 text-[10px] text-purple-600">optional</Badge>
                  </summary>
                  <div className="mt-3 flex items-center justify-between mb-3">
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
                        duplicateInfo={duplicateInfoByDeliverableId.get(d.id)}
                        canCheckEligibility={canCheckDeliverableEligibility}
                        eligibilityBlockedReason={eligibilityBlockedReason}
                        notesMode={isWorkspaceLayout ? 'external' : 'inline'}
                      />
                    ))}
                  </div>
                </details>

                {/* Alte documente justificative (optional) */}
                <details open={justifDeliverables.length > 0} className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <summary className="cursor-pointer list-none text-sm font-medium text-amber-800">
                    Alte documente justificative
                    <Badge variant="outline" className="ml-2 text-[10px] text-amber-600">optional</Badge>
                  </summary>
                  <div className="mt-3 flex items-center justify-between mb-3">
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
                          duplicateInfo={duplicateInfoByDeliverableId.get(d.id)}
                          canCheckEligibility={canCheckDeliverableEligibility}
                          eligibilityBlockedReason={eligibilityBlockedReason}
                          notesMode={isWorkspaceLayout ? 'external' : 'inline'}
                        />
                      ))}
                    </div>
                  )}
                </details>

                {/* Event Documents Panel */}
                {isEvent && (
                  <details open className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-green-800">
                      Eveniment
                    </summary>
                    <div className="mt-3">
                      <EventDocsPanel
                        deliverables={deliverables}
                        subActivity={saCode}
                        activityTitle={activityTitle}
                        date={selectedDates[0] || ''}
                        description={description}
                        expertName={expertName}
                        allExperts={allExperts}
                        currentExpertId={expertId}
                        onUpdateDeliverable={updateDeliverable}
                        onAddEventProof={addEventProofSlot}
                        onRemoveDeliverable={removeDeliverable}
                        onUpsertSlot={upsertEventSlot}
                        canCheckEligibility={canCheckDeliverableEligibility}
                        eligibilityBlockedReason={eligibilityBlockedReason}
                        deliverableNotesMode={isWorkspaceLayout ? 'external' : 'inline'}
                      />
                    </div>
                  </details>
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
        {!isWorkspaceLayout && !isLeave && !isException && mainDeliverables.length === 0 && !hasEventMomAsMainDeliverable && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-800">
              Activitatea necesita cel putin un livrabil principal.
            </span>
          </div>
        )}

        {!isWorkspaceLayout && validationError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {!isWorkspaceLayout && isSaveDisabled && !isSaving && (
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

  if (!isWorkspaceLayout) {
    return formPanel;
  }

  return (
    <div
      id="activity-form-panel"
      className="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start"
    >
      <div className="min-w-0">
        {formPanel}
      </div>
      <ActivityObservationRail items={observationRailItems} />
    </div>
  );
}

function ActivityObservationRail({ items }: { items: ObservationRailItem[] }) {
  const groups: ObservationGroup[] = ['form', 'deliverables', 'ai'];

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-950">Observatii si atentionari</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Raman vizibile cat timp completezi formularul.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Nu exista atentionari active.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;

            return (
              <section key={group} className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {OBSERVATION_GROUP_LABELS[group]}
                </div>
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-md border p-2 text-xs ${getObservationToneClass(item.tone)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${getObservationBadgeClass(item.tone)}`} />
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold leading-5">{item.title}</div>
                        {item.detail && (
                          <p className="whitespace-pre-wrap leading-5">{item.detail}</p>
                        )}
                        {item.meta && item.meta.length > 0 && (
                          <ul className="space-y-0.5 text-[11px] opacity-90">
                            {item.meta.map((meta, index) => (
                              <li key={`${item.id}-${index}`} className="break-words">
                                {meta}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}
