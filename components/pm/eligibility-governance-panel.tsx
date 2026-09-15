'use client';

import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { AiReportingInstructionsPanel } from '@/components/pm/ai-reporting-instructions-panel';
import { PeoEligibilityAgentPanel } from '@/components/pm/peo-eligibility-agent-panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  useAiEligibilityRuleVersions,
  useAiEligibilityRulesetMutations,
  useAiEligibilityRulesets,
} from '@/hooks/use-backend-data';
import { isActivePmUnlockRequest } from '@/lib/pm-unlock-status';
import type { DocumentMetadata, Expert } from '@/lib/types';

interface EligibilityGovernancePanelProps {
  documents: DocumentMetadata[];
  experts: Expert[];
  actorName?: string;
  onExpertsChanged?: () => Promise<unknown> | unknown;
  onAudit?: (input: {
    actionType: string;
    oldValue?: string;
    newValue?: string;
    justification: string;
    source: 'manual' | 'import' | 'eligibility_review';
  }) => Promise<unknown>;
}

function stringifyRules(value: unknown) {
  if (!value) return '{\n  "thresholds": {},\n  "rubric": {}\n}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function EligibilityGovernancePanel({
  documents,
  experts,
  actorName,
  onExpertsChanged,
  onAudit,
}: EligibilityGovernancePanelProps) {
  const { rulesets, activeRuleset, isLoading } = useAiEligibilityRulesets();
  const { createDraft, updateDraft, publish, rollbackToVersion } = useAiEligibilityRulesetMutations();
  const selectedRuleset = rulesets.find((ruleset) => ruleset.status === 'draft') ?? activeRuleset ?? rulesets[0] ?? null;
  const { versions } = useAiEligibilityRuleVersions(selectedRuleset?.id ?? null);
  const [title, setTitle] = useState('');
  const [rulesJsonText, setRulesJsonText] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTitle(selectedRuleset?.title ?? 'Reguli eligibilitate PEO');
    setRulesJsonText(stringifyRules(selectedRuleset?.rulesJson));
    setChangeReason(selectedRuleset?.changeReason ?? '');
    setMessage(null);
  }, [selectedRuleset?.id]);

  const reviewQueue = useMemo(() => {
    return documents.filter((document) => {
      const check = document.eligibilityCheck;
      return check?.status === 'neeligibil'
        || check?.status === 'neconcludent'
        || isActivePmUnlockRequest(check);
    });
  }, [documents]);

  const saveDraft = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const parsedRules = JSON.parse(rulesJsonText);
      const saved = selectedRuleset
        ? await updateDraft(selectedRuleset.id, {
            title,
            rulesJson: parsedRules,
            changeReason,
            updatedBy: actorName,
          })
        : await createDraft({
            title,
            rulesJson: parsedRules,
            actorName,
            changeReason,
          });
      await onAudit?.({
        actionType: 'ai_eligibility_ruleset_updated',
        oldValue: selectedRuleset ? JSON.stringify(selectedRuleset.rulesJson) : '',
        newValue: JSON.stringify(saved.rulesJson),
        justification: changeReason || 'Draft reguli eligibilitate salvat.',
        source: 'manual',
      });
      setMessage('Draft salvat.');
    } catch (error) {
      setMessage(error instanceof SyntaxError ? 'JSON-ul regulilor nu este valid.' : 'Regulile nu au putut fi salvate.');
    } finally {
      setIsSaving(false);
    }
  };

  const publishRuleset = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const parsedRules = JSON.parse(rulesJsonText);
      const saved = selectedRuleset
        ? await updateDraft(selectedRuleset.id, {
            title,
            rulesJson: parsedRules,
            changeReason,
            updatedBy: actorName,
          })
        : await createDraft({
            title,
            rulesJson: parsedRules,
            actorName,
            changeReason,
          });
      const published = await publish(saved, activeRuleset, actorName);
      await onAudit?.({
        actionType: 'ai_eligibility_ruleset_published',
        oldValue: activeRuleset ? JSON.stringify(activeRuleset.rulesJson) : '',
        newValue: JSON.stringify(published.rulesJson),
        justification: changeReason || 'Reguli eligibilitate publicate.',
        source: 'manual',
      });
      setMessage('Reguli publicate. Verificarile noi vor primi versiunea activa.');
    } catch (error) {
      setMessage(error instanceof SyntaxError ? 'JSON-ul regulilor nu este valid.' : 'Regulile nu au putut fi publicate.');
    } finally {
      setIsSaving(false);
    }
  };

  const rollback = async (versionId: string) => {
    if (!selectedRuleset) return;
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const saved = await rollbackToVersion(selectedRuleset, version, actorName);
      await onAudit?.({
        actionType: 'ai_eligibility_ruleset_rollback',
        oldValue: JSON.stringify(selectedRuleset.rulesJson),
        newValue: JSON.stringify(saved.rulesJson),
        justification: `Rollback la versiunea ${version.version}.`,
        source: 'manual',
      });
      setMessage(`Rollback aplicat la versiunea ${version.version}.`);
    } catch {
      setMessage('Rollback-ul nu a putut fi aplicat.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PeoEligibilityAgentPanel />

      <AiReportingInstructionsPanel
        experts={experts}
        actorName={actorName}
        onSaved={onExpertsChanged}
        onAudit={onAudit}
      />

      <section className="rounded-md border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Cazuri de eligibilitate pentru PM</h2>
            <p className="text-sm text-muted-foreground">
              {reviewQueue.length} documente sunt neeligibile, neconcludente sau asteapta deblocare PM.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 max-h-60 overflow-y-auto rounded-md border">
          {reviewQueue.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nu exista cazuri deschise in luna selectata.</p>
          ) : reviewQueue.map((document) => (
            <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0">
              <span className="font-medium text-slate-950">{document.originalFileName || document.id}</span>
              <span className="text-muted-foreground">
                {document.eligibilityCheck?.status || 'fara status'}
                {document.eligibilityCheck?.pmUnlockRequested && !document.eligibilityCheck?.pmUnlockApproved ? ' · deblocare solicitata' : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Reguli eligibilitate versionate</h2>
            <p className="text-sm text-muted-foreground">
              Versiune activa: {activeRuleset ? `${activeRuleset.title} v${activeRuleset.version}` : 'default-code-rules-v1'}
            </p>
          </div>
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlu ruleset" />
            <Textarea
              value={rulesJsonText}
              onChange={(event) => setRulesJsonText(event.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder="rulesJson"
            />
            <Input
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder="Motiv schimbare"
            />
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={saveDraft} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salveaza draft
              </Button>
              <Button type="button" onClick={publishRuleset} disabled={isSaving || !title.trim()}>
                <ShieldCheck className="h-4 w-4" />
                Publica
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-slate-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <History className="h-4 w-4" />
              Versiuni
            </div>
            <div className="space-y-2">
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu exista versiuni publicate pentru ruleset.</p>
              ) : versions.map((version) => (
                <div key={version.id} className="rounded-md bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">v{version.version}</span>
                    <span className="text-muted-foreground">{version.status}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => rollback(version.id)}
                    disabled={isSaving}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Rollback
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
