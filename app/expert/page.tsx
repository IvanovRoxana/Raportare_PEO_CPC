'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Globe2,
  Loader2,
  Save,
  Users,
} from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { ProgressBar, RightInfoCard, StatCard } from '@/components/layout/dashboard-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserMenu } from '@/components/user-menu';
import { useActivitiesByMonth, useConcurrentProjects, useConcurrentProjectTimesheetByMonth, useConcurrentProjectTimesheetMutations, useDocuments, useExperts, useSharedDeliverableMutations, useSharedDeliverables } from '@/hooks/use-backend-data';
import type { AppRole } from '@/lib/aws/auth';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { buildConsolidatedTimesheet, filterActiveConcurrentProjectsForMonth, getConcurrentProjectMonthlyTotal, getConsolidatedWarnings } from '@/lib/concurrent-projects';
import { buildIgnoredSharedActivityAlerts, buildPendingSharedActivityAlerts, buildPendingSharedDeliverableAlerts, buildReturnedSharedActivityAlerts } from '@/lib/document-sharing';
import { canAccessPmDashboard } from '@/lib/pm-dashboard';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert } from '@/lib/types';
import { getNonWorkingDayInfo } from '@/lib/non-working-days';
import { cn } from '@/lib/utils';

type ProjectItem = {
  id: string;
  name: string;
  href: string;
  activities: Activity[];
  concurrentProject?: ConcurrentProject;
  timesheetEntries?: ConcurrentProjectTimesheetEntry[];
};

const WORK_TABS = [
  { label: 'Raportare', href: '/expert/peo', icon: ClipboardList, active: true },
  { label: 'Grupuri de lucru', href: '#', icon: Users, active: false },
  { label: 'Activități Colegi', href: '#', icon: BriefcaseBusiness, active: false },
  { label: 'EU Affairs', href: '#', icon: Globe2, active: false },
];

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return {
        day,
        date: new Date(year, month, day),
        dateStr: toIsoDate(year, month, day),
      };
    }),
  ];
}

function getDayTotals(projects: ProjectItem[]) {
  const totals = new Map<string, { total: number; byProject: Record<string, number> }>();

  projects.forEach((project) => {
    project.activities.forEach((activity) => {
      const hours = Number(activity.hours) || 0;
      const day = totals.get(activity.date) ?? { total: 0, byProject: {} };
      day.total += hours;
      day.byProject[project.id] = (day.byProject[project.id] || 0) + hours;
      totals.set(activity.date, day);
    });
    project.timesheetEntries?.forEach((entry) => {
      const hours = Number(entry.hours) || 0;
      const day = totals.get(entry.date) ?? { total: 0, byProject: {} };
      day.total += hours;
      day.byProject[project.id] = (day.byProject[project.id] || 0) + hours;
      totals.set(entry.date, day);
    });
  });

  return totals;
}

function getProjectTotal(project: ProjectItem) {
  const peoHours = project.activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
  const concurrentHours = project.timesheetEntries?.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0) ?? 0;
  return peoHours + concurrentHours;
}

function getFilenameFromDisposition(disposition: string) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


function DashboardCalendar({
  projects,
  month,
  year,
}: {
  projects: ProjectItem[];
  month: number;
  year: number;
}) {
  const dayTotals = useMemo(() => getDayTotals(projects), [projects]);
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  return (
    <section id="calendar-ore" className="rounded-lg border bg-card scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Calendar ore
          </h2>
          <p className="text-sm text-muted-foreground">
            {getMonthName(month)} {year}
          </p>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
          Limită 8 ore/zi
        </Badge>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 border-b pb-2 text-center text-xs font-semibold text-muted-foreground">
          {DAY_NAMES.map((day, index) => (
            <div key={day} className={cn(index >= 5 && 'text-red-600')}>
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 pt-2">
          {calendarDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="min-h-24 rounded-md" />;
            }

            const dayTotal = dayTotals.get(day.dateStr);
            const totalHours = dayTotal?.total ?? 0;
            const nonWorkingInfo = getNonWorkingDayInfo(day.date);
            const isNonWorkingDay = nonWorkingInfo.isNonWorkingDay;
            const hasHours = totalHours > 0;
            const exceedsLimit = totalHours > 8;

            return (
              <div
                key={day.dateStr}
                className={cn(
                  'min-h-24 rounded-md border p-2 text-sm',
                  isNonWorkingDay ? 'border-muted bg-muted/40 text-muted-foreground' : 'bg-background',
                  hasHours && !exceedsLimit && 'border-green-300 bg-green-50 text-green-950',
                  exceedsLimit && 'border-red-300 bg-red-50 text-red-950'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{day.day}</span>
                </div>
                {nonWorkingInfo.badgeLabels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {nonWorkingInfo.badgeLabels.map((label) => (
                      <Badge key={label} variant="outline" className="px-1 py-0 text-[9px] leading-4">
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
                {nonWorkingInfo.holidayNames.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-[9px] leading-tight">
                    {nonWorkingInfo.holidayNames.map((name) => (
                      <div key={name}>{name}</div>
                    ))}
                  </div>
                )}

                {hasHours ? (
                  <div className="mt-2 space-y-1">
                    <div className="text-2xl font-bold leading-none">{totalHours}h</div>
                    {projects.map((project) => {
                      const projectHours = dayTotal?.byProject[project.id] ?? 0;
                      if (!projectHours) return null;
                      return (
                        <div key={project.id} className="truncate text-[11px]">
                          {project.name}: {projectHours}h
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">0h</div>
                )}

                {exceedsLimit && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold">
                    <AlertTriangle className="h-3 w-3" />
                    peste 8h
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


function ConcurrentTimesheetEditor({
  project,
  entries,
  draftEntries,
  month,
  year,
  updateDraft,
  saveEntry,
}: {
  project: ConcurrentProject;
  entries: ConcurrentProjectTimesheetEntry[];
  draftEntries: Record<string, Partial<ConcurrentProjectTimesheetEntry>>;
  month: number;
  year: number;
  updateDraft: (date: string, updates: Partial<ConcurrentProjectTimesheetEntry>) => void;
  saveEntry: (date: string) => void;
}) {
  const totals = getConcurrentProjectMonthlyTotal({ project, entries, month, year });
  const dates = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3 text-sm">
        <div className="font-semibold">Project: {project.projectName}</div>
        <div className="text-muted-foreground">Code: {project.projectCode || '-'} · Name & Project Role: {project.expertName || project.expertId}, {project.expertProjectRole || '-'}</div>
        <div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">Total proiect: {totals.totalHours}h</Badge>{Object.entries(totals.totalByWp).map(([wp, hours]) => <Badge key={wp} variant="outline">{wp}: {hours}h</Badge>)}</div>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <table className="w-full min-w-[820px] text-xs">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-2 py-2 text-left">DATE</th><th>DayType</th><th>WP</th><th>NO. h</th><th>TASK NAME</th><th>RELEVANT DELIVERABLE</th><th>Notes</th><th></th></tr></thead>
          <tbody>{dates.map((date) => {
            const existing = entries.find((entry) => entry.date === date);
            const draft = { ...existing, ...draftEntries[date] } as Partial<ConcurrentProjectTimesheetEntry>;
            return (
              <tr key={date} className="border-t">
                <td className="px-2 py-2 font-medium">{date}</td>
                <td><Input className="h-8" value={draft.dayType || 'lucratoare'} onChange={(event) => updateDraft(date, { dayType: event.target.value })} /></td>
                <td><Input className="h-8" value={draft.wp || ''} onChange={(event) => updateDraft(date, { wp: event.target.value })} /></td>
                <td><Input className="h-8" type="number" min={0} step="0.5" value={draft.hours ?? ''} onChange={(event) => updateDraft(date, { hours: Number(event.target.value) || 0 })} /></td>
                <td><Input className="h-8" value={draft.taskName || ''} onChange={(event) => updateDraft(date, { taskName: event.target.value })} /></td>
                <td><Input className="h-8" value={draft.relevantDeliverable || ''} onChange={(event) => updateDraft(date, { relevantDeliverable: event.target.value })} /></td>
                <td><Input className="h-8" value={draft.notes || ''} onChange={(event) => updateDraft(date, { notes: event.target.value })} /></td>
                <td className="px-2"><Button size="sm" variant="outline" onClick={() => saveEntry(date)}><Save className="h-3 w-3" /> Draft</Button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function ExpertHomeDashboard() {
  const router = useRouter();
  const [currentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState('expert');
  const [signedInRoles, setSignedInRoles] = useState<AppRole[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { experts } = useExperts();
  const { activities: monthActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { documents } = useDocuments();
  const [selectedConcurrentProjectId, setSelectedConcurrentProjectId] = useState<string>('');
  const [draftConcurrentEntries, setDraftConcurrentEntries] = useState<Record<string, Partial<ConcurrentProjectTimesheetEntry>>>({});

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;

        if (!user) {
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          router.replace('/auth/login?redirectTo=/expert');
          return;
        }

        setIsAuthenticated(true);
        setSignedInUserId(user.id ?? null);
        if (user.email) setSignedInEmail(user.email);
        if (user.displayName) setSignedInName(user.displayName);
        if (user.roles) setSignedInRoles(user.roles);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setIsAuthLoading(false);
        router.replace('/auth/login?redirectTo=/expert');
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  const currentExpert = useMemo(() => {
    const normalizedEmail = signedInEmail?.toLowerCase();
    return experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (!normalizedEmail) return false;
      return expert.email?.toLowerCase() === normalizedEmail;
    }) ?? null;
  }, [experts, signedInEmail, signedInUserId]);


  const { projects: currentExpertConcurrentProjects } = useConcurrentProjects(currentExpert?.id ?? null);
  const { entries: concurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { upsertEntry } = useConcurrentProjectTimesheetMutations(currentMonth, currentYear);

  const expertName = currentExpert?.name ?? signedInName;
  const { sharedDeliverables, mutate: refreshSharedDeliverables } = useSharedDeliverables();
  const { ignore: ignoreSharedSuggestion } = useSharedDeliverableMutations();
  const pendingSharedAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildPendingSharedDeliverableAlerts({
      expert: currentExpert,
      documents,
      sharedDeliverables,
    });
  }, [currentExpert, documents, sharedDeliverables]);
  const pendingActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildPendingSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables,
    });
  }, [currentExpert, experts, sharedDeliverables]);
  const returnedActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildReturnedSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables,
    });
  }, [currentExpert, experts, sharedDeliverables]);
  const ignoredActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildIgnoredSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables,
    });
  }, [currentExpert, experts, sharedDeliverables]);

  const handleIgnoreActivitySuggestion = async (relationId: string) => {
    await ignoreSharedSuggestion(relationId);
    await refreshSharedDeliverables();
  };

  const peoActivities = useMemo(() => {
    if (!currentExpert) return [];
    return monthActivities.filter((activity) => activity.expertId === currentExpert.id);
  }, [currentExpert, monthActivities]);

  const activeConcurrentProjects = useMemo(
    () => filterActiveConcurrentProjectsForMonth(currentExpertConcurrentProjects, currentMonth, currentYear),
    [currentExpertConcurrentProjects, currentMonth, currentYear]
  );
  const expertConcurrentEntries = useMemo(
    () => concurrentTimesheetEntries.filter((entry) => entry.expertId === currentExpert?.id),
    [concurrentTimesheetEntries, currentExpert]
  );

  const projects = useMemo<ProjectItem[]>(
    () => [
      {
        id: 'peo',
        name: 'PEO 302141',
        href: '/expert/peo',
        activities: peoActivities,
      },
      ...activeConcurrentProjects.map((project) => ({
        id: project.id,
        name: `${project.projectName}${project.projectCode ? ` / ${project.projectCode}` : ''}`,
        href: '#proiecte-paralele',
        activities: [],
        concurrentProject: project,
        timesheetEntries: expertConcurrentEntries.filter((entry) => entry.concurrentProjectId === project.id),
      })),
    ],
    [activeConcurrentProjects, expertConcurrentEntries, peoActivities]
  );

  const consolidatedRows = useMemo(
    () => buildConsolidatedTimesheet({ activities: peoActivities, concurrentProjects: activeConcurrentProjects, entries: expertConcurrentEntries, month: currentMonth, year: currentYear }),
    [activeConcurrentProjects, currentMonth, currentYear, expertConcurrentEntries, peoActivities]
  );
  const consolidatedWarnings = useMemo(() => getConsolidatedWarnings(consolidatedRows), [consolidatedRows]);
  const dayTotals = useMemo(() => getDayTotals(projects), [projects]);
  const exceededDays = consolidatedWarnings.exceededDays;
  const totalMonthHours = projects.reduce((sum, project) => sum + getProjectTotal(project), 0);
  const peoMonthHours = getProjectTotal(projects[0]);
  const selectedConcurrentProject = activeConcurrentProjects.find((project) => project.id === selectedConcurrentProjectId) ?? activeConcurrentProjects[0];
  const updateConcurrentDraft = (date: string, updates: Partial<ConcurrentProjectTimesheetEntry>) => {
    const existing = expertConcurrentEntries.find((entry) => entry.concurrentProjectId === selectedConcurrentProject?.id && entry.date === date);
    setDraftConcurrentEntries({
      ...draftConcurrentEntries,
      [date]: { ...existing, ...draftConcurrentEntries[date], ...updates },
    });
  };

  const saveConcurrentEntry = async (date: string) => {
    if (!selectedConcurrentProject || !currentExpert) return;
    const existing = expertConcurrentEntries.find((entry) => entry.concurrentProjectId === selectedConcurrentProject.id && entry.date === date);
    const draft = draftConcurrentEntries[date] || existing || {};
    await upsertEntry({
      id: existing?.id,
      concurrentProjectId: selectedConcurrentProject.id,
      expertId: currentExpert.id,
      date,
      month: currentMonth,
      year: currentYear,
      wp: draft.wp || '',
      hours: Number(draft.hours) || 0,
      taskName: draft.taskName || '',
      relevantDeliverable: draft.relevantDeliverable || '',
      dayType: draft.dayType || 'lucratoare',
      notes: draft.notes || '',
      status: draft.status || 'draft',
      source: 'expert_manual',
      updatedBy: currentExpert.id,
    });
    const { [date]: _saved, ...rest } = draftConcurrentEntries;
    setDraftConcurrentEntries(rest);
  };

  const exportPontaj = async () => {
    if (!currentExpert) return;

    const response = await fetch('/api/export/pontaj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPontajExportPayload({
        kind: 'consolidated',
        expert: currentExpert,
        activities: peoActivities,
        concurrentProjects: activeConcurrentProjects,
        concurrentTimesheetEntries: expertConcurrentEntries,
        month: currentMonth,
        year: currentYear,
      })),
    });

    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      const message = contentType.includes('application/json')
        ? ((await response.json().catch(() => ({}))) as { error?: string }).error
        : await response.text().catch(() => '');
      throw new Error(
        contentType.includes('text/html')
          ? `Exportul pontajului a fost blocat de server. Status HTTP: ${response.status}. Reincarca pagina si incearca din nou.`
          : message || `Exportul pontajului a esuat. Status HTTP: ${response.status}`,
      );
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename =
      getFilenameFromDisposition(disposition) ||
      `Pontaj_final_consolidat_${currentExpert.name}_${getMonthName(currentMonth)}_${currentYear}.xlsx`;
    triggerDownload(blob, filename);
  };

  const canOpenPmDashboard = canAccessPmDashboard({
    roles: signedInRoles,
    projectRole: currentExpert?.role,
    hasPmAccess: currentExpert?.hasPmAccess,
  });

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Se verifica autentificarea...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert"
        navItems={expertNavItems}
        eyebrow="Modul Expert"
        title="Pontaj lunar"
        description="Centralizează activitățile și orele raportate pentru luna curentă."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                exportPontaj().catch((error) => {
                  console.error('Eroare export pontaj:', error);
                  alert(error instanceof Error ? error.message : 'Exportul pontajului a esuat.');
                });
              }}
              disabled={!currentExpert}
            >
              Export pontaj
            </Button>
            <Button asChild>
              <Link href="/expert/peo">
                Adaugă activitate
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {canOpenPmDashboard && (
              <Button asChild variant="outline">
                <Link href="/pm">Dashboard PM</Link>
              </Button>
            )}
            <UserMenu />
          </>
        }
        quickTabs={[
          { label: 'Pontaj lunar', href: '#calendar-ore', icon: CalendarDays, active: true },
          { label: 'Activitățile mele', href: '/expert/peo', icon: ClipboardList },
          { label: 'Livrabile', href: '/expert/peo#livrabile', icon: CheckCircle2 },
          { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: BriefcaseBusiness },
        ]}
        aside={
          <>
            <RightInfoCard title="Rezumat lună" icon={CalendarDays}>
              <p className="text-sm font-semibold text-muted-foreground">{getMonthName(currentMonth)} {currentYear}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total ore raportate</p>
                  <p className="mt-1 text-4xl font-bold text-slate-950">{totalMonthHours}h</p>
                </div>
                <span className="text-sm text-muted-foreground">din 160h planificate</span>
              </div>
              <ProgressBar value={Math.min(100, Math.round((totalMonthHours / 160) * 100))} className="mt-4" />
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ore disponibile</span>
                  <span className="font-semibold text-[#087a63]">{Math.max(0, 160 - totalMonthHours)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Limita lunară</span>
                  <span className="font-semibold">160h</span>
                </div>
              </div>
              <Link href="#pontaj-consolidat" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Vezi detalii complete
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RightInfoCard>

            <RightInfoCard title="Reguli pontaj" icon={CheckCircle2}>
              <div className="space-y-3 text-sm leading-6">
                {[
                  'Pontajul se raportează zilnic, până la ora 23:59.',
                  'Orele trebuie alocate pe subactivități.',
                  'Documentele justificative se atașează la activități.',
                  'Minimum 8h / zi lucrată.',
                ].map((rule) => (
                  <div key={rule} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#36c2a0]" />
                    {rule}
                  </div>
                ))}
              </div>
            </RightInfoCard>

            <RightInfoCard title="Status raportare" icon={ClipboardList}>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-muted-foreground">Luna curentă</span>
                  <span className="rounded-full bg-[#e9faf5] px-3 py-1 text-xs font-semibold text-[#087a63]">Deschisă</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pontaj</span>
                  <span className="rounded-full bg-[#eaf3fb] px-3 py-1 text-xs font-semibold text-primary">În lucru</span>
                </div>
              </div>
              <Link href="/expert/peo" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Vezi istoricul raportărilor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RightInfoCard>
          </>
        }
      >

        {(pendingActivityAlerts.length > 0 || ignoredActivityAlerts.length > 0 || returnedActivityAlerts.length > 0) && (
          <Tabs defaultValue="active" className="space-y-3">
            <TabsList>
              <TabsTrigger value="active">Colaborari active</TabsTrigger>
              <TabsTrigger value="rejected">
                Colaborari respinse ({ignoredActivityAlerts.length + returnedActivityAlerts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {pendingActivityAlerts.length > 0 && (
                <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Activitati comune sugerate
                  </div>
                  <div className="mt-3 space-y-2">
                    {pendingActivityAlerts.map((alert) => (
                      <div key={alert.relationId} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                        <div className="font-medium">Sugestie de la {alert.sourceExpertName}</div>
                        {alert.sourceActivityTitle && (
                          <div className="mt-1 text-sm font-medium text-amber-950">{alert.sourceActivityTitle}</div>
                        )}
                        <div className="mt-1 text-xs text-amber-800">{alert.message}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {alert.projectId && <Badge variant="outline">{alert.projectId}</Badge>}
                          {alert.sourceActivitySaCode && <Badge variant="outline">{alert.sourceActivitySaCode}</Badge>}
                          {alert.sourceActivityDate && <Badge variant="outline">{alert.sourceActivityDate}</Badge>}
                          {alert.sourceActivityHours && <Badge variant="outline">{alert.sourceActivityHours}h</Badge>}
                          <Badge variant="secondary">{alert.status}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild size="sm" className="h-8 rounded-md">
                            <Link href={`/expert/peo?sharedActivityRelationId=${encodeURIComponent(alert.relationId)}`}>Adauga activitate</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md border-amber-300 text-amber-900"
                            onClick={() => handleIgnoreActivitySuggestion(alert.relationId)}
                          >
                            Ignora activitatea
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="rejected" className="space-y-3">
              {ignoredActivityAlerts.length === 0 && returnedActivityAlerts.length === 0 ? (
                <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                  Nu exista colaborari respinse.
                </section>
              ) : (
                <>
                  {ignoredActivityAlerts.map((alert) => (
                    <div key={alert.relationId} className="rounded-md border bg-card p-3 text-sm">
                      <div className="font-medium">Ai ignorat sugestia de la {alert.sourceExpertName}</div>
                      {alert.sourceActivityTitle && <div className="mt-1 text-sm">{alert.sourceActivityTitle}</div>}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {alert.projectId && <Badge variant="outline">{alert.projectId}</Badge>}
                        {alert.sourceActivitySaCode && <Badge variant="outline">{alert.sourceActivitySaCode}</Badge>}
                        {alert.sourceActivityDate && <Badge variant="outline">{alert.sourceActivityDate}</Badge>}
                        {alert.sourceActivityHours && <Badge variant="outline">{alert.sourceActivityHours}h</Badge>}
                        <Badge variant="outline">{alert.status}</Badge>
                      </div>
                    </div>
                  ))}
                  {returnedActivityAlerts.map((alert) => (
                    <div key={alert.relationId} className="rounded-md border bg-card p-3 text-sm">
                      <div className="font-medium">{alert.targetExpertName} a ignorat sugestia ta</div>
                      <div className="mt-1 text-xs text-muted-foreground">{alert.message}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {alert.projectId && <Badge variant="outline">{alert.projectId}</Badge>}
                        <Badge variant="outline">{alert.status}</Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        {pendingSharedAlerts.length > 0 && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Livrabile comune neinregistrate
            </div>
            <div className="mt-3 space-y-2">
              {pendingSharedAlerts.map((alert) => (
                <div key={alert.relationId} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                  <div className="font-medium">{alert.title || alert.fileName}</div>
                  <div className="mt-1 text-xs text-amber-800">
                    {alert.message}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {alert.projectId && <Badge variant="outline">{alert.projectId}</Badge>}
                    {alert.saCode && <Badge variant="outline">{alert.saCode}</Badge>}
                    {alert.activityDate && <Badge variant="outline">{alert.activityDate}</Badge>}
                    <Badge variant="secondary">{alert.status}</Badge>
                  </div>
                  <Button asChild size="sm" className="mt-3 h-8 rounded-md">
                    <Link href={`/expert/peo?sharedDeliverableRelationId=${encodeURIComponent(alert.relationId)}`}>
                      Asociaza in pontajul meu
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Clock3}
            label="Total ore raportate"
            value={`${totalMonthHours}h`}
            description="din 160h planificate"
            progress={Math.min(100, Math.round((totalMonthHours / 160) * 100))}
            tone="blue"
          />
          <StatCard
            icon={CalendarDays}
            label="Zile lucrate"
            value={Array.from(dayTotals.values()).filter((day) => day.total > 0).length}
            description="zile cu pontaj în luna curentă"
            progress={55}
            tone="success"
          />
          <StatCard
            icon={AlertTriangle}
            label="Activități în curs"
            value={peoActivities.filter((activity) => activity.status !== 'approved').length}
            description={`${peoActivities.length} activități PEO`}
            progress={43}
            tone="warning"
          />
          <StatCard
            icon={ClipboardList}
            label="Livrabile atașate"
            value={documents.length}
            description="documente disponibile"
            progress={44}
            tone="violet"
          />
        </section>

        <section className="grid gap-3 rounded-[1.5rem] border bg-card p-3 md:grid-cols-4">
          {WORK_TABS.map((tab) => {
            const Icon = tab.icon;
            const content = (
              <>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </span>
                {tab.active && <ArrowRight className="h-4 w-4" />}
              </>
            );

            if (tab.active) {
              return (
                <Button key={tab.label} asChild className="h-12 justify-between rounded-md">
                  <Link href={tab.href}>{content}</Link>
                </Button>
              );
            }

            return (
              <Button key={tab.label} variant="outline" className="h-12 justify-start rounded-md" disabled>
                {content}
              </Button>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <DashboardCalendar projects={projects} month={currentMonth} year={currentYear} />

          <Card id="pontaj-consolidat" className="h-fit rounded-lg scroll-mt-24">
            <CardHeader className="border-b">
              <CardTitle className="text-lg">Panou proiecte</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs defaultValue="proiecte" className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-muted/50 p-1">
                  <TabsTrigger value="proiecte">Selectează Proiect</TabsTrigger>
                  <TabsTrigger value="ore">Ore luna curentă</TabsTrigger>
                  <TabsTrigger value="consolidat">Pontaj consolidat</TabsTrigger>
                  <TabsTrigger value="paralele">Proiect paralel</TabsTrigger>
                </TabsList>

                <TabsContent value="proiecte" className="mt-4 space-y-3">
                  {projects.map((project) => (
                    <Button key={project.id} asChild className="h-12 w-full justify-between rounded-md">
                      <Link href={project.href}>
                        {project.name}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ))}
                </TabsContent>

                <TabsContent value="ore" className="mt-4 space-y-4">
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      {getMonthName(currentMonth)} {currentYear}
                    </p>
                    <p className="mt-1 text-3xl font-bold">{totalMonthHours}h</p>
                    <p className="mt-1 text-xs text-muted-foreground">PEO eligibil: {peoMonthHours}h · proiecte paralele doar în total consolidat</p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {exceededDays > 0 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-red-700">{exceededDays} zile peste 8 ore · {consolidatedWarnings.coCmConflicts} conflicte CO/CM.</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-green-700">0 zile peste 8 ore.</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {projects.map((project) => (
                      <div key={project.id} className="flex items-center justify-between rounded-md border p-3">
                        <span className="font-medium">{project.name}</span>
                        <Badge variant="secondary">{getProjectTotal(project)}h</Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="consolidat" className="mt-4 space-y-3">
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="font-semibold">Total consolidat — {totalMonthHours}h</div>
                    <div className="text-muted-foreground">PEO 302141: {peoMonthHours}h · proiecte paralele: {totalMonthHours - peoMonthHours}h</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={consolidatedWarnings.exceededDays ? 'destructive' : 'secondary'}>{consolidatedWarnings.exceededDays} zile cu depășire</Badge>
                      <Badge variant={consolidatedWarnings.coCmConflicts ? 'destructive' : 'secondary'}>{consolidatedWarnings.coCmConflicts} conflicte CO/CM</Badge>
                    </div>
                  </div>
                  <div className="max-h-80 space-y-2 overflow-auto">
                    {consolidatedRows.filter((row) => row.totalHours > 0 || row.dayTypes.length > 0).map((row) => (
                      <div key={row.date} className="rounded-md border p-2 text-xs">
                        <div className="flex justify-between gap-2 font-medium"><span>{row.date}</span><span>{row.totalHours}h · {row.status}</span></div>
                        <div className="mt-1 text-muted-foreground">PEO {row.peoHours}h · paralele {Object.values(row.concurrentHoursByProject).reduce((sum, hours) => sum + hours, 0)}h · {row.dayTypes.join(', ') || 'lucrătoare'}</div>
                        {row.observations.length > 0 && <div className="mt-1 text-amber-700">{row.observations.join(' · ')}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    Confirm că orele raportate pentru PEO 302141 și proiectele paralele declarate pentru luna selectată sunt corecte și complete.
                  </div>
                </TabsContent>

                <TabsContent value="paralele" className="mt-4 space-y-3" id="proiecte-paralele">
                  {activeConcurrentProjects.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nu ai proiecte paralele active în luna curentă.</div>
                  ) : (
                    <>
                      <Select value={selectedConcurrentProject?.id || ''} onValueChange={setSelectedConcurrentProjectId}>
                        <SelectTrigger><SelectValue placeholder="Selectează proiect paralel" /></SelectTrigger>
                        <SelectContent>{activeConcurrentProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.projectName} {project.projectCode ? `/ ${project.projectCode}` : ''}</SelectItem>)}</SelectContent>
                      </Select>
                      {selectedConcurrentProject && (
                        <ConcurrentTimesheetEditor
                          project={selectedConcurrentProject}
                          entries={expertConcurrentEntries.filter((entry) => entry.concurrentProjectId === selectedConcurrentProject.id)}
                          draftEntries={draftConcurrentEntries}
                          month={currentMonth}
                          year={currentYear}
                          updateDraft={updateConcurrentDraft}
                          saveEntry={saveConcurrentEntry}
                        />
                      )}
                    </>
                  )}
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </section>
      </DashboardShell>
    </>
  );
}
