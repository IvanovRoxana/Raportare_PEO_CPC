'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, ClipboardList, Loader2 } from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserMenu } from '@/components/user-menu';
import { useActivitiesByMonth, useExperts, useReportStatus } from '@/hooks/use-backend-data';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { buildClarificationEditHref, getActivitiesWithPmClarifications } from '@/lib/pm-clarifications';
import type { Activity } from '@/lib/types';

function readMonthParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 11 ? parsed : fallback;
}

function readYearParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : fallback;
}

function formatDateRo(date?: string) {
  if (!date) return 'Data nespecificata';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ActivityClarificationCard({ activity, month, year }: { activity: Activity; month: number; year: number }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatDateRo(activity.date)}</Badge>
              <Badge variant="secondary">{activity.hours}h</Badge>
              {activity.saCode ? <Badge variant="outline">{activity.saCode}</Badge> : null}
            </div>
            <h2 className="text-lg font-semibold text-slate-950">
              {activity.title || activity.activityType || 'Activitate fara titlu'}
            </h2>
            {activity.description ? (
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{activity.description}</p>
            ) : null}
          </div>
          <Button asChild>
            <Link href={buildClarificationEditHref(activity, month, year)}>
              Modifică activitatea
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Clarificare PM</p>
          <p className="mt-1 leading-6">{activity.pmNotes}</p>
        </div>
        {activity.updatedAt ? (
          <p className="text-xs text-muted-foreground">
            Ultima modificare activitate: {new Date(activity.updatedAt).toLocaleString('ro-RO')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ExpertClarificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const month = readMonthParam(searchParams.get('month'), today.getMonth());
  const year = readYearParam(searchParams.get('year'), today.getFullYear());
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { experts } = useExperts();
  const { activities: monthActivities, isLoading: activitiesLoading } = useActivitiesByMonth(month, year);
  const currentExpert = useMemo(() => {
    const normalizedEmail = signedInEmail?.toLowerCase();
    return experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (!normalizedEmail) return false;
      return expert.email?.toLowerCase() === normalizedEmail;
    }) ?? null;
  }, [experts, signedInEmail, signedInUserId]);
  const { status: reportStatus, isLoading: reportStatusLoading } = useReportStatus(currentExpert?.id ?? null, month, year);
  const expertActivities = useMemo(
    () => currentExpert ? monthActivities.filter((activity) => activity.expertId === currentExpert.id) : [],
    [currentExpert, monthActivities],
  );
  const clarificationActivities = useMemo(
    () => getActivitiesWithPmClarifications(expertActivities),
    [expertActivities],
  );

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;
        if (!user) {
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          router.replace('/auth/login?redirectTo=/expert/clarificari');
          return;
        }

        setIsAuthenticated(true);
        setSignedInUserId(user.id ?? null);
        setSignedInEmail(user.email ?? null);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setIsAuthLoading(false);
        router.replace('/auth/login?redirectTo=/expert/clarificari');
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

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
        title="Clarificări PM"
        description={`Activitățile marcate de PM pentru ${getMonthName(month)} ${year}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/expert">
                <ArrowLeft className="h-4 w-4" />
                Înapoi la pontaj
              </Link>
            </Button>
            <UserMenu />
          </>
        }
        quickTabs={[
          { label: 'Clarificări', href: '#clarificari', icon: AlertTriangle, active: true },
          { label: 'Activitățile mele', href: '/expert/peo', icon: ClipboardList },
          { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
        ]}
      >
        <div id="clarificari" className="space-y-5">
          <Card className="rounded-lg">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">
                  {getMonthName(month)} {year}
                </CardTitle>
                <Badge variant={reportStatus?.status === 'clarifications' ? 'destructive' : 'outline'}>
                  {reportStatus?.status === 'clarifications' ? 'Clarificări solicitate' : 'Fără status de clarificări'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportStatus?.pmNotes ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Observații lunare PM</p>
                  <p className="mt-1 leading-6">{reportStatus.pmNotes}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nu exista observații lunare PM pentru luna selectată.</p>
              )}
              <p className="text-sm text-muted-foreground">
                {clarificationActivities.length} activități au clarificări punctuale.
              </p>
            </CardContent>
          </Card>

          {activitiesLoading || reportStatusLoading ? (
            <div className="flex items-center justify-center rounded-lg border bg-card py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clarificationActivities.length > 0 ? (
            <div className="space-y-3">
              {clarificationActivities.map((activity) => (
                <ActivityClarificationCard key={activity.id} activity={activity} month={month} year={year} />
              ))}
            </div>
          ) : (
            <Card className="rounded-lg">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold">Nu sunt activități marcate punctual</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dacă PM a transmis doar o observație lunară, revizuiește pontajul din pagina activităților.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/expert/peo?month=${month}&year=${year}`}>Deschide activitățile lunii</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardShell>
    </>
  );
}
