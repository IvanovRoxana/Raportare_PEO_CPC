'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  SearchIcon,
  Send,
  Users,
} from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { ProgressBar, RightInfoCard, StatCard } from '@/components/layout/dashboard-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserMenu } from '@/components/user-menu';
import { useActivitiesByMonth, useConcurrentProjects, useConcurrentProjectTimesheetByMonth, useConcurrentProjectTimesheetMutations, useDocuments, useExperts, useLeaveEntries, useMonthAccessRequest, useMonthAccessRequestMutations, useReportStatus, useSharedDeliverableMutations, useSharedDeliverables } from '@/hooks/use-backend-data';
import type { AppRole } from '@/lib/aws/auth';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { buildConsolidatedTimesheet, filterActiveConcurrentProjectsForMonth, getConcurrentProjectMonthlyTotal, getConsolidatedWarnings } from '@/lib/concurrent-projects';
import { buildIgnoredSharedActivityAlerts, buildPendingSharedActivityAlerts, buildPendingSharedDeliverableAlerts, buildReturnedSharedActivityAlerts, filterSharedRelationsForMonths } from '@/lib/document-sharing';
import { getActivitiesWithPmClarifications } from '@/lib/pm-clarifications';
import { canAccessPmDashboard } from '@/lib/pm-dashboard';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';
import { calculateMonthlyNormInfo } from '@/lib/pontaj-rules';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, LeaveEntry, ReportStatus } from '@/lib/types';
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
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, active: false },
  { label: 'Grupuri de lucru', href: '/grupuri-lucru', icon: Users, active: false },
  { label: 'Activități Colegi', href: '/expert/peo?tab=colegi', icon: BriefcaseBusiness, active: false },
  { label: 'EU Affairs', href: '#', icon: Globe2, active: false },
];

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, value) => ({ value, label: getMonthName(value) }));

type SharedActivityAlertSummary = {
  projectId?: string;
  sourceActivityDate?: string;
  sourceActivityHours?: number;
  sourceActivityTitle?: string;
  sourceActivityDescription?: string;
  sourceActivityLocation?: string;
  sourceActivityDayType?: string;
  sourceActivitySaCode?: string;
  sourceActivityProjectCode?: string;
  sourceActivityEventDurationHours?: number;
  sourceActivityEventExtendedDescription?: string;
  status: string;
};

type SharedActivityAlert = SharedActivityAlertSummary & {
  relationId: string;
  sourceActivityId?: string;
  sourceExpertName?: string;
  targetExpertName?: string;
  message?: string;
};

type GroupedSharedActivityAlert = SharedActivityAlert & {
  alerts: SharedActivityAlert[];
  relationIds: string[];
  sourceActivityDates: string[];
};

function getSharedActivityGroupKey(alert: SharedActivityAlert) {
  return JSON.stringify([
    alert.sourceExpertName,
    alert.sourceActivityTitle,
    alert.sourceActivityDescription,
    alert.sourceActivityHours,
    alert.sourceActivityLocation,
    alert.sourceActivityDayType,
    alert.sourceActivitySaCode,
    alert.sourceActivityProjectCode || alert.projectId,
    alert.sourceActivityEventDurationHours,
    alert.sourceActivityEventExtendedDescription,
    alert.status,
  ].map((value) => value ?? ''));
}

function groupSharedActivityAlerts(alerts: SharedActivityAlert[]): GroupedSharedActivityAlert[] {
  const groups = new Map<string, SharedActivityAlert[]>();

  alerts.forEach((alert) => {
    const key = getSharedActivityGroupKey(alert);
    groups.set(key, [...(groups.get(key) || []), alert]);
  });

  return Array.from(groups.values()).map((groupAlerts) => {
    const sortedAlerts = [...groupAlerts].sort((first, second) => {
      return (first.sourceActivityDate || '').localeCompare(second.sourceActivityDate || '');
    });
    const sourceActivityDates = Array.from(new Set(sortedAlerts.map((alert) => alert.sourceActivityDate).filter(Boolean) as string[]));

    return {
      ...sortedAlerts[0],
      alerts: sortedAlerts,
      relationIds: sortedAlerts.map((alert) => alert.relationId),
      sourceActivityDate: sourceActivityDates.join(', '),
      sourceActivityDates,
    };
  });
}

function formatSharedActivityHours(hours?: number) {
  return typeof hours === 'number' && Number.isFinite(hours) ? `${hours}h` : undefined;
}

function SharedActivityMetadata({ alert, subtle = false }: { alert: SharedActivityAlertSummary; subtle?: boolean }) {
  const projectCode = alert.sourceActivityProjectCode || alert.projectId;
  const meta = [
    { label: 'Data', value: alert.sourceActivityDate },
    { label: 'Ore', value: formatSharedActivityHours(alert.sourceActivityHours) },
    { label: 'SA', value: alert.sourceActivitySaCode },
    { label: 'Proiect', value: projectCode },
    { label: 'Locatie', value: alert.sourceActivityLocation },
    { label: 'Tip zi', value: alert.sourceActivityDayType },
    { label: 'Durata', value: formatSharedActivityHours(alert.sourceActivityEventDurationHours) },
  ].filter((item) => Boolean(item.value));

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      {meta.map((item) => (
        <Badge key={`${item.label}-${item.value}`} variant="outline" className={subtle ? undefined : 'border-amber-300 bg-white/80 text-amber-950'}>
          {item.label}: {item.value}
        </Badge>
      ))}
      <Badge variant={subtle ? 'outline' : 'secondary'}>{alert.status}</Badge>
    </div>
  );
}

function SharedActivityDescription({ alert, subtle = false }: { alert: SharedActivityAlertSummary; subtle?: boolean }) {
  const description = alert.sourceActivityDescription || alert.sourceActivityEventExtendedDescription;
  if (!description) return null;

  return (
    <p
      className={cn('mt-2 max-w-5xl overflow-hidden text-xs leading-5', subtle ? 'text-muted-foreground' : 'text-amber-800')}
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
    >
      {description}
    </p>
  );
}

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

function isLeaveActivity(activity: Pick<Activity, 'dayType'>) {
  const dayType = String(activity.dayType || '').trim().toUpperCase();
  return dayType === 'CO' || dayType === 'CM';
}

function getPeoCoveredHours(activities: Activity[], leaveEntries: LeaveEntry[]) {
  const leaveDates = new Set(leaveEntries.filter((leave) => leave.status !== 'REJECTED').map((leave) => leave.date));
  const workedHours = activities
    .filter((activity) => !isLeaveActivity(activity))
    .reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
  const leaveHours = leaveEntries
    .filter((leave) => leave.status !== 'REJECTED')
    .reduce((sum, leave) => sum + (Number(leave.peoHours) || 0), 0);
  const manualLeaveHours = activities
    .filter((activity) => isLeaveActivity(activity) && !activity.id.startsWith('leave-entry:') && !leaveDates.has(activity.date))
    .reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);

  return workedHours + leaveHours + manualLeaveHours;
}

function percent(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function isDateInMonth(date: string | undefined, month: number, year: number) {
  if (!date) return false;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed.getMonth() === month && parsed.getFullYear() === year;
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

function financialHourlyRateStorageKey(month: number, year: number) {
  return `financial-peo-hourly-rates-${year}-${String(month + 1).padStart(2, '0')}`;
}

function getStoredFinancialHourlyRate(expert: Expert, month: number, year: number) {
  try {
    const storedRates = window.localStorage.getItem(financialHourlyRateStorageKey(month, year));
    const rates = storedRates ? JSON.parse(storedRates) as Record<string, string> : {};
    const rawValue = rates[expert.id] ?? rates[expert.name];
    const value = Number(rawValue?.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}


function DashboardCalendar({
  projects,
  month,
  year,
  toolbar,
}: {
  projects: ProjectItem[];
  month: number;
  year: number;
  toolbar?: ReactNode;
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbar}
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            Limită 8 ore/zi
          </Badge>
        </div>
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
  const deliverableOptions = project.deliverableOptions ?? [];

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
                <td>
                  {deliverableOptions.length > 0 ? (
                    <Select value={draft.relevantDeliverable || ''} onValueChange={(value) => updateDraft(date, { relevantDeliverable: value })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Livrabil" /></SelectTrigger>
                      <SelectContent>
                        {draft.relevantDeliverable && !deliverableOptions.includes(draft.relevantDeliverable) && (
                          <SelectItem value={draft.relevantDeliverable}>{draft.relevantDeliverable}</SelectItem>
                        )}
                        {deliverableOptions.map((deliverable) => <SelectItem key={deliverable} value={deliverable}>{deliverable}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-8" value={draft.relevantDeliverable || ''} onChange={(event) => updateDraft(date, { relevantDeliverable: event.target.value })} />
                  )}
                </td>
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
  const today = useMemo(() => new Date(), []);
  const baseMonth = today.getMonth();
  const baseYear = today.getFullYear();
  const [currentMonth, setCurrentMonth] = useState(baseMonth);
  const [currentYear, setCurrentYear] = useState(baseYear);
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState('expert');
  const [signedInRoles, setSignedInRoles] = useState<AppRole[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [isSubmittingMonth, setIsSubmittingMonth] = useState(false);

  const { experts } = useExperts();
  const { activities: monthActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { leaveEntries } = useLeaveEntries(currentMonth, currentYear);
  const { documents } = useDocuments();
  const [selectedConcurrentProjectId, setSelectedConcurrentProjectId] = useState<string>('');
  const [consolidatedTab, setConsolidatedTab] = useState('ore');
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
  const { status: currentMonthStatus, updateStatus: updateCurrentMonthStatus } = useReportStatus(
    currentExpert?.id ?? null,
    currentMonth,
    currentYear,
  );
  const { request: currentMonthAccessRequest } = useMonthAccessRequest(
    currentExpert?.id ?? null,
    currentMonth,
    currentYear,
  );
  const { requestAccess: requestMonthAccess } = useMonthAccessRequestMutations();
  const previousMonthDate = useMemo(() => new Date(currentYear, currentMonth - 1, 1), [currentMonth, currentYear]);
  const { status: previousMonthStatus } = useReportStatus(
    currentExpert?.id ?? null,
    previousMonthDate.getMonth(),
    previousMonthDate.getFullYear(),
  );

  const expertName = currentExpert?.name ?? signedInName;
  const expertFirstName = expertName.split(/\s+/).filter(Boolean)[0] || 'Expert';
  const isBaseMonth = currentMonth === baseMonth && currentYear === baseYear;
  const selectedMonthHasAccess = isBaseMonth || currentMonthStatus?.expertAccessApproved === true;
  const selectedMonthRequestPending = currentMonthAccessRequest?.status === 'pending';
  const selectableYears = useMemo(
    () => Array.from(new Set([baseYear - 1, baseYear, baseYear + 1, currentYear])).sort((a, b) => b - a),
    [baseYear, currentYear],
  );
  const { sharedDeliverables, mutate: refreshSharedDeliverables } = useSharedDeliverables();
  const { ignore: ignoreSharedSuggestion } = useSharedDeliverableMutations();
  const visibleSharedDeliverables = useMemo(() => {
    if (!selectedMonthHasAccess) return [];
    const allowedMonths = [
      { month: currentMonth, year: currentYear },
      ...(previousMonthStatus?.expertAccessApproved
        ? [{ month: previousMonthDate.getMonth(), year: previousMonthDate.getFullYear() }]
        : []),
    ];
    return filterSharedRelationsForMonths({
      sharedDeliverables,
      documents,
      allowedMonths,
    });
  }, [currentMonth, currentYear, documents, previousMonthDate, previousMonthStatus, selectedMonthHasAccess, sharedDeliverables]);
  const visibleSharedActivitySuggestions = useMemo(() => {
    if (!selectedMonthHasAccess) return [];
    return filterSharedRelationsForMonths({
      sharedDeliverables,
      allowedMonths: [{ month: currentMonth, year: currentYear }],
    });
  }, [currentMonth, currentYear, selectedMonthHasAccess, sharedDeliverables]);
  const pendingSharedAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildPendingSharedDeliverableAlerts({
      expert: currentExpert,
      documents,
      sharedDeliverables: visibleSharedDeliverables,
    });
  }, [currentExpert, documents, visibleSharedDeliverables]);
  const pendingActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildPendingSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables: visibleSharedActivitySuggestions,
      sourceActivities: monthActivities,
    });
  }, [currentExpert, experts, monthActivities, visibleSharedActivitySuggestions]);
  const groupedPendingActivityAlerts = useMemo(
    () => groupSharedActivityAlerts(pendingActivityAlerts),
    [pendingActivityAlerts]
  );
  const returnedActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildReturnedSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables: visibleSharedActivitySuggestions,
      sourceActivities: monthActivities,
    });
  }, [currentExpert, experts, monthActivities, visibleSharedActivitySuggestions]);
  const ignoredActivityAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildIgnoredSharedActivityAlerts({
      expert: currentExpert,
      experts,
      sharedDeliverables: visibleSharedActivitySuggestions,
      sourceActivities: monthActivities,
    });
  }, [currentExpert, experts, monthActivities, visibleSharedActivitySuggestions]);

  const handleIgnoreActivitySuggestionGroup = async (relationIds: string[]) => {
    await Promise.all(relationIds.map((relationId) => ignoreSharedSuggestion(relationId)));
    await refreshSharedDeliverables();
  };

  const peoActivities = useMemo(() => {
    if (!currentExpert || !selectedMonthHasAccess) return [];
    const expertLeaves = leaveEntries.filter((leave) => leave.expertId === currentExpert.id && leave.status !== 'REJECTED');
    const financialLeaveDates = new Set(expertLeaves.map((leave) => leave.date));
    const reportedActivities = monthActivities.filter((activity) => activity.expertId === currentExpert.id
      && (!financialLeaveDates.has(activity.date) || (activity.dayType !== 'CO' && activity.dayType !== 'CM')));
    const leaveActivities: Activity[] = expertLeaves
      .map((leave) => ({
        id: 'leave-entry:' + leave.id,
        date: leave.date,
        expertId: leave.expertId,
        expertName: currentExpert.name,
        hours: Number(leave.peoHours) || 0,
        activityType: leave.type === 'CM' ? 'CM - Concediu medical' : 'CO - Concediu de odihna',
        title: leave.type + ' (' + leave.peoHours + ' h PEO + ' + leave.cpcHours + ' h CPC)',
        description: leave.source === 'FINANCIAL' ? 'Concediu introdus de Financiar.' : 'Concediu repartizat automat.',
        dayType: leave.type,
        status: leave.status === 'VALIDATED' ? 'approved' : 'draft',
        projectCode: 'CONSOLIDAT',
        autoGenerated: true,
      }));
    return [...reportedActivities, ...leaveActivities];
  }, [currentExpert, leaveEntries, monthActivities, selectedMonthHasAccess]);

  const activeConcurrentProjects = useMemo(
    () => selectedMonthHasAccess ? filterActiveConcurrentProjectsForMonth(currentExpertConcurrentProjects, currentMonth, currentYear) : [],
    [currentExpertConcurrentProjects, currentMonth, currentYear, selectedMonthHasAccess]
  );
  const expertConcurrentEntries = useMemo(
    () => selectedMonthHasAccess ? concurrentTimesheetEntries.filter((entry) => entry.expertId === currentExpert?.id) : [],
    [concurrentTimesheetEntries, currentExpert, selectedMonthHasAccess]
  );
  const peoHref = `/expert/peo?month=${currentMonth}&year=${currentYear}`;
  const workTabs = useMemo(
    () =>
      WORK_TABS.map((tab) =>
        tab.label === 'Activități Colegi'
          ? { ...tab, href: `${peoHref}&tab=colegi` }
          : tab,
      ),
    [peoHref],
  );

  const projects = useMemo<ProjectItem[]>(
    () => [
      {
        id: 'peo',
        name: 'PEO 302141',
        href: peoHref,
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
    [activeConcurrentProjects, expertConcurrentEntries, peoActivities, peoHref]
  );

  const currentExpertLeaveEntries = useMemo(
    () => leaveEntries.filter((leave) => leave.expertId === currentExpert?.id),
    [currentExpert, leaveEntries],
  );
  const consolidatedRows = useMemo(
    () => buildConsolidatedTimesheet({ activities: peoActivities, concurrentProjects: activeConcurrentProjects, entries: expertConcurrentEntries, leaveEntries: currentExpertLeaveEntries, month: currentMonth, year: currentYear }),
    [activeConcurrentProjects, currentExpertLeaveEntries, currentMonth, currentYear, expertConcurrentEntries, peoActivities]
  );
  const consolidatedWarnings = useMemo(() => getConsolidatedWarnings(consolidatedRows), [consolidatedRows]);
  const dayTotals = useMemo(() => getDayTotals(projects), [projects]);
  const exceededDays = consolidatedWarnings.exceededDays;
  const peoCoveredMonthHours = getPeoCoveredHours(peoActivities, currentExpertLeaveEntries);
  const peoMonthHours = peoCoveredMonthHours;
  const totalMonthHours = peoCoveredMonthHours
    + activeConcurrentProjects.reduce(
      (sum, project) => sum + getConcurrentProjectMonthlyTotal({ project, entries: expertConcurrentEntries, month: currentMonth, year: currentYear }).totalHours,
      0,
    );
  const monthlyNormInfo = useMemo(
    () => calculateMonthlyNormInfo(currentExpert ?? { norma: 8 }, currentMonth, currentYear),
    [currentExpert, currentMonth, currentYear],
  );
  const workedDaysCount = Array.from(dayTotals.values()).filter((day) => day.total > 0).length;
  const openPeoActivitiesCount = peoActivities.filter((activity) => activity.status !== 'approved').length;
  const clarificationActivities = useMemo(() => getActivitiesWithPmClarifications(peoActivities), [peoActivities]);
  const hasPmClarifications = currentMonthStatus?.status === 'clarifications' || clarificationActivities.length > 0;
  const clarificationHref = `/expert/clarificari?month=${currentMonth}&year=${currentYear}`;
  const peoActivitiesWithDeliverablesCount = peoActivities.filter((activity) => (activity.deliverables?.length ?? 0) > 0).length;
  const monthlyDocumentCount = useMemo(() => {
    if (!currentExpert || !selectedMonthHasAccess) return 0;
    return documents.filter((document) => (
      document.uploadedByExpertId === currentExpert.id
      && isDateInMonth(document.activityDate || document.uploadDate, currentMonth, currentYear)
    )).length;
  }, [currentExpert, currentMonth, currentYear, documents, selectedMonthHasAccess]);
  const embeddedDeliverablesCount = peoActivities.reduce((sum, activity) => sum + (activity.deliverables?.length ?? 0), 0);
  const deliverablesCount = Math.max(monthlyDocumentCount, embeddedDeliverablesCount);
  const totalHoursProgress = percent(totalMonthHours, monthlyNormInfo.monthlyNorm);
  const workedDaysProgress = percent(workedDaysCount, monthlyNormInfo.workingDays);
  const openActivitiesProgress = percent(openPeoActivitiesCount, peoActivities.length);
  const deliverablesProgress = percent(peoActivitiesWithDeliverablesCount, peoActivities.length);
  const hasActiveConcurrentProjects = activeConcurrentProjects.length > 0;
  const dashboardReadinessItems = [
    pendingSharedAlerts.length > 0
      ? { label: 'Livrabile comune neînregistrate', detail: `${pendingSharedAlerts.length} livrabile necesita asociere in pontaj.`, severity: 'blocking' }
      : null,
    groupedPendingActivityAlerts.length > 0
      ? { label: 'Activitati comune sugerate', detail: `${groupedPendingActivityAlerts.length} activitati comune necesita decizie.`, severity: 'warning' }
      : null,
    exceededDays > 0
      ? { label: 'Depasiri limita zilnica', detail: `${exceededDays} zile depasesc limita de 8 ore.`, severity: 'blocking' }
      : null,
    hasPmClarifications
      ? { label: 'Clarificari PM', detail: `${clarificationActivities.length} activitati necesita clarificare.`, severity: 'warning' }
      : null,
  ].filter((item): item is { label: string; detail: string; severity: 'blocking' | 'warning' } => Boolean(item));
  const dashboardHasBlockingItems = dashboardReadinessItems.some((item) => item.severity === 'blocking');
  const currentReportStatus = currentMonthStatus?.status || 'draft';
  const isCurrentMonthApproved = currentReportStatus === 'approved';
  const isCurrentMonthSent = currentReportStatus === 'sent';
  const isCurrentMonthInReview = currentReportStatus === 'in_review';
  const canSubmitCurrentMonth =
    Boolean(currentExpert)
    && selectedMonthHasAccess
    && peoActivities.length > 0
    && !dashboardHasBlockingItems
    && !isCurrentMonthApproved
    && !isCurrentMonthSent
    && !isCurrentMonthInReview;
  const submitCurrentMonthTitle = !selectedMonthHasAccess
    ? 'Luna selectata nu este deblocata pentru editare.'
    : peoActivities.length === 0
      ? 'Adauga cel putin o activitate inainte de trimitere.'
      : dashboardHasBlockingItems
        ? dashboardReadinessItems.find((item) => item.severity === 'blocking')?.detail
        : isCurrentMonthApproved
          ? 'Luna este aprobata.'
          : isCurrentMonthInReview
            ? 'Raportarea este deja in verificare la PM.'
            : isCurrentMonthSent
              ? 'Luna a fost deja trimisa catre PM.'
              : 'Trimite luna catre PM.';
  const handleSubmitCurrentMonth = async () => {
    if (!currentExpert || !canSubmitCurrentMonth) {
      if (!canSubmitCurrentMonth) setSubmitNotice(submitCurrentMonthTitle || 'Luna nu poate fi trimisa in acest moment.');
      return;
    }

    setIsSubmittingMonth(true);
    setSubmitNotice(null);
    try {
      await updateCurrentMonthStatus({
        expertId: currentExpert.id,
        year: currentYear,
        month: currentMonth,
        status: 'sent',
        sentDate: new Date().toISOString(),
        expertAccessApproved: currentMonthStatus?.expertAccessApproved ?? false,
        expertAccessApprovedAt: currentMonthStatus?.expertAccessApprovedAt,
        pmNotes: currentMonthStatus?.pmNotes,
      } satisfies Omit<ReportStatus, 'id'>);
      setSubmitNotice('Luna a fost trimisa catre PM.');
    } catch (error) {
      setSubmitNotice(error instanceof Error ? error.message : 'Trimiterea lunii catre PM a esuat.');
    } finally {
      setIsSubmittingMonth(false);
    }
  };
  const selectedConcurrentProject = activeConcurrentProjects.find((project) => project.id === selectedConcurrentProjectId) ?? activeConcurrentProjects[0];
  const selectedProjectShortcutValue =
    selectedConcurrentProjectId && activeConcurrentProjects.some((project) => project.id === selectedConcurrentProjectId)
      ? selectedConcurrentProjectId
      : 'peo';

  const handleProjectShortcutChange = (projectId: string) => {
    if (projectId === 'peo') {
      setSelectedConcurrentProjectId('');
      return;
    }

    setSelectedConcurrentProjectId(projectId);
  };

  const handleOpenSelectedWorkspace = () => {
    if (!selectedMonthHasAccess) return;

    if (selectedProjectShortcutValue === 'peo') {
      router.push(`${peoHref}#calendar`);
      return;
    }

    setConsolidatedTab('paralele');
    window.requestAnimationFrame(() => {
      document.getElementById('proiecte-paralele')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const updateConcurrentDraft = (date: string, updates: Partial<ConcurrentProjectTimesheetEntry>) => {
    const existing = expertConcurrentEntries.find((entry) => entry.concurrentProjectId === selectedConcurrentProject?.id && entry.date === date);
    setDraftConcurrentEntries({
      ...draftConcurrentEntries,
      [date]: { ...existing, ...draftConcurrentEntries[date], ...updates },
    });
  };

  const saveConcurrentEntry = async (date: string) => {
    if (!selectedConcurrentProject || !currentExpert || !selectedMonthHasAccess) return;
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
    if (!currentExpert || !selectedMonthHasAccess) return;

    const response = await fetch('/api/export/pontaj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPontajExportPayload({
        kind: 'consolidated',
        expert: { ...currentExpert, hourlyRate: getStoredFinancialHourlyRate(currentExpert, currentMonth, currentYear) },
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

  const handleMonthAccessRequest = async () => {
    if (!currentExpert || isBaseMonth || currentMonthStatus?.expertAccessApproved === true) return;

    await requestMonthAccess({
      expertId: currentExpert.id,
      year: currentYear,
      month: currentMonth,
      expertName,
      requestedBy: signedInName || currentExpert.email || currentExpert.id,
    });
  };

  const welcomeExpertCard = (
    <div className="flex min-w-[250px] items-center justify-end gap-4 rounded-2xl border border-[#dce5ef] bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0 text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bine ai venit,</p>
        <p className="truncate text-2xl font-bold text-slate-950">{expertFirstName}</p>
      </div>
      <ExpertAvatar
        expert={currentExpert ?? { id: signedInUserId || 'expert', name: expertName }}
        className="h-20 w-20 border-4 border-[#eaf3fb] text-2xl shadow-sm sm:h-24 sm:w-24"
      />
    </div>
  );

  const calendarToolbar = (
    <>
      {hasActiveConcurrentProjects && (
        <div className="min-w-[240px] rounded-xl border border-[#dce5ef] bg-slate-50/80 p-2 shadow-sm">
          <p className="mb-1 px-1 text-xs font-semibold text-slate-600">Panou proiecte</p>
          <Select value={selectedProjectShortcutValue} onValueChange={handleProjectShortcutChange}>
            <SelectTrigger className="h-9 w-full bg-white">
              <SelectValue placeholder="Selecteaza proiect" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={`${currentMonth}-${currentYear}`}
          onValueChange={(value) => {
            const [month, year] = value.split('-').map(Number);
            setCurrentMonth(month);
            setCurrentYear(year);
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Luna" />
          </SelectTrigger>
          <SelectContent>
            {selectableYears.flatMap((year) =>
              MONTH_OPTIONS.map((month) => (
                <SelectItem key={`${month.value}-${year}`} value={`${month.value}-${year}`}>
                  {month.label} {year}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {!selectedMonthHasAccess && (
          selectedMonthRequestPending ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              Cerere trimisa PM
            </Badge>
          ) : (
            <Button type="button" variant="outline" onClick={handleMonthAccessRequest} disabled={!currentExpert}>
              Solicita acces PM
            </Button>
          )
        )}
      </div>
      {selectedMonthHasAccess ? (
        <Button type="button" onClick={handleOpenSelectedWorkspace} disabled={!currentExpert}>
          {selectedProjectShortcutValue === 'peo' ? (
            <>
              Deschide calendarul
              <CalendarDays className="h-4 w-4" />
            </>
          ) : (
            <>
              Deschide pontajul
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      ) : (
        <Button type="button" disabled>
          {selectedProjectShortcutValue === 'peo' ? (
            <>
              Deschide calendarul
              <CalendarDays className="h-4 w-4" />
            </>
          ) : (
            <>
              Deschide pontajul
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      )}
      {canOpenPmDashboard && (
        <Button asChild variant="outline">
          <Link href="/pm">Dashboard PM</Link>
        </Button>
      )}
      <UserMenu />
    </>
  );

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
        reportingMonth={`${getMonthName(currentMonth)} ${currentYear}`}
        description={`Centralizeaza activitatile si orele raportate pentru toate proiectele CPC in luna ${getMonthName(currentMonth)} anul ${currentYear}.`}
        contentClassName="max-w-none"
        actions={welcomeExpertCard}
        quickTabs={[
          { label: 'Rapoarte', href: `${peoHref}#rapoarte`, icon: BriefcaseBusiness },
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
                <span className="text-sm text-muted-foreground">din {monthlyNormInfo.monthlyNorm}h planificate</span>
              </div>
              <ProgressBar value={totalHoursProgress} className="mt-4" />
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ore disponibile</span>
                  <span className="font-semibold text-[#087a63]">{Math.max(0, monthlyNormInfo.monthlyNorm - totalMonthHours)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Limita lunară</span>
                  <span className="font-semibold">{monthlyNormInfo.monthlyNorm}h</span>
                </div>
              </div>
              {hasActiveConcurrentProjects && (
                <Link href="#pontaj-consolidat" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Vezi detalii complete
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </RightInfoCard>

            <RightInfoCard title="Submit readiness" icon={ClipboardList}>
              <div className="space-y-3 text-sm">
                {dashboardReadinessItems.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                    Nu exista blocaje sau warninguri pentru luna selectata.
                  </div>
                ) : (
                  dashboardReadinessItems.map((item) => (
                    <div key={item.label} className="rounded-lg border bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{item.label}</p>
                        <Badge variant={item.severity === 'blocking' ? 'destructive' : 'outline'}>
                          {item.severity === 'blocking' ? 'Blocant' : 'Atentie'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))
                )}
              </div>
              {dashboardReadinessItems.length === 0 && (
                <span className="mt-4 block" title={submitCurrentMonthTitle}>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSubmitCurrentMonth}
                    disabled={!canSubmitCurrentMonth || isSubmittingMonth}
                  >
                    {isSubmittingMonth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {isCurrentMonthApproved
                      ? 'Luna aprobata'
                      : isCurrentMonthInReview
                        ? 'In verificare PM'
                        : isCurrentMonthSent
                          ? 'Luna trimisa catre PM'
                          : 'Trimite luna la PM'}
                  </Button>
                </span>
              )}
              {submitNotice && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  {submitNotice}
                </p>
              )}
              <Link href={`${peoHref}#calendar`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Deschide calendarul PEO
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RightInfoCard>

            <RightInfoCard title="Livrabile comune neînregistrate" icon={AlertTriangle}>
              {pendingSharedAlerts.length > 0 ? (
                <div className="space-y-3">
                  {pendingSharedAlerts.map((alert) => (
                    <div key={alert.relationId} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                      <p className="text-sm font-semibold">{alert.title || alert.fileName || 'Document comun'}</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        {alert.message}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {alert.projectId && <Badge variant="outline" className="border-amber-300 bg-white/80 text-amber-950">{alert.projectId}</Badge>}
                        {alert.saCode && <Badge variant="outline" className="border-amber-300 bg-white/80 text-amber-950">{alert.saCode}</Badge>}
                        {alert.activityDate && <Badge variant="outline" className="border-amber-300 bg-white/80 text-amber-950">{alert.activityDate}</Badge>}
                        <Badge variant="secondary">{alert.status}</Badge>
                      </div>
                      <Button asChild size="sm" className="mt-3">
                        <Link href={`${peoHref}&sharedDeliverableRelationId=${encodeURIComponent(alert.relationId)}`}>
                          Asociaza in pontajul meu
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nu exista livrabile comune neînregistrate pentru luna selectata.</p>
              )}
            </RightInfoCard>

            <RightInfoCard title="Clarificări PM" icon={AlertTriangle}>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={hasPmClarifications ? 'destructive' : 'outline'}
                    className={hasPmClarifications ? undefined : 'border-slate-200 bg-slate-50 text-slate-600'}
                  >
                    {hasPmClarifications ? 'Clarificări solicitate' : 'Fără clarificări'}
                  </Badge>
                </div>
                {currentMonthStatus?.pmNotes ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <p className="text-xs font-semibold uppercase tracking-wide">Observații PM</p>
                    <p className="mt-1 leading-6">{currentMonthStatus.pmNotes}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Nu există observații lunare de la PM pentru luna selectată.
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Activități marcate</span>
                  <span className="font-semibold text-slate-950">{clarificationActivities.length}</span>
                </div>
                {clarificationActivities[0] ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    Ultima clarificare: {clarificationActivities[0].title || clarificationActivities[0].activityType}
                  </div>
                ) : null}
              </div>
              <Button asChild className="mt-5 w-full" variant={hasPmClarifications ? 'default' : 'outline'}>
                <Link href={clarificationHref}>
                  Vezi clarificări
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </RightInfoCard>

            <RightInfoCard title="Status raportare" icon={ClipboardList}>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-muted-foreground">Luna selectata</span>
                  <span className="rounded-full bg-[#e9faf5] px-3 py-1 text-xs font-semibold text-[#087a63]">Deschisă</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pontaj</span>
                  <span className="rounded-full bg-[#eaf3fb] px-3 py-1 text-xs font-semibold text-primary">În lucru</span>
                </div>
              </div>
              <Link href={peoHref} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Vezi istoricul raportărilor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RightInfoCard>
          </>
        }
      >

        {!selectedMonthHasAccess && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Acces luna blocat
            </div>
            <p className="mt-2 text-sm text-amber-800">
              Datele pentru {getMonthName(currentMonth)} {currentYear} raman ascunse pana cand PM aproba accesul pentru aceasta luna.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selectedMonthRequestPending ? (
                <Badge variant="outline" className="border-amber-300 bg-white text-amber-900">
                  Cerere trimisa catre PM
                </Badge>
              ) : (
                <Button type="button" size="sm" onClick={handleMonthAccessRequest} disabled={!currentExpert}>
                  Solicita acces PM
                </Button>
              )}
            </div>
          </section>
        )}

        {(pendingActivityAlerts.length > 0 || ignoredActivityAlerts.length > 0 || returnedActivityAlerts.length > 0) && (
          <Tabs defaultValue="active" className="space-y-3">
            <TabsList>
              <TabsTrigger value="active">Colaborari active</TabsTrigger>
              <TabsTrigger value="rejected">
                Colaborari respinse ({ignoredActivityAlerts.length + returnedActivityAlerts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {groupedPendingActivityAlerts.length > 0 && (
                <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Activitati comune sugerate
                  </div>
                  <div className="mt-3 space-y-2">
                    {groupedPendingActivityAlerts.map((alert) => (
                      <div key={alert.relationIds.join('|')} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium">Sugestie de la {alert.sourceExpertName}</div>
                            {alert.sourceActivityTitle && (
                              <div className="mt-1 text-sm font-semibold text-amber-950">{alert.sourceActivityTitle}</div>
                            )}
                          </div>
                        </div>
                        <SharedActivityDescription alert={alert} />
                        <SharedActivityMetadata alert={alert} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          {alert.alerts.map((activityAlert) => (
                            <Button key={activityAlert.relationId} asChild size="sm" className="h-8 rounded-md">
                              <Link href={`${peoHref}&sharedActivityRelationId=${encodeURIComponent(activityAlert.relationId)}`}>
                                {alert.alerts.length > 1 && activityAlert.sourceActivityDate
                                  ? `Adauga ${activityAlert.sourceActivityDate}`
                                  : 'Adauga activitate'}
                              </Link>
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md border-amber-300 text-amber-900"
                            onClick={() => handleIgnoreActivitySuggestionGroup(alert.relationIds)}
                          >
                            {alert.relationIds.length > 1 ? 'Ignora activitatile' : 'Ignora activitatea'}
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
                      {alert.sourceActivityTitle && <div className="mt-1 text-sm font-medium">{alert.sourceActivityTitle}</div>}
                      <SharedActivityDescription alert={alert} subtle />
                      <SharedActivityMetadata alert={alert} subtle />
                    </div>
                  ))}
                  {returnedActivityAlerts.map((alert) => (
                    <div key={alert.relationId} className="rounded-md border bg-card p-3 text-sm">
                      <div className="font-medium">{alert.targetExpertName} a ignorat sugestia ta</div>
                      {alert.sourceActivityTitle && <div className="mt-1 text-sm font-medium">{alert.sourceActivityTitle}</div>}
                      <div className="mt-1 text-xs text-muted-foreground">{alert.message}</div>
                      <SharedActivityDescription alert={alert} subtle />
                      <SharedActivityMetadata alert={alert} subtle />
                    </div>
                  ))}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Clock3}
            label="Total ore raportate"
            value={`${totalMonthHours}h`}
            description={`din ${monthlyNormInfo.monthlyNorm}h planificate`}
            progress={totalHoursProgress}
            tone="blue"
          />
          <StatCard
            icon={CalendarDays}
            label="Zile lucrate"
            value={workedDaysCount}
            description="zile cu pontaj in luna selectata"
            progress={workedDaysProgress}
            tone="success"
          />
          <StatCard
            icon={AlertTriangle}
            label="Activități în curs"
            value={openPeoActivitiesCount}
            description={`${peoActivities.length} activități PEO`}
            progress={openActivitiesProgress}
            tone="warning"
          />
          <StatCard
            icon={ClipboardList}
            label="Livrabile atașate"
            value={deliverablesCount}
            description="documente disponibile"
            progress={deliverablesProgress}
            tone="violet"
          />
        </section>

        <section className="grid gap-3 rounded-[1.5rem] border bg-card p-3 md:grid-cols-4">
          {workTabs.map((tab) => {
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

            if (tab.active || tab.href !== '#') {
              return (
                <Button
                  key={tab.label}
                  asChild
                  variant={tab.active ? 'default' : 'outline'}
                  className={cn(
                    'h-12 rounded-md',
                    tab.active ? 'justify-between' : 'justify-start',
                  )}
                >
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

        <section className="space-y-6">
          <DashboardCalendar projects={projects} month={currentMonth} year={currentYear} toolbar={calendarToolbar} />

          {hasActiveConcurrentProjects && (
            <Card id="pontaj-consolidat" className="h-fit rounded-lg scroll-mt-24">
            <CardHeader className="border-b">
              <CardTitle className="text-lg">Detalii pontaj consolidat</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs value={consolidatedTab} onValueChange={setConsolidatedTab} className="w-full">
                <TabsList className="grid h-auto w-full gap-2 bg-muted/50 p-1 sm:grid-cols-3">
                  <TabsTrigger value="ore">Ore luna selectata</TabsTrigger>
                  <TabsTrigger value="consolidat">Pontaj consolidat</TabsTrigger>
                  <TabsTrigger value="paralele">Proiect paralel</TabsTrigger>
                </TabsList>

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
                        <Badge variant="secondary">{project.id === 'peo' ? peoMonthHours : getProjectTotal(project)}h</Badge>
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
                        <div className="mt-1 text-muted-foreground">PEO {row.peoHours}h · CPC/Concordia CO {row.cpcLeaveHours}h · paralele {Object.values(row.concurrentHoursByProject).reduce((sum, hours) => sum + hours, 0)}h · {row.dayTypes.join(', ') || 'lucrătoare'}</div>
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
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nu ai proiecte paralele active in luna selectata.</div>
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
              <div className="mt-4 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    exportPontaj().catch((error) => {
                      console.error('Eroare export pontaj:', error);
                      alert(error instanceof Error ? error.message : 'Exportul pontajului a esuat.');
                    });
                  }}
                  disabled={!currentExpert || !selectedMonthHasAccess}
                >
                  Export pontaj
                </Button>
              </div>
            </CardContent>
            </Card>
          )}
        </section>
      </DashboardShell>
    </>
  );
}
