'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, RotateCcw, Save, SearchIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActivityCatalog, useActivityCatalogMutations } from '@/hooks/use-backend-data';
import type { ActivityCatalog } from '@/lib/types';
import { activityCatalogMergeKey, mergeActivityCatalogs } from '@/lib/activity-catalog-merge';

const ALL = 'all';
const ACTIVE = 'active';
const INACTIVE = 'inactive';
const FALLBACK_CATEGORIES = ['ap', 'com', 'gdpr', 'gt', 'pm'];

type ActivityCatalogDraft = Omit<ActivityCatalog, 'id' | 'createdAt'>;

interface ActivityDescriptionEditorProps {
  fallbackCatalog?: ActivityCatalog[];
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

function draftFromActivity(activity?: ActivityCatalog | null): ActivityCatalogDraft {
  return {
    category: activity?.category ?? '',
    saCode: activity?.saCode ?? '',
    serviceCategory: activity?.serviceCategory ?? '',
    activityNumber: activity?.activityNumber ?? 0,
    activityName: activity?.activityName ?? '',
    isActive: activity?.isActive ?? true,
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
    serviceCategory: draft.serviceCategory.trim(),
    activityNumber: Number.isFinite(Number(draft.activityNumber)) ? Number(draft.activityNumber) : 0,
    activityName: draft.activityName.trim(),
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

export function ActivityDescriptionEditor({ fallbackCatalog = [] }: ActivityDescriptionEditorProps) {
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
      setCategoryFilter(ALL);
      setSaFilter(ALL);
      setDraft(draftFromActivity(saved));
      setSaveMessage(isCreating ? 'Activitate adaugata.' : 'Activitate salvata.');
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Activitatea nu a putut fi salvata.');
    } finally {
      setIsSaving(false);
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
                {!isCreating && selectedActivity && selectedActivityIsPersisted && (
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
                  <Input
                    id="catalog-service-category"
                    value={draft.serviceCategory}
                    onChange={(event) => updateDraft('serviceCategory', event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

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
                  <label htmlFor="catalog-deliverables" className="text-sm font-semibold text-slate-900">
                    Livrabile
                  </label>
                  <Textarea
                    id="catalog-deliverables"
                    value={draft.deliverables ?? ''}
                    onChange={(event) => updateDraft('deliverables', event.target.value)}
                    rows={4}
                    placeholder="Livrabile asociate..."
                  />
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
