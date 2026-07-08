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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { generateId, formatDateRo } from '@/lib/app-utils';
import { EventDocsPanel } from './event-docs-panel';
import { DeliverableEligibilityControl, DeliverableItem, type DeliverableDuplicateInfo } from './deliverable-item';
import {
  ExistingDeliverablePicker,
  type ExistingDeliverableCandidate,
} from './existing-deliverable-picker';
import { createDeliverableSlot, type DeliverableSlot } from '@/lib/deliverable-types';
import { 
  isEventActivity, 
  isExceptionActivity,
  getDeliverableOptions 
} from '@/lib/peo-constants';
import { useActivityCatalog, useBusinessHubEntityDirectory } from '@/hooks/use-backend-data';
import type { Activity, Deliverable, DocumentMetadata, GrupTintaEntry, Expert, ActivityCatalog } from '@/lib/types';
import fallbackActivityCatalog from '@/data/import/activity-catalog.json';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { normalizeActivityCatalogSaCode, resolveExpertActivityCatalog } from '@/lib/activity-catalog-merge';
import { buildDocumentS3Key, findDuplicateCandidates, getDocumentAuditTitle, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import {
  findMonthlyDeliverableDuplicate,
  getDeliverableDocumentSignature,
} from '@/lib/deliverable-deduplication';
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
  buildExistingDeliverableSourceContext,
  type ExistingDeliverableSourceAction,
  type ExistingDeliverableSourceContext,
} from '@/lib/existing-deliverable-context';
import {
  type ActivityResolutionHint,
  type ObservationRailItem,
  useObservationRail,
} from '@/hooks/use-observation-rail';
import { useActivityAutofill } from '@/hooks/use-activity-autofill';
import { useGdprActivity } from '@/hooks/use-gdpr-activity';
import { ObservationRail } from './observation-rail';
import { BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE, getActivityFormRoleConfig } from '@/lib/roles/business-hub';
import {
  getBusinessHubMetaMissingFields,
  parseBusinessHubMetaJson,
  serializeBusinessHubMeta,
} from '@/lib/business-hub-reporting';

export type { ActivityResolutionHint, ActivityResolutionSection } from '@/hooks/use-observation-rail';

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
  colleagueDocuments?: DocumentMetadata[];
  month: number;
  year: number;
  onSave: (activities: Activity[]) => void | Promise<void>;
  onCancel: () => void;
  initialActivity?: Activity;
  prefillActivity?: Partial<Activity>;
  resolutionHint?: ActivityResolutionHint;
  isSaving?: boolean;
  layout?: 'card' | 'workspace';
  showObservationRail?: boolean;
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

function normalizeActivityLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
  colleagueDocuments = [],
  month,
  year,
  onSave,
  onCancel,
  initialActivity,
  prefillActivity,
  resolutionHint,
  isSaving = false,
  layout = 'card',
  showObservationRail = true,
}: ActivityFormProps) {
  const isWorkspaceLayout = layout === 'workspace';
  const eligibilityCheckEnabled = isDeliverableEligibilityCheckEnabledClient();
  // Fetch activity catalog from database
  const { catalog, isLoading: catalogLoading } = useActivityCatalog();

  const fallbackCatalog = useMemo<ActivityCatalog[]>(() => {
    return fallbackActivityCatalog as ActivityCatalog[];
  }, []);

  // Get expert's assigned SA codes (based on their role)
  const expertSaCodes = expert?.saCodes || [];
  const roleConfig = useMemo(() => getActivityFormRoleConfig(expert), [expert]);
  const expertCategory = roleConfig.category || normalizePeoCategory(expert?.category);
  const show = roleConfig.enabledSections;
  const isGtExpert = show.grupTinta || isGtExpertCategory(expert?.category);
  const isGdprExpert = show.gdprAssistant;
  const isBusinessHubExpert = show.businessHubTab;
  const reportMonthName = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'][month] || 'luna de raportare';

  const effectiveCatalog = useMemo(
    () => resolveExpertActivityCatalog({ fallbackCatalog, backendCatalog: catalog, expertCategory }),
    [catalog, expertCategory, fallbackCatalog],
  );
  
  // Filter catalog by expert category from PEO_Experti and then by assigned SA codes.
  const filteredCatalog = useMemo(() => {
    if (!effectiveCatalog || effectiveCatalog.length === 0) return [];
    const allowedSaCodes = new Set(expertSaCodes.map(normalizeActivityCatalogSaCode).filter(Boolean));
    return effectiveCatalog.filter((item) => {
      const itemCategory = normalizePeoCategory(item.category);
      const matchesCategory = !expertCategory || itemCategory === expertCategory;
      const matchesSaCode = allowedSaCodes.size === 0 || allowedSaCodes.has(normalizeActivityCatalogSaCode(item.saCode));
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

  const updateHoursForDate = useCallback((date: string, value: string) => {
    if (!isValidPontajHours(value)) return;
    setHoursPerDay(prev => {
      const next = { ...prev, [date]: normalizePontajHoursValue(value, prev[date] || defaultHours) };
      onSelectedHoursChange?.(next);
      return next;
    });
  }, [defaultHours, onSelectedHoursChange]);
  const [activityTitle, setActivityTitle] = useState(activitySeed?.activityType || '');
  const [selectedCatalogActivityId, setSelectedCatalogActivityId] = useState(activitySeed?.catalogActivityId || '');
  const [dayType, setDayType] = useState<'lucratoare' | 'CO' | 'CM'>(
    (activitySeed?.dayType as 'lucratoare' | 'CO' | 'CM') || 'lucratoare'
  );
  const [description, setDescription] = useState(activitySeed?.description || '');
  const [activityKeywords, setActivityKeywords] = useState(activitySeed?.activityKeywords || '');
  const [location, setLocation] = useState(activitySeed?.location || 'Birou');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateConfirmation, setDuplicateConfirmation] = useState<{
    identity: string;
    dates: string[];
  } | null>(null);
  const [monthlyDeliverableDuplicateConfirmation, setMonthlyDeliverableDuplicateConfirmation] = useState<{
    message: string;
    confirmedActivityDuplicate: boolean;
  } | null>(null);
  const saveInFlightRef = useRef(false);
  const [existingDeliverablePickerOpen, setExistingDeliverablePickerOpen] = useState(false);

  // Deliverables state with slots
  const [deliverables, setDeliverables] = useState<DeliverableSlot[]>(
    activitySeed?.deliverables?.map(d => ({
      id: initialActivity ? d.id : generateId(),
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
      stadiu: d.stadiu || '',
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
  const [eventDuration, setEventDuration] = useState<string>(
    activitySeed?.eventDurationHours ? String(activitySeed.eventDurationHours) : '',
  );
  const [eventExtendedDesc, setEventExtendedDesc] = useState(activitySeed?.eventExtendedDescription || '');
  
  // Grup tinta
  const [grupTinta, setGrupTinta] = useState<GrupTintaEntry[]>(initialActivity?.grupTinta || []);

  const initialBusinessHubMeta = useMemo(
    () => parseBusinessHubMetaJson(activitySeed?.businessHubMetaJson),
    [activitySeed?.businessHubMetaJson],
  );
  const [businessHubEntityName, setBusinessHubEntityName] = useState(initialBusinessHubMeta?.entityName || '');
  const [businessHubEventTitle, setBusinessHubEventTitle] = useState(initialBusinessHubMeta?.eventTitle || '');
  const [businessHubStartTime, setBusinessHubStartTime] = useState(initialBusinessHubMeta?.startTime || '');
  const [businessHubEndTime, setBusinessHubEndTime] = useState(initialBusinessHubMeta?.endTime || '');
  const [businessHubContactPersonName, setBusinessHubContactPersonName] = useState(initialBusinessHubMeta?.contactPersonName || '');
  const { entries: businessHubDirectoryEntries } = useBusinessHubEntityDirectory();
  const businessHubEntityOptions = useMemo(() => {
    const seen = new Set<string>();
    return businessHubDirectoryEntries
      .filter((entry) => (entry.status ?? 'active') === 'active')
      .map((entry) => {
        const value = entry.acronym || entry.displayName || entry.legalName;
        const label = entry.displayName || entry.acronym || entry.legalName;
        return {
          id: entry.id,
          value,
          label,
          legalName: entry.legalName,
          directoryType: entry.directoryType === 'affiliate' ? 'affiliate' : 'target_group',
          designatedPersonName: entry.designatedPersonName,
        };
      })
      .filter((entry) => {
        const key = entry.value.toLowerCase();
        if (!entry.value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) =>
        Number(a.directoryType === 'target_group') - Number(b.directoryType === 'target_group')
        || a.label.localeCompare(b.label),
      );
  }, [businessHubDirectoryEntries]);
  const selectedBusinessHubEntityExists = businessHubEntityOptions.some((entry) => entry.value === businessHubEntityName);
  const handleBusinessHubEntityChange = useCallback((value: string) => {
    setBusinessHubEntityName(value);
    const selectedEntry = businessHubEntityOptions.find((entry) => entry.value === value);
    if (!businessHubContactPersonName.trim() && selectedEntry?.designatedPersonName) {
      setBusinessHubContactPersonName(selectedEntry.designatedPersonName);
    }
  }, [businessHubContactPersonName, businessHubEntityOptions]);
  
  // Verification

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
  
  // Get available catalog rows for selected SA. Keep IDs so descriptions stay tied to the PM-edited row.
  const availableActivityItems = useMemo(() => {
    if (!saCode || filteredCatalog.length === 0) return [];
    return filteredCatalog
      .filter(item => item.saCode === saCode);
  }, [saCode, filteredCatalog]);

  const businessHubRegistryCatalogItem = useMemo(() => {
    if (!isBusinessHubExpert) return null;
    const targetTitle = normalizeActivityLabel(BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE);
    return filteredCatalog.find((item) =>
      item.saCode === (roleConfig.defaultSaCode || 'SA3.2')
      && normalizeActivityLabel(item.activityName) === targetTitle
    ) || null;
  }, [filteredCatalog, isBusinessHubExpert, roleConfig.defaultSaCode]);

  const businessHubRegistryActivityTitle =
    businessHubRegistryCatalogItem?.activityName
    || roleConfig.defaultActivityTitle
    || BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE;
  
  // Get full activity catalog item for selected activity
  const selectedCatalogItem = useMemo(() => {
    if (!activityTitle || !saCode) return null;
    return availableActivityItems.find(item => item.id === selectedCatalogActivityId)
      || availableActivityItems.find(item =>
        item.activityName === activityTitle
    ) || null;
  }, [activityTitle, availableActivityItems, saCode, selectedCatalogActivityId]);

  const selectedActivitySelectValue = selectedCatalogItem?.id || '';

  const handleActivitySelectionChange = useCallback((catalogActivityId: string) => {
    const catalogItem = availableActivityItems.find((item) => item.id === catalogActivityId);
    setSelectedCatalogActivityId(catalogActivityId);
    setActivityTitle(catalogItem?.activityName || '');
  }, [availableActivityItems]);

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
    selectedActivityId: selectedCatalogItem?.id,
    saCode,
    activityName: activityTitle,
    currentDescription: description,
    selectedDates,
    setDescription,
    year,
    onApplied: () => {
      lastAutoDescriptionRef.current = '__activity_autofill_applied__';
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

  const businessHubMetaDate = selectedDates[0] || initialActivity?.date || '';
  const businessHubMetaDraft = useMemo(() => ({
    entityName: businessHubEntityName,
    eventTitle: businessHubEventTitle,
    date: businessHubMetaDate,
    startTime: businessHubStartTime,
    endTime: businessHubEndTime,
    contactPersonName: businessHubContactPersonName,
    contactSource: businessHubContactPersonName.trim() ? 'manual' as const : 'empty' as const,
  }), [
    businessHubContactPersonName,
    businessHubEndTime,
    businessHubEntityName,
    businessHubEventTitle,
    businessHubMetaDate,
    businessHubStartTime,
  ]);

  const [activityFormTab, setActivityFormTab] = useState<'business_hub' | 'standard' | 'event'>(
    () => isBusinessHubExpert && !initialActivity?.businessHubMetaJson ? 'business_hub' : 'standard',
  );
  const isBusinessHubTabActive = isWorkspaceLayout && isBusinessHubExpert && activityFormTab === 'business_hub';
  const showStandardActivityWorkflow = !isBusinessHubTabActive;
  const effectiveActivityTitle = isGdprExpert && selectedGdprTemplate
    ? selectedGdprTemplate.activityTitle
    : isBusinessHubTabActive
      ? businessHubRegistryActivityTitle
      : activityTitle;
  const effectiveSaCode = isGdprExpert && selectedGdprTemplate
    ? selectedGdprTemplate.saCode
    : isBusinessHubTabActive
      ? roleConfig.defaultSaCode || saCode
      : saCode;
  
  // Check if current activity is exception (no deliverable required)
  const isException = isExceptionActivity(effectiveActivityTitle);
  
  // Check if current activity is event
  const isEvent = isEventActivity(effectiveActivityTitle);

  useEffect(() => {
    if (activityFormTab === 'business_hub') return;
    if (isEvent) {
      setActivityFormTab('event');
    } else if (effectiveActivityTitle.trim()) {
      setActivityFormTab('standard');
    }
  }, [activityFormTab, effectiveActivityTitle, isEvent]);

  useEffect(() => {
    if (!isBusinessHubExpert || activityFormTab !== 'business_hub') return;
    if (saCode !== (roleConfig.defaultSaCode || 'SA3.2')) {
      setSaCode(roleConfig.defaultSaCode || 'SA3.2');
    }
    if (activityTitle !== businessHubRegistryActivityTitle) {
      setActivityTitle(businessHubRegistryActivityTitle);
    }
  }, [
    activityFormTab,
    activityTitle,
    businessHubRegistryActivityTitle,
    isBusinessHubExpert,
    roleConfig.defaultSaCode,
    saCode,
  ]);
  
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
    selectedDates.length === 0 ? 'Selecteaza cel putin o zi din calendar.' : null,
    (!effectiveActivityTitle.trim() && !isLeave) ? 'Selecteaza tipul activitatii.' : null,
    isSaving ? 'Salvarea este deja in curs.' : null,
    (isBusinessHubTabActive && selectedDates.length !== 1) ? 'Registrul Business Hub se completeaza pentru o singura zi selectata.' : null,
    (isBusinessHubTabActive && getBusinessHubMetaMissingFields(businessHubMetaDraft).length > 0)
      ? `Completeaza campurile Business Hub: ${getBusinessHubMetaMissingFields(businessHubMetaDraft).join(', ')}.`
      : null,
    (isException && (description || '').length < 15) ? 'Completeaza descrierea pentru activitatea exceptata.' : null,
    needsCommonDesc ? 'Pentru activitate comuna, descrierea trebuie sa aiba minimum 30 de caractere.' : null,
    needsExtendedDesc ? 'Pentru evenimente cu ore peste durata evenimentului, completeaza descrierea extinsa.' : null,
  ].filter((message): message is string => Boolean(message));
  const isSaveDisabled = saveBlockers.length > 0;
  const footerValidationMessage = validationError || saveBlockers[0] || null;
  const footerAdditionalBlockersCount = validationError
    ? saveBlockers.length
    : Math.max(0, saveBlockers.length - 1);

  // Update activity when SA changes
  useEffect(() => {
    if (isGdprExpert && gdprTemplateCode) return;
    if (availableActivityItems.length > 0 && !selectedCatalogItem) {
      setSelectedCatalogActivityId('');
      setActivityTitle('');
    }
  }, [saCode, availableActivityItems, selectedCatalogItem, isGdprExpert, gdprTemplateCode]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, []);

  const handleBusinessHubPvUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await generateGdprDeliverable(file);
    } finally {
      if (businessHubPvInputRef.current) {
        businessHubPvInputRef.current.value = '';
      }
    }
  }, [generateGdprDeliverable]);

  const addDeliverableSlot = useCallback((type: 'livrabil' | 'raport_preliminar' | 'justificativ') => {
    const newSlot = createDeliverableSlot(type, '');
    setDeliverables(prev => [...prev, newSlot]);
  }, []);

  const addEventProofSlot = useCallback(() => {
    const newSlot = createDeliverableSlot('event_proof', 'Fotografii eveniment');
    setDeliverables(prev => [...prev, newSlot]);
  }, []);

  const updateDeliverable = useCallback((id: string, patch: Partial<DeliverableSlot>) => {
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const applyEligibilitySuggestion = useCallback((
    settings: NonNullable<NonNullable<DeliverableSlot['eligibilityCheck']>['suggestedSettings']>,
    change: 'activity' | 'deliverableType',
    deliverableId: string,
  ) => {
    if (change === 'activity' && settings.saCode && settings.activityName) {
      const catalogMatch = filteredCatalog.find((item) => (
        item.saCode === settings.saCode
        && item.activityName === settings.activityName
        && (!settings.selectedActivityId || item.id === settings.selectedActivityId)
      ));
      if (!catalogMatch) return;

      setSaCode(catalogMatch.saCode);
      setActivityTitle(catalogMatch.activityName);
      updateDeliverable(deliverableId, {
        eligibilityCheck: null,
        aiCheck: null,
        saCode: catalogMatch.saCode,
      });
      return;
    }

    if (change === 'deliverableType' && settings.deliverableType) {
      updateDeliverable(deliverableId, {
        type: settings.deliverableType,
        deliverableType: settings.deliverableType,
        eligibilityCheck: null,
        aiCheck: null,
      });
    }
  }, [filteredCatalog, updateDeliverable]);

  const removeDeliverable = useCallback((id: string) => {
    setDeliverables(prev => prev.filter((d) => d.id !== id));
  }, []);
  
  const upsertEventSlot = useCallback((slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => {
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
  }, [deliverables, updateDeliverable]);

  const addGrupTintaEntry = useCallback(() => {
    setGrupTinta((prev) => [
      ...prev,
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
  }, [activityTitle, expertId, selectedDates]);

  const updateGrupTintaEntry = useCallback((id: string, field: keyof GrupTintaEntry, value: string | number | string[]) => {
    setGrupTinta((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  }, []);

  const removeGrupTintaEntry = useCallback((id: string) => {
    setGrupTinta((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const dataUrlToBlob = useCallback((dataUrl: string, fallbackType: string) => {
    const [header, data] = dataUrl.split(',');
    const contentType = header.match(/data:(.*?);base64/)?.[1] || fallbackType || 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: contentType });
  }, []);

  const uploadDeliverableFile = useCallback(async (deliverable: DeliverableSlot): Promise<DeliverableSlot> => {
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
  }, [
    collaborators,
    dataUrlToBlob,
    expert?.projectCode,
    expert?.projectTitle,
    expertId,
    expertName,
    initialActivity?.date,
    saCode,
    selectedDates,
  ]);

  const handleSave = useCallback(async (
    confirmedDuplicate = false,
    confirmedMonthlyDeliverableDuplicate = false,
  ) => {
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

    if (isBusinessHubTabActive && !isLeave) {
      const missingFields = getBusinessHubMetaMissingFields(businessHubMetaDraft);
      if (missingFields.length > 0) {
        setValidationError(`Completeaza campurile Business Hub: ${missingFields.join(', ')}.`);
        return;
      }
    }

    const activityDatesForSave = initialActivity
      ? (selectedDates.length > 0 ? selectedDates : [initialActivity.date])
      : selectedDates;
    const editedActivityDate = initialActivity
      ? activityDatesForSave.includes(initialActivity.date)
        ? initialActivity.date
        : activityDatesForSave[0]
      : null;
    const normalizedIdentity = (activityKeywords.trim() || description.trim())
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const hasCurrentDeliverable = deliverables.some((d) => d.uploaded && (d.filename || d.name));
    if (!confirmedDuplicate && !hasCurrentDeliverable && normalizedIdentity.length > 0) {
      const duplicateDates = [...new Set(
        allActivities
          .filter((activity) => activity.expertId === expertId)
          .filter((activity) => !initialActivity || activity.id !== initialActivity.id)
          .filter((activity) => !activityDatesForSave.includes(activity.date))
          .filter((activity) => {
            const existingIdentity = ((activity.activityKeywords || '').trim() || (activity.description || '').trim())
              .toLowerCase()
              .replace(/\s+/g, ' ');
            return existingIdentity === normalizedIdentity;
          })
          .map((activity) => activity.date),
      )].sort();

      if (duplicateDates.length > 0) {
        setDuplicateConfirmation({
          identity: activityKeywords.trim() || description.trim(),
          dates: duplicateDates,
        });
        return;
      }
    }
    setDuplicateConfirmation(null);

    const newActivityDrafts: ActivityDraftForValidation[] = activityDatesForSave.map((date) => ({
      id: initialActivity && date === editedActivityDate ? initialActivity.id : undefined,
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

    const existingActivityPeriodGroupId = initialActivity?.periodGroupId
      ?? (initialActivity?.workingGroupId?.startsWith('activity-period:') ? initialActivity.workingGroupId : undefined);
    const activityPeriodGroupId = existingActivityPeriodGroupId
      ?? (activityDatesForSave.length > 1 ? createActivityPeriodGroupId(generateId()) : undefined);

    let activities: Activity[] = activityDatesForSave.map((date) => {
      // Get hours for this specific date, fallback to default
      const dateHours = isLeave ? 0 : Number(normalizePontajHoursValue(hoursPerDay[date] || initialActivity?.hours, defaultHours));
      const shouldAttachDeliverables = shouldAttachUploadedDeliverablesToDate(activityDatesForSave, date);
      const activityId = initialActivity && date === editedActivityDate ? initialActivity.id : generateId();
      
      return {
        id: activityId,
        date,
        expertId,
        expertName,
        hours: dateHours,
        activityType: effectiveActivityTitle,
        saCode: effectiveSaCode,
        catalogActivityId: isBusinessHubTabActive
          ? businessHubRegistryCatalogItem?.id
          : selectedCatalogItem?.id,
        title: effectiveActivityTitle,
        description,
        activityKeywords: activityKeywords.trim() || undefined,
        deliverables: shouldAttachDeliverables ? uploadedDeliverables
          .map(d => ({
            id: d.id,
            activityId,
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
            stadiu: d.stadiu,
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
        workingGroupId: initialActivity?.workingGroupId ?? activityPeriodGroupId,
        periodGroupId: activityPeriodGroupId,
        shareStatus: activityCommon ? 'shared' : 'private',
        takenByExperts: activityCommon ? collaborators : [],
        gdprTemplateCode: isGdprExpert ? gdprTemplateCode : undefined,
        gdprMetaJson: isGdprExpert ? serializeGdprMeta({ ...gdprMeta, concluzie: gdprConclusionCode }) : undefined,
        gdprGeneratedText: isGdprExpert ? (gdprGeneratedText || description) : undefined,
        gdprConclusionCode: isGdprExpert ? gdprConclusionCode : undefined,
        businessHubMetaJson: isBusinessHubTabActive ? serializeBusinessHubMeta({ ...businessHubMetaDraft, date }) : undefined,
        eventDurationHours: isEvent ? eventDur || undefined : undefined,
        eventExtendedDescription: isEvent ? eventExtendedDesc.trim() || undefined : undefined,
        grupTinta,
        createdAt: initialActivity?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const excludedActivityIds = new Set<string>();
    if (initialActivity?.id) excludedActivityIds.add(initialActivity.id);
    const initialPeriodGroupId = initialActivity?.periodGroupId
      ?? (initialActivity?.workingGroupId?.startsWith('activity-period:') ? initialActivity.workingGroupId : undefined);
    if (initialPeriodGroupId) {
      allActivities.forEach((activity) => {
        const activityPeriodGroup = activity.periodGroupId
          ?? (activity.workingGroupId?.startsWith('activity-period:') ? activity.workingGroupId : undefined);
        if (activityPeriodGroup === initialPeriodGroupId) excludedActivityIds.add(activity.id);
      });
    }

    const monthlyDuplicate = findMonthlyDeliverableDuplicate({
      existingActivities: allActivities,
      nextActivities: activities,
      expertId,
      month,
      year,
      excludedActivityIds: [...excludedActivityIds],
    });

    if (monthlyDuplicate) {
      const duplicateName = monthlyDuplicate.deliverable.originalFileName
        || monthlyDuplicate.deliverable.fileName
        || monthlyDuplicate.existingDeliverable.originalFileName
        || monthlyDuplicate.existingDeliverable.fileName
        || 'Acest livrabil';
      const message = `${duplicateName} este deja incarcat pentru luna selectata. Daca acest document este livrabilul comun pentru activitatea multi-day, confirma ca vrei sa adaugi zilele selectate la activitatea existenta fara sa il incarci inca o data. Altfel, anuleaza si incarca un livrabil diferit.`;

      if (!confirmedMonthlyDeliverableDuplicate) {
        setMonthlyDeliverableDuplicateConfirmation({
          message,
          confirmedActivityDuplicate: confirmedDuplicate,
        });
        return;
      }

      const existingActivityWithDeliverable = allActivities.find((activity) => (
        activity.id === monthlyDuplicate.existingActivity.id
      )) ?? allActivities.find((activity) => (
        activity.deliverables?.some((deliverable) => (
          getDeliverableDocumentSignature(deliverable) === monthlyDuplicate.signature
        ))
      ));
      const duplicatePeriodGroupId = existingActivityWithDeliverable?.periodGroupId
        ?? (existingActivityWithDeliverable?.workingGroupId?.startsWith('activity-period:')
          ? existingActivityWithDeliverable.workingGroupId
          : undefined)
        ?? createActivityPeriodGroupId(existingActivityWithDeliverable?.id ?? generateId());
      const nextActivities = activities.map((activity) => ({
        ...activity,
        periodGroupId: duplicatePeriodGroupId,
        workingGroupId: duplicatePeriodGroupId,
        deliverables: activity.deliverables?.filter((deliverable) => (
          getDeliverableDocumentSignature(deliverable) !== monthlyDuplicate.signature
        )),
      }));

      if (
        existingActivityWithDeliverable
        && !nextActivities.some((activity) => activity.id === existingActivityWithDeliverable.id)
        && (
          existingActivityWithDeliverable.periodGroupId !== duplicatePeriodGroupId
          || !existingActivityWithDeliverable.workingGroupId
        )
      ) {
        activities = [
          {
            ...existingActivityWithDeliverable,
            periodGroupId: duplicatePeriodGroupId,
            workingGroupId: existingActivityWithDeliverable.workingGroupId ?? duplicatePeriodGroupId,
            updatedAt: new Date().toISOString(),
          },
          ...nextActivities,
        ];
      } else {
        activities = nextActivities;
      }
    }

    setMonthlyDeliverableDuplicateConfirmation(null);
    if (saveInFlightRef.current || isSaving) return;
    saveInFlightRef.current = true;
    try {
      await onSave(activities);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [
    activityCommon,
    activityKeywords,
    allActivities,
    collaborators,
    dayType,
    defaultHours,
    deliverables,
    description,
    effectiveActivityTitle,
    effectiveSaCode,
    eventDur,
    eventExtendedDesc,
    expert,
    expertId,
    expertName,
    expertNorma,
    gdprConclusionCode,
    gdprGeneratedText,
    gdprMeta,
    gdprTemplateCode,
    grupTinta,
    hoursPerDay,
    initialActivity,
    businessHubRegistryCatalogItem?.id,
    businessHubMetaDraft,
    isBusinessHubTabActive,
    isEvent,
    isGdprExpert,
    isSaving,
    isLeave,
    location,
    month,
    onSave,
    saCode,
    selectedCatalogItem?.id,
    selectedDates,
    uploadDeliverableFile,
    year,
  ]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const setCollaboratorChecked = useCallback((id: string, checked: boolean) => {
    setCollaborators((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((collaboratorId) => collaboratorId !== id);
    });
  }, []);

  const addAllSuggestedCollaborators = useCallback(() => {
    setCollaborators((prev) => Array.from(new Set([
      ...prev,
      ...collaboratorSuggestions.map((suggestion) => suggestion.expert.id),
    ])));
  }, [collaboratorSuggestions]);

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
  const scrollToDeliverables = useCallback(() => {
    window.setTimeout(() => {
      document.getElementById('activity-form-deliverables-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }, []);
  const startDeliverableFlow = useCallback(() => {
    if (mainDeliverables.length === 0) {
      addDeliverableSlot('livrabil');
    }
    scrollToDeliverables();
  }, [addDeliverableSlot, mainDeliverables.length, scrollToDeliverables]);
  const openExistingDeliverableFlow = useCallback(() => {
    setExistingDeliverablePickerOpen(true);
    scrollToDeliverables();
  }, [scrollToDeliverables]);
  const hasEventMomAsMainDeliverable = isEvent && deliverables.some((deliverable) => (
    deliverable.slotType === 'event_mom'
    && deliverable.uploaded
    && !deliverable.isPendingConfirm
    && Boolean(deliverable.filename || deliverable.name || deliverable.declaredTitle)
  ));
  const existingDeliverableContexts = useMemo<ExistingDeliverableSourceContext[]>(() => (
    deliverables
      .map((deliverable) => buildExistingDeliverableSourceContext({
        deliverable,
        activities: allActivities,
        catalog: filteredCatalog,
      }))
      .filter((context): context is ExistingDeliverableSourceContext => Boolean(context))
  ), [allActivities, deliverables, filteredCatalog]);

  const applyExistingDeliverableSourceAction = useCallback((actionId: string) => {
    const [, deliverableId, action] = actionId.split(':') as [string, string, ExistingDeliverableSourceAction | undefined];
    if (!deliverableId || !action) return;

    const context = existingDeliverableContexts.find((item) => item.deliverableId === deliverableId);
    if (!context) return;

    if (action === 'activity' && context.sourceSaCode && context.sourceActivityName) {
      const catalogMatch = filteredCatalog.find((item) => (
        item.saCode === context.sourceSaCode
        && item.activityName === context.sourceActivityName
        && (!context.selectedActivityId || item.id === context.selectedActivityId)
      )) || filteredCatalog.find((item) => (
        item.saCode === context.sourceSaCode
        && item.activityName === context.sourceActivityName
      ));
      if (!catalogMatch) return;

      setSaCode(catalogMatch.saCode);
      setActivityTitle(catalogMatch.activityName);
      updateDeliverable(deliverableId, {
        eligibilityCheck: null,
        aiCheck: null,
        saCode: catalogMatch.saCode,
      });
      return;
    }

    if (action === 'deliverableType' && context.deliverableType) {
      updateDeliverable(deliverableId, {
        eligibilityCheck: null,
        aiCheck: null,
        type: context.deliverableType,
        deliverableType: context.deliverableType,
      });
      return;
    }

    if (action === 'stadiu' && context.stadiu) {
      updateDeliverable(deliverableId, {
        eligibilityCheck: null,
        aiCheck: null,
        stadiu: context.stadiu,
      });
    }
  }, [existingDeliverableContexts, filteredCatalog, updateDeliverable]);

  const handleObservationRailAction = useCallback((_item: ObservationRailItem, actionId: string) => {
    if (actionId.startsWith('existing-source:')) {
      applyExistingDeliverableSourceAction(actionId);
    }
  }, [applyExistingDeliverableSourceAction]);

  const observationRailItems = useObservationRail({
    activity: {
      activityName: activityTitle,
      hasEventMomAsMainDeliverable,
      isException,
      isLeave,
      isWorkspaceLayout,
      mainDeliverablesCount: mainDeliverables.length,
      saCode,
    },
    deliverables,
    duplicateInfoByDeliverableId,
    eligibility: {
      blockedReason: eligibilityBlockedReason,
      checkEnabled: eligibilityCheckEnabled,
    },
    existingDeliverableContexts,
    resolutionHint,
    warnings: {
      activityAutofillError,
      activityAutofillUnavailableMessage: null,
      isSaveDisabled,
      isSaving,
      saveBlockers,
      validationError,
    },
  });
  const attachExistingDeliverable = useCallback((candidate: ExistingDeliverableCandidate) => {
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
    const sourceActivity = candidate.sourceActivityId
      ? allActivities.find((activity) => activity.id === candidate.sourceActivityId)
      : undefined;
    const sourceSaCode = candidate.saCode || sourceActivity?.saCode;
    const sourceActivityName = sourceActivity?.activityType || sourceActivity?.title;
    const sourceCatalogMatch = filteredCatalog.find((item) => (
      item.saCode === sourceSaCode
      && item.activityName === sourceActivityName
      && (!sourceActivity?.catalogActivityId || item.id === sourceActivity.catalogActivityId)
    )) || filteredCatalog.find((item) => (
      item.saCode === sourceSaCode
      && item.activityName === sourceActivityName
    ));
    const inferredStadiu = candidate.stadiu || (candidate.eligibilityCheck ? 'final' : '');
    const existingDeliverableType = candidate.deliverableType || 'livrabil';
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
      type: existingDeliverableType,
      deliverableType: existingDeliverableType,
      isCommonDeliverable: candidate.source !== 'mine' || candidate.isCommonDeliverable === true,
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
      titleCheckMessage: candidate.titleCheckMessage || (candidate.source === 'colleagues'
        ? 'Livrabil atasat direct din documentele colegilor.'
        : 'Livrabil selectat din documentele existente.'),
      aiCheck,
      eligibilityCheck: candidate.eligibilityCheck,
      stadiu: inferredStadiu,
      common: false,
      isPendingConfirm: false,
    };

    if (!activityTitle && sourceCatalogMatch) {
      setSaCode(sourceCatalogMatch.saCode);
      setActivityTitle(sourceCatalogMatch.activityName);
      slot.saCode = sourceCatalogMatch.saCode;
    }

    setDeliverables((prev) => [...prev, slot]);
    setExistingDeliverablePickerOpen(false);
  }, [activityTitle, allActivities, filteredCatalog]);

  const renderGdprField = useCallback((field: GdprFieldDefinition) => {
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
  }, [gdprMeta, updateGdprMeta]);

  const formPanel = (
    <Card id={isWorkspaceLayout ? undefined : 'activity-form-panel'} className={isWorkspaceLayout ? 'scroll-mt-24 overflow-hidden border-slate-200 shadow-sm' : 'scroll-mt-24'}>
      {isWorkspaceLayout ? (
        <div className="flex flex-col gap-3 border-b bg-white px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {initialActivity ? 'Editare activitate' : 'Activitate noua'}
            </p>
            <h2 className="text-lg font-semibold leading-tight text-foreground">
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
      <CardContent className={isWorkspaceLayout ? 'space-y-6 bg-slate-50/60 p-4 sm:p-6' : 'space-y-6'}>
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
            onValueChange={(value) => setActivityFormTab(value as 'business_hub' | 'standard' | 'event')}
            className="rounded-lg border bg-white p-3 shadow-sm sm:p-4"
          >
            <TabsList className={`grid w-full rounded-lg ${isBusinessHubExpert ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {isBusinessHubExpert && (
                <TabsTrigger value="business_hub">Business Hub</TabsTrigger>
              )}
              <TabsTrigger value="standard">Activitate standard</TabsTrigger>
              <TabsTrigger value="event">Eveniment</TabsTrigger>
            </TabsList>
            {isBusinessHubExpert && (
              <TabsContent value="business_hub" className="space-y-4 pt-3">
                <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                  Inregistreaza evenimentul organizat in Business Hub. Data vine din calendar, iar activitatea se salveaza pe SA3.2.
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <div className="font-medium text-slate-950">Subactivitate</div>
                  <div className="mt-1">{businessHubRegistryActivityTitle}</div>
                  <div className="mt-2 text-slate-500">
                    Livrabilele aferente registrului Business Hub se genereaza lunar: proces-verbal si adrese catre entitati.
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="bh-entity">Entitate organizatoare *</FieldLabel>
                    {businessHubEntityOptions.length > 0 ? (
                      <Select value={businessHubEntityName || undefined} onValueChange={handleBusinessHubEntityChange}>
                        <SelectTrigger id="bh-entity" className="w-full">
                          <SelectValue placeholder="Selecteaza entitatea" />
                        </SelectTrigger>
                        <SelectContent>
                          {businessHubEntityName && !selectedBusinessHubEntityExists && (
                            <>
                              <SelectItem value={businessHubEntityName}>
                                {businessHubEntityName} (manual)
                              </SelectItem>
                              <SelectSeparator />
                            </>
                          )}
                          <SelectGroup>
                            <SelectLabel>Organizatii afiliate CPC</SelectLabel>
                            {businessHubEntityOptions
                              .filter((entry) => entry.directoryType === 'affiliate')
                              .map((entry) => (
                                <SelectItem key={entry.id} value={entry.value}>
                                  {entry.label}{entry.legalName && entry.legalName !== entry.label ? ` - ${entry.legalName}` : ''}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Entitati inscrise in GT</SelectLabel>
                            {businessHubEntityOptions
                              .filter((entry) => entry.directoryType === 'target_group')
                              .map((entry) => (
                                <SelectItem key={entry.id} value={entry.value}>
                                  {entry.label}{entry.legalName && entry.legalName !== entry.label ? ` - ${entry.legalName}` : ''}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="bh-entity"
                        value={businessHubEntityName}
                        onChange={(event) => setBusinessHubEntityName(event.target.value)}
                        placeholder="ex: CPBR"
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bh-event-title">Titlu eveniment *</FieldLabel>
                    <Input
                      id="bh-event-title"
                      value={businessHubEventTitle}
                      onChange={(event) => setBusinessHubEventTitle(event.target.value)}
                      placeholder="ex: Sedinta de lucru"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="bh-date">Data</FieldLabel>
                    <Input id="bh-date" value={businessHubMetaDate ? formatDateRo(businessHubMetaDate) : 'Selecteaza o zi din calendar'} disabled />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="bh-start-time">Ora inceput *</FieldLabel>
                      <Input
                        id="bh-start-time"
                        type="time"
                        value={businessHubStartTime}
                        onChange={(event) => setBusinessHubStartTime(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="bh-end-time">Ora final *</FieldLabel>
                      <Input
                        id="bh-end-time"
                        type="time"
                        value={businessHubEndTime}
                        onChange={(event) => setBusinessHubEndTime(event.target.value)}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="bh-contact">Persoana contact</FieldLabel>
                    <Input
                      id="bh-contact"
                      value={businessHubContactPersonName}
                      onChange={(event) => setBusinessHubContactPersonName(event.target.value)}
                      placeholder="optional"
                    />
                  </Field>
                </div>
              </TabsContent>
            )}
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

        {isWorkspaceLayout && showStandardActivityWorkflow && !isLeave && !isException && (
          <div className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  Porneste de la livrabil
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Incarca sau ataseaza un livrabil existent, apoi selecteaza activitatea si foloseste AI-ul de descriere din formular.
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
              </div>
            </div>
            {!isWorkspaceLayout && activityAutofillError && (
              <p className="mt-3 text-xs text-amber-700">{activityAutofillError}</p>
            )}
          </div>
        )}

        {/* Day Type and Hours */}
        <div id="activity-form-details-section" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

                    {!isBusinessHubGdpr && (
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
                    )}
                  </>
                )}
              </div>
            )}

            {/* Main Deliverables */}
            {showStandardActivityWorkflow && !isException && (
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
                    colleagueDocuments={colleagueDocuments}
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
                            activityCatalogCandidates={filteredCatalog}
                            deliverableOptions={deliverableOptions}
                            projectCode={expert?.projectCode}
                            month={month}
                            year={year}
                            expertName={expertName}
                            onUpdate={(patch) => updateDeliverable(d.id, patch)}
                            onRemove={() => removeDeliverable(d.id)}
                            duplicateInfo={duplicateInfoByDeliverableId.get(d.id)}
                            canCheckEligibility={canCheckDeliverableEligibility}
                            eligibilityBlockedReason={eligibilityBlockedReason}
                            onApplyEligibilitySuggestion={applyEligibilitySuggestion}
                            notesMode={isWorkspaceLayout ? 'external' : 'inline'}
                            showEligibilityControl={false}
                          />
                        </div>
                      );
                    })}
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
            {showStandardActivityWorkflow && (
              <>
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
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(220px,0.28fr)]">
                    <Field>
                      <FieldLabel htmlFor="activity">Activitate</FieldLabel>
                      <Select value={selectedActivitySelectValue} onValueChange={handleActivitySelectionChange} disabled={!saCode || availableActivityItems.length === 0}>
                        <SelectTrigger id="activity">
                          <SelectValue placeholder={!saCode ? "Selecteaza SA mai intai" : "Selecteaza activitatea"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableActivityItems.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nicio activitate pentru acest SA</div>
                          ) : (
                            availableActivityItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>{item.activityName}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {selectedCatalogItem && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedCatalogItem.serviceCategory} - {selectedCatalogItem.description}
                        </p>
                      )}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="activityKeywords">Cheie interna optionala</FieldLabel>
                      <Input
                        id="activityKeywords"
                        value={activityKeywords}
                        onChange={(event) => setActivityKeywords(event.target.value)}
                        placeholder="ex: monitorizare iulie"
                        maxLength={120}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
            {/* Description */}
            {showStandardActivityWorkflow && (
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
              <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Descriere asistata AI</div>
                    <div className="text-xs text-slate-600">
                      Foloseste descrierea curenta, activitatea selectata si livrabilele citite.
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
                    Rescrie descrierea
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
                      <div className="font-medium">Descriere pregatita pentru revizuire</div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-800">
                          {getAutofillConfidenceLabel(activityAutofillSuggestion.confidence)}
                        </Badge>
                        <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-800">
                          {getAutofillRagLabel(activityAutofillSuggestion)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-emerald-800">Descriere propusa</div>
                      <div className="mt-1 whitespace-pre-wrap rounded border border-emerald-200 bg-white p-2 text-xs text-slate-800">
                        {activityAutofillSuggestion.description}
                      </div>
                    </div>
                    {(activityAutofillSuggestion.evidence.length > 0 || activityAutofillSuggestion.warnings.length > 0) && (
                      <div className="grid gap-2 md:grid-cols-2">
                        {activityAutofillSuggestion.evidence.length > 0 && (
                          <div className="rounded border border-emerald-200 bg-white p-2 text-xs text-slate-800">
                            <div className="font-medium text-emerald-800">Dovezi folosite</div>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {activityAutofillSuggestion.evidence.slice(0, 4).map((item, index) => (
                                <li key={`activity-description-ai-evidence-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {activityAutofillSuggestion.warnings.length > 0 && (
                          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            <div className="font-medium">Atentionari</div>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {activityAutofillSuggestion.warnings.slice(0, 4).map((item, index) => (
                                <li key={`activity-description-ai-warning-${index}`}>{item}</li>
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
                              <li key={`activity-description-ai-rag-source-${source.rank}`}>
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
                        Aplica descrierea
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Field>
            )}

            <AlertDialog open={Boolean(duplicateConfirmation)} onOpenChange={(open) => !open && setDuplicateConfirmation(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Activitate similara gasita</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ai mai descris aceasta activitate in zilele{' '}
                    {duplicateConfirmation?.dates.map((date) => formatDateRo(date)).join(', ')}.
                    Confirma ca vrei sa salvezi separat sau anuleaza si editeaza activitatea existenta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuleaza</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleSave(true)}>
                    Confirma salvarea
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
              open={Boolean(monthlyDeliverableDuplicateConfirmation)}
              onOpenChange={(open) => !open && setMonthlyDeliverableDuplicateConfirmation(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Livrabil deja incarcat</AlertDialogTitle>
                  <AlertDialogDescription>
                    {monthlyDeliverableDuplicateConfirmation?.message}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuleaza</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleSave(
                      monthlyDeliverableDuplicateConfirmation?.confirmedActivityDuplicate ?? false,
                      true,
                    )}
                  >
                    Adauga la activitatea existenta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {showStandardActivityWorkflow && mainDeliverableForEligibility && !isLeave && !isException && (
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
                  activityCatalogCandidates={filteredCatalog}
                  deliverableOptions={deliverableOptions}
                  projectCode={expert?.projectCode}
                  month={month}
                  year={year}
                  expertName={expertName}
                  onUpdate={(patch) => updateDeliverable(mainDeliverableForEligibility.id, patch)}
                  canCheckEligibility={canCheckDeliverableEligibility}
                  eligibilityBlockedReason={eligibilityBlockedReason}
                  onApplyEligibilitySuggestion={applyEligibilitySuggestion}
                />
              </div>
            )}

            {/* Event duration (for event activities) */}
            {showStandardActivityWorkflow && isEvent && !isWorkspaceLayout && (
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
            {showStandardActivityWorkflow && !isException && (
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
                        activityCatalogCandidates={filteredCatalog}
                        deliverableOptions={deliverableOptions}
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
                        onApplyEligibilitySuggestion={applyEligibilitySuggestion}
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
                          selectedActivityId={selectedCatalogItem?.id}
                          catalogDescription={selectedCatalogItem?.description}
                          catalogObjectives={selectedCatalogItem?.objectives}
                          catalogComponent={selectedCatalogItem?.serviceComponent}
                          catalogBeneficiaries={selectedCatalogItem?.beneficiaries}
                          catalogExpectedResults={selectedCatalogItem?.expectedResults}
                          catalogDeliverables={selectedCatalogItem?.deliverables}
                          catalogIndicators={selectedCatalogItem?.indicators}
                          activityCatalogCandidates={filteredCatalog}
                          deliverableOptions={deliverableOptions}
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
                          onApplyEligibilitySuggestion={applyEligibilitySuggestion}
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
        {(!isWorkspaceLayout || !showObservationRail) && showStandardActivityWorkflow && !isLeave && !isException && mainDeliverables.length === 0 && !hasEventMomAsMainDeliverable && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-800">
              Activitatea necesita cel putin un livrabil principal.
            </span>
          </div>
        )}

        {(!isWorkspaceLayout || !showObservationRail) && validationError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {(!isWorkspaceLayout || !showObservationRail) && isSaveDisabled && !isSaving && (
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
        <div className={isWorkspaceLayout ? 'sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col gap-3 border-t bg-white/95 px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-6' : 'flex justify-end gap-2 pt-4 border-t'}>
          {isWorkspaceLayout && footerValidationMessage && !isSaving ? (
            <div className="flex min-w-0 items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:max-w-[min(720px,calc(100%-220px))]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <span className="font-medium">Nu se poate salva inca: </span>
                <span>{footerValidationMessage}</span>
                {footerAdditionalBlockersCount > 0 && (
                  <span className="text-amber-800"> Inca {footerAdditionalBlockersCount} {footerAdditionalBlockersCount === 1 ? 'motiv' : 'motive'}.</span>
                )}
              </div>
            </div>
          ) : isWorkspaceLayout ? (
            <div className="hidden sm:block" />
          ) : null}
          <div className={isWorkspaceLayout ? 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' : 'flex justify-end gap-2'}>
            <Button type="button" variant="outline" onClick={onCancel} className={isWorkspaceLayout ? 'w-full sm:w-auto' : undefined}>
              Anuleaza
            </Button>
            <Button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaveDisabled || isSaving}
              className={isWorkspaceLayout ? 'w-full sm:w-auto' : undefined}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se salveaza...
                </>
              ) : initialActivity ? 'Salveaza modificarile' : 'Adauga activitate'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!isWorkspaceLayout) {
    return formPanel;
  }

  if (!showObservationRail) {
    return (
      <div id="activity-form-panel" className="scroll-mt-24">
        {formPanel}
      </div>
    );
  }

  return (
    <div
      id="activity-form-panel"
      className="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start"
    >
      <div className="min-w-0">
        {formPanel}
      </div>
      <ObservationRail items={observationRailItems} onAction={handleObservationRailAction} />
    </div>
  );
}
