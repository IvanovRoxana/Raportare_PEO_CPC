'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Loader2, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { ReportGenerator } from '@/components/expert/report-generator';
import { ReportingWorkBlockDraftPanel } from '@/components/expert/reporting-work-block-draft-panel';
import { ReportingWorkBlocksPanel } from '@/components/expert/reporting-work-blocks-panel';
import { MonthlyReportExport } from '@/components/expert/monthly-report-export';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';
import { isAnexa10DeterministicDocxEnabledClient, isReportingWorkBlocksEnabledClient } from '@/lib/feature-flags';
import type { Expert } from '@/lib/types';
import {
  useActivitiesByMonth,
  useConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
  useExperts,
  useReportingWorkBlockBundles,
} from '@/hooks/use-backend-data';

function readMonthParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 11 ? parsed : fallback;
}

function readYearParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : fallback;
}

function buildPeoHref(expertId: string | null, month: number, year: number) {
  const params = new URLSearchParams({
    month: String(month),
    year: String(year),
  });
  if (expertId) params.set('expertId', expertId);
  return `/expert/peo?${params.toString()}`;
}

function ExportRaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date();
  const currentMonth = readMonthParam(searchParams.get('month'), today.getMonth());
  const currentYear = readYearParam(searchParams.get('year'), today.getFullYear());
  const queryExpertId = searchParams.get('expertId');
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(queryExpertId);
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading } = useActivitiesByMonth(currentMonth, currentYear);
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);
  const { entries: concurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const {
    bundles: persistedWorkBlockBundles,
    status: bundlesStatus,
    isReady: bundlesReady,
    isLoading: isLoadingPersistedWorkBlockBundles,
    isRefreshing: isRefreshingPersistedWorkBlockBundles,
  } = useReportingWorkBlockBundles(selectedExpertId, currentMonth, currentYear);

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;

        if (!user) {
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          const redirectTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
          router.replace(`/auth/login?redirectTo=${redirectTo}`);
          return;
        }

        setIsAuthenticated(true);
        setSignedInUserId(user.id ?? null);
        setUserEmail(user.email ?? user.displayName ?? null);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setIsAuthLoading(false);
        const redirectTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        router.replace(`/auth/login?redirectTo=${redirectTo}`);
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (isAuthLoading || experts.length === 0) return;

    if (queryExpertId && experts.some((expert) => expert.id === queryExpertId)) {
      if (selectedExpertId !== queryExpertId) setSelectedExpertId(queryExpertId);
      return;
    }

    if (selectedExpertId && experts.some((expert) => expert.id === selectedExpertId)) return;

    const normalizedIdentity = userEmail?.toLowerCase();
    const matchingExpert = experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (!normalizedIdentity) return false;
      return expert.email?.toLowerCase() === normalizedIdentity
        || expert.name?.toLowerCase() === normalizedIdentity;
    }) ?? null;
    setSelectedExpertId(matchingExpert?.id ?? experts[0]?.id ?? null);
  }, [experts, isAuthLoading, queryExpertId, selectedExpertId, signedInUserId, userEmail]);

  const selectedExpert = useMemo(() => {
    const expert = experts.find((item) => item.id === selectedExpertId) || experts[0];
    return expert || { id: '', name: 'Expert', role: '', norma: 8, saCodes: [] };
  }, [experts, selectedExpertId]);

  const activities = useMemo(() => {
    if (!selectedExpertId) return [];
    return allMonthActivities.filter((activity) => activity.expertId === selectedExpertId);
  }, [allMonthActivities, selectedExpertId]);

  const isLoading = isAuthLoading || expertsLoading || activitiesLoading;
  const backHref = buildPeoHref(selectedExpertId, currentMonth, currentYear);
  const reportingWorkBlocksEnabled = isReportingWorkBlocksEnabledClient();
  const deterministicAnexa10DocxEnabled = isAnexa10DeterministicDocxEnabledClient();
  const isLoadingDeterministicWorkBlocks = reportingWorkBlocksEnabled
    && (!bundlesReady || isLoadingPersistedWorkBlockBundles || isRefreshingPersistedWorkBlockBundles);
  const usePersistedWorkBlockBundles = reportingWorkBlocksEnabled && bundlesStatus === 'success';
  const useActivityWorkBlockFallback = reportingWorkBlocksEnabled
    && bundlesReady
    && bundlesStatus === 'empty';
  const deterministicWorkBlockBundles = usePersistedWorkBlockBundles || useActivityWorkBlockFallback
    ? persistedWorkBlockBundles
    : undefined;

  if (isLoading && (experts.length === 0 || !selectedExpertId)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Se incarca datele pentru export...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !selectedExpertId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md rounded-lg">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Lock className="h-10 w-10 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Autentificare necesara</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Nu am gasit un profil de expert asociat contului curent. Autentifica-te din nou sau contacteaza administratorul pentru asocierea profilului.
              </p>
            </div>
            <Button asChild>
              <Link href="/auth/login?redirectTo=/expert/peo/export">Mergi la autentificare</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert/peo"
        navItems={expertNavItems}
        eyebrow="Modul Expert"
        title="Export RA"
        reportingMonth={`${getMonthName(currentMonth)} ${currentYear}`}
        description={`Genereaza si descarca Raportul de Activitate pentru ${selectedExpert.name}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
                Inapoi la activitati
              </Link>
            </Button>
            <MonthlyReportExport
              expert={selectedExpert as Expert}
              activities={activities}
              concurrentProjects={concurrentProjects}
              concurrentTimesheetEntries={concurrentTimesheetEntries.filter((entry) => entry.expertId === selectedExpertId)}
              workBlockBundles={deterministicWorkBlockBundles}
              workBlockBundlesLoading={isLoadingDeterministicWorkBlocks}
              month={currentMonth}
              year={currentYear}
            />
          </>
        }
      >
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Raport de Activitate</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedExpert.name} - {getMonthName(currentMonth)} {currentYear}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium">
                <Download className="h-4 w-4" />
                {activities.length} activitati, {activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0)}h
              </div>
            </div>
          </div>
          {reportingWorkBlocksEnabled && (
            <>
              <ReportingWorkBlocksPanel
                activities={activities}
                month={currentMonth}
                year={currentYear}
                persistedBundles={persistedWorkBlockBundles}
              />
              <ReportingWorkBlockDraftPanel
                expertId={selectedExpertId}
                projectCode={selectedExpert.projectCode ?? '302141'}
                month={currentMonth}
                year={currentYear}
                activities={activities}
                existingBundles={persistedWorkBlockBundles}
                existingBundlesLoading={isLoadingPersistedWorkBlockBundles || isRefreshingPersistedWorkBlockBundles}
              />
            </>
          )}
          <ReportGenerator
            activities={activities}
            month={currentMonth}
            year={currentYear}
            expertName={selectedExpert.name}
            expert={selectedExpert as Expert}
            enableDeterministicAnexa10Docx={deterministicAnexa10DocxEnabled}
            isLoadingDeterministicWorkBlocks={isLoadingDeterministicWorkBlocks}
            workBlockBundles={deterministicWorkBlockBundles}
          />
        </div>
      </DashboardShell>
    </>
  );
}

export default function ExportRaPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Se incarca exportul RA...</span>
        </div>
      </div>
    }>
      <ExportRaContent />
    </Suspense>
  );
}
