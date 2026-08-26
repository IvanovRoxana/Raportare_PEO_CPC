'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle, Download, Loader2, Lock, Send } from 'lucide-react';
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
import type { Activity, Expert } from '@/lib/types';
import type { ReportStatus } from '@/lib/types';
import {
  useActivitiesByMonth,
  useConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
  useExpertNormContracts,
  useExperts,
  useFinancialPersonLinks,
  useLeaveEntries,
  useReportStatus,
  useReportingWorkBlockBundles,
} from '@/hooks/use-backend-data';
import { getWorkingDaysListInMonth } from '@/lib/working-hours';
import { buildFinancialReportingSummary, normalizeFinancialPersonName } from '@/lib/financial-reporting';

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

function parseFinancialNormLabel(value?: string) {
  if (!value || value === '-' || value.toLowerCase().includes('nedefinita')) {
    return { value: 0, unit: 'HOURS_PER_DAY' as const };
  }
  const numeric = Number((value.match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? '0').replace(',', '.')) || 0;
  return {
    value: numeric,
    unit: /h\s*\/\s*luna/i.test(value) ? 'HOURS_PER_MONTH' as const : 'HOURS_PER_DAY' as const,
  };
}

function formatDisplayDate(date?: string) {
  if (!date) return 'Neprecizata';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}.${month}.${year}`;
}

function getActivityDisplayTitle(activity: Activity) {
  return activity.title || activity.activityType || 'Activitate fara titlu';
}

function getBlockedDeliverables(activity: Activity) {
  return (activity.deliverables ?? []).filter((deliverable) => {
    const check = deliverable.eligibilityCheck;
    return check?.status === 'neeligibil' && check.pmUnlockApproved !== true;
  });
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
  const { contracts: selectedExpertNormContracts, isLoading: selectedExpertNormContractsLoading } = useExpertNormContracts(selectedExpertId);
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);
  const { entries: concurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { leaveEntries } = useLeaveEntries(currentMonth, currentYear);
  const { links: financialPersonLinks } = useFinancialPersonLinks();
  const { status: reportStatus, updateStatus: updateReportStatus, isLoading: reportStatusLoading } = useReportStatus(
    selectedExpertId,
    currentMonth,
    currentYear,
  );
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
  const financialSummary = useMemo(() => buildFinancialReportingSummary({
    experts,
    activities: allMonthActivities,
    concurrentProjects,
    concurrentEntries: concurrentTimesheetEntries,
    normContracts: selectedExpertNormContracts,
    leaveEntries,
    financialPersonLinks,
    month: currentMonth,
    year: currentYear,
  }), [allMonthActivities, concurrentProjects, concurrentTimesheetEntries, currentMonth, currentYear, experts, financialPersonLinks, leaveEntries, selectedExpertNormContracts]);
  const selectedExpertFinancialRow = useMemo(() => {
    const selectedNameKey = normalizeFinancialPersonName(selectedExpert.name);
    return financialSummary.rows.find((row) => row.expertId === selectedExpertId)
      ?? financialSummary.rows.find((row) => normalizeFinancialPersonName(row.name) === selectedNameKey);
  }, [financialSummary.rows, selectedExpert.name, selectedExpertId]);
  const selectedExpertActiveNormContract = useMemo(() => {
    if (!selectedExpertId) return undefined;
    const referenceDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    return selectedExpertNormContracts
      .filter((item) => item.expertId === selectedExpertId)
      .filter((item) => item.status === 'ACTIVE')
      .filter((item) => item.validFrom <= referenceDate && (!item.validTo || item.validTo >= referenceDate))
      .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
  }, [currentMonth, currentYear, selectedExpertId, selectedExpertNormContracts]);
  const selectedExpertCimDailyLimit = useMemo(() => {
    const contract = selectedExpertActiveNormContract;
    const financialCimDaily = parseFinancialNormLabel(selectedExpertFinancialRow?.cimNorm);
    const cimDailyValue = Number(contract?.cimDailyCap) || (
      financialCimDaily.unit === 'HOURS_PER_DAY' ? financialCimDaily.value : 0
    );
    return Math.max(0, Math.min(8, cimDailyValue));
  }, [selectedExpertActiveNormContract, selectedExpertFinancialRow?.cimNorm]);
  const selectedExpertPeoMonthlyLimit = useMemo(() => {
    const contract = selectedExpertActiveNormContract;
    const financialPeoNorm = parseFinancialNormLabel(selectedExpertFinancialRow?.peoNorm || selectedExpertFinancialRow?.workbookNorm);
    if (!contract) {
      if (financialPeoNorm.unit === 'HOURS_PER_MONTH') return financialPeoNorm.value;
      return financialPeoNorm.value * getWorkingDaysListInMonth(currentMonth + 1, currentYear).length;
    }
    if (contract.peoNormUnit === 'HOURS_PER_MONTH') return Number(contract.peoNormValue) || 0;
    return (Number(contract.peoNormValue) || 0) * getWorkingDaysListInMonth(currentMonth + 1, currentYear).length;
  }, [currentMonth, currentYear, selectedExpertActiveNormContract, selectedExpertFinancialRow?.peoNorm, selectedExpertFinancialRow?.workbookNorm]);
  const selectedExpertPeoDailyLimit = useMemo(() => {
    const contract = selectedExpertActiveNormContract;
    const financialPeoNorm = parseFinancialNormLabel(selectedExpertFinancialRow?.peoNorm || selectedExpertFinancialRow?.workbookNorm);
    if (!contract) {
      return financialPeoNorm.unit === 'HOURS_PER_DAY'
        ? Math.max(0, Math.min(8, financialPeoNorm.value))
        : 0;
    }
    const dailyValue = contract.peoNormUnit === 'HOURS_PER_DAY'
      ? Number(contract.peoNormValue) || 0
      : Number(contract.peoDailyCap) || 0;
    return Math.max(0, Math.min(8, dailyValue));
  }, [selectedExpertActiveNormContract, selectedExpertFinancialRow?.peoNorm, selectedExpertFinancialRow?.workbookNorm]);
  const selectedExpertFinancialNorm = useMemo<Expert>(() => ({
    ...(selectedExpert as Expert),
    norma: selectedExpertCimDailyLimit,
    oreZi: selectedExpertPeoDailyLimit,
    dailyHours: selectedExpertPeoDailyLimit,
    normType: 'project',
    projectMonthlyNorm: selectedExpertPeoMonthlyLimit,
  }), [selectedExpert, selectedExpertCimDailyLimit, selectedExpertPeoDailyLimit, selectedExpertPeoMonthlyLimit]);

  const activities = useMemo(() => {
    if (!selectedExpertId) return [];
    const expertLeaves = leaveEntries.filter((leave) => leave.expertId === selectedExpertId && leave.status !== 'REJECTED');
    const financialLeaveDates = new Set(expertLeaves.map((leave) => leave.date));
    const reportedActivities = allMonthActivities.filter((activity) => activity.expertId === selectedExpertId
      && (!financialLeaveDates.has(activity.date) || (activity.dayType !== 'CO' && activity.dayType !== 'CM')));
    const leaveActivities: Activity[] = expertLeaves.map((leave) => ({
      id: 'leave-entry:' + leave.id,
      date: leave.date,
      expertId: leave.expertId,
      expertName: selectedExpert.name,
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
  }, [allMonthActivities, leaveEntries, selectedExpert.name, selectedExpertId]);
  const activitiesWithPmClarificationsCount = useMemo(
    () => activities.filter((activity) => activity.pmNotes?.trim()).length,
    [activities],
  );
  const blockedActivities = useMemo(
    () => activities
      .map((activity) => ({
        activity,
        blockedDeliverables: getBlockedDeliverables(activity),
      }))
      .filter((item) => item.blockedDeliverables.length > 0),
    [activities],
  );
  const blockedDeliverablesCount = blockedActivities.reduce((sum, item) => sum + item.blockedDeliverables.length, 0);

  const isLoading = isAuthLoading || expertsLoading || activitiesLoading || selectedExpertNormContractsLoading;
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
  const currentStatus = reportStatus?.status || 'draft';
  const isApproved = currentStatus === 'approved';
  const isSent = currentStatus === 'sent';
  const isInReview = currentStatus === 'in_review';
  const approvedExportBlockedReason = isSent || isInReview
    ? 'Exportul RA si Pontaj PEO este disponibil dupa aprobarea lunii de catre PM.'
    : 'Trimite luna catre PM si asteapta aprobarea pentru a exporta RA si Pontaj PEO.';
  const blockedActivitiesReason = blockedActivities.length > 0
    ? `${blockedActivities.length} activitati sunt blocate de livrabile neeligibile. Corecteaza livrabilele sau asteapta deblocarea PM inainte de trimitere/export.`
    : '';
  const peoExportBlockedReason = blockedActivitiesReason || approvedExportBlockedReason;
  const submitButtonIcon = isApproved
    ? <Lock className="h-4 w-4" />
    : isSent || isInReview
      ? <CheckCircle className="h-4 w-4" />
      : <Send className="h-4 w-4" />;
  const submitButtonLabel = isApproved
    ? 'Luna aprobata'
    : isInReview
      ? 'In verificare PM'
      : isSent
        ? 'Luna trimisa catre PM'
        : 'Trimite luna catre PM';
  const submitButtonTitle = activities.length === 0
    ? 'Adauga cel putin o activitate inainte de trimitere.'
    : blockedActivities.length > 0
      ? blockedActivitiesReason
    : isApproved
      ? 'Luna este aprobata.'
      : isInReview
        ? 'Raportarea este deja in verificare la PM.'
        : isSent
          ? 'Luna a fost deja trimisa catre PM.'
          : undefined;
  const handleSubmitMonth = async () => {
    if (!selectedExpertId || isApproved || isSent || isInReview || activities.length === 0 || blockedActivities.length > 0) return;

    await updateReportStatus({
      expertId: selectedExpertId,
      year: currentYear,
      month: currentMonth,
      status: 'sent',
      sentDate: new Date().toISOString(),
      expertAccessApproved: reportStatus?.expertAccessApproved ?? false,
      expertAccessApprovedAt: reportStatus?.expertAccessApprovedAt,
      pmNotes: reportStatus?.pmNotes,
    } satisfies Omit<ReportStatus, 'id'>);
  };

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
              expert={selectedExpertFinancialNorm}
              activities={activities}
              concurrentProjects={concurrentProjects}
              concurrentTimesheetEntries={concurrentTimesheetEntries.filter((entry) => entry.expertId === selectedExpertId)}
              leaveEntries={leaveEntries.filter((leave) => leave.expertId === selectedExpertId)}
              workBlockBundles={deterministicWorkBlockBundles}
              workBlockBundlesLoading={isLoadingDeterministicWorkBlocks}
              canExportPeoDocuments={isApproved && blockedActivities.length === 0}
              peoExportBlockedReason={peoExportBlockedReason}
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSubmitMonth}
                  disabled={isApproved || isSent || isInReview || reportStatusLoading || activities.length === 0 || blockedActivities.length > 0}
                  title={submitButtonTitle}
                >
                  {reportStatusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitButtonIcon}
                  {submitButtonLabel}
                </Button>
                <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium">
                  <Download className="h-4 w-4" />
                  {activities.length} activitati, {activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0)}h
                </div>
              </div>
            </div>
          </div>
          {blockedActivities.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    {blockedActivities.length} activitati blocate
                  </p>
                  <p className="mt-2 leading-6">
                    Exportul si trimiterea catre PM sunt blocate de {blockedDeliverablesCount} livrabile neeligibile fara deblocare PM.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {blockedActivities.slice(0, 4).map(({ activity, blockedDeliverables }) => (
                      <li key={activity.id}>
                        {formatDisplayDate(activity.date)} - {getActivityDisplayTitle(activity)}
                        <span className="text-destructive/80">
                          {' '}({blockedDeliverables.length} livrabile blocate)
                        </span>
                      </li>
                    ))}
                  </ul>
                  {blockedActivities.length > 4 ? (
                    <p className="mt-2 text-xs font-medium text-destructive/80">
                      Inca {blockedActivities.length - 4} activitati blocate nu sunt afisate aici.
                    </p>
                  ) : null}
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0 border-destructive/30 bg-background text-destructive hover:bg-destructive/10">
                  <Link href={backHref}>
                    <ArrowLeft className="h-4 w-4" />
                    Corecteaza activitatile
                  </Link>
                </Button>
              </div>
            </div>
          )}
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
            expert={selectedExpertFinancialNorm}
            enableDeterministicAnexa10Docx={deterministicAnexa10DocxEnabled}
            isLoadingDeterministicWorkBlocks={isLoadingDeterministicWorkBlocks}
            workBlockBundles={deterministicWorkBlockBundles}
            clarificationNotes={reportStatus?.pmNotes}
            clarificationCount={activitiesWithPmClarificationsCount}
            onSubmitMonth={handleSubmitMonth}
            submitMonthDisabled={isApproved || isSent || isInReview || reportStatusLoading || activities.length === 0 || blockedActivities.length > 0}
            submitMonthLabel={submitButtonLabel}
            submitMonthTitle={submitButtonTitle}
            isSubmittingMonth={reportStatusLoading}
            canExportApprovedDocuments={isApproved && blockedActivities.length === 0}
            approvedDocumentsBlockedReason={peoExportBlockedReason}
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
