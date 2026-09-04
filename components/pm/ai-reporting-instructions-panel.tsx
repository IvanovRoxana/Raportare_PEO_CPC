'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Save, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useExpertMutations, useExperts } from '@/hooks/use-backend-data';
import { expertIdentityKey } from '@/lib/expert-merge';
import type { Expert } from '@/lib/types';

interface AiReportingInstructionsPanelProps {
  experts: Expert[];
  actorName?: string;
  onSaved?: () => Promise<unknown> | unknown;
  onAudit?: (input: {
    actionType: string;
    oldValue?: string;
    newValue?: string;
    justification: string;
    source: 'manual' | 'import' | 'eligibility_review';
  }) => Promise<unknown>;
}

export function AiReportingInstructionsPanel({
  experts,
  actorName,
  onSaved,
  onAudit,
}: AiReportingInstructionsPanelProps) {
  const { experts: persistedExperts } = useExperts({ includeInactive: true, includeFallback: false });
  const { create, update } = useExpertMutations();
  const [query, setQuery] = useState('');
  const [selectedExpertId, setSelectedExpertId] = useState(experts[0]?.id ?? '');
  const [draft, setDraft] = useState(experts[0]?.aiReportingInstructions ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sortedExperts = useMemo(
    () => [...experts].sort((left, right) => left.name.localeCompare(right.name)),
    [experts],
  );

  const filteredExperts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedExperts;
    return sortedExperts.filter((expert) => (
      expert.name.toLowerCase().includes(normalizedQuery)
      || (expert.email || '').toLowerCase().includes(normalizedQuery)
      || (expert.category || '').toLowerCase().includes(normalizedQuery)
      || (expert.positionInProject || '').toLowerCase().includes(normalizedQuery)
    ));
  }, [query, sortedExperts]);

  const selectedExpert = sortedExperts.find((expert) => expert.id === selectedExpertId) ?? sortedExperts[0] ?? null;
  const savedInstructions = selectedExpert?.aiReportingInstructions ?? '';
  const hasChanges = draft.trim() !== savedInstructions.trim();
  const persistedExpertsByKey = useMemo(
    () => new Map(persistedExperts.map((expert) => [expertIdentityKey(expert), expert])),
    [persistedExperts],
  );

  useEffect(() => {
    if (selectedExpertId || !sortedExperts[0]) return;
    setSelectedExpertId(sortedExperts[0].id);
    setDraft(sortedExperts[0].aiReportingInstructions ?? '');
  }, [selectedExpertId, sortedExperts]);

  const selectExpert = (expert: Expert) => {
    setSelectedExpertId(expert.id);
    setDraft(expert.aiReportingInstructions ?? '');
    setMessage(null);
  };

  const saveInstructions = async () => {
    if (!selectedExpert) return;
    const nextInstructions = draft.trim();
    const persistedExpert = persistedExpertsByKey.get(expertIdentityKey(selectedExpert));
    setIsSaving(true);
    setMessage(null);
    try {
      if (persistedExpert) {
        await update(persistedExpert.id, { aiReportingInstructions: nextInstructions });
      } else {
        const { id: _fallbackId, ...expertCreateInput } = selectedExpert;
        await create({
          ...expertCreateInput,
          aiReportingInstructions: nextInstructions,
        });
      }
      await onAudit?.({
        actionType: 'user_ai_reporting_instructions_updated',
        oldValue: savedInstructions,
        newValue: nextInstructions,
        justification: `Instructiuni AI pentru raportare actualizate din PM pentru ${selectedExpert.name}.`,
        source: 'manual',
      });
      await onSaved?.();
      setMessage(`Instructiunile AI pentru ${selectedExpert.name} au fost actualizate.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Actualizarea instructiunilor AI a esuat.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-md border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <Bot className="h-5 w-5 text-primary" />
            Prompturi AI pentru raportare
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Instructiuni PM per expert pentru generarea descrierilor, fara sa suprascrie catalogul sau eligibilitatea.
          </p>
        </div>
        {actorName ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
            Editor: {actorName}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Cauta expert..."
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded-md border">
            {filteredExperts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nu exista experti pentru filtrul curent.</p>
            ) : filteredExperts.map((expert) => (
              <button
                key={expert.id}
                type="button"
                onClick={() => selectExpert(expert)}
                className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                  selectedExpert?.id === expert.id ? 'bg-blue-50 text-slate-950' : 'hover:bg-slate-50'
                }`}
              >
                <span className="block font-semibold">{expert.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {expert.positionInProject || expert.role || 'Expert'}
                  {expert.aiReportingInstructions?.trim() ? ' · prompt setat' : ' · fara prompt dedicat'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {selectedExpert ? (
            <>
              <div className="rounded-md border bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-950">{selectedExpert.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[selectedExpert.positionInProject, selectedExpert.category, selectedExpert.email].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={12}
                placeholder="Ex: Pentru acest expert, descrierile trebuie sa sublinieze analiza de politici publice, sinteza pentru membri si formularea de recomandari. Evita formulari despre organizare evenimente daca livrabilul nu sustine explicit acest lucru."
              />
              <p className="text-xs text-muted-foreground">
                Aceste instructiuni ajusteaza stilul si accentul descrierii. Nu pot suprascrie scopul SA, catalogul PM, eligibilitatea sau continutul livrabilelor.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {message || (hasChanges ? 'Modificari nesalvate.' : 'Prompt sincronizat.')}
                </p>
                <Button type="button" onClick={saveInstructions} disabled={!hasChanges || isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salveaza prompt
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground">
              Selecteaza un expert pentru a configura promptul AI.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
