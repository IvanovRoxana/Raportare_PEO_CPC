'use client';

import { useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, CheckCircle2, FileText, Loader2, SearchIcon, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMonthName } from '@/lib/backend-store';
import { formatDateRo } from '@/lib/app-utils';
import type { Activity, Expert, SharedDeliverable } from '@/lib/types';

type ColleagueActivitiesNewsletterProps = {
  activities: Activity[];
  experts: Expert[];
  selectedExpertId: string;
  month: number;
  year: number;
  isLoading?: boolean;
  isActionDisabled?: boolean;
  actionDisabledReason?: string;
  sharedRelations?: SharedDeliverable[];
  activeActivityId?: string | null;
  onAddToTimesheet: (activity: Activity) => void;
  onAssociateExisting: (activity: Activity) => void;
};

function getActivityTitle(activity: Activity) {
  return activity.title || activity.activityType || 'Activitate fara titlu';
}

function getActivitySummary(activity: Activity) {
  const description = activity.description?.trim();
  if (!description) return 'Nu exista descriere detaliata pentru aceasta activitate.';
  if (description.length <= 260) return description;
  return `${description.slice(0, 260).trim()}...`;
}

function getDeliverableCount(activity: Activity) {
  return (activity.deliverables ?? []).filter((deliverable) => (
    !deliverable.category || deliverable.category === 'livrabil' || deliverable.category === 'main'
  )).length;
}

function getRelationForActivity(
  activity: Activity,
  selectedExpertId: string,
  relations: SharedDeliverable[],
) {
  return relations.find((relation) => (
    relation.targetExpertId === selectedExpertId
    && relation.sourceActivityId === activity.id
    && relation.documentId === `activity:${activity.id}`
  ));
}

function relationBadge(relation?: SharedDeliverable) {
  if (!relation) return { label: 'Disponibila', className: 'border-sky-200 bg-sky-50 text-sky-800' };
  if (relation.status === 'registered') return { label: 'Deja asociata', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (relation.status === 'pending_registration') return { label: 'Pregatita', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  if (relation.status === 'ignored_by_target') return { label: 'Ignorata anterior', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  return { label: relation.status || 'Status necunoscut', className: 'border-slate-200 bg-slate-50 text-slate-700' };
}

type ActivityNewsletterGroup = {
  key: string;
  title: string;
  saCode?: string;
  projectCode?: string;
  activities: Activity[];
  totalHours: number;
  deliverableCount: number;
  dateLabels: string[];
};

function buildNewsletterGroups(activities: Activity[]): ActivityNewsletterGroup[] {
  const groups = new Map<string, ActivityNewsletterGroup>();

  activities.forEach((activity) => {
    const title = getActivityTitle(activity);
    const key = [
      title.trim().toLowerCase(),
      activity.saCode || '',
      activity.projectCode || '',
    ].join('|');
    const existing = groups.get(key);
    const nextActivity: ActivityNewsletterGroup = {
      key,
      title,
      saCode: activity.saCode,
      projectCode: activity.projectCode,
      activities: [...(existing?.activities ?? []), activity],
      totalHours: (existing?.totalHours ?? 0) + (Number(activity.hours) || 0),
      deliverableCount: (existing?.deliverableCount ?? 0) + getDeliverableCount(activity),
      dateLabels: [],
    };
    nextActivity.dateLabels = [...new Set(nextActivity.activities.map((item) => formatDateRo(item.date)))];
    groups.set(key, nextActivity);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const dateCompare = (a.activities[0]?.date || '').localeCompare(b.activities[0]?.date || '');
    if (dateCompare !== 0) return dateCompare;
    return a.title.localeCompare(b.title);
  });
}

export function ColleagueActivitiesNewsletter({
  activities,
  experts,
  selectedExpertId,
  month,
  year,
  isLoading = false,
  isActionDisabled = false,
  actionDisabledReason,
  sharedRelations = [],
  activeActivityId,
  onAddToTimesheet,
  onAssociateExisting,
}: ColleagueActivitiesNewsletterProps) {
  const [query, setQuery] = useState('');
  const [expertFilter, setExpertFilter] = useState('all');
  const [saFilter, setSaFilter] = useState('all');

  const colleagueActivities = useMemo(
    () => activities.filter((activity) => activity.expertId !== selectedExpertId),
    [activities, selectedExpertId],
  );

  const expertNameById = useMemo(
    () => new Map(experts.map((expert) => [expert.id, expert.name])),
    [experts],
  );

  const expertOptions = useMemo(() => {
    const ids = [...new Set(colleagueActivities.map((activity) => activity.expertId).filter(Boolean))];
    return ids
      .map((id) => ({ id, name: expertNameById.get(id) || colleagueActivities.find((activity) => activity.expertId === id)?.expertName || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [colleagueActivities, expertNameById]);

  const saOptions = useMemo(() => (
    [...new Set(colleagueActivities.map((activity) => activity.saCode).filter((value): value is string => Boolean(value)))]
      .sort()
  ), [colleagueActivities]);

  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return colleagueActivities
      .filter((activity) => expertFilter === 'all' || activity.expertId === expertFilter)
      .filter((activity) => saFilter === 'all' || activity.saCode === saFilter)
      .filter((activity) => {
        if (!normalizedQuery) return true;
        return [
          activity.expertName,
          expertNameById.get(activity.expertId),
          activity.title,
          activity.activityType,
          activity.description,
          activity.saCode,
          activity.projectCode,
        ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const expertCompare = (expertNameById.get(a.expertId) || a.expertName || '').localeCompare(expertNameById.get(b.expertId) || b.expertName || '');
        if (expertCompare !== 0) return expertCompare;
        return a.date.localeCompare(b.date);
      });
  }, [colleagueActivities, expertFilter, expertNameById, query, saFilter]);

  const groupedActivities = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    filteredActivities.forEach((activity) => {
      const expertName = expertNameById.get(activity.expertId) || activity.expertName || 'Colegul fara nume';
      groups.set(expertName, [...(groups.get(expertName) ?? []), activity]);
    });
    return Array.from(groups.entries());
  }, [expertNameById, filteredActivities]);

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-slate-200">
        <div className="border-b bg-gradient-to-r from-slate-950 via-slate-800 to-sky-900 px-5 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <Badge className="bg-white/15 text-white hover:bg-white/15">
                Newsletter intern
              </Badge>
              <h2 className="text-2xl font-semibold tracking-normal">
                Ce au lucrat colegii in {getMonthName(month)} {year}
              </h2>
              <p className="text-sm leading-6 text-slate-200">
                Exploreaza activitatile declarate, vezi livrabilele comune si porneste acelasi flux sigur de activitate comuna folosit de formularul PEO.
              </p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm">
              <div className="font-semibold">{filteredActivities.length} activitati</div>
              <div className="text-slate-200">dupa filtrele curente</div>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cauta dupa coleg, titlu, descriere, SA..."
                className="pl-9"
              />
            </div>
            <Select value={expertFilter} onValueChange={setExpertFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Colegi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toti colegii</SelectItem>
                {expertOptions.map((expert) => (
                  <SelectItem key={expert.id} value={expert.id}>{expert.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={saFilter} onValueChange={setSaFilter}>
              <SelectTrigger>
                <SelectValue placeholder="SA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate SA</SelectItem>
                {saOptions.map((saCode) => (
                  <SelectItem key={saCode} value={saCode}>{saCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Se incarca newsletterul activitatilor colegilor...
          </CardContent>
        </Card>
      ) : groupedActivities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <BriefcaseBusiness className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-semibold text-slate-900">Nu exista activitati pentru filtrele curente.</p>
              <p className="mt-1 text-sm text-muted-foreground">Schimba luna, colegul sau cautarea pentru a vedea alte activitati.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        groupedActivities.map(([expertName, expertActivities]) => {
          const activityGroups = buildNewsletterGroups(expertActivities);
          const totalHours = expertActivities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
          const totalDeliverables = expertActivities.reduce((sum, activity) => sum + getDeliverableCount(activity), 0);

          return (
          <Card key={expertName} className="overflow-hidden">
            <CardHeader className="border-b bg-slate-50">
              <CardTitle className="flex flex-wrap items-center gap-3 text-lg">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
                  <UsersRound className="h-4 w-4" />
                </span>
                <span>{expertName} in {getMonthName(month)}</span>
                <Badge variant="outline">{expertActivities.length} activitati</Badge>
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                {expertName} a raportat {totalHours}h in {activityGroups.length} grupuri de lucru,
                cu {totalDeliverables} livrabile atasate sau reutilizabile.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {activityGroups.map((group) => {
                const representativeActivity = group.activities.find((activity) => {
                  const relation = getRelationForActivity(activity, selectedExpertId, sharedRelations);
                  return relation?.status !== 'registered';
                }) ?? group.activities[0];
                const relation = representativeActivity
                  ? getRelationForActivity(representativeActivity, selectedExpertId, sharedRelations)
                  : undefined;
                const status = relationBadge(relation);
                const isRegistered = group.activities.every((activity) => (
                  getRelationForActivity(activity, selectedExpertId, sharedRelations)?.status === 'registered'
                ));
                const isBusy = group.activities.some((activity) => activeActivityId === activity.id);
                const disabled = !representativeActivity || isActionDisabled || isRegistered || isBusy;
                const deliverables = group.activities.flatMap((activity) => activity.deliverables ?? []);
                const uniqueDeliverables = Array.from(new Map(deliverables.map((deliverable) => [deliverable.id, deliverable])).values());

                return (
                <article key={group.key} className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={status.className}>{isRegistered ? 'Deja asociata' : status.label}</Badge>
                        {group.saCode && <Badge variant="secondary">{group.saCode}</Badge>}
                        {group.projectCode && <Badge variant="outline">{group.projectCode}</Badge>}
                        <Badge variant="outline">{group.totalHours}h total</Badge>
                        {group.deliverableCount > 0 ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                            {group.deliverableCount} livrabile
                          </Badge>
                        ) : (
                          <Badge variant="outline">Fara livrabil atasat</Badge>
                        )}
                      </div>
                      <h3 className="text-base font-semibold leading-6 text-slate-950">{group.title}</h3>
                      <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {group.dateLabels.join(', ')}
                        </span>
                        <span>{group.activities.length} inregistrari grupate</span>
                      </div>
                    </div>

                    {representativeActivity && (
                      <p className="text-sm leading-6 text-slate-700">{getActivitySummary(representativeActivity)}</p>
                    )}
                    {uniqueDeliverables.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uniqueDeliverables.slice(0, 3).map((deliverable) => (
                          <span
                            key={deliverable.id}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border bg-slate-50 px-2 py-1 text-xs text-slate-700"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <span className="truncate">{deliverable.declaredTitle || deliverable.fileName || deliverable.originalFileName || 'Livrabil'}</span>
                          </span>
                        ))}
                        {uniqueDeliverables.length > 3 && (
                          <span className="rounded-md border bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            +{uniqueDeliverables.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:w-56 lg:flex-col">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => representativeActivity && onAddToTimesheet(representativeActivity)}
                      disabled={disabled}
                      title={isActionDisabled ? actionDisabledReason : undefined}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Adauga la mine
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => representativeActivity && onAssociateExisting(representativeActivity)}
                      disabled={disabled}
                      title={isActionDisabled ? actionDisabledReason : undefined}
                    >
                      Asociaza existent
                    </Button>
                  </div>
                </article>
                );
              })}
            </CardContent>
          </Card>
          );
        })
      )}
    </section>
  );
}
