'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, X, FileText, Loader2, Users, Plus, AlertTriangle, CheckCircle } from 'lucide-react';
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
  DELIVS, 
  EXCEPTIONS, 
  isEventActivity, 
  isExceptionActivity,
  getActivityOptions,
  getDeliverableOptions 
} from '@/lib/peo-constants';
import { useActivityCatalog } from '@/hooks/use-backend-data';
import type { Activity, Deliverable, GrupTintaEntry, Expert, ActivityCatalog } from '@/lib/types';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { buildDocumentS3Key, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import { validateActivitiesBeforeCreate, type ActivityDraftForValidation } from '@/lib/pontaj-rules';

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
  const defaultHours = Math.min(expertNorma, 8);
  
  // Per-day hours state - each day can have different hours
  const [hoursPerDay, setHoursPerDay] = useState<Record<string, string>>(() => {
    // Initialize with default hours for each selected date
    const initial: Record<string, string> = {};
    selectedDates.forEach(date => {
      initial[date] = selectedHours?.[date] || initialActivity?.hours?.toString() || defaultHours.toString();
    });
    return initial;
  });
  
  // Legacy single hours for backward compatibility (used when saving)
  const [hours, setHours] = useState(initialActivity?.hours?.toString() || defaultHours.toString());
  const [saCode, setSaCode] = useState(initialActivity?.saCode || '');
  
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
      const updated = { ...prev };
      selectedDates.forEach(date => {
        if (!updated[date]) {
          updated[date] = selectedHours?.[date] || defaultHours.toString();
        }
      });
      return updated;
    });
  }, [selectedDates, defaultHours, selectedHours]);

  const updateHoursForDate = (date: string, value: string) => {
    setHoursPerDay(prev => {
      const next = { ...prev, [date]: value };
      onSelectedHoursChange?.(next);
      return next;
    });
  };
  const [activityTitle, setActivityTitle] = useState(initialActivity?.activityType || '');
  const [dayType, setDayType] = useState<'lucratoare' | 'CO' | 'CM'>(
    (initialActivity?.dayType as 'lucratoare' | 'CO' | 'CM') || 'lucratoare'
  );
  const [description, setDescription] = useState(initialActivity?.description || '');
  const [location, setLocation] = useState(initialActivity?.location || 'Birou');
  const [validationError, setValidationError] = useState<string | null>(null);
  
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
      possibleDuplicateOfDocumentId: d.possibleDuplicateOfDocumentId,
      duplicateStatus: d.duplicateStatus,
      fileData: d.fileData,
      uploadedAt: d.uploadedAt,
      uploaded: true,
      isPhoto: d.fileType?.startsWith('image/') || false,
      declaredTitle: d.declaredTitle || '',
      titleConfirmed: false,
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
  
  // Check if current activity is exception (no deliverable required)
  const isException = isExceptionActivity(activityTitle);
  
  // Check if current activity is event
  const isEvent = isEventActivity(activityTitle);
  
  // Check if leave day
  const isLeave = dayType === 'CO' || dayType === 'CM';
  
  // Check if common description is needed
  const needsCommonDesc = activityCommon && (description || '').trim().length < 30;
  
  // Check if extended event description is needed
  const totalHours = parseFloat(hours) || 0;
  const eventDur = parseFloat(eventDuration) || 0;
  const needsExtendedDesc = isEvent && eventDur > 0 && totalHours > eventDur && (eventExtendedDesc || '').trim().length < 20;

  // Update activity when SA changes
  useEffect(() => {
    if (availableActivities.length > 0 && !availableActivities.includes(activityTitle)) {
      setActivityTitle('');
    }
  }, [saCode, availableActivities, activityTitle]);

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
      alert(
        invalidTitleDeliverable.titleCheckMessage
        || 'Titlul livrabilului trebuie confirmat si trebuie sa se regaseasca in prima pagina.',
      );
      return;
    }

    const newActivityDrafts: ActivityDraftForValidation[] = selectedDates.map((date) => ({
      id: initialActivity?.id,
      expertId,
      date,
      hours: isLeave ? 0 : (parseFloat(hoursPerDay[date] || defaultHours.toString()) || defaultHours),
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

    const uploadedDeliverables = await Promise.all(
      deliverables
        .filter(d => d.uploaded && (d.filename || d.name))
        .map(uploadDeliverableFile)
    );

    const activities: Activity[] = selectedDates.map((date) => {
      // Get hours for this specific date, fallback to default
      const dateHours = isLeave ? 0 : (parseFloat(hoursPerDay[date] || defaultHours.toString()) || defaultHours);
      
      return {
        id: initialActivity?.id || generateId(),
        date,
        expertId,
        expertName,
        hours: dateHours,
        activityType: activityTitle,
        saCode,
        catalogActivityId: selectedCatalogItem?.id,
        title: activityTitle,
        description,
        deliverables: uploadedDeliverables
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
            fileData: d.fileData,
          })),
        location,
        dayType,
        shareStatus: activityCommon ? 'shared' : 'private',
        takenByExperts: activityCommon ? collaborators : [],
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
  const prelimDeliverables = deliverables.filter(d => d.slotType === 'raport_preliminar');
  const justifDeliverables = deliverables.filter(d => d.slotType === 'justificativ');

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
                  {Array.from({ length: 16 }, (_, i) => (i + 1) * 0.5)
                    .filter(h => h <= 8)
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
                      {Array.from({ length: 16 }, (_, i) => (i + 1) * 0.5)
                        .filter(h => h <= 8)
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
              Total: {selectedDates.reduce((sum, date) => sum + parseFloat(hoursPerDay[date] || defaultHours.toString()), 0)}h pentru {selectedDates.length} zile
            </p>
          </div>
        )}

        {!isLeave && (
          <>
            {/* Sub-activity and Activity */}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="saCode">Subactivitate (Rol: {expert?.role})</FieldLabel>
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
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="activity">Activitate</FieldLabel>
                {apiKey && activityTitle && (
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
                        apiKey={apiKey}
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
                        apiKey={apiKey}
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
                          apiKey={null}
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
                    apiKey={apiKey}
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
        {!isLeave && !isException && mainDeliverables.length === 0 && (
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

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Anuleaza
          </Button>
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={
              (!activityTitle.trim() && !isLeave) || 
              isSaving ||
              (isException && (description || '').length < 15) ||
              needsCommonDesc ||
              needsExtendedDesc
            }
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
