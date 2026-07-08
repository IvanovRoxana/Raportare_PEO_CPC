'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  AlertTriangle,
  SearchIcon,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { DashboardShell, pmNavItems } from '@/components/layout/dashboard-shell';
import { RightInfoCard } from '@/components/layout/dashboard-primitives';
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
  useNeconformitati,
  useNeconformitateMutations,
  useNotes,
  useNoteMutations,
  useActivityMutations,
  useReportStatus,
  useReportStatusByMonth,
  useActivitiesByMonth,
  useAuditLogs,
  useAuditLogMutations,
  useDocuments,
  useGTEntities,
  useGTPersons,
  useSharedDeliverables,
  useGrupTintaByMonth,
  useAllConcurrentProjects,
  useConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
} from '@/hooks/use-backend-data';
import { buildDashboardComplianceRows } from '@/lib/reporting-dashboard';
import { clearMonthAccessRequestNote, hasMonthAccessRequest } from '@/lib/month-access-requests';
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
import { findLatestClarificationAudit, PM_CLARIFICATION_AUDIT_ACTION } from '@/lib/pm-clarifications';
import type {
  PontajRow,
  RaportRow,
  LivrabilRow,
  CrossExpertRow,
  Neconformitate,
  VerificationNote,
  ReportStatus,
  Expert,
  Activity,
} from '@/lib/types';
import { UserMenu } from '@/components/user-menu';
import { ProgressReportTab } from '@/components/pm/progress-report-tab';
import { GTProgressTab } from '@/components/pm/gt-progress-tab';
import { DosarExpertModal } from '@/components/pm/dosar-expert-modal';
import { DoubleFundingTab } from '@/components/pm/double-funding-tab';
import { PmDashboardKpiCards } from '@/components/pm/pm-dashboard-kpi-cards';
import { PmAlertsPanel } from '@/components/pm/pm-alerts-panel';
import { PmMonthlyStatusTable } from '@/components/pm/pm-monthly-status-table';
import { PmSubmittedReportsPanel, type PmSubmittedReportRow } from '@/components/pm/pm-submitted-reports-panel';
import { AiRagAuditTab } from '@/components/pm/ai-rag-audit-tab';

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
  const [reviewExpertId, setReviewExpertId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const dataAccessScope = useMemo(
    () => resolveDataAccessScope({ user: currentUser, experts }),
    [currentUser, experts]
  );
  const hasExtendedExpertAccess = dataAccessScope.canAccessAllExperts;
  const canManagePmReview = hasExtendedExpertAccess;
  const { 
    verification, 
    isLoading: verificationLoading,
  } = useVerification(
    selectedExpertId,
    selectedMonth.toString().padStart(2, '0'),
    selectedYear.toString()
  );
  const { verification: reviewVerification } = useVerification(
    reviewExpertId,
    selectedMonth.toString().padStart(2, '0'),
    selectedYear.toString()
  );
  const { neconformitati, isLoading: neconformitatiLoading } = useNeconformitati(verification?.id || null);
  const { neconformitati: reviewNeconformitati } = useNeconformitati(reviewVerification?.id || null);
  const { create: createNeconformitate, resolve: resolveNeconformitate, remove: removeNeconformitate } = useNeconformitateMutations();
  const { notes, isLoading: notesLoading } = useNotes(verification?.id || null);
  const { create: createNote, update: updateNote, remove: removeNote } = useNoteMutations();
  const { create: createActivity, update: updateActivity } = useActivityMutations();
  const { create: createAuditLog } = useAuditLogMutations();
  const {
    status: reportStatus,
    updateStatus: updateReportStatus,
    isLoading: reportStatusLoading,
  } = useReportStatus(selectedExpertId, selectedMonth, selectedYear);
  const {
    status: reviewReportStatus,
    updateStatus: updateReviewReportStatus,
  } = useReportStatus(reviewExpertId, selectedMonth, selectedYear);
  const { statuses: allMonthlyReportStatuses } = useReportStatusByMonth(selectedMonth, selectedYear);
  const { activities: allMonthActivities, mutate: refreshMonthActivities } = useActivitiesByMonth(selectedMonth, selectedYear);
  const scopedAuditExpertId = hasExtendedExpertAccess ? null : dataAccessScope.currentExpertId ?? selectedExpertId;
  const { auditLogs: allAuditLogs } = useAuditLogs(scopedAuditExpertId, selectedMonth, selectedYear);
  const { documents: allDocuments } = useDocuments();
  const scopedSharedDeliverablesExpertId = hasExtendedExpertAccess ? undefined : dataAccessScope.currentExpertId ?? selectedExpertId ?? undefined;
  const { sharedDeliverables: allSharedDeliverables } = useSharedDeliverables(scopedSharedDeliverablesExpertId);
  const { entries: allGrupTintaEntries } = useGrupTintaByMonth(selectedMonth, selectedYear);
  const { records: gtEntities } = useGTEntities();
  const { records: gtPersons } = useGTPersons();
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
  const reviewExpert = useMemo(() => {
    return reviewExpertId ? visibleExperts.find((expert) => expert.id === reviewExpertId) || null : null;
  }, [visibleExperts, reviewExpertId]);
  const selectedClarificationActivities = useMemo(
    () => monthActivities.filter((activity) => activity.expertId === selectedExpertId && activity.pmNotes?.trim()),
    [monthActivities, selectedExpertId],
  );
  const recordClarificationAudit = async ({
    expert,
    note,
    activityIds,
  }: {
    expert: Pick<Expert, 'id' | 'name' | 'projectCode'>;
    note: string;
    activityIds?: string[];
  }) => {
    if (!currentUser || !canManagePmReview) return;

    try {
      await createAuditLog({
        actionType: PM_CLARIFICATION_AUDIT_ACTION,
        actorId: currentUser.id || currentUser.email || 'pm',
        actorName: currentUser.displayName || currentUser.email || 'PM',
        actorRole: currentUser.roles?.join(',') || 'pm',
        affectedExpertId: expert.id,
        affectedExpertName: expert.name,
        projectCode: expert.projectCode,
        month: selectedMonth,
        year: selectedYear,
        fieldName: activityIds?.length ? `activity:${activityIds.join(',')}` : 'reportStatus.pmNotes',
        oldValue: '',
        newValue: note,
        justification: `Clarificări PM solicitate pentru ${expert.name}.`,
        source: 'manual',
      });
    } catch (error) {
      console.warn('Clarification audit log was not persisted:', error);
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

  const approveMonthAccessRequest = async (status: ReportStatus) => {
    if (!canManagePmReview) return;

    await updateReportStatus({
      expertId: status.expertId,
      year: status.year,
      month: status.month,
      status: status.status,
      sentDate: status.sentDate,
      approvalDate: status.approvalDate,
      expertAccessApproved: true,
      expertAccessApprovedAt: new Date().toISOString(),
      pmNotes: clearMonthAccessRequestNote(status.pmNotes, { month: status.month, year: status.year }),
    });
  };

  const rejectMonthAccessRequest = async (status: ReportStatus) => {
    if (!canManagePmReview) return;

    await updateReportStatus({
      expertId: status.expertId,
      year: status.year,
      month: status.month,
      status: status.status,
      sentDate: status.sentDate,
      approvalDate: status.approvalDate,
      expertAccessApproved: false,
      expertAccessApprovedAt: undefined,
      pmNotes: clearMonthAccessRequestNote(status.pmNotes, { month: status.month, year: status.year }),
    });
  };

  const requestClarifications = async () => {
    const note = window.prompt('Ce clarificări solicitați expertului?');
    if (note === null) return;
    const pmNote = note.trim() || 'Clarificări solicitate de PM.';
    await setMonthlyStatus('clarifications', pmNote);
    await recordClarificationAudit({ expert: selectedExpert, note: pmNote });
  };

  const rejectMonth = async () => {
    const note = window.prompt('Motiv respingere:');
    if (note === null) return;
    await setMonthlyStatus('rejected', note.trim() || 'Respins de PM.');
  };

  const setReviewMonthlyStatus = async (status: ReportStatus['status'], pmNotes?: string) => {
    if (!reviewExpertId || !canManagePmReview) return;
    const currentStatus = reviewReportStatus || monthlyReportStatuses.find((item) => item.expertId === reviewExpertId);

    await updateReviewReportStatus({
      expertId: reviewExpertId,
      year: selectedYear,
      month: selectedMonth,
      status,
      sentDate: currentStatus?.sentDate,
      approvalDate: status === 'approved' ? new Date().toISOString() : currentStatus?.approvalDate,
      expertAccessApproved: currentStatus?.expertAccessApproved ?? false,
      expertAccessApprovedAt: currentStatus?.expertAccessApprovedAt,
      pmNotes,
    });
  };

  const requestReviewClarifications = async () => {
    const note = window.prompt('Ce clarificari soliciti expertului pentru aceasta raportare?');
    if (note === null) return;
    const pmNote = note.trim() || 'Clarificari solicitate de PM.';
    await setReviewMonthlyStatus('clarifications', pmNote);
    if (reviewExpert) {
      await recordClarificationAudit({ expert: reviewExpert, note: pmNote });
    }
  };

  const approveReviewActivities = async (activities: Activity[]) => {
    if (!canManagePmReview || activities.length === 0) return;

    await Promise.all(
      activities.map((activity) => updateActivity(activity.id, {
        status: 'approved',
        pmNotes: activity.pmNotes,
      }))
    );
    await refreshMonthActivities();
  };

  const requestReviewActivityClarification = async (activities: Activity[]) => {
    if (!canManagePmReview || activities.length === 0) return;

    const dates = activities
      .map((activity) => {
        const date = new Date(activity.date);
        return isNaN(date.getTime()) ? activity.date : date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
      })
      .join(', ');
    const note = window.prompt(`Ce clarificari soliciti pentru activitatea din ${dates}?`);
    if (note === null) return;

    const pmNote = note.trim() || 'Clarificari solicitate de PM pentru aceasta activitate.';
    await Promise.all(
      activities.map((activity) => updateActivity(activity.id, {
        status: 'sent',
        pmNotes: pmNote,
      }))
    );
    await setReviewMonthlyStatus('clarifications', activeReviewReportStatus?.pmNotes || 'Clarificari solicitate punctual pe activitati.');
    if (reviewExpert) {
      await recordClarificationAudit({
        expert: reviewExpert,
        note: pmNote,
        activityIds: activities.map((activity) => activity.id),
      });
    }
    await refreshMonthActivities();
  };

  const rejectReviewMonth = async () => {
    const note = window.prompt('Motiv respingere pentru aceasta raportare:');
    if (note === null) return;
    await setReviewMonthlyStatus('rejected', note.trim() || 'Respins de PM.');
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
  const monthAccessRequests = useMemo(
    () =>
      monthlyReportStatuses
        .filter(hasMonthAccessRequest)
        .map((status) => ({
          status,
          expert: visibleExperts.find((expert) => expert.id === status.expertId),
        }))
        .filter((item): item is { status: ReportStatus; expert: Expert } => Boolean(item.expert)),
    [monthlyReportStatuses, visibleExperts]
  );
  const dashboardRowByExpertId = useMemo(
    () => new Map(dashboardRows.map((row) => [row.expertId, row])),
    [dashboardRows]
  );
  const attentionRows = useMemo(
    () =>
      dashboardRows
        .filter(
          (row) =>
            row.missingActivityDays.length > 0 ||
            row.blockedDays.length > 0 ||
            row.hasDailyLimitIssue ||
            row.hasMonthlyNormIssue ||
            row.hasProjectNormIssue
        )
        .slice(0, 5),
    [dashboardRows]
  );
  const submittedReportRows = useMemo<PmSubmittedReportRow[]>(() => {
    const activityGroups = new Map<string, typeof monthActivities>();
    monthActivities.forEach((activity) => {
      const current = activityGroups.get(activity.expertId) || [];
      current.push(activity);
      activityGroups.set(activity.expertId, current);
    });

    return monthlyReportStatuses
      .filter((status) => status.status !== 'draft')
      .map((status) => {
        const expert = visibleExperts.find((item) => item.id === status.expertId);
        if (!expert) return null;

        const activities = activityGroups.get(status.expertId) || [];
        const dashboardRow = dashboardRowByExpertId.get(status.expertId);
        const issueFlags = dashboardRow
          ? [
              dashboardRow.hasDailyLimitIssue,
              dashboardRow.hasMonthlyNormIssue,
              dashboardRow.hasProjectNormIssue,
              dashboardRow.missingActivityDays.length > 0,
              dashboardRow.blockedDays.length > 0,
              dashboardRow.adminInterventions > 0,
            ].filter(Boolean).length
          : 0;

        return {
          expert,
          status,
          totalHours: dashboardRow?.totalHours ?? activities.reduce((sum, activity) => sum + (activity.hours || 0), 0),
          totalDeliverables: activities.reduce((sum, activity) => sum + (activity.deliverables?.length || 0), 0),
          issuesCount: issueFlags,
          utilizationPercent: dashboardRow?.utilizationPercent ?? 0,
        };
      })
      .filter((row): row is PmSubmittedReportRow => Boolean(row))
      .sort((a, b) => {
        const aDate = a.status.sentDate ? new Date(a.status.sentDate).getTime() : 0;
        const bDate = b.status.sentDate ? new Date(b.status.sentDate).getTime() : 0;
        return bDate - aDate || a.expert.name.localeCompare(b.expert.name);
      });
  }, [dashboardRowByExpertId, monthActivities, monthlyReportStatuses, visibleExperts]);
  const eventDocumentIssues = useMemo(() => {
    return monthActivities.filter((activity) => {
      if (!isEventActivity(activity.activityType || activity.title || '')) return false;
      const deliverables = activity.deliverables || [];
      const hasMom = deliverables.some((deliverable) => {
        const kind = deliverable.category || deliverable.deliverableType;
        const isUploaded = deliverable.uploaded ?? Boolean(deliverable.filePath || deliverable.s3Key || deliverable.fileName);
        return kind === 'event_mom' && isUploaded;
      });
      const hasProof = deliverables.some((deliverable) => {
        const kind = deliverable.category || deliverable.deliverableType;
        const isUploaded = deliverable.uploaded ?? Boolean(deliverable.filePath || deliverable.s3Key || deliverable.fileName);
        return kind === 'event_proof' && isUploaded;
      });
      return !(hasMom || hasProof);
    });
  }, [monthActivities]);
  const titleIssues = useMemo(
    () => documents.filter((document) => document.titleMatch === false || document.titleCheckStatus === 'mismatch'),
    [documents]
  );
  const reviewExpertActivities = useMemo(
    () => (reviewExpertId ? monthActivities.filter((activity) => activity.expertId === reviewExpertId) : []),
    [monthActivities, reviewExpertId]
  );
  const activeReviewReportStatus = useMemo(
    () => reviewReportStatus || (reviewExpertId ? reportStatusByExpertId.get(reviewExpertId) : undefined) || null,
    [reportStatusByExpertId, reviewExpertId, reviewReportStatus]
  );

  const openReviewReport = (expert: Expert) => {
    if (!canAccessExpertId(dataAccessScope, expert.id)) return;
    setSelectedExpertId(expert.id);
    setReviewExpertId(expert.id);
    setReviewOpen(true);
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: getMonthName(i),
  }));

  const isAccessDenied = !isAuthLoading && !expertsLoading && !dataAccessScope.canUsePmDashboard;
  const isLoading = isAuthLoading || expertsLoading;
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
    <DashboardShell
      activeHref="/pm"
      navItems={pmNavItems}
      eyebrow="Modul PM"
      title="Verificări PM"
      description="Revizuiește activitățile, livrabilele și rapoartele transmise de experți."
      actions={
        <>
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v, 10))}>
            <SelectTrigger className="h-10 w-[9.5rem] bg-white">
              <CalendarDays className="h-4 w-4 text-primary" />
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
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Export situație
          </Button>
          <Button asChild>
            <a href="#pm-tabs">
              Deschide verificare
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <UserMenu />
        </>
      }
      quickTabs={[
        { label: 'KPI', href: '#pm-kpi', icon: ShieldCheck, active: true },
        { label: 'Pontaj', href: '#pm-tabs', icon: CalendarDays },
        { label: 'Rapoarte', href: '#pm-tabs', icon: FileText },
        { label: 'Livrabile', href: '#pm-tabs', icon: Upload },
        { label: 'Neconformitati', href: '#pm-tabs', icon: SearchIcon },
        { label: 'Note', href: '#pm-tabs', icon: ClipboardList },
      ]}
      aside={
        <>
          <RightInfoCard title="Rezumat verificări" icon={CalendarDays}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Luna curentă</p>
                <p className="mt-3 text-4xl font-bold text-slate-950">{pmSummary.totalExperts}</p>
                <p className="text-sm text-muted-foreground">experți monitorizați</p>
              </div>
              <span className="rounded-full bg-[#e9faf5] px-3 py-1 text-xs font-semibold text-[#087a63]">
                {getMonthName(selectedMonth)} {selectedYear}
              </span>
            </div>
            <div className="mt-5 grid h-2 grid-cols-[1fr_0.45fr_1.25fr_0.3fr] overflow-hidden rounded-full">
              <span className="bg-primary" />
              <span className="bg-amber-400" />
              <span className="bg-[#36c2a0]" />
              <span className="bg-red-400" />
            </div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                ['De verificat', pmSummary.statusCounts.sent, 'bg-primary'],
                ['Cu observații', unresolvedIssues, 'bg-amber-400'],
                ['Aprobate', pmSummary.statusCounts.approved, 'bg-[#36c2a0]'],
                ['Neconforme', localNeconformitati.filter((item) => !item.resolved).length, 'bg-red-400'],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                    {label as string}
                  </span>
                  <span className="font-semibold text-slate-950">{value}</span>
                </div>
              ))}
            </div>
            <Link href="#pm-tabs" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi raport detaliat
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Cereri acces lună" icon={AlertTriangle}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {getMonthName(selectedMonth)} {selectedYear}
              </p>
              <Badge variant={monthAccessRequests.length > 0 ? 'destructive' : 'secondary'}>
                {monthAccessRequests.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {monthAccessRequests.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Nu exista cereri de acces pentru luna selectata.
                </div>
              ) : (
                monthAccessRequests.map(({ status, expert }) => (
                  <div key={status.id} className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-950">{expert.name}</div>
                        <div className="text-xs text-amber-800">
                          Solicita acces pentru {getMonthName(status.month)} {status.year}
                        </div>
                      </div>
                      <Badge variant="outline">{expert.category || expert.role || 'expert'}</Badge>
                    </div>
                    {canManagePmReview && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => approveMonthAccessRequest(status)}>
                          Aproba acces
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectMonthAccessRequest(status)}>
                          Respinge
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </RightInfoCard>

          <RightInfoCard title="Intervenții clarificări" icon={AlertTriangle}>
            <div className="space-y-4 text-sm">
              {selectedClarificationActivities.length > 0 ? (
                selectedClarificationActivities.slice(0, 4).map((activity) => {
                  const clarificationAudit = findLatestClarificationAudit(auditLogs, activity.id)
                    || findLatestClarificationAudit(auditLogs);

                  return (
                    <div key={activity.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{activity.title || activity.activityType}</p>
                          <p className="text-xs text-muted-foreground">
                            {activity.date} · {activity.hours}h{activity.saCode ? ` · ${activity.saCode}` : ''}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                          Clarificare
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-amber-900">{activity.pmNotes}</p>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Cerere PM: {clarificationAudit?.createdAt
                            ? new Date(clarificationAudit.createdAt).toLocaleString('ro-RO')
                            : 'neînregistrată în audit'}
                        </p>
                        <p>
                          Modificat de expert: {activity.updatedAt
                            ? new Date(activity.updatedAt).toLocaleString('ro-RO')
                            : 'fără actualizare recentă'}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground">
                  Nu sunt activități cu clarificări punctuale pentru expertul și luna selectate.
                </p>
              )}
            </div>
          </RightInfoCard>

          <RightInfoCard title="Activitate recentă" icon={ClipboardList}>
            <div className="space-y-4">
              {visibleExperts.slice(0, 3).map((expert, index) => (
                <div key={expert.id} className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf3fb] text-xs font-bold text-primary">
                      {expert.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{expert.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {index === 0 ? 'a aprobat livrabil SA1.1' : index === 1 ? 'a trimis raport SA3.2' : 'a răspuns la observații'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Acum {index + 1}h</span>
                </div>
              ))}
            </div>
            <Link href="#pm-tabs" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi toată activitatea
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Atentionari luna" icon={AlertTriangle}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {getMonthName(selectedMonth)} {selectedYear}
              </p>
              <Badge variant="secondary">{attentionRows.length}</Badge>
            </div>
            <div className="space-y-2">
              {attentionRows.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Nu exista atentionari majore pentru luna selectata.
                </div>
              ) : (
                attentionRows.map((row) => (
                  <div key={row.expertId} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-950">{row.expertName}</div>
                      <Badge variant="outline">{row.utilizationPercent}% completare</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {row.missingActivityDays.length > 0 && (
                        <Badge variant="outline" className="border-amber-300 text-amber-800">
                          {row.missingActivityDays.length} zile lipsa
                        </Badge>
                      )}
                      {row.blockedDays.length > 0 && (
                        <Badge variant="destructive">{row.blockedDays.length} zile blocate</Badge>
                      )}
                      {row.hasDailyLimitIssue && <Badge variant="destructive">limita zilnica</Badge>}
                      {row.hasMonthlyNormIssue && <Badge variant="outline">norma lunara</Badge>}
                      {row.hasProjectNormIssue && <Badge variant="outline">norma proiect</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </RightInfoCard>
        </>
      }
    >
      <PmSubmittedReportsPanel
        rows={submittedReportRows}
        statusLabels={statusLabels}
        onOpenReport={openReviewReport}
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
      <div id="pm-kpi" className="space-y-6 scroll-mt-24">
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
          onOpenDossier={openReviewReport}
        />

        <Tabs id="pm-tabs" defaultValue="pontaj" className="space-y-6 scroll-mt-24">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="pontaj">Pontaj Excel</TabsTrigger>
            <TabsTrigger value="raport">Raport Activitate</TabsTrigger>
            <TabsTrigger value="livrabile">Livrabile</TabsTrigger>
            {hasExtendedExpertAccess && <TabsTrigger value="cross-expert">Cross-Expert</TabsTrigger>}
            <TabsTrigger value="double-funding">Dublă finanțare</TabsTrigger>
            <TabsTrigger value="progres">Raport Progres</TabsTrigger>
            <TabsTrigger value="gt">Progres GT</TabsTrigger>
            {hasExtendedExpertAccess && <TabsTrigger value="ai-rag">AI RAG</TabsTrigger>}
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
              gtEntities={gtEntities}
              gtPersons={gtPersons}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          {hasExtendedExpertAccess && (
            <TabsContent value="ai-rag">
              <AiRagAuditTab
                month={selectedMonth}
                year={selectedYear}
                expertId={selectedExpertId}
              />
            </TabsContent>
          )}

          <TabsContent value="neconformitati">
            <NeconformitatiTab data={localNeconformitati} onDataChange={handleNeconformitatiChange} />
          </TabsContent>

          <TabsContent value="note">
            <NotesTab data={localNotes} onDataChange={handleNotesChange} />
          </TabsContent>
        </Tabs>
      </div>
      <DosarExpertModal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        expert={reviewExpert}
        activities={reviewExpertActivities}
        verification={reviewVerification || null}
        neconformitati={reviewNeconformitati}
        month={selectedMonth}
        year={selectedYear}
        reportStatus={activeReviewReportStatus}
        documents={documents}
        canManagePmReview={canManagePmReview}
        onSetInReview={() => setReviewMonthlyStatus('in_review', activeReviewReportStatus?.pmNotes)}
        onRequestClarifications={requestReviewClarifications}
        onRejectMonth={rejectReviewMonth}
        onApproveMonth={() => setReviewMonthlyStatus('approved', activeReviewReportStatus?.pmNotes)}
        onApproveActivity={approveReviewActivities}
        onRequestActivityClarification={requestReviewActivityClarification}
        projectCode="302141"
        projectTitle="Consolidarea capacității Concordia pentru dialog social"
      />
    </DashboardShell>
  );
}
