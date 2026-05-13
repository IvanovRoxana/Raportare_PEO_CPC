'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Globe2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserMenu } from '@/components/user-menu';
import { useActivitiesByMonth, useDocuments, useExperts, useSharedDeliverables } from '@/hooks/use-backend-data';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { buildPendingSharedDeliverableAlerts } from '@/lib/document-sharing';
import type { Activity } from '@/lib/types';
import { getRomanianHolidays } from '@/lib/working-hours';
import { cn } from '@/lib/utils';

type ProjectItem = {
  id: string;
  name: string;
  href: string;
  activities: Activity[];
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
  });

  return totals;
}

function getProjectTotal(project: ProjectItem) {
  return project.activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
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
  const holidays = useMemo(() => new Set(getRomanianHolidays(year).map((date) => toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()))), [year]);
  const dayTotals = useMemo(() => getDayTotals(projects), [projects]);
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  return (
    <section className="rounded-lg border bg-card">
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
            const isWeekend = [0, 6].includes(day.date.getDay());
            const isHoliday = holidays.has(day.dateStr);
            const hasHours = totalHours > 0;
            const exceedsLimit = totalHours > 8;

            return (
              <div
                key={day.dateStr}
                className={cn(
                  'min-h-24 rounded-md border p-2 text-sm',
                  isWeekend || isHoliday ? 'border-muted bg-muted/40 text-muted-foreground' : 'bg-background',
                  hasHours && !exceedsLimit && 'border-green-300 bg-green-50 text-green-950',
                  exceedsLimit && 'border-red-300 bg-red-50 text-red-950'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{day.day}</span>
                  {isHoliday && <span className="text-[10px] font-semibold">SL</span>}
                </div>

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

export default function ExpertHomeDashboard() {
  const [currentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState('expert');

  const { experts } = useExperts();
  const { activities: monthActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { documents } = useDocuments();

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (user?.email) setSignedInEmail(user.email);
      if (user?.displayName) setSignedInName(user.displayName);
    });
  }, []);

  const currentExpert = useMemo(() => {
    if (!signedInEmail) return null;
    return experts.find((expert) => expert.email?.toLowerCase() === signedInEmail.toLowerCase()) ?? null;
  }, [experts, signedInEmail]);

  const expertName = currentExpert?.name ?? signedInName;
  const { sharedDeliverables } = useSharedDeliverables(currentExpert?.id);
  const pendingSharedAlerts = useMemo(() => {
    if (!currentExpert) return [];
    return buildPendingSharedDeliverableAlerts({
      expert: currentExpert,
      documents,
      sharedDeliverables,
    });
  }, [currentExpert, documents, sharedDeliverables]);

  const peoActivities = useMemo(() => {
    if (!currentExpert) return [];
    return monthActivities.filter((activity) => activity.expertId === currentExpert.id);
  }, [currentExpert, monthActivities]);

  const projects = useMemo<ProjectItem[]>(
    () => [
      {
        id: 'peo',
        name: 'PEO',
        href: '/expert/peo',
        activities: peoActivities,
      },
    ],
    [peoActivities]
  );

  const dayTotals = useMemo(() => getDayTotals(projects), [projects]);
  const exceededDays = Array.from(dayTotals.values()).filter((day) => day.total > 8).length;
  const totalMonthHours = projects.reduce((sum, project) => sum + getProjectTotal(project), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-primary">Dashboard expert</p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Bine ai venit - {expertName} -!
            </h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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
                    <Link href="/expert/peo">Asociaza in pontajul meu</Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-4">
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

          <Card className="h-fit rounded-lg">
            <CardHeader className="border-b">
              <CardTitle className="text-lg">Panou proiecte</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs defaultValue="proiecte" className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-muted/50 p-1">
                  <TabsTrigger value="proiecte">Selectează Proiect</TabsTrigger>
                  <TabsTrigger value="ore">Ore luna curentă</TabsTrigger>
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
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {exceededDays > 0 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-red-700">{exceededDays} zile peste 8 ore.</span>
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
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
