'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, RotateCcw, Save, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActivityCatalog, useActivityCatalogMutations } from '@/hooks/use-backend-data';
import type { ActivityCatalog } from '@/lib/types';

const ALL = 'all';

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
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function ActivityDescriptionEditor({ fallbackCatalog = [] }: ActivityDescriptionEditorProps) {
  const { catalog: backendCatalog, isLoading, error } = useActivityCatalog();
  const { updateDescription } = useActivityCatalogMutations();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [saFilter, setSaFilter] = useState(ALL);
  const [selectedId, setSelectedId] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const catalog = backendCatalog.length > 0 ? backendCatalog : fallbackCatalog;

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(catalog.map((item) => item.category).filter(Boolean))).sort();
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
      return matchesCategory && matchesSa && matchesCatalogSearch(item, query);
    });
  }, [catalog, categoryFilter, query, saFilter]);

  const selectedActivity = useMemo(() => {
    return catalog.find((item) => item.id === selectedId) ?? null;
  }, [catalog, selectedId]);

  useEffect(() => {
    if (filteredCatalog.length === 0) {
      setSelectedId('');
      return;
    }

    if (!filteredCatalog.some((item) => item.id === selectedId)) {
      setSelectedId(filteredCatalog[0].id);
    }
  }, [filteredCatalog, selectedId]);

  useEffect(() => {
    setDraftDescription(selectedActivity?.description ?? '');
    setSaveMessage(null);
  }, [selectedActivity?.id, selectedActivity?.description]);

  const handleSave = async () => {
    if (!selectedActivity) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      await updateDescription(selectedActivity.id, draftDescription);
      setSaveMessage('Descriere salvata.');
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Descrierea nu a putut fi salvata.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentDescription = selectedActivity?.description ?? '';
  const hasChanges = draftDescription !== currentDescription;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 border-b border-slate-100 pb-5 lg:grid-cols-[1.2fr_0.55fr_0.55fr]">
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
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
        <div className="min-h-[420px] border-r border-slate-100 pr-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-950">Activitati</span>
            <span className="text-muted-foreground">{filteredCatalog.length} / {catalog.length}</span>
          </div>

          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
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
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full border-l-2 px-3 py-2 text-left text-sm transition ${
                    selectedId === item.id
                      ? 'border-primary bg-slate-50 text-slate-950'
                      : 'border-transparent text-slate-700 hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <span className="block font-semibold">{item.activityName}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {item.saCode} · {item.category?.toUpperCase() || 'N/A'}
                    {item.description ? ' · descriere setata' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedActivity ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {selectedActivity.saCode} · {selectedActivity.category?.toUpperCase() || 'N/A'}
                </p>
                <h3 className="text-base font-bold text-slate-950">{selectedActivity.activityName}</h3>
                <p className="text-sm text-muted-foreground">{selectedActivity.serviceCategory || 'Fara categorie serviciu'}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="activity-standard-description" className="text-sm font-semibold text-slate-900">
                  Descriere activitate
                </label>
                <Textarea
                  id="activity-standard-description"
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  rows={12}
                  placeholder="Text standard pentru formular..."
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  {saveMessage || (hasChanges ? 'Modificari nesalvate.' : 'Descriere sincronizata.')}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDraftDescription(currentDescription)}
                    disabled={!hasChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reseteaza
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={!hasChanges || isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salveaza
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              {error ? 'Catalogul nu a putut fi incarcat.' : 'Selecteaza o activitate.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
