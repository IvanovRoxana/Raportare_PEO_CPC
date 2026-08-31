'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, Plus, RotateCcw, Save, SearchIcon, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActivityCatalog, useActivityCatalogMutations } from '@/hooks/use-backend-data';
import type { ActivityCatalog } from '@/lib/types';
import {
  activityCatalogMergeKey,
  mergeActivityCatalogs,
  requiresSameDayForSharedEventActivity,
} from '@/lib/activity-catalog-merge';
import {
  buildActivityCatalogImportPlan,
  exportActivityCatalogCsv,
  type ActivityCatalogImportPlan,
} from '@/lib/activity-catalog-governance';
import { GDPR_TEMPLATES, resolveGdprTemplateCodeForCatalogActivity } from '@/lib/gdpr-reporting';
import {
  isCatalogDeliverableNotApplicable,
  NO_DELIVERABLE_CATALOG_MARKER,
} from '@/lib/submit-readiness';
import { isActivePmUnlockRequest } from '@/lib/pm-unlock-status';

const ALL = 'all';
const ACTIVE = 'active';
const INACTIVE = 'inactive';
const FALLBACK_CATEGORIES = ['ap', 'com', 'gdpr', 'gt', 'pm'];
const CUSTOM_SERVICE_CATEGORY = '__custom_service_category__';
const EMPTY_SERVICE_CATEGORY = '__empty_service_category__';

type ActivityCatalogDraft = Omit<ActivityCatalog, 'id' | 'createdAt'>;
type CatalogEditorView = 'catalog' | 'deliverables';

interface ActivityCatalogGovernancePanelProps {
  fallbackCatalog?: ActivityCatalog[];
  mode?: 'admin' | 'pm';
  activities?: Array<{ id: string; catalogActivityId?: string; saCode?: string; title?: string; activityType?: string }>;
  documents?: Array<{
    id: string;
    originalFileName?: string;
    eligibilityCheck?: { status?: string; checkedActivityId?: string; pmUnlockRequested?: boolean; pmUnlockApproved?: boolean } | null;
    sourceActivityId?: string;
  }>;
  onAudit?: (input: {
    actionType: string;
    oldValue?: string;
    newValue?: string;
    justification: string;
    source: 'manual' | 'import' | 'eligibility_review';
  }) => Promise<unknown>;
}

function matchesCatalogSearch(item: ActivityCatalog, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    item.activityName,
    item.saCode,
    item.category,
    item.serviceCategory,
    item.description,
    item.objectives,
    item.serviceComponent,
    item.beneficiaries,
    item.expectedResults,
    item.deliverables,
    item.indicators,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function splitCatalogDeliverables(value?: string | null) {
  return (value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinCatalogDeliverables(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join(' | ');
}

function draftFromActivity(activity?: ActivityCatalog | null): ActivityCatalogDraft {
  return {
    category: activity?.category ?? '',
    saCode: activity?.saCode ?? '',
    gdprTemplateCode: activity?.category?.trim().toLowerCase() === 'gdpr'
      ? resolveGdprTemplateCodeForCatalogActivity(activity)
      : activity?.gdprTemplateCode,
    serviceCategory: activity?.serviceCategory ?? '',
    activityNumber: activity?.activityNumber ?? 0,
    activityName: activity?.activityName ?? '',
    isActive: activity?.isActive ?? true,
    requiresSameDayForSharedDeliverable: activity
      ? requiresSameDayForSharedEventActivity(activity)
      : false,
    description: activity?.description ?? '',
    objectives: activity?.objectives ?? '',
    serviceComponent: activity?.serviceComponent ?? '',
    beneficiaries: activity?.beneficiaries ?? '',
    expectedResults: activity?.expectedResults ?? '',
    deliverables: activity?.deliverables ?? '',
    indicators: activity?.indicators ?? '',
  };
}

function normalizeDraft(draft: ActivityCatalogDraft): ActivityCatalogDraft {
  return {
    ...draft,
    category: draft.category.trim().toLowerCase(),
    saCode: draft.saCode.trim().toUpperCase(),
    gdprTemplateCode: draft.category.trim().toLowerCase() === 'gdpr'
      ? draft.gdprTemplateCode?.trim() || 'GDPR_ALTE_VERIFICARI'
      : undefined,
    serviceCategory: draft.serviceCategory.trim(),
    activityNumber: Number.isFinite(Number(draft.activityNumber)) ? Number(draft.activityNumber) : 0,
    activityName: draft.activityName.trim(),
    requiresSameDayForSharedDeliverable: Boolean(draft.requiresSameDayForSharedDeliverable),
    description: draft.description?.trim(),
    objectives: draft.objectives?.trim(),
    serviceComponent: draft.serviceComponent?.trim(),
    beneficiaries: draft.beneficiaries?.trim(),
    expectedResults: draft.expectedResults?.trim(),
    deliverables: draft.deliverables?.trim(),
    indicators: draft.indicators?.trim(),
  };
}

function areDraftsEqual(left: ActivityCatalogDraft, right: ActivityCatalogDraft) {
  return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right));
}

export function ActivityCatalogGovernancePanel({
  fallbackCatalog = [],
  mode = 'admin',
  activities = [],
  documents = [],
  onAudit,
}: ActivityCatalogGovernancePanelProps) {
  const { catalog: backendCatalog, isLoading, error } = useActivityCatalog();
  const { create, update, remove } = useActivityCatalogMutations();
  const [localCatalog, setLocalCatalog] = useState<ActivityCatalog[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [saFilter, setSaFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [selectedId, setSelectedId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ActivityCatalogDraft>(() => draftFromActivity(null));
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ActivityCatalogImportPlan | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editorView, setEditorView] = useState<CatalogEditorView>('catalog');
  const [deliverableDrafts, setDeliverableDrafts] = useState<Record<string, string>>({});
  const [useCustomServiceCategory, setUseCustomServiceCategory] = useState(false);

  const persistedCatalogKeys = useMemo(() => {
    return new Set([...backendCatalog, ...localCatalog].map(activityCatalogMergeKey));
  }, [backendCatalog, localCatalog]);

  const catalog = useMemo(() => {
    return mergeActivityCatalogs(fallbackCatalog, backendCatalog, localCatalog);
  }, [backendCatalog, fallbackCatalog, localCatalog]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set([
      ...FALLBACK_CATEGORIES,
      ...catalog.map((item) => item.category).filter(Boolean),
    ])).sort();
  }, [catalog]);

  const saOptions = useMemo(() => {
    return Array.from(
      new Set(
        catalog
          .filter((item) => categoryFilter === ALL || item.category === categoryFilter)
          .map((item) => item.saCode)
          .filter(Boolean),
      ),
    ).sort();
  }, [catalog, categoryFilter]);

  const serviceCategoryOptions = useMemo(() => {
    const draftCategory = draft.category.trim().toLowerCase();
    const draftSaCode = draft.saCode.trim().toUpperCase();
    return Array.from(
      new Set(
        catalog
          .filter((item) => item.category.trim().toLowerCase() === draftCategory)
          .filter((item) => item.saCode.trim().toUpperCase() === draftSaCode)
          .map((item) => item.serviceCategory?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [catalog, draft.category, draft.saCode]);

  const draftServiceCategory = draft.serviceCategory.trim();
  const serviceCategoryInOptions = draftServiceCategory
    ? serviceCategoryOptions.includes(draftServiceCategory)
    : false;
  const showCustomServiceCategoryInput = useCustomServiceCategory
    || serviceCategoryOptions.length === 0
    || (Boolean(draftServiceCategory) && !serviceCategoryInOptions);
  const serviceCategorySelectValue = showCustomServiceCategoryInput
    ? CUSTOM_SERVICE_CATEGORY
    : draftServiceCategory || EMPTY_SERVICE_CATEGORY;

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchesCategory = categoryFilter === ALL || item.category === categoryFilter;
      const matchesSa = saFilter === ALL || item.saCode === saFilter;
      const matchesStatus = statusFilter === ALL
        || (statusFilter === ACTIVE ? item.isActive !== false : item.isActive === false);
      return matchesCategory && matchesSa && matchesStatus && matchesCatalogSearch(item, query);
    });
  }, [catalog, categoryFilter, query, saFilter, statusFilter]);

  const selectedActivity = useMemo(() => {
    if (isCreating) return null;
    return catalog.find((item) => item.id === selectedId) ?? null;
  }, [catalog, isCreating, selectedId]);

  const selectedImpact = useMemo(() => {
    if (!selectedActivity) return { activities: [], documents: [] };
    const activityMatches = activities.filter((activity) => (
      activity.catalogActivityId === selectedActivity.id
      || (activity.saCode === selectedActivity.saCode && activity.title === selectedActivity.activityName)
      || (activity.saCode === selectedActivity.saCode && activity.activityType === selectedActivity.activityName)
    ));
    const activityIds = new Set(activityMatches.map((activity) => activity.id));
    return {
      activities: activityMatches,
      documents: documents.filter((document) => (
        activityIds.has(document.sourceActivityId || '')
        || document.eligibilityCheck?.checkedActivityId === selectedActivity.id
        || document.eligibilityCheck?.checkedActivityId === selectedActivity.activityName
      )),
    };
  }, [activities, documents, selectedActivity]);

  const reviewQueueDocuments = useMemo(() => {
    return documents.filter((document) => {
      const status = document.eligibilityCheck?.status;
      return status === 'neeligibil'
        || status === 'neconcludent'
        || isActivePmUnlockRequest(document.eligibilityCheck);
    });
  }, [documents]);

  useEffect(() => {
    if (isCreating) return;

    if (filteredCatalog.length === 0) {
      setSelectedId('');
      return;
    }

    if (!filteredCatalog.some((item) => item.id === selectedId)) {
      setSelectedId(filteredCatalog[0].id);
    }
  }, [filteredCatalog, isCreating, selectedId]);

  useEffect(() => {
    if (isCreating) return;
    setDraft(draftFromActivity(selectedActivity));
    setSaveMessage(null);
    setUseCustomServiceCategory(false);
  }, [isCreating, selectedActivity?.id, selectedActivity]);

  const getNextActivityNumber = (category: string, saCode: string) => {
    const matchingNumbers = catalog
      .filter((item) => item.category === category && item.saCode === saCode)
      .map((item) => item.activityNumber || 0);
    return matchingNumbers.length > 0 ? Math.max(...matchingNumbers) + 1 : 1;
  };

  const startCreate = () => {
    const category = categoryFilter !== ALL ? categoryFilter : categoryOptions[0] || 'ap';
    const saCode = saFilter !== ALL ? saFilter : saOptions[0] || '';
    setIsCreating(true);
    setSelectedId('');
    setDraft({
      ...draftFromActivity(null),
      category,
      saCode,
      activityNumber: getNextActivityNumber(category, saCode),
    });
    setSaveMessage(null);
  };

  const updateDraft = <Key extends keyof ActivityCatalogDraft>(key: Key, value: ActivityCatalogDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveMessage(null);
  };

  const handleSave = async () => {
    const normalized = normalizeDraft(draft);
    if (!normalized.category || !normalized.saCode || !normalized.activityName) {
      setSaveMessage('Completeaza categoria expert, SA-ul si numele activitatii.');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const shouldCreate = isCreating
        || !selectedActivity
        || !persistedCatalogKeys.has(activityCatalogMergeKey(selectedActivity));
      const saved = shouldCreate
        ? await create(normalized)
        : await update(selectedActivity.id, normalized, selectedActivity.saCode);

      if (!saved) return;

      setLocalCatalog((current) => {
        const withoutSaved = current.filter((item) => item.id !== saved.id);
        return [...withoutSaved, saved];
      });
      setIsCreating(false);
      setSelectedId(saved.id);
      setDraft(draftFromActivity(saved));
      setSaveMessage(isCreating ? 'Activitate adaugata.' : 'Activitate salvata.');
      const changedStatus = selectedActivity && selectedActivity.isActive !== saved.isActive;
      await onAudit?.({
        actionType: isCreating
          ? 'activity_catalog_created'
          : changedStatus && saved.isActive === false
            ? 'activity_catalog_inactivated'
            : changedStatus && saved.isActive !== false
              ? 'activity_catalog_reactivated'
              : 'activity_catalog_updated',
        oldValue: selectedActivity ? JSON.stringify(selectedActivity) : '',
        newValue: JSON.stringify(saved),
        justification: isCreating ? 'Activitate adaugata in catalogul de eligibilitate.' : 'Catalog eligibilitate actualizat.',
        source: 'manual',
      });
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Activitatea nu a putut fi salvata.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportActivityCatalogCsv(catalog);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `catalog-eligibilitate-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportMessage(null);
    const text = await file.text();
    const plan = buildActivityCatalogImportPlan(text, catalog);
    setImportPlan(plan);
    setImportMessage(
      plan.errors.length > 0
        ? 'Importul are erori si nu poate fi aplicat.'
        : 'Preview import pregatit. Verifica diferentele inainte de aplicare.',
    );
  };

  const handleApplyImport = async () => {
    if (!importPlan || importPlan.errors.length > 0) return;
    const actionableDiffs = importPlan.diffs.filter((diff) => diff.action !== 'unchanged');
    if (actionableDiffs.length === 0) {
      setImportMessage('Nu exista modificari de aplicat.');
      return;
    }

    setIsImporting(true);
    setImportMessage(null);
    try {
      const savedItems: ActivityCatalog[] = [];
      for (const diff of actionableDiffs) {
        const saved = diff.action === 'create'
          ? await create(diff.row.draft)
          : await update(diff.existing!.id, diff.row.draft, diff.existing!.saCode);
        savedItems.push(saved);
      }
      setLocalCatalog((current) => {
        const savedIds = new Set(savedItems.map((item) => item.id));
        return [...current.filter((item) => !savedIds.has(item.id)), ...savedItems];
      });
      await onAudit?.({
        actionType: 'activity_catalog_imported',
        oldValue: `${importPlan.diffs.filter((diff) => diff.action === 'update').length} update-uri`,
        newValue: `${importPlan.diffs.filter((diff) => diff.action === 'create').length} activitati noi`,
        justification: 'Import catalog eligibilitate aplicat din PM.',
        source: 'import',
      });
      setImportMessage(`Import aplicat: ${savedItems.length} modificari salvate.`);
      setImportPlan(null);
    } catch (importError) {
      setImportMessage(importError instanceof Error ? importError.message : 'Importul nu a putut fi aplicat.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedActivity) return;

    const confirmed = window.confirm(`Stergi activitatea "${selectedActivity.activityName}" din catalog?`);
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      await remove(selectedActivity.id, selectedActivity.saCode);
      setLocalCatalog((current) => current.filter((item) => item.id !== selectedActivity.id));
      const nextSelection = filteredCatalog.find((item) => item.id !== selectedActivity.id);
      setSelectedId(nextSelection?.id ?? '');
      setDraft(draftFromActivity(nextSelection));
      setSaveMessage('Activitate eliminata.');
    } catch (deleteError) {
      setSaveMessage(deleteError instanceof Error ? deleteError.message : 'Activitatea nu a putut fi eliminata.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveCatalogItem = async (
    activity: ActivityCatalog,
    updates: Partial<ActivityCatalogDraft>,
    justification: string,
  ) => {
    const nextDraft = normalizeDraft({
      ...draftFromActivity(activity),
      ...updates,
    });
    const shouldCreate = !persistedCatalogKeys.has(activityCatalogMergeKey(activity));
    const saved = shouldCreate
      ? await create(nextDraft)
      : await update(activity.id, nextDraft, activity.saCode);

    setLocalCatalog((current) => {
      const savedKey = activityCatalogMergeKey(saved);
      const withoutSaved = current.filter((item) => item.id !== saved.id && activityCatalogMergeKey(item) !== savedKey);
      return [...withoutSaved, saved];
    });
    setSelectedId(saved.id);
    setIsCreating(false);
    setDraft(draftFromActivity(saved));
    await onAudit?.({
      actionType: shouldCreate ? 'activity_catalog_created' : 'activity_catalog_updated',
      oldValue: JSON.stringify(activity),
      newValue: JSON.stringify(saved),
      justification,
      source: 'manual',
    });
    return saved;
  };

  const saveNormalizedDeliverable = async (activity: ActivityCatalog, deliverableIndex: number, value: string) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const deliverables = splitCatalogDeliverables(activity.deliverables);
      deliverables[deliverableIndex] = value;
      const saved = await saveCatalogItem(
        activity,
        { deliverables: joinCatalogDeliverables(deliverables) },
        'Livrabil normalizat actualizat in catalogul de eligibilitate.',
      );
      setDeliverableDrafts((current) => {
        const next = { ...current };
        delete next[`${activity.id}:${deliverableIndex}`];
        return next;
      });
      setSaveMessage(`Livrabil salvat pentru ${saved.saCode}.`);
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Livrabilul nu a putut fi salvat.');
    } finally {
      setIsSaving(false);
    }
  };

  const addNormalizedDeliverable = async (activity: ActivityCatalog) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const deliverables = [...splitCatalogDeliverables(activity.deliverables), 'Livrabil nou'];
      const saved = await saveCatalogItem(
        activity,
        { deliverables: joinCatalogDeliverables(deliverables) },
        'Livrabil normalizat adaugat in catalogul de eligibilitate.',
      );
      setSaveMessage(`Livrabil adaugat pentru ${saved.saCode}.`);
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Livrabilul nu a putut fi adaugat.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeNormalizedDeliverable = async (activity: ActivityCatalog, deliverableIndex: number) => {
    const deliverable = splitCatalogDeliverables(activity.deliverables)[deliverableIndex] || 'acest livrabil';
    const confirmed = window.confirm(`Stergi "${deliverable}" din livrabilele normalizate?`);
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const deliverables = splitCatalogDeliverables(activity.deliverables).filter((_, index) => index !== deliverableIndex);
      const saved = await saveCatalogItem(
        activity,
        { deliverables: joinCatalogDeliverables(deliverables) },
        'Livrabil normalizat eliminat din catalogul de eligibilitate.',
      );
      setSaveMessage(`Livrabil eliminat pentru ${saved.saCode}.`);
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Livrabilul nu a putut fi eliminat.');
    } finally {
      setIsSaving(false);
    }
  };

  const baselineDraft = selectedActivity ? draftFromActivity(selectedActivity) : draftFromActivity(null);
  const selectedActivityIsPersisted = selectedActivity ? persistedCatalogKeys.has(activityCatalogMergeKey(selectedActivity)) : false;
  const hasChanges = isCreating || !areDraftsEqual(draft, baselineDraft);
  const canSave = hasChanges
    && draft.category.trim()
    && draft.saCode.trim()
    && draft.activityName.trim()
    && !isSaving;

  return (
    <div className="space-y-5">
      {mode === 'pm' && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Catalog activ</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {catalog.filter((item) => item.isActive !== false).length}
            </p>
          </div>
          <div className="rounded-md border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Inactive reactivabile</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {catalog.filter((item) => item.isActive === false).length}
            </p>
          </div>
          <div className="rounded-md border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Cazuri eligibilitate PM</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{reviewQueueDocuments.length}</p>
          </div>
        </div>
      )}

      {mode === 'pm' && (
        <div className="rounded-md border bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Import / export controlat</p>
              <p className="text-sm text-muted-foreground">
                Importul valideaza anteturile oficiale si nu sterge activitati absente din fisier.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleExportCsv}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button type="button" variant="outline" asChild>
                <label>
                  <Upload className="h-4 w-4" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
            </div>
          </div>
          {importPlan && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 text-sm md:grid-cols-3">
                <div className="rounded-md bg-white p-3">Noi: {importPlan.diffs.filter((diff) => diff.action === 'create').length}</div>
                <div className="rounded-md bg-white p-3">Actualizari: {importPlan.diffs.filter((diff) => diff.action === 'update').length}</div>
                <div className="rounded-md bg-white p-3">Neschimbate: {importPlan.diffs.filter((diff) => diff.action === 'unchanged').length}</div>
              </div>
              {[...importPlan.errors, ...importPlan.warnings].slice(0, 6).map((message) => (
                <p key={message} className={`text-sm ${importPlan.errors.includes(message) ? 'text-red-700' : 'text-amber-700'}`}>
                  {message}
                </p>
              ))}
              <div className="max-h-44 overflow-y-auto rounded-md border bg-white text-sm">
                {importPlan.diffs.filter((diff) => diff.action !== 'unchanged').slice(0, 20).map((diff) => (
                  <div key={`${diff.row.rowNumber}-${diff.row.stableKey}`} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                    <span>{diff.row.draft.saCode} · {diff.row.draft.activityName}</span>
                    <span className="text-muted-foreground">{diff.action === 'create' ? 'nou' : diff.changedFields.join(', ')}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleApplyImport} disabled={isImporting || importPlan.errors.length > 0}>
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Aplica import
                </Button>
              </div>
            </div>
          )}
          {importMessage && <p className="mt-3 text-sm text-muted-foreground">{importMessage}</p>}
        </div>
      )}

      <div className="grid gap-3 border-b border-slate-100 pb-5 lg:grid-cols-[1.2fr_0.55fr_0.55fr_0.55fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cauta activitate, SA sau descriere..."
          />
        </div>
        <Select value={categoryFilter} onValueChange={(value) => {
          setCategoryFilter(value);
          setSaFilter(ALL);
        }}>
          <SelectTrigger>
            <SelectValue placeholder="Categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toate categoriile</SelectItem>
            {categoryOptions.map((category) => (
              <SelectItem key={category} value={category}>{category.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={saFilter} onValueChange={setSaFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Subactivitate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toate SA</SelectItem>
            {saOptions.map((saCode) => (
              <SelectItem key={saCode} value={saCode}>{saCode}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toate statusurile</SelectItem>
            <SelectItem value={ACTIVE}>Active</SelectItem>
            <SelectItem value={INACTIVE}>Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Activitate noua
        </Button>
      </div>

      {error && backendCatalog.length === 0 && fallbackCatalog.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Catalogul backend nu a putut fi incarcat. Afisez catalogul local; salvarea necesita autentificare si backend activ.
        </p>
      )}

      {mode === 'pm' && (
        <div className="space-y-4 rounded-md border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-950">Editor catalog livrabile</h3>
              <p className="text-sm text-muted-foreground">
                Lucreaza pe structura din 01_Catalog_Activitati si 02_Livrabile_Normalizate.
              </p>
            </div>
            <div className="flex rounded-md border bg-slate-50 p-1">
              <Button
                type="button"
                size="sm"
                variant={editorView === 'catalog' ? 'default' : 'ghost'}
                onClick={() => setEditorView('catalog')}
                className={editorView === 'catalog' ? 'bg-[#1f3f75]' : undefined}
              >
                01 Catalog activitati
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editorView === 'deliverables' ? 'default' : 'ghost'}
                onClick={() => setEditorView('deliverables')}
                className={editorView === 'deliverables' ? 'bg-[#1f3f75]' : undefined}
              >
                02 Livrabile normalizate
              </Button>
            </div>
          </div>

          {editorView === 'catalog' ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">ID catalog</th>
                    <th className="px-3 py-2">Categorie</th>
                    <th className="px-3 py-2">SA</th>
                    <th className="px-3 py-2">Nr.</th>
                    <th className="px-3 py-2">Nume activitate</th>
                    <th className="px-3 py-2">Activ</th>
                    <th className="px-3 py-2">Livrabile</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.slice(0, 80).map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-t align-top hover:bg-slate-50 ${selectedId === item.id ? 'bg-blue-50/60' : ''}`}
                      onClick={() => {
                        setIsCreating(false);
                        setSelectedId(item.id);
                      }}
                    >
                      <td className="max-w-[13rem] truncate px-3 py-2 font-mono text-xs text-slate-500">{item.id}</td>
                      <td className="px-3 py-2">{item.category?.toUpperCase() || '-'}</td>
                      <td className="px-3 py-2">{item.saCode || '-'}</td>
                      <td className="px-3 py-2">{item.activityNumber || '-'}</td>
                      <td className="min-w-[18rem] px-3 py-2 font-medium text-slate-950">{item.activityName}</td>
                      <td className="px-3 py-2">{item.isActive === false ? 'Nu' : 'Da'}</td>
                      <td className="max-w-[24rem] px-3 py-2 text-xs text-slate-600">{item.deliverables || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCatalog.length > 80 && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Sunt afisate primele 80 randuri filtrate. Rafineaza cautarea pentru restul.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">ID catalog</th>
                    <th className="px-3 py-2">Categorie</th>
                    <th className="px-3 py-2">SA</th>
                    <th className="px-3 py-2">Nr.</th>
                    <th className="px-3 py-2">Nume activitate</th>
                    <th className="px-3 py-2">Livrabil asteptat</th>
                    <th className="px-3 py-2">Actiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.flatMap((item) => {
                    const deliverables = splitCatalogDeliverables(item.deliverables);
                    const rows = deliverables.length > 0 ? deliverables : [''];
                    return rows.map((deliverable, index) => {
                      const draftKey = `${item.id}:${index}`;
                      const value = deliverableDrafts[draftKey] ?? deliverable;
                      const isChanged = value.trim() !== deliverable.trim();
                      return (
                        <tr key={draftKey} className="border-t align-top">
                          <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs text-slate-500">{item.id}</td>
                          <td className="px-3 py-2">{item.category?.toUpperCase() || '-'}</td>
                          <td className="px-3 py-2">{item.saCode || '-'}</td>
                          <td className="px-3 py-2">{item.activityNumber || '-'}</td>
                          <td className="min-w-[18rem] px-3 py-2 text-slate-700">{item.activityName}</td>
                          <td className="min-w-[20rem] px-3 py-2">
                            <Input
                              value={value}
                              onChange={(event) => setDeliverableDrafts((current) => ({
                                ...current,
                                [draftKey]: event.target.value,
                              }))}
                              placeholder="Livrabil asteptat"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void saveNormalizedDeliverable(item, index, value)}
                                disabled={isSaving || !isChanged || !value.trim()}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              {deliverable && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void removeNormalizedDeliverable(item, index)}
                                  disabled={isSaving}
                                  className="text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {index === rows.length - 1 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void addNormalizedDeliverable(item)}
                                  disabled={isSaving}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
        <div className="min-h-[420px] border-r border-slate-100 pr-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-950">Activitati</span>
            <span className="text-muted-foreground">{filteredCatalog.length} / {catalog.length}</span>
          </div>

          <div className="max-h-[580px] space-y-2 overflow-y-auto pr-1">
            {isLoading && catalog.length === 0 ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Se incarca...
              </div>
            ) : filteredCatalog.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">
                Nu exista activitati pentru filtrul selectat.
              </p>
            ) : (
              filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(item.id);
                  }}
                  className={`w-full border-l-2 px-3 py-2 text-left text-sm transition ${
                    !isCreating && selectedId === item.id
                      ? 'border-primary bg-slate-50 text-slate-950'
                      : 'border-transparent text-slate-700 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <span className="block font-semibold">{item.activityName}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {item.saCode} · {item.category?.toUpperCase() || 'N/A'}
                    {item.description ? ' · descriere setata' : ''}
                    {' · '}{item.isActive === false ? 'Inactiva' : 'Activa'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {(selectedActivity || isCreating) ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {isCreating ? 'Activitate noua' : `${selectedActivity?.saCode} · ${selectedActivity?.category?.toUpperCase() || 'N/A'}`}
                  </p>
                  <h3 className="text-base font-bold text-slate-950">
                    {isCreating ? 'Adauga activitate in catalog' : selectedActivity?.activityName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Modificarile se salveaza in ActivityCatalog si apar automat in formularul expertilor.
                  </p>
                </div>
                {!isCreating && selectedActivity && selectedActivityIsPersisted && mode === 'admin' && (
                  <Button type="button" variant="outline" onClick={handleDelete} disabled={isSaving} className="text-red-700">
                    <Trash2 className="h-4 w-4" />
                    Elimina
                  </Button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="catalog-category" className="text-sm font-semibold text-slate-900">
                    Categoria expert
                  </label>
                  <Select value={draft.category} onValueChange={(value) => updateDraft('category', value)}>
                    <SelectTrigger id="catalog-category">
                      <SelectValue placeholder="Alege categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category} value={category}>{category.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-sa-code" className="text-sm font-semibold text-slate-900">
                    SA
                  </label>
                  <Input
                    id="catalog-sa-code"
                    value={draft.saCode}
                    onChange={(event) => updateDraft('saCode', event.target.value)}
                    placeholder="ex: SA3.2"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="catalog-activity-name" className="text-sm font-semibold text-slate-900">
                    Activitate
                  </label>
                  <Input
                    id="catalog-activity-name"
                    value={draft.activityName}
                    onChange={(event) => updateDraft('activityName', event.target.value)}
                    placeholder="Numele activitatii"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-status" className="text-sm font-semibold text-slate-900">
                    Status
                  </label>
                  <Select
                    value={draft.isActive === false ? INACTIVE : ACTIVE}
                    onValueChange={(value) => updateDraft('isActive', value === ACTIVE)}
                  >
                    <SelectTrigger id="catalog-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ACTIVE}>Activ</SelectItem>
                      <SelectItem value={INACTIVE}>Inactiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-activity-number" className="text-sm font-semibold text-slate-900">
                    Numar activitate
                  </label>
                  <Input
                    id="catalog-activity-number"
                    type="number"
                    min="0"
                    value={String(draft.activityNumber)}
                    onChange={(event) => updateDraft('activityNumber', Number(event.target.value || 0))}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-service-category" className="text-sm font-semibold text-slate-900">
                    Categorie serviciu
                  </label>
                  <Select
                    value={serviceCategorySelectValue}
                    onValueChange={(value) => {
                      if (value === CUSTOM_SERVICE_CATEGORY) {
                        setUseCustomServiceCategory(true);
                        return;
                      }
                      setUseCustomServiceCategory(false);
                      updateDraft('serviceCategory', value === EMPTY_SERVICE_CATEGORY ? '' : value);
                    }}
                  >
                    <SelectTrigger id="catalog-service-category">
                      <SelectValue placeholder="Alege categoria serviciului" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SERVICE_CATEGORY}>Fara categorie serviciu</SelectItem>
                      {serviceCategoryOptions.map((serviceCategory) => (
                        <SelectItem key={serviceCategory} value={serviceCategory}>
                          {serviceCategory}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_SERVICE_CATEGORY}>Serviciu nou / editare manuala</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomServiceCategoryInput && (
                    <Input
                      value={draft.serviceCategory}
                      onChange={(event) => updateDraft('serviceCategory', event.target.value)}
                      placeholder="Categorie serviciu noua"
                    />
                  )}
                </div>

                <label className="flex items-start gap-3 rounded-md border bg-slate-50 p-3 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    checked={Boolean(draft.requiresSameDayForSharedDeliverable)}
                    onChange={(event) => updateDraft('requiresSameDayForSharedDeliverable', event.target.checked)}
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">
                      Livrabil comun cu data obligatoriu identica
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      Bifeaza pentru sedinte, evenimente si webinarii unde expertii trebuie sa ponteze aceeasi data. Debifeaza pentru livrabile elaborate colaborativ in zile diferite.
                    </span>
                  </span>
                </label>

                {draft.category.trim().toLowerCase() === 'gdpr' && (
                  <div className="space-y-2">
                    <label htmlFor="catalog-gdpr-template" className="text-sm font-semibold text-slate-900">
                      Sablon formular GDPR
                    </label>
                    <Select
                      value={draft.gdprTemplateCode || 'GDPR_ALTE_VERIFICARI'}
                      onValueChange={(value) => updateDraft('gdprTemplateCode', value)}
                    >
                      <SelectTrigger id="catalog-gdpr-template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GDPR_TEMPLATES.map((template) => (
                          <SelectItem key={template.code} value={template.code}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Activitatea ramane definita in catalog; sablonul controleaza doar campurile, validarile si DOCX-ul.
                    </p>
                  </div>
                )}
              </div>

              {mode === 'pm' && selectedActivity && (
                <div className="grid gap-3 rounded-md border bg-slate-50 p-4 text-sm md:grid-cols-3">
                  <div>
                    <p className="font-semibold text-slate-950">Impact pontaj</p>
                    <p className="text-muted-foreground">{selectedImpact.activities.length} activitati raportate in luna selectata.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">Impact documente</p>
                    <p className="text-muted-foreground">{selectedImpact.documents.length} documente legate de verificari eligibilitate.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">Livrabile asteptate</p>
                    <p className="text-muted-foreground">{selectedActivity.deliverables || 'Nespecificat'}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="activity-standard-description" className="text-sm font-semibold text-slate-900">
                  Descriere activitate
                </label>
                <Textarea
                  id="activity-standard-description"
                  value={draft.description ?? ''}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  rows={10}
                  placeholder="Text standard pentru formular..."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="catalog-objectives" className="text-sm font-semibold text-slate-900">
                    Obiective
                  </label>
                  <Textarea
                    id="catalog-objectives"
                    value={draft.objectives ?? ''}
                    onChange={(event) => updateDraft('objectives', event.target.value)}
                    rows={5}
                    placeholder="Obiectivele activitatii..."
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-service-component" className="text-sm font-semibold text-slate-900">
                    Componenta serviciului
                  </label>
                  <Textarea
                    id="catalog-service-component"
                    value={draft.serviceComponent ?? ''}
                    onChange={(event) => updateDraft('serviceComponent', event.target.value)}
                    rows={5}
                    placeholder="Componenta serviciului..."
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-beneficiaries" className="text-sm font-semibold text-slate-900">
                    Beneficiari
                  </label>
                  <Textarea
                    id="catalog-beneficiaries"
                    value={draft.beneficiaries ?? ''}
                    onChange={(event) => updateDraft('beneficiaries', event.target.value)}
                    rows={4}
                    placeholder="Beneficiarii activitatii..."
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-expected-results" className="text-sm font-semibold text-slate-900">
                    Rezultate asteptate
                  </label>
                  <Textarea
                    id="catalog-expected-results"
                    value={draft.expectedResults ?? ''}
                    onChange={(event) => updateDraft('expectedResults', event.target.value)}
                    rows={4}
                    placeholder="Rezultatele asteptate..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="catalog-deliverables" className="text-sm font-semibold text-slate-900">
                      Livrabile
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant={isCatalogDeliverableNotApplicable(draft.deliverables) ? 'default' : 'outline'}
                      onClick={() => updateDraft(
                        'deliverables',
                        isCatalogDeliverableNotApplicable(draft.deliverables)
                          ? ''
                          : NO_DELIVERABLE_CATALOG_MARKER,
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isCatalogDeliverableNotApplicable(draft.deliverables)
                        ? 'Eligibila fara livrabil'
                        : 'Marcheaza fara livrabil'}
                    </Button>
                  </div>
                  <Textarea
                    id="catalog-deliverables"
                    value={draft.deliverables ?? ''}
                    onChange={(event) => updateDraft('deliverables', event.target.value)}
                    rows={4}
                    placeholder="Livrabile asociate..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Valoarea exacta N/A marcheaza activitatea ca eligibila fara livrabil. Exceptiile existente raman active.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="catalog-indicators" className="text-sm font-semibold text-slate-900">
                    Indicatori
                  </label>
                  <Textarea
                    id="catalog-indicators"
                    value={draft.indicators ?? ''}
                    onChange={(event) => updateDraft('indicators', event.target.value)}
                    rows={4}
                    placeholder="Indicatori de realizare..."
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {saveMessage || (hasChanges ? 'Modificari nesalvate.' : 'Activitate sincronizata.')}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setDraft(draftFromActivity(selectedActivity));
                      setSaveMessage(null);
                    }}
                    disabled={isSaving || (!isCreating && !hasChanges)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reseteaza
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={!canSave}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salveaza
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              {error ? 'Catalogul nu a putut fi incarcat.' : 'Selecteaza o activitate sau adauga una noua.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityDescriptionEditor({ fallbackCatalog = [] }: { fallbackCatalog?: ActivityCatalog[] }) {
  return <ActivityCatalogGovernancePanel fallbackCatalog={fallbackCatalog} mode="admin" />;
}
