'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { PontajTab } from '@/components/pm/pontaj-tab';
import { RaportActivitateTab } from '@/components/pm/raport-activitate-tab';
import { LivrabileTab } from '@/components/pm/livrabile-tab';
import { CrossExpertTab } from '@/components/pm/cross-expert-tab';
import { NeconformitatiTab } from '@/components/pm/neconformitati-tab';
import { NotesTab } from '@/components/pm/notes-tab';
import { getMonthName } from '@/lib/app-utils';
import {
  useExperts,
  useVerification,
  useVerificationMutations,
  useNeconformitati,
  useNeconformitateMutations,
  useNotes,
  useNoteMutations,
  useApiKey,
  useActivityMutations,
  useReportStatus,
  useReportStatusByMonth,
  useActivitiesByMonth,
  useAuditLogs,
  useDocuments,
  useSharedDeliverables,
  useGrupTintaByMonth,
  useAllConcurrentProjects,
  useConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
} from '@/hooks/use-backend-data';
import { buildDashboardComplianceRows } from '@/lib/reporting-dashboard';
import { getSignedInUser, type AppUser } from '@/lib/aws/auth';
import { buildPmDashboardSummary } from '@/lib/pm-dashboard';
import {
  canAccessExpertId,
  filterActivitiesForScope,
  filterAuditLogsForScope,
  filterConcurrentProjectsForScope,
  filterConcurrentProjectTimesheetEntriesForScope,
  filterDocumentsForScope,
  filterExpertsForScope,
  filterGrupTintaForScope,
  filterReportStatusesForScope,
  filterSharedDeliverablesForScope,
  resolveDataAccessScope,
} from '@/lib/access-control';
import { isEventActivity } from '@/lib/deliverable-types';
import type {
  PontajRow,
  RaportRow,
  LivrabilRow,
  CrossExpertRow,
  Neconformitate,
  VerificationNote,
  ReportStatus,
  Expert,
} from '@/lib/types';
import { UserMenu } from '@/components/user-menu';
import { ProgressReportTab } from '@/components/pm/progress-report-tab';
import { GTProgressTab } from '@/components/pm/gt-progress-tab';
import { DosarExpertModal } from '@/components/pm/dosar-expert-modal';
import { DoubleFundingTab } from '@/components/pm/double-funding-tab';
import { PmStatusPanel } from '@/components/pm/pm-status-panel';
import { PmDashboardKpiCards } from '@/components/pm/pm-dashboard-kpi-cards';
import { PmAlertsPanel } from '@/components/pm/pm-alerts-panel';
import { PmMonthlyStatusTable } from '@/components/pm/pm-monthly-status-table';

const EMPTY_PONTAJ_ROWS: PontajRow[] = [];
const EMPTY_RAPORT_ROWS: RaportRow[] = [];
const EMPTY_LIVRABIL_ROWS: LivrabilRow[] = [];
const EMPTY_CROSS_EXPERT_ROWS: CrossExpertRow[] = [];

function listHasSameItems<T>(current: T[], next: T[]) {
  return current === next || (current.length === next.length && current.every((item, index) => Object.is(item, next[index])));
}

function keepCurrentListIfSame<T>(next: T[]) {
  return (current: T[]) => (listHasSameItems(current, next) ? current : next);
}

export default function PMDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [localApiKey, setLocalApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dossierExpert, setDossierExpert] = useState<Expert | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [pmExceptionOpen, setPmExceptionOpen] = useState(false);
  const [pmExceptionType, setPmExceptionType] = useState<'CO' | 'CM' | 'Altele'>('CO');
  const [pmExceptionDate, setPmExceptionDate] = useState('');
  const [pmExceptionNotes, setPmExceptionNotes] = useState('');
  const [pmExceptionError, setPmExceptionError] = useState<string | null>(null);
  const [isSavingPmException, setIsSavingPmException] = useState(false);

  // Local data states for editing before save
  const [pontajData, setPontajData] = useState<PontajRow[]>([]);
  const [raportData, setRaportData] = useState<RaportRow[]>([]);
  const [livrabileData, setLivrabileData] = useState<LivrabilRow[]>([]);
  const [crossExpertData, setCrossExpertData] = useState<CrossExpertRow[]>([]);
  const [localNeconformitati, setLocalNeconformitati] = useState<Neconformitate[]>([]);
  const [localNotes, setLocalNotes] = useState<VerificationNote[]>([]);

  // Data hooks
  const { experts, isLoading: expertsLoading } = useExperts();
  const { apiKey, setApiKey, isLoading: apiKeyLoading } = useApiKey();
  const dataAccessScope = useMemo(
    () => resolveDataAccessScope({ user: currentUser, experts }),
    [currentUser, experts]
  );
  const hasExtendedExpertAccess = dataAccessScope.canAccessAllExperts;
  const canManagePmReview = hasExtendedExpertAccess;
  const { 
    verification, 
    isLoading: verificationLoading,
    mutate: refreshVerification 
  } = useVerification(
    selectedExpertId,
    selectedMonth.toString().padStart(2, '0'),
    selectedYear.toString()
  );
  const { create: createVerification, update: updateVerification } = useVerificationMutations();
  const { neconformitati, isLoading: neconformitatiLoading } = useNeconformitati(verification?.id || null);
  const { create: createNeconformitate, resolve: resolveNeconformitate, remove: removeNeconformitate } = useNeconformitateMutations();
  const { notes, isLoading: notesLoading } = useNotes(verification?.id || null);
  const { create: createNote, update: updateNote, remove: removeNote } = useNoteMutations();
  const { create: createActivity } = useActivityMutations();
  const {
    status: reportStatus,
    updateStatus: updateReportStatus,
    isLoading: reportStatusLoading,
  } = useReportStatus(selectedExpertId, selectedMonth, selectedYear);
  const { statuses: allMonthlyReportStatuses } = useReportStatusByMonth(selectedMonth, selectedYear);
  const { activities: allMonthActivities, mutate: refreshMonthActivities } = useActivitiesByMonth(selectedMonth, selectedYear);
  const scopedAuditExpertId = hasExtendedExpertAccess ? null : dataAccessScope.currentExpertId ?? selectedExpertId;
  const { auditLogs: allAuditLogs } = useAuditLogs(scopedAuditExpertId, selectedMonth, selectedYear);
  const { documents: allDocuments } = useDocuments();
  const scopedSharedDeliverablesExpertId = hasExtendedExpertAccess ? undefined : dataAccessScope.currentExpertId ?? selectedExpertId ?? undefined;
  const { sharedDeliverables: allSharedDeliverables } = useSharedDeliverables(scopedSharedDeliverablesExpertId);
  const { entries: allGrupTintaEntries } = useGrupTintaByMonth(selectedMonth, selectedYear);
  const { projects: allConcurrentProjects } = useAllConcurrentProjects();
  const { addProject: createConcurrentProject, updateProject: updateConcurrentProject, removeProject: archiveConcurrentProject } = useConcurrentProjects(selectedExpertId);
  const { entries: allConcurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(selectedMonth, selectedYear);
  const visibleExperts = useMemo(
    () => filterExpertsForScope(experts, dataAccessScope),
    [experts, dataAccessScope]
  );
  const monthlyReportStatuses = useMemo(
    () => filterReportStatusesForScope(allMonthlyReportStatuses, dataAccessScope),
    [allMonthlyReportStatuses, dataAccessScope]
  );
  const monthActivities = useMemo(
    () => filterActivitiesForScope(allMonthActivities, dataAccessScope),
    [allMonthActivities, dataAccessScope]
  );
  const auditLogs = useMemo(
    () => filterAuditLogsForScope(allAuditLogs, dataAccessScope),
    [allAuditLogs, dataAccessScope]
  );
  const documents = useMemo(
    () => filterDocumentsForScope(allDocuments, dataAccessScope),
    [allDocuments, dataAccessScope]
  );
  const sharedDeliverables = useMemo(
    () => filterSharedDeliverablesForScope(allSharedDeliverables, dataAccessScope),
    [allSharedDeliverables, dataAccessScope]
  );
  const grupTintaEntries = useMemo(
    () => filterGrupTintaForScope(allGrupTintaEntries, dataAccessScope),
    [allGrupTintaEntries, dataAccessScope]
  );
  const concurrentProjects = useMemo(
    () => filterConcurrentProjectsForScope(allConcurrentProjects, dataAccessScope),
    [allConcurrentProjects, dataAccessScope]
  );
  const concurrentTimesheetEntries = useMemo(
    () => filterConcurrentProjectTimesheetEntriesForScope(allConcurrentTimesheetEntries, dataAccessScope),
    [allConcurrentTimesheetEntries, dataAccessScope]
  );

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (!user) {
        setIsAuthLoading(false);
        router.replace('/auth/login');
        return;
      }

      setCurrentUser(user);
      setIsAuthLoading(false);
    }).catch(() => {
      setIsAuthLoading(false);
    });
  }, [router]);

  // Set default expert when experts load
  useEffect(() => {
    if (!dataAccessScope.canUsePmDashboard || visibleExperts.length === 0) return;

    setSelectedExpertId((currentId) => {
      if (currentId && visibleExperts.some((expert) => expert.id === currentId)) {
        return currentId;
      }

      return visibleExperts[0].id;
    });
  }, [dataAccessScope.canUsePmDashboard, visibleExperts]);

  // Load API key
  useEffect(() => {
    if (apiKey) {
      setLocalApiKey(apiKey);
    }
  }, [apiKey]);

  // Load verification data when it changes
  useEffect(() => {
    if (verification) {
      setPontajData(keepCurrentListIfSame(verification.pontajRows || verification.pontajData || EMPTY_PONTAJ_ROWS));
      setRaportData(keepCurrentListIfSame(verification.raportRows || verification.raportActivitateData || EMPTY_RAPORT_ROWS));
      setLivrabileData(keepCurrentListIfSame(verification.livrabilRows || verification.livrabileData || EMPTY_LIVRABIL_ROWS));
      setCrossExpertData(keepCurrentListIfSame(verification.crossExpertRows || verification.crossExpertData || EMPTY_CROSS_EXPERT_ROWS));
    } else {
      setPontajData(keepCurrentListIfSame(EMPTY_PONTAJ_ROWS));
      setRaportData(keepCurrentListIfSame(EMPTY_RAPORT_ROWS));
      setLivrabileData(keepCurrentListIfSame(EMPTY_LIVRABIL_ROWS));
      setCrossExpertData(keepCurrentListIfSame(EMPTY_CROSS_EXPERT_ROWS));
    }
  }, [verification]);

  // Load neconformitati and notes
  useEffect(() => {
    setLocalNeconformitati(keepCurrentListIfSame(neconformitati));
  }, [neconformitati]);

  useEffect(() => {
    setLocalNotes(keepCurrentListIfSame(notes));
  }, [notes]);

  // Get selected expert
  const selectedExpert = useMemo(() => {
    return visibleExperts.find((e) => e.id === selectedExpertId) || visibleExperts[0] || { id: '', name: 'Expert', role: '' };
  }, [visibleExperts, selectedExpertId]);

  const saveVerificationData = async () => {
    if (!selectedExpertId || !canManagePmReview) return;
    
    setIsSaving(true);
    try {
      if (verification?.id) {
        await updateVerification(verification.id, {
          status: 'in-progress',
        });
      } else {
        await createVerification({
          expertId: selectedExpertId,
          month: selectedMonth.toString().padStart(2, '0'),
          year: selectedYear.toString(),
          status: 'in-progress',
          pontajRows: pontajData,
          raportRows: raportData,
          livrabilRows: livrabileData,
          crossExpertRows: crossExpertData,
        });
      }
      await refreshVerification();
    } catch (error) {
      console.error('Error saving verification:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const statusLabels: Record<ReportStatus['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'secondary' },
    sent: { label: 'Trimis către PM', variant: 'outline' },
    in_review: { label: 'În verificare', variant: 'outline' },
    approved: { label: 'Aprobat', variant: 'default' },
    rejected: { label: 'Respins', variant: 'destructive' },
    clarifications: { label: 'Clarificări', variant: 'destructive' },
  };

  const currentReportStatus = reportStatus?.status || 'draft';
  const currentReportStatusMeta = statusLabels[currentReportStatus as ReportStatus['status']] || statusLabels.draft;

  const setMonthlyStatus = async (status: ReportStatus['status'], pmNotes?: string) => {
    if (!selectedExpertId || !canManagePmReview) return;

    await updateReportStatus({
      expertId: selectedExpertId,
      year: selectedYear,
      month: selectedMonth,
      status,
      sentDate: reportStatus?.sentDate,
      approvalDate: status === 'approved' ? new Date().toISOString() : reportStatus?.approvalDate,
      expertAccessApproved: reportStatus?.expertAccessApproved ?? false,
      expertAccessApprovedAt: reportStatus?.expertAccessApprovedAt,
      pmNotes,
    });
  };

  const toggleExpertMonthAccess = async () => {
    if (!selectedExpertId || !canManagePmReview) return;
    const nextValue = !(reportStatus?.expertAccessApproved ?? false);

    await updateReportStatus({
      expertId: selectedExpertId,
      year: selectedYear,
      month: selectedMonth,
      status: currentReportStatus as ReportStatus['status'],
      sentDate: reportStatus?.sentDate,
      approvalDate: reportStatus?.approvalDate,
      expertAccessApproved: nextValue,
      expertAccessApprovedAt: nextValue ? new Date().toISOString() : undefined,
      pmNotes: reportStatus?.pmNotes,
    });
  };

  const requestClarifications = async () => {
    const note = window.prompt('Ce clarificări solicitați expertului?');
    if (note === null) return;
    await setMonthlyStatus('clarifications', note.trim() || 'Clarificări solicitate de PM.');
  };

  const rejectMonth = async () => {
    const note = window.prompt('Motiv respingere:');
    if (note === null) return;
    await setMonthlyStatus('rejected', note.trim() || 'Respins de PM.');
  };

  const getDefaultExceptionDate = () =>
    `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;

  const openPmExceptionDialog = () => {
    setPmExceptionDate(getDefaultExceptionDate());
    setPmExceptionType('CO');
    setPmExceptionNotes('');
    setPmExceptionError(null);
    setPmExceptionOpen(true);
  };

  const savePmException = async () => {
    if (!selectedExpertId || !canManagePmReview) return;
    if (!pmExceptionDate) {
      setPmExceptionError('Selecteaza data pentru inregistrare.');
      return;
    }

    const date = new Date(`${pmExceptionDate}T00:00:00`);
    if (date.getMonth() !== selectedMonth || date.getFullYear() !== selectedYear) {
      setPmExceptionError('Data trebuie sa fie in luna selectata in Dashboard PM.');
      return;
    }

    setIsSavingPmException(true);
    setPmExceptionError(null);
    try {
      const label =
        pmExceptionType === 'CO'
          ? 'CO - Concediu odihna'
          : pmExceptionType === 'CM'
            ? 'CM - Concediu medical'
            : 'Altele';

      await createActivity({
        expertId: selectedExpertId,
        expertName: selectedExpert.name,
        date: pmExceptionDate,
        hours: 0,
        activityType: label,
        title: label,
        description: pmExceptionNotes.trim() || `Inregistrare adaugata de PM: ${label}.`,
        location: 'N/A',
        dayType: pmExceptionType,
        status: 'approved',
        pmNotes: pmExceptionNotes.trim() || 'Adaugat de PM.',
      });
      await refreshMonthActivities();
      setPmExceptionOpen(false);
    } catch (error) {
      setPmExceptionError(error instanceof Error ? error.message : 'Inregistrarea nu a putut fi salvata.');
    } finally {
      setIsSavingPmException(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await setApiKey(localApiKey);
      setSettingsOpen(false);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Handle neconformitati changes
  const handleNeconformitatiChange = async (newData: Neconformitate[]) => {
    setLocalNeconformitati(newData);
  };

  // Handle notes changes
  const handleNotesChange = async (newData: VerificationNote[]) => {
    setLocalNotes(newData);
  };

  // Calculate statistics
  const pontajVerified = pontajData.filter((p) => p.verified).length;
  const raportVerified = raportData.filter((r) => r.verified).length;
  const livrabileMatched = livrabileData.filter((l) => l.titleMatch).length;
  const unresolvedIssues = localNeconformitati.filter((n) => !n.resolved).length;
  const dashboardRows = useMemo(
    () =>
      buildDashboardComplianceRows({
        experts: visibleExperts,
        activities: monthActivities,
        auditLogs,
        month: selectedMonth,
        year: selectedYear,
      }),
    [visibleExperts, monthActivities, auditLogs, selectedMonth, selectedYear]
  );
  const dashboardTotals = useMemo(() => {
    const totalHours = dashboardRows.reduce((sum, row) => sum + row.totalHours, 0);
    const totalRemaining = dashboardRows.reduce((sum, row) => sum + row.remainingHours, 0);
    const missingDays = dashboardRows.reduce((sum, row) => sum + row.missingActivityDays.length, 0);
    const blockedDays = dashboardRows.reduce((sum, row) => sum + row.blockedDays.length, 0);
    const issues = dashboardRows.filter(
      (row) => row.hasDailyLimitIssue || row.hasMonthlyNormIssue || row.hasProjectNormIssue
    ).length;

    return { totalHours, totalRemaining, missingDays, blockedDays, issues };
  }, [dashboardRows]);
  const pendingSharedDeliverables = useMemo(() => {
    return sharedDeliverables
      .filter((relation) => relation.status === 'pending_registration' || relation.status === 'ignored_by_target')
      .map((relation) => ({
        relation,
        document: documents.find((document) => document.id === relation.documentId),
        sourceExpert: visibleExperts.find((expert) => expert.id === relation.sourceExpertId),
        targetExpert: visibleExperts.find((expert) => expert.id === relation.targetExpertId),
      }));
  }, [documents, visibleExperts, sharedDeliverables]);
  const pmSummary = useMemo(
    () =>
      buildPmDashboardSummary({
        experts: visibleExperts,
        activities: monthActivities,
        reportStatuses: monthlyReportStatuses,
        documents,
        sharedDeliverables,
      }),
    [documents, visibleExperts, monthActivities, monthlyReportStatuses, sharedDeliverables]
  );
  const reportStatusByExpertId = useMemo(
    () => new Map(monthlyReportStatuses.map((status) => [status.expertId, status])),
    [monthlyReportStatuses]
  );
  const eventDocumentIssues = useMemo(() => {
    return monthActivities.filter((activity) => {
      if (!isEventActivity(activity.activityType || activity.title || '')) return false;
      const deliverables = activity.deliverables || [];
      const hasMom = deliverables.some((deliverable) => deliverable.category === 'event_mom' && deliverable.uploaded);
      const hasProof = deliverables.some((deliverable) => deliverable.category === 'event_proof' && deliverable.uploaded);
      return !(hasMom || hasProof);
    });
  }, [monthActivities]);
  const titleIssues = useMemo(
    () => documents.filter((document) => document.titleMatch === false || document.titleCheckStatus === 'mismatch'),
    [documents]
  );
  const selectedExpertActivities = useMemo(
    () => monthActivities.filter((activity) => activity.expertId === selectedExpertId),
    [monthActivities, selectedExpertId]
  );

  const openDossier = (expert: Expert) => {
    if (!canAccessExpertId(dataAccessScope, expert.id)) return;
    setDossierExpert(expert);
    setDossierOpen(true);
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: getMonthName(i),
  }));

  const years = Array.from({ length: 5 }, (_, i) => ({
    value: new Date().getFullYear() - 2 + i,
    label: (new Date().getFullYear() - 2 + i).toString(),
  }));

  const isAccessDenied = !isAuthLoading && !expertsLoading && !dataAccessScope.canUsePmDashboard;
  const isLoading = isAuthLoading || expertsLoading || apiKeyLoading;
  const hasError = !isLoading && experts.length === 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Se incarca datele...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Nu s-au putut incarca datele</h2>
          <p className="text-muted-foreground max-w-md">
            Verifica conexiunea la internet si incearca din nou. 
            Daca problema persista, contacteaza administratorul.
          </p>
          <Button onClick={() => window.location.reload()}>
            Reincarca pagina
          </Button>
        </div>
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-4 text-center p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Nu ai acces la Dashboard PM</h2>
          <p className="text-muted-foreground">
            Modulul PM este disponibil doar pentru utilizatori cu rol PM, Administrator sau Expert/PM configurat in profil.
          </p>
          <Button asChild>
            <Link href="/expert">Mergi la Modul Expert</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/95">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="mt-1 rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="space-y-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                  Control center PEO
                </Badge>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                    {hasExtendedExpertAccess
                      ? 'Dashboard PM — Raportare PEO 302141'
                      : 'Raportarea mea — Verificare'}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {getMonthName(selectedMonth)} {selectedYear} • Cod proiect 302141
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="rounded-2xl border bg-background/70 p-3 shadow-sm">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Filtre raportare
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={selectedExpertId || ''}
                    onValueChange={(id) => setSelectedExpertId(id)}
                    disabled={!hasExtendedExpertAccess}
                  >
                    <SelectTrigger className="w-full sm:w-[190px]">
                      <SelectValue placeholder="Expert" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleExperts.map((expert) => (
                        <SelectItem key={expert.id} value={expert.id}>
                          {expert.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(v) => setSelectedMonth(parseInt(v))}
                  >
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Luna" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value.toString()}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(v) => setSelectedYear(parseInt(v))}
                  >
                    <SelectTrigger className="w-full sm:w-[100px]">
                      <SelectValue placeholder="An" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.value} value={y.value.toString()}>
                          {y.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center">
                {canManagePmReview && (
                  <Button onClick={saveVerificationData} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvează
                  </Button>
                )}

                {canManagePmReview && (
                  <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Settings className="h-5 w-5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Setari</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="apiKey">Claude API Key</Label>
                          <Input
                            id="apiKey"
                            type="password"
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                            placeholder="sk-ant-..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Necesar pentru functiile AI (comparare documente, asistent Ramona)
                          </p>
                        </div>
                        <Button onClick={handleSaveSettings} className="w-full">
                          Salveaza
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                <UserMenu />
              </div>
            </div>
          </div>
        </div>
      </header>

      <PmStatusPanel
        statusMeta={currentReportStatusMeta}
        reportStatus={reportStatus}
        reportStatusLoading={reportStatusLoading}
        verificationLoading={verificationLoading}
        canManagePmReview={canManagePmReview}
        pontajVerified={pontajVerified}
        pontajTotal={pontajData.length}
        raportVerified={raportVerified}
        raportTotal={raportData.length}
        livrabileMatched={livrabileMatched}
        livrabileTotal={livrabileData.length}
        unresolvedIssues={unresolvedIssues}
        onSetInReview={() => setMonthlyStatus('in_review')}
        onRequestClarifications={requestClarifications}
        onRejectMonth={rejectMonth}
        onApproveMonth={() => setMonthlyStatus('approved', reportStatus?.pmNotes)}
        onToggleExpertAccess={toggleExpertMonthAccess}
        onOpenPmExceptionDialog={openPmExceptionDialog}
      />

      <Dialog open={pmExceptionOpen} onOpenChange={setPmExceptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adauga CO/CM/Altele pentru expert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Expert</Label>
              <Input value={selectedExpert?.name || ''} disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pmExceptionType">Tip inregistrare</Label>
              <Select value={pmExceptionType} onValueChange={(value) => setPmExceptionType(value as typeof pmExceptionType)}>
                <SelectTrigger id="pmExceptionType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CO">CO - Concediu odihna</SelectItem>
                  <SelectItem value="CM">CM - Concediu medical</SelectItem>
                  <SelectItem value="Altele">Altele</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pmExceptionDate">Data</Label>
              <Input
                id="pmExceptionDate"
                type="date"
                value={pmExceptionDate}
                min={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`}
                max={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, '0')}`}
                onChange={(event) => setPmExceptionDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pmExceptionNotes">Observatii PM</Label>
              <Input
                id="pmExceptionNotes"
                value={pmExceptionNotes}
                onChange={(event) => setPmExceptionNotes(event.target.value)}
                placeholder="Motiv sau detalii pentru inregistrare"
              />
            </div>
            {pmExceptionError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pmExceptionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPmExceptionOpen(false)}>
                Anuleaza
              </Button>
              <Button onClick={savePmException} disabled={!selectedExpertId || isSavingPmException}>
                {isSavingPmException && <Loader2 className="h-4 w-4 animate-spin" />}
                Salveaza
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <PmDashboardKpiCards
          hasExtendedExpertAccess={hasExtendedExpertAccess}
          pmSummary={pmSummary}
          dashboardTotals={dashboardTotals}
          titleIssuesCount={titleIssues.length}
          pendingSharedDeliverablesCount={pendingSharedDeliverables.length}
          eventDocumentIssuesCount={eventDocumentIssues.length}
        />

        <PmAlertsPanel
          titleIssues={titleIssues}
          pendingSharedDeliverables={pendingSharedDeliverables}
          eventDocumentIssues={eventDocumentIssues}
          unresolvedNeconformitati={localNeconformitati.filter((item) => !item.resolved)}
          dashboardRows={dashboardRows}
        />

        <PmMonthlyStatusTable
          hasExtendedExpertAccess={hasExtendedExpertAccess}
          dashboardRows={dashboardRows}
          visibleExperts={visibleExperts}
          reportStatusByExpertId={reportStatusByExpertId}
          statusLabels={statusLabels}
          onOpenDossier={openDossier}
        />

        <Tabs defaultValue="pontaj" className="space-y-6">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="pontaj">Pontaj Excel</TabsTrigger>
            <TabsTrigger value="raport">Raport Activitate</TabsTrigger>
            <TabsTrigger value="livrabile">Livrabile</TabsTrigger>
            {hasExtendedExpertAccess && <TabsTrigger value="cross-expert">Cross-Expert</TabsTrigger>}
            <TabsTrigger value="double-funding">Dublă finanțare</TabsTrigger>
            <TabsTrigger value="progres">Raport Progres</TabsTrigger>
            <TabsTrigger value="gt">Progres GT</TabsTrigger>
            <TabsTrigger value="neconformitati">
              Neconformitati
              {unresolvedIssues > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                  {unresolvedIssues}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="note">Note</TabsTrigger>
          </TabsList>

          <TabsContent value="pontaj">
            <PontajTab data={pontajData} onDataChange={setPontajData} />
          </TabsContent>

          <TabsContent value="raport">
            <RaportActivitateTab
              data={raportData}
              pontajData={pontajData}
              onDataChange={setRaportData}
            />
          </TabsContent>

          <TabsContent value="livrabile">
            <LivrabileTab
              data={livrabileData}
              raportData={raportData}
              onDataChange={setLivrabileData}
            />
          </TabsContent>

          {hasExtendedExpertAccess && (
            <TabsContent value="cross-expert">
              <CrossExpertTab data={crossExpertData} onDataChange={setCrossExpertData} />
            </TabsContent>
          )}

          <TabsContent value="double-funding">
            <DoubleFundingTab
              experts={visibleExperts}
              activities={monthActivities}
              concurrentProjects={concurrentProjects}
              concurrentTimesheetEntries={concurrentTimesheetEntries}
              onCreateConcurrentProject={createConcurrentProject}
              onUpdateConcurrentProject={updateConcurrentProject}
              onArchiveConcurrentProject={archiveConcurrentProject}
              reportStatuses={monthlyReportStatuses}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="progres">
            <ProgressReportTab
              experts={visibleExperts}
              activities={monthActivities}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="gt">
            <GTProgressTab
              experts={visibleExperts}
              activities={monthActivities}
              grupTintaEntries={grupTintaEntries}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="neconformitati">
            <NeconformitatiTab data={localNeconformitati} onDataChange={handleNeconformitatiChange} />
          </TabsContent>

          <TabsContent value="note">
            <NotesTab data={localNotes} onDataChange={handleNotesChange} />
          </TabsContent>
        </Tabs>
      </main>
      <DosarExpertModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        expert={dossierExpert}
        activities={dossierExpert ? monthActivities.filter((activity) => activity.expertId === dossierExpert.id) : selectedExpertActivities}
        verification={verification || null}
        neconformitati={localNeconformitati}
        month={selectedMonth}
        year={selectedYear}
        projectCode="302141"
        projectTitle="Consolidarea capacității Concordia pentru dialog social"
      />
    </div>
  );
}
