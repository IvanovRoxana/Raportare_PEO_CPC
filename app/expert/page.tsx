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
  Loader2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserMenu } from '@/components/user-menu';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { getRomanianHolidays } from '@/lib/working-hours';
import { useActivitiesByMonth, useExperts } from '@/hooks/use-backend-data';
import type { Activity, Expert } from '@/lib/types';
import { cn } from '@/lib/utils';

type ProjectDashboardItem = {
  id: string;
  name: string;
  description: string;
  href: string;
  isAvailable: boolean;
  activities: Activity[];
};

const dashboardTabs = [
  {
    value: 'raportare',
    label: 'Raportare',
    href: '/expert/peo',
    icon: ClipboardList,
    description: 'Acces direct la raportarea PEO construită până acum.',
  },
  {
    value: 'grupuri',
    label: 'Grupuri de lucru',
    href: '#',
    icon: Users,
    description: 'Spațiu rezervat pentru paginile grupurilor de lucru.',
  },
  {
    value: 'colegi',
    label: 'Activități Colegi',
    href: '#',
    icon: BriefcaseBusiness,
    description: 'Spațiu rezervat pentru vizualizarea activităților colegilor.',
  },
  {
    value: 'eu-affairs',
    label: 'EU Affairs',
    href: '#',
    icon: Globe2,
    description: 'Spațiu rezervat pentru raportarea EU Affairs.',
  },
];

const dayNames = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

function getMonthRange(month: number, year: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      day,
      date: new Date(year, month, day),
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  });
}

function getActivitiesByDay(projects: ProjectDashboardItem[]) {
  const dayMap = new Map<string, { totalHours: number; projectHours: Record<string, number> }>();

  projects.forEach((project) => {
    project.activities.forEach((activity) => {
      const entry = dayMap.get(activity.date) ?? { totalHours: 0, projectHours: {} };
      const hours = Number(activity.hours) || 0;
      entry.totalHours += hours;
      entry.projectHours[project.id] = (entry.projectHours[project.id] || 0) + hours;
      dayMap.set(activity.date, entry);
    });
  });

  return dayMap;
}

function DashboardCalendar({
  month,
  year,
  projects,
}: {
  month: number;
  year: number;
  projects: ProjectDashboardItem[];
}) {
  const holidays = useMemo(() => getRomanianHolidays(year), [year]);
  const activitiesByDay = useMemo(() => getActivitiesByDay(projects), [projects]);
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDow = (firstDay.getDay() + 6) % 7;
    return [...Array(startDow).fill(null), ...getMonthRange(month, year)];
  }, [month, year]);

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              Calendar ore proiecte
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {getMonthName(month)} {year}. Totalul zilnic nu trebuie să depășească 8 ore.
            </p>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            Limită zilnică: 8h
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
          {dayNames.map((day, index) => (
            <div key={day} className={cn('p-2', index >= 5 && 'text-red-600')}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 pt-2">
          {calendarDays.map((item, index) => {
            if (!item) {
              return <div key={`empty-${index}`} className="min-h-[82px]" />;
            }

            const dow = item.date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = holidays.includes(item.dateStr);
            const dayEntry = activitiesByDay.get(item.dateStr);
            const totalHours = dayEntry?.totalHours ?? 0;
            const exceedsLimit = totalHours > 8;
            const hasHours = totalHours > 0;

            return (
              <div
                key={item.dateStr}
                className={cn(
                  'min-h-[82px] rounded-md border p-2 text-sm transition-colors',
                  isWeekend || isHoliday
                    ? 'border-muted bg-muted/40 text-muted-foreground'
                    : 'border-border bg-background',
                  hasHours && !exceedsLimit && 'border-green-300 bg-green-50 text-green-900',
                  exceedsLimit && 'border-red-300 bg-red-50 text-red-900'
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-semibold">{item.day}</span>
                  {isHoliday && <span className="text-[10px]">SL</span>}
                </div>
                {hasHours ? (
                  <div className="mt-2">
                    <div className="text-2xl font-bold leading-none">{totalHours}h</div>
                    <div className="mt-1 space-y-0.5 text-[10px]">
                      {projects
                        .filter((project) => (dayEntry?.projectHours[project.id] ?? 0) > 0)
                        .map((project) => (
                          <div key={project.id} className="truncate">
                            {project.name}: {dayEntry?.projectHours[project.id]}h
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">-</div>
                )}
                {exceedsLimit && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    <AlertTriangle className="h-3 w-3" />
                    peste 8h
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function getProjectTotals(projects: ProjectDashboardItem[]) {
  return projects.map((project) => ({
    ...project,
    totalHours: project.activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0),
  }));
}

export default function ExpertHomeDashboard() {
  const [currentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading } = useActivitiesByMonth(
    currentMonth,
    currentYear
  );

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (user?.email) {
        setUserEmail(user.email);
      }
    });
  }, []);

  const selectedExpert = useMemo<Expert | null>(() => {
    if (experts.length === 0) return null;
    if (!userEmail) return experts[0];
    return experts.find((expert) => expert.email?.toLowerCase() === userEmail.toLowerCase()) ?? experts[0];
  }, [experts, userEmail]);

  const peoActivities = useMemo(() => {
    if (!selectedExpert) return [];
    return allMonthActivities.filter((activity) => activity.expertId === selectedExpert.id);
  }, [allMonthActivities, selectedExpert]);

  const projects = useMemo<ProjectDashboardItem[]>(
    () => [
      {
        id: 'peo',
        name: 'PEO',
        description: 'Programul PEO - raportarea construită deja.',
        href: '/expert/peo',
        isAvailable: true,
        activities: peoActivities,
      },
    ],
    [peoActivities]
  );

  const projectTotals = useMemo(() => getProjectTotals(projects), [projects]);
  const totalMonthHours = projectTotals.reduce((sum, project) => sum + project.totalHours, 0);
  const exceededDays = useMemo(() => {
    const activitiesByDay = getActivitiesByDay(projects);
    return Array.from(activitiesByDay.values()).filter((entry) => entry.totalHours > 8).length;
  }, [projects]);

  const isLoading = expertsLoading || activitiesLoading;
  const expertName = selectedExpert?.name ?? 'Expert';

  if (isLoading && !selectedExpert) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Se încarcă dashboardul...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div>
            <p className="text-sm font-medium text-primary">Dashboard expert</p>
            <h1 className="text-2xl font-bold text-foreground">Bine ai venit - {expertName}!</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        <section className="rounded-lg border bg-card p-4">
          <Tabs defaultValue="raportare" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-muted/50 p-1 md:grid-cols-4">
              {dashboardTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="justify-start gap-2 py-3">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {dashboardTabs.map((tab) => {
              const isAvailable = tab.value === 'raportare';
              return (
                <TabsContent key={tab.value} value={tab.value} className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-background p-4">
                    <div>
                      <h2 className="text-lg font-semibold">{tab.label}</h2>
                      <p className="text-sm text-muted-foreground">{tab.description}</p>
                    </div>
                    {isAvailable ? (
                      <Button asChild>
                        <Link href={tab.href}>
                          Deschide PEO
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Badge variant="outline">Se va configura ulterior</Badge>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <DashboardCalendar month={currentMonth} year={currentYear} projects={projects} />

          <Card className="h-fit">
            <CardContent className="p-4">
              <Tabs defaultValue="proiecte" orientation="vertical" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="proiecte">Selectează Proiect</TabsTrigger>
                  <TabsTrigger value="ore">Ore lună</TabsTrigger>
                </TabsList>

                <TabsContent value="proiecte" className="mt-4 space-y-3">
                  {projects.map((project) => (
                    <Button
                      key={project.id}
                      asChild={project.isAvailable}
                      variant={project.isAvailable ? 'default' : 'outline'}
                      className="h-auto w-full justify-between py-3"
                      disabled={!project.isAvailable}
                    >
                      {project.isAvailable ? (
                        <Link href={project.href}>
                          <span className="text-left">
                            <span className="block font-semibold">{project.name}</span>
                            <span className="block text-xs opacity-80">{project.description}</span>
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span className="text-left">
                          <span className="block font-semibold">{project.name}</span>
                          <span className="block text-xs opacity-80">{project.description}</span>
                        </span>
                      )}
                    </Button>
                  ))}
                </TabsContent>

                <TabsContent value="ore" className="mt-4 space-y-4">
                  <div className="rounded-md border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">
                      Total ore {getMonthName(currentMonth)} {currentYear}
                    </div>
                    <div className="mt-1 text-3xl font-bold">{totalMonthHours}h</div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {exceededDays > 0 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-red-700">{exceededDays} zile depășesc 8 ore.</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-green-700">Nu există depășiri de 8 ore/zi.</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {projectTotals.map((project) => (
                      <div key={project.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <div className="font-medium">{project.name}</div>
                          <div className="text-xs text-muted-foreground">{project.description}</div>
                        </div>
                        <Badge variant="secondary">{project.totalHours}h</Badge>
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
