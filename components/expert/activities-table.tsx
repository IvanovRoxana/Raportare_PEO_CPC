'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit2,
  FileText,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDateRo } from '@/lib/app-utils';
import {
  GDPR_CONCLUSION_OPTIONS,
  getGdprTemplate,
  parseGdprMetaJson,
  validateGdprActivityDraft,
} from '@/lib/gdpr-reporting';
import { cn } from '@/lib/utils';
import { inferLegacyActivityPeriodGroups } from '@/lib/submit-readiness';
import type { Activity, Deliverable } from '@/lib/types';

interface ActivitiesTableProps {
  activities: Activity[];
  onEdit: (activity: Activity) => void;
  onDelete: (activityId: string) => void;
  activeActivityId?: string;
  compact?: boolean;
}

interface ActivityWorkingGroup {
  id: string;
  title: string;
  dateLabel: string;
  dayCount: number;
  activities: Activity[];
  totalHours: number;
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ro-RO', { weekday: 'long' });
const ACTIVITY_PERIOD_GROUP_PREFIXES = ['activity-period:', 'legacy-activity-period:'];

function getDateTime(date: string) {
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getWeekdayLabel(date: string) {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'zi nedefinita';
  return WEEKDAY_FORMATTER.format(parsedDate);
}

function normalizeText(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength = 180) {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 120 ? sliced.slice(0, lastSpace) : sliced).trim()}...`;
}

function getActivitySummary(activity: Activity) {
  const description = normalizeText(activity.activitySummary || activity.description || activity.gdprGeneratedText);
  if (description) return truncateText(description);
  return 'Fara descriere completata.';
}

function getDeliverableTitle(deliverable: Deliverable) {
  return normalizeText(
    deliverable.declaredTitle
      || deliverable.docTitle
      || deliverable.suggestedTitle
      || deliverable.originalFileName
      || deliverable.fileName,
  );
}

function getPrimaryDeliverable(activity: Activity) {
  const deliverables = activity.deliverables ?? [];
  return deliverables.find((deliverable) => normalizeText(deliverable.declaredTitle || deliverable.docTitle))
    || deliverables[0]
    || null;
}

function isActivityPeriodGroupId(value?: string | null) {
  return Boolean(value && ACTIVITY_PERIOD_GROUP_PREFIXES.some((prefix) => value.startsWith(prefix)));
}

function isLeaveEntryActivity(activity: Activity) {
  return activity.id.startsWith('leave-entry:');
}

function getActivityGroupKey(activity: Activity, inferredLegacyGroups: Map<string, string>) {
  if (isLeaveEntryActivity(activity)) {
    return [
      'leave',
      activity.expertId,
      activity.dayType || activity.activityType,
      normalizeText(activity.description),
      activity.status,
    ].join(':');
  }

  if (activity.workingGroupId && !isActivityPeriodGroupId(activity.workingGroupId)) {
    return `working:${activity.workingGroupId}`;
  }
  if (activity.periodGroupId) return `period:${activity.periodGroupId}`;
  if (activity.workingGroupId) return `working:${activity.workingGroupId}`;

  const inferredGroupId = inferredLegacyGroups.get(activity.id);
  if (inferredGroupId) return `legacy:${inferredGroupId}`;

  return `activity:${activity.id}`;
}

function getActivityGroupTitle(activities: Activity[]) {
  const first = activities[0];
  if (first && isLeaveEntryActivity(first)) {
    return first.activityType || first.title || 'Concediu';
  }
  return first?.title || first?.activityType || 'Activitate fara titlu';
}

function getActivityGroupDateLabel(activities: Activity[]) {
  const dates = [...new Set(activities.map((activity) => activity.date).filter(Boolean))].sort();
  if (dates.length === 0) return 'Fara data';
  if (dates.length === 1) return `${formatDateRo(dates[0])} ${getWeekdayLabel(dates[0])}`;
  return `${formatDateRo(dates[0])} - ${formatDateRo(dates[dates.length - 1])}`;
}

function groupActivitiesByWorkingGroup(activities: Activity[]): ActivityWorkingGroup[] {
  const groups = new Map<string, Activity[]>();
  const order: string[] = [];
  const inferredLegacyGroups = inferLegacyActivityPeriodGroups(activities);

  [...activities]
    .sort((a, b) => {
      const dateDiff = getDateTime(a.date) - getDateTime(b.date);
      if (dateDiff !== 0) return dateDiff;
      return (a.title || a.activityType || '').localeCompare(b.title || b.activityType || '', 'ro');
    })
    .forEach((activity) => {
      const key = getActivityGroupKey(activity, inferredLegacyGroups);
      const groupActivities = groups.get(key) ?? [];
      groupActivities.push(activity);
      groups.set(key, groupActivities);
      if (!order.includes(key)) order.push(key);
    });

  return order.map((id) => {
    const groupActivities = groups.get(id) ?? [];
    return {
      id,
      title: getActivityGroupTitle(groupActivities),
      dateLabel: getActivityGroupDateLabel(groupActivities),
      dayCount: new Set(groupActivities.map((activity) => activity.date).filter(Boolean)).size,
      activities: groupActivities,
      totalHours: groupActivities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0),
    };
  });
}

export function ActivitiesTable({
  activities,
  onEdit,
  onDelete,
  activeActivityId,
  compact = false,
}: ActivitiesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const workingGroups = useMemo(() => groupActivitiesByWorkingGroup(activities), [activities]);
  const totalHours = activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
        <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/70" />
        <p className="mt-3 font-medium text-foreground">Nu exista activitati inregistrate.</p>
        <p className="mt-1 text-sm">Selectati zile din calendar pentru a adauga activitati.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', compact && 'p-3')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={cn('font-semibold text-foreground', compact ? 'text-base' : 'text-lg')}>Jurnal activitati</h3>
          <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            {activities.length} activitati grupate pe {workingGroups.length} working group-uri.
          </p>
        </div>
        <Badge variant="secondary" className={cn('rounded-lg px-3 py-1', compact ? 'text-xs' : 'text-sm')}>
          Total: {totalHours} ore
        </Badge>
      </div>

      <div className="space-y-2">
        {workingGroups.map((group) => {
          const representativeActivity = group.activities[0];
          const isExpanded = expandedRows.has(group.id);
          const isActive = group.activities.some((activity) => activeActivityId === activity.id);
          const deliverableCount = group.activities.reduce(
            (count, activity) => count + (activity.deliverables?.length ?? 0),
            0,
          );
          const saCodes = [...new Set(group.activities.map((activity) => activity.saCode).filter(Boolean))];
          const primaryDeliverable = representativeActivity ? getPrimaryDeliverable(representativeActivity) : null;
          const primaryDeliverableTitle = primaryDeliverable ? getDeliverableTitle(primaryDeliverable) : '';

          return (
            <section
              key={group.id}
              className={cn(
                'overflow-hidden rounded-lg border bg-card transition-colors',
                isActive ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted/20',
              )}
            >
              <div
                className={cn(
                  'grid items-center gap-3 px-3 py-2.5',
                  compact ? 'grid-cols-1' : 'lg:grid-cols-[72px_minmax(0,1fr)_auto]',
                )}
              >
                <div className="flex items-center gap-2 lg:block">
                  <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold text-foreground">
                    {group.totalHours}h
                  </div>
                  <Badge variant="outline" className="lg:mt-1">
                    {group.dayCount} {group.dayCount === 1 ? 'zi' : 'zile'}
                  </Badge>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h4 className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                      {group.title}
                    </h4>
                    <span className="text-xs text-muted-foreground">{group.dateLabel}</span>
                  </div>
                  <p className="line-clamp-1 text-sm leading-5 text-muted-foreground">
                    {representativeActivity ? getActivitySummary(representativeActivity) : 'Fara descriere completata.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="max-w-full truncate">
                      {representativeActivity?.activityType || 'Tip neprecizat'}
                    </Badge>
                    {saCodes.length > 0 && (
                      <span className="rounded-md border bg-background px-2 py-1">
                        {saCodes.join(', ')}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1">
                      <FileText className="h-3.5 w-3.5" />
                      {deliverableCount === 0
                        ? 'Fara livrabile'
                        : `${deliverableCount} ${deliverableCount === 1 ? 'livrabil' : 'livrabile'}`}
                    </span>
                    {primaryDeliverableTitle && (
                      <span className="max-w-full truncate rounded-md border bg-slate-50 px-2 py-1">
                        {primaryDeliverableTitle}
                      </span>
                    )}
                  </div>
                </div>

                <div className={cn('flex flex-wrap items-center gap-2', !compact && 'lg:justify-end')}>
                  {representativeActivity && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(representativeActivity)}
                      className={compact ? 'flex-1 justify-center' : undefined}
                    >
                      <Edit2 className="h-4 w-4" />
                      Editeaza
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRow(group.id)}
                    className={compact ? 'flex-1 justify-center' : undefined}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Ascunde
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Detalii
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="divide-y border-t bg-muted/20">
                  {group.activities.map((activity) => {
                    const deliverables = activity.deliverables ?? [];
                    const grupTinta = activity.grupTinta ?? [];
                    const activityTitle = activity.title || activity.activityType || 'Activitate fara titlu';

                    return (
                      <Fragment key={activity.id}>
                        <article className="grid gap-3 px-4 py-3 lg:grid-cols-[72px_minmax(0,1fr)_auto]">
                          <div className="flex items-center gap-2 lg:block">
                            <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold text-foreground">
                              {Number(activity.hours) || 0}h
                            </div>
                            <Badge variant="outline" className="lg:mt-1">
                              {formatDateRo(activity.date)}
                            </Badge>
                          </div>

                          <div className="min-w-0 space-y-2">
                            <div>
                              <h5 className="break-words text-sm font-semibold leading-5 text-foreground">
                                {activityTitle}
                              </h5>
                              {activity.activityKeywords && (
                                <p className="text-xs font-medium text-primary">{activity.activityKeywords}</p>
                              )}
                            </div>
                            <p className="break-words text-sm leading-6 text-muted-foreground">
                              {activity.description || getActivitySummary(activity)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {activity.location && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  {activity.location}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1">
                                <FileText className="h-3.5 w-3.5" />
                                {deliverables.length === 0
                                  ? 'Fara livrabile'
                                  : `${deliverables.length} ${deliverables.length === 1 ? 'livrabil' : 'livrabile'}`}
                              </span>
                              {activity.saCode && (
                                <span className="rounded-md border bg-background px-2 py-1">{activity.saCode}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(activity)}>
                              <Edit2 className="h-4 w-4" />
                              Editeaza ziua
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  aria-label="Sterge activitatea"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Sterge activitatea?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Aceasta actiune nu poate fi anulata. Activitatea din{' '}
                                    {formatDateRo(activity.date)} va fi stearsa permanent.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Anuleaza</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => onDelete(activity.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Sterge
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </article>

                        {activity.gdprTemplateCode && (
                          <div className="px-4 pb-3">
                            <GdprActivityDetails activity={activity} />
                          </div>
                        )}

                        {(deliverables.length > 0 || grupTinta.length > 0) && (
                          <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                            {deliverables.length > 0 && (
                              <div className="rounded-lg border bg-background p-3">
                                <h4 className="mb-2 text-sm font-medium">Livrabile</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                  {deliverables.map((deliverable) => (
                                    <li key={deliverable.id} className="flex items-start gap-2">
                                      <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                      <span>
                                        {getDeliverableTitle(deliverable)}
                                        {deliverable.fileName && getDeliverableTitle(deliverable) !== deliverable.fileName
                                          ? ` (${deliverable.fileName})`
                                          : ''}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {grupTinta.length > 0 && (
                              <div className="rounded-lg border bg-background p-3">
                                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                                  <Users className="h-4 w-4" />
                                  Grup tinta
                                </h4>
                                <ul className="space-y-1 text-sm text-muted-foreground">
                                  {grupTinta.map((entry) => (
                                    <li key={entry.id}>
                                      {entry.name || entry.type || entry.activityType || 'Intrare GT'}
                                      {entry.cnp ? ` (CNP: ${entry.cnp})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function GdprActivityDetails({ activity }: { activity: Activity }) {
  const meta = parseGdprMetaJson(activity.gdprMetaJson);
  const template = getGdprTemplate(activity.gdprTemplateCode);
  const validation = validateGdprActivityDraft({
    templateCode: activity.gdprTemplateCode,
    meta,
    conclusionCode: activity.gdprConclusionCode,
    description: activity.gdprGeneratedText || activity.description,
    hasDeliverable: Boolean(activity.deliverables?.length),
  });
  const conclusion = GDPR_CONCLUSION_OPTIONS.find(
    (option) => option.code === (activity.gdprConclusionCode || meta.concluzie)
  );
  const generatedDeliverable = activity.deliverables?.find((deliverable) =>
    deliverable.documentId?.startsWith('doc_gdpr_') || deliverable.declaredTitle === template?.deliverableTitle
  );

  return (
    <div className="rounded-lg border bg-background p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{activity.gdprTemplateCode}</Badge>
        {template && <span className="font-medium">{template.label}</span>}
        {conclusion && <Badge variant="outline">{conclusion.label}</Badge>}
      </div>
      <div className="grid gap-2 text-muted-foreground md:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">Livrabil GDPR: </span>
          {generatedDeliverable?.declaredTitle || generatedDeliverable?.fileName || template?.deliverableTitle || 'neatasat'}
        </p>
        <p>
          <span className="font-medium text-foreground">Status completare: </span>
          {validation.ok ? 'complet' : `lipsesc ${validation.missingFields.length} campuri`}
        </p>
      </div>
      {!validation.ok && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
          {validation.missingFields.map((field) => (
            <li key={field}>Camp lipsa: {field}</li>
          ))}
          {validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
