'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, GitBranch, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useReportingWorkBlockActivityOptions,
  useReportingWorkBlockDeliverableOptions,
  useReportingWorkBlockDraft,
} from '@/hooks/use-backend-data';
import type {
  ReportingFlowType,
  ReportingWorkBlockBundle,
} from '@/lib/activity-report/work-blocks';
import type { Activity } from '@/lib/types';

const REPORTING_FLOW_TYPES: { value: ReportingFlowType; label: string }[] = [
  { value: 'deliverable', label: 'Livrabil' },
  { value: 'meeting', label: 'Reuniune' },
  { value: 'event', label: 'Eveniment' },
  { value: 'consultation', label: 'Consultare' },
  { value: 'project_coordination', label: 'Coordonare proiect' },
  { value: 'administrative', label: 'Administrativ' },
  { value: 'report_preparation', label: 'Pregatire raport' },
  { value: 'other', label: 'Alt flux' },
];

type WorkBlockDraftSessionState = {
  title: string;
  saCode: string;
  reportingFlowType: ReportingFlowType;
  selectedActivityIds: string[];
  allocatedHoursByActivityId: Record<string, number>;
  selectedDeliverableIds: string[];
};

function areSameStringList(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function createEmptyDraftSessionState(): WorkBlockDraftSessionState {
  return {
    title: '',
    saCode: '',
    reportingFlowType: 'deliverable',
    selectedActivityIds: [],
    allocatedHoursByActivityId: {},
    selectedDeliverableIds: [],
  };
}

function createDraftSessionStateFromBundle(bundle: ReportingWorkBlockBundle): WorkBlockDraftSessionState {
  return {
    title: bundle.workBlock.title,
    saCode: bundle.workBlock.saCode,
    reportingFlowType: bundle.workBlock.reportingFlowType,
    selectedActivityIds: bundle.activityLinks.map((link) => link.activityId),
    allocatedHoursByActivityId: Object.fromEntries(
      bundle.activityLinks.map((link) => [link.activityId, link.allocatedHours])
    ),
    selectedDeliverableIds: bundle.deliverableLinks.map((link) => link.deliverableId),
  };
}

function serializeDraftSessionState(state: WorkBlockDraftSessionState) {
  return JSON.stringify(state);
}

interface ReportingWorkBlockDraftPanelProps {
  expertId: string;
  projectCode: string;
  month: number;
  year: number;
  activities: Activity[];
  existingBundles?: ReportingWorkBlockBundle[];
  existingBundlesLoading?: boolean;
  editingWorkBlockId?: string;
}

export function ReportingWorkBlockDraftPanel({
  expertId,
  projectCode,
  month,
  year,
  activities,
  existingBundles = [],
  existingBundlesLoading = false,
  editingWorkBlockId,
}: ReportingWorkBlockDraftPanelProps) {
  const [title, setTitle] = useState('');
  const [saCode, setSaCode] = useState('');
  const [reportingFlowType, setReportingFlowType] = useState<ReportingFlowType>('deliverable');
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [allocatedHoursByActivityId, setAllocatedHoursByActivityId] = useState<Record<string, number>>({});
  const [selectedDeliverableIds, setSelectedDeliverableIds] = useState<string[]>([]);
  const [lastSavedSessionDraft, setLastSavedSessionDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveDraftError, setSaveDraftError] = useState<string | null>(null);
  const [saveDraftSuccess, setSaveDraftSuccess] = useState(false);
  const [selectedWorkBlockId, setSelectedWorkBlockId] = useState(editingWorkBlockId ?? 'new');
  const effectiveEditingWorkBlockId = selectedWorkBlockId === 'new' ? undefined : selectedWorkBlockId;
  const selectedEditingBundle = useMemo(() => (
    existingBundles.find((bundle) => bundle.workBlock.id === effectiveEditingWorkBlockId)
  ), [effectiveEditingWorkBlockId, existingBundles]);
  const storageKey = useMemo(() => (
    `reporting-work-block-draft:${expertId}:${projectCode}:${year}:${month}:${effectiveEditingWorkBlockId ?? 'new'}`
  ), [effectiveEditingWorkBlockId, expertId, month, projectCode, year]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const { prepareDraft, prepareSaveDraft, saveDraft } = useReportingWorkBlockDraft();
  const {
    options: activityOptions,
    unallocatedActivityCount,
    unallocatedHoursTotal,
  } = useReportingWorkBlockActivityOptions(activities, existingBundles, effectiveEditingWorkBlockId);
  const {
    options: deliverableOptions,
    unassociatedDeliverableCount,
  } = useReportingWorkBlockDeliverableOptions(activities, existingBundles, effectiveEditingWorkBlockId);
  const availableActivityIds = useMemo(() => (
    new Set(activityOptions.map((option) => option.activityId))
  ), [activityOptions]);
  const availableDeliverableIds = useMemo(() => (
    new Set(deliverableOptions.map((option) => option.deliverableId))
  ), [deliverableOptions]);

  const draftPreview = useMemo(() => prepareDraft({
    id: effectiveEditingWorkBlockId,
    expertId,
    projectCode,
    month,
    year,
    title,
    saCode,
    reportingFlowType,
    activityIds: selectedActivityIds,
    allocatedHoursByActivityId,
    deliverableIds: selectedDeliverableIds,
    existingBundles,
  }, activities), [
    activities,
    allocatedHoursByActivityId,
    effectiveEditingWorkBlockId,
    existingBundles,
    expertId,
    month,
    projectCode,
    reportingFlowType,
    saCode,
    selectedActivityIds,
    selectedDeliverableIds,
    title,
    year,
  ]);
  const saveDraftPreview = useMemo(() => prepareSaveDraft({
    id: effectiveEditingWorkBlockId,
    expertId,
    projectCode,
    month,
    year,
    title,
    saCode,
    reportingFlowType,
    activityIds: selectedActivityIds,
    allocatedHoursByActivityId,
    deliverableIds: selectedDeliverableIds,
    existingBundles,
  }, activities), [
    activities,
    allocatedHoursByActivityId,
    effectiveEditingWorkBlockId,
    existingBundles,
    expertId,
    month,
    prepareSaveDraft,
    projectCode,
    reportingFlowType,
    saCode,
    selectedActivityIds,
    selectedDeliverableIds,
    title,
    year,
  ]);

  const selectedHours = draftPreview.bundle
    ? draftPreview.bundle.activityLinks.reduce((sum, link) => sum + link.allocatedHours, 0)
    : 0;
  const sessionDraft = useMemo<WorkBlockDraftSessionState>(() => ({
    title,
    saCode,
    reportingFlowType,
    selectedActivityIds,
    allocatedHoursByActivityId,
    selectedDeliverableIds,
  }), [
    allocatedHoursByActivityId,
    reportingFlowType,
    saCode,
    selectedActivityIds,
    selectedDeliverableIds,
    title,
  ]);
  const serializedSessionDraft = useMemo(() => (
    serializeDraftSessionState(sessionDraft)
  ), [sessionDraft]);
  const hasUnsavedSessionChanges = hydratedStorageKey === storageKey
    && lastSavedSessionDraft !== ''
    && serializedSessionDraft !== lastSavedSessionDraft;
  const isReadyForControlledSave = saveDraftPreview.canSave
    && !hasUnsavedSessionChanges;
  const isWaitingForSelectedBundle = Boolean(
    effectiveEditingWorkBlockId && !selectedEditingBundle && existingBundlesLoading
  );
  const controlledSaveLabel = draftPreview.issues.length > 0
    ? 'Finalizeaza validarile'
    : hasUnsavedSessionChanges
      ? 'Sincronizare sesiune'
      : isSavingDraft
        ? 'Se salveaza'
      : 'Pregatit pentru salvare';

  useEffect(() => {
    setHydratedStorageKey(null);

    const rawDraft = window.sessionStorage.getItem(storageKey);
    if (!rawDraft) {
      const initialDraft = selectedEditingBundle
        ? createDraftSessionStateFromBundle(selectedEditingBundle)
        : createEmptyDraftSessionState();
      setTitle(initialDraft.title);
      setSaCode(initialDraft.saCode);
      setReportingFlowType(initialDraft.reportingFlowType);
      setSelectedActivityIds(initialDraft.selectedActivityIds);
      setAllocatedHoursByActivityId(initialDraft.allocatedHoursByActivityId);
      setSelectedDeliverableIds(initialDraft.selectedDeliverableIds);
      setLastSavedSessionDraft(serializeDraftSessionState(initialDraft));
      setHydratedStorageKey(storageKey);
      return;
    }

    try {
      const parsedDraft = JSON.parse(rawDraft) as Partial<WorkBlockDraftSessionState>;
      const hydratedDraft: WorkBlockDraftSessionState = {
        title: typeof parsedDraft.title === 'string' ? parsedDraft.title : '',
        saCode: typeof parsedDraft.saCode === 'string' ? parsedDraft.saCode : '',
        reportingFlowType: REPORTING_FLOW_TYPES.some((item) => item.value === parsedDraft.reportingFlowType)
        ? parsedDraft.reportingFlowType as ReportingFlowType
        : 'deliverable',
        selectedActivityIds: Array.isArray(parsedDraft.selectedActivityIds) ? parsedDraft.selectedActivityIds : [],
        allocatedHoursByActivityId: parsedDraft.allocatedHoursByActivityId && typeof parsedDraft.allocatedHoursByActivityId === 'object'
          ? parsedDraft.allocatedHoursByActivityId
          : {},
        selectedDeliverableIds: Array.isArray(parsedDraft.selectedDeliverableIds) ? parsedDraft.selectedDeliverableIds : [],
      };
      setTitle(hydratedDraft.title);
      setSaCode(hydratedDraft.saCode);
      setReportingFlowType(hydratedDraft.reportingFlowType);
      setSelectedActivityIds(hydratedDraft.selectedActivityIds);
      setAllocatedHoursByActivityId(hydratedDraft.allocatedHoursByActivityId);
      setSelectedDeliverableIds(hydratedDraft.selectedDeliverableIds);
      setLastSavedSessionDraft(serializeDraftSessionState(hydratedDraft));
    } catch {
      window.sessionStorage.removeItem(storageKey);
      setLastSavedSessionDraft('');
    } finally {
      setHydratedStorageKey(storageKey);
    }
  }, [selectedEditingBundle, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) {
      return;
    }

    setSelectedActivityIds((current) => {
      const next = current.filter((activityId) => availableActivityIds.has(activityId));
      return areSameStringList(current, next) ? current : next;
    });
    setAllocatedHoursByActivityId((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([activityId]) => availableActivityIds.has(activityId))
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setSelectedDeliverableIds((current) => {
      const next = current.filter((deliverableId) => availableDeliverableIds.has(deliverableId));
      return areSameStringList(current, next) ? current : next;
    });
  }, [availableActivityIds, availableDeliverableIds, hydratedStorageKey, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) {
      return;
    }

    if (serializedSessionDraft === lastSavedSessionDraft) {
      return;
    }

    window.sessionStorage.setItem(storageKey, serializedSessionDraft);
    setLastSavedSessionDraft(serializedSessionDraft);
  }, [
    hydratedStorageKey,
    lastSavedSessionDraft,
    serializedSessionDraft,
    storageKey,
  ]);

  const toggleActivity = (activityId: string, checked: boolean, defaultHours: number) => {
    setSelectedActivityIds((current) => (
      checked ? [...new Set([...current, activityId])] : current.filter((id) => id !== activityId)
    ));
    setAllocatedHoursByActivityId((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[activityId];
        return next;
      }
      return { ...current, [activityId]: current[activityId] ?? defaultHours };
    });
  };

  const toggleDeliverable = (deliverableId: string, checked: boolean) => {
    setSelectedDeliverableIds((current) => (
      checked ? [...new Set([...current, deliverableId])] : current.filter((id) => id !== deliverableId)
    ));
  };

  const applyDraftSessionState = (draft: WorkBlockDraftSessionState) => {
    setTitle(draft.title);
    setSaCode(draft.saCode);
    setReportingFlowType(draft.reportingFlowType);
    setSelectedActivityIds(draft.selectedActivityIds);
    setAllocatedHoursByActivityId(draft.allocatedHoursByActivityId);
    setSelectedDeliverableIds(draft.selectedDeliverableIds);
    setLastSavedSessionDraft(serializeDraftSessionState(draft));
    setSaveDraftError(null);
    setSaveDraftSuccess(false);
  };

  const resetDraft = () => {
    window.sessionStorage.removeItem(storageKey);
    applyDraftSessionState(createEmptyDraftSessionState());
    setSelectedWorkBlockId('new');
  };

  const handleSaveDraft = async () => {
    if (!isReadyForControlledSave || isSavingDraft) {
      return;
    }

    setIsSavingDraft(true);
    setSaveDraftError(null);
    setSaveDraftSuccess(false);

    try {
      const savedBundle = await saveDraft({
        id: effectiveEditingWorkBlockId,
        expertId,
        projectCode,
        month,
        year,
        title,
        saCode,
        reportingFlowType,
        activityIds: selectedActivityIds,
        allocatedHoursByActivityId,
        deliverableIds: selectedDeliverableIds,
        existingBundles,
      }, activities);
      window.sessionStorage.removeItem(storageKey);
      applyDraftSessionState(createEmptyDraftSessionState());
      setSelectedWorkBlockId(savedBundle.workBlock.id ?? 'new');
      setSaveDraftSuccess(true);
    } catch (error) {
      setSaveDraftError(error instanceof Error ? error.message : 'Nu am putut salva draftul work block.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Draft work block
        </CardTitle>
        <CardDescription>
          Pregateste local un flux raportabil. Draftul ramane doar in sesiunea browserului.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Activitati cu ore ramase" value={unallocatedActivityCount} />
          <Metric label="Ore nealocate" value={unallocatedHoursTotal} />
          <Metric label="Livrabile neasociate" value={unassociatedDeliverableCount} />
          <Metric label="Ore in draft" value={selectedHours} />
        </div>

        {existingBundles.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Editare work block</label>
            <Select
              value={selectedWorkBlockId}
              onValueChange={(value) => {
                setSelectedWorkBlockId(value);
                setSaveDraftError(null);
                setSaveDraftSuccess(false);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Draft nou</SelectItem>
                {existingBundles.map((bundle) => (
                  <SelectItem key={bundle.workBlock.id} value={bundle.workBlock.id}>
                    {bundle.workBlock.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="work-block-title">Titlu</label>
            <Input
              id="work-block-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex. Analiza acte normative iunie"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="work-block-sa">SA</label>
            <Input
              id="work-block-sa"
              value={saCode}
              onChange={(event) => setSaCode(event.target.value)}
              placeholder="SA3.4"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tip flux</label>
            <Select value={reportingFlowType} onValueChange={(value) => setReportingFlowType(value as ReportingFlowType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTING_FLOW_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Activitati</h3>
              <p className="text-xs text-muted-foreground">Selecteaza zilele si orele alocate acestui flux.</p>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border p-2">
              {activityOptions.length === 0 ? (
                <EmptyState text="Nu exista activitati pentru luna selectata." />
              ) : activityOptions.map((option) => {
                const isSelected = selectedActivityIds.includes(option.activityId);
                const disabled = option.isFullyAllocated && !isSelected;
                return (
                  <div key={option.activityId} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_1fr_96px]">
                    <Checkbox
                      checked={isSelected}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggleActivity(option.activityId, checked === true, option.remainingHours)}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{option.date}</span>
                        <Badge variant="outline">{option.saCode}</Badge>
                        {disabled && <Badge variant="secondary">alocat</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{option.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {option.allocatedHours}h alocate din {option.totalHours}h
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      disabled={!isSelected}
                      value={allocatedHoursByActivityId[option.activityId] ?? option.remainingHours}
                      onChange={(event) => setAllocatedHoursByActivityId((current) => ({
                        ...current,
                        [option.activityId]: Number(event.target.value),
                      }))}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Livrabile</h3>
              <p className="text-xs text-muted-foreground">Asociaza unul sau mai multe livrabile fluxului selectat.</p>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border p-2">
              {deliverableOptions.length === 0 ? (
                <EmptyState text="Nu exista livrabile in activitatile lunii." />
              ) : deliverableOptions.map((option) => {
                const isSelected = selectedDeliverableIds.includes(option.deliverableId);
                const disabled = option.isAlreadyAssociated && !isSelected;
                return (
                  <div key={option.deliverableId} className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox
                      checked={isSelected}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggleDeliverable(option.deliverableId, checked === true)}
                    />
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{option.title}</span>
                        {option.saCode && <Badge variant="outline">{option.saCode}</Badge>}
                        {option.eligibilityStatus && <Badge variant="outline">eligibilitate: {option.eligibilityStatus}</Badge>}
                        {disabled && <Badge variant="secondary">asociat</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {option.fileName}
                        {option.eligibilitySummary ? ` - ${option.eligibilitySummary}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="work-block-preview">Preview validare</label>
          <Textarea
            id="work-block-preview"
            readOnly
            value={isWaitingForSelectedBundle
              ? 'Se reincarca work block-ul salvat.'
              : draftPreview.issues.length > 0
              ? draftPreview.issues.map((issue) => issue.message).join('\n')
              : isReadyForControlledSave
                ? 'Draft valid local si pregatit pentru salvarea controlata.'
                : 'Draft valid local. Se actualizeaza starea de sesiune.'}
            className="min-h-24"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {draftPreview.issues.length > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {draftPreview.issues.length} validari de rezolvat
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {isWaitingForSelectedBundle
                  ? 'Se reincarca work block-ul salvat'
                  : saveDraftSuccess
                  ? 'Draft salvat in backend'
                  : hasUnsavedSessionChanges ? 'Draft local modificat' : 'Draft salvat in sesiune'}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={resetDraft}>
              <RotateCcw className="h-4 w-4" />
              Reset draft
            </Button>
            {saveDraftError && (
              <span className="text-sm text-destructive">{saveDraftError}</span>
            )}
            <Button
              type="button"
              disabled={!isReadyForControlledSave || isSavingDraft || isWaitingForSelectedBundle}
              aria-disabled={!isReadyForControlledSave || isSavingDraft || isWaitingForSelectedBundle}
              onClick={handleSaveDraft}
            >
              <Save className="h-4 w-4" />
              {controlledSaveLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
