'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle, ClipboardList, Clock3, FileText, Loader2, Plus, RotateCcw, Send, Lock, AlertTriangle, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { ProgressBar, RightInfoCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MultiSelectCalendar } from '@/components/expert/multi-select-calendar';
import { CalendarView } from '@/components/expert/calendar-view';
import { ActivityForm, type ActivityResolutionHint, type ActivityResolutionSection } from '@/components/expert/activity-form';
import { ActivitiesTable } from '@/components/expert/activities-table';
import { ExpertDeliverablesDialog } from '@/components/expert/expert-deliverables-dialog';
import { MonthlyEvidencePanel } from '@/components/expert/monthly-evidence-panel';
import { ReportGenerator } from '@/components/expert/report-generator';
import { MonthlyReportExport } from '@/components/expert/monthly-report-export';
import { getMonthName } from '@/lib/backend-store';
import {
  useActivitiesByMonth,
  useActivityMutations,
  useCollaborationExperts,
  useColleagueDocumentsByMonth,
  useConcurrentProjects,
  useConcurrentProjectTimesheetByMonth,
  useDocuments,
  useExperts,
  useReportStatus,
  useSharedActivityRegistrationContext,
  useSharedDeliverableMutations,
  useSharedDeliverables,
} from '@/hooks/use-backend-data';
import type { Activity, Deliverable, Expert, ReportStatus } from '@/lib/types';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { UserMenu } from '@/components/user-menu';
import { getSignedInUser } from '@/lib/aws/auth';
import { isGtExpertCategory, normalizePeoCategory } from '@/lib/peo-category';
import { parseGdprMetaJson, validateGdprActivityDraft } from '@/lib/gdpr-reporting';
import { assertCanLogHoursOnDate, getNonWorkingDayInfo } from '@/lib/non-working-days';
import { formatDate, formatDateRo } from '@/lib/app-utils';
import {
  createActivityDeliverableAvailabilityResolver,
  getActivitiesMissingDeliverables,
  isActivityExceptionForSubmit,
} from '@/lib/submit-readiness';
import { getWorkingDaysListInMonth } from '@/lib/working-hours';
import {
  getMonthlyBlockingState,
  normalizePontajHoursValue,
  validateActivitiesBeforeCreate,
  type ActivityDraftForValidation,
} from '@/lib/pontaj-rules';
import {
  buildSubmittedActivitiesForEdit,
  getActivityGroupMembers,
  getActivityGroupMembersForSelectedDates,
  mergeActivityGroupForEdit,
  planGroupedActivityEdit,
} from '@/lib/activity-edit';
import { filterPendingSharedDeliverablesNotCoveredByActivity, filterSharedRelationsForMonths } from '@/lib/document-sharing';
import { buildExpertDeliverableRows } from '@/lib/expert-deliverables';
import { isCurrentOrPreviousMonth } from '@/lib/pm-clarifications';

type SubmitReadinessSeverity = 'ok' | 'warning' | 'blocking';
type SubmitReadinessKey =
  | 'working-days'
  | 'deliverables'
  | 'titles'
  | 'ai'
  | 'norm'
  | 'shared-deliverables'
  | 'gdpr';

type SubmitReadinessIssueAction =
  | { type: 'edit-activity'; activityId: string; section?: ActivityResolutionSection; deliverableId?: string }
  | { type: 'add-activity-date'; date: string }
  | { type: 'open-shared-activity'; relationId: string }
  | { type: 'open-shared-deliverable'; relationId: string }
  | { type: 'review-activities' };

interface SubmitReadinessIssue {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  actionLabel?: string;
  action?: SubmitReadinessIssueAction;
}

interface SubmitReadinessItem {
  key: SubmitReadinessKey;
  label: string;
  detail: string;
  severity: SubmitReadinessSeverity;
  issues: SubmitReadinessIssue[];
}

type DeletedActivityUndo = {
  activity: Activity;
};

const SUBMIT_MIN_NORM_PERCENT = 80;

const isActivityException = isActivityExceptionForSubmit;

function needsTitleConfirmation(deliverable: Deliverable) {
  return !deliverable.fileType?.startsWith('image/');
}

function clearSharedRelationQueryParams() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('sharedActivityRelationId');
  url.searchParams.delete('sharedDeliverableRelationId');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function clearHashIfCurrent(hash: string) {
  if (typeof window === 'undefined' || window.location.hash !== hash) return;

  const url = new URL(window.location.href);
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function formatDisplayDate(date?: string) {
  return date ? formatDateRo(date) : 'Neprecizata';
}

function getActivityDisplayTitle(activity: Activity) {
  return activity.title || activity.activityType || 'Activitate fara titlu';
}

function getDeliverableDisplayName(deliverable: Deliverable) {
  return deliverable.declaredTitle
    || deliverable.fileName
    || deliverable.originalFileName
    || deliverable.docTitle
    || 'Livrabil fara titlu';
}

function readMonthParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 11 ? parsed : fallback;
}

function readYearParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : fallback;
}

function toRestoredActivityInput(activity: Activity): Omit<Activity, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...restoredActivity } = activity;
  return restoredActivity;
}

function ExpertDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date();
  const baseMonth = today.getMonth();
  const baseYear = today.getFullYear();
  const queryMonthParam = searchParams.get('month');
  const queryYearParam = searchParams.get('year');
  const hasExplicitMonthContext = queryMonthParam !== null || queryYearParam !== null;
  const queryMonth = readMonthParam(queryMonthParam, baseMonth);
  const queryYear = readYearParam(queryYearParam, baseYear);
  const clarificationMode = searchParams.get('mode') === 'clarificari';
  const clarificationActivityId = searchParams.get('activityId');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<Record<string, string>>({});
  const [currentMonth, setCurrentMonth] = useState(queryMonth);
  const [currentYear, setCurrentYear] = useState(queryYear);
  const [activeTab, setActiveTab] = useState('activitati');
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSharedActivityRelationId, setPendingSharedActivityRelationId] = useState<string | null>(null);
  const [pendingSharedDeliverableRelationId, setPendingSharedDeliverableRelationId] = useState<string | null>(null);
  const [sharedActivityPrefill, setSharedActivityPrefill] = useState<Partial<Activity> | null>(null);
  const [selectedReadinessKey, setSelectedReadinessKey] = useState<SubmitReadinessKey | null>(null);
  const [activityResolutionHint, setActivityResolutionHint] = useState<ActivityResolutionHint | null>(null);
  const [isDeliverablesDialogOpen, setIsDeliverablesDialogOpen] = useState(false);
  const [deletedActivityUndo, setDeletedActivityUndo] = useState<DeletedActivityUndo | null>(null);
  const [isUndoingDelete, setIsUndoingDelete] = useState(false);
  const [clarificationAutoOpenedId, setClarificationAutoOpenedId] = useState<string | null>(null);
  const [selectedExistingSharedActivityId, setSelectedExistingSharedActivityId] = useState<string>('');
  const [isRegisteringExistingSharedActivity, setIsRegisteringExistingSharedActivity] = useState(false);

  // Data hooks
  const { experts, isLoading: expertsLoading } = useExperts();
  const { experts: collaborationExperts } = useCollaborationExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading, mutate: refreshActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { documents } = useDocuments();
  const { documents: colleagueDocuments } = useColleagueDocumentsByMonth(currentMonth, currentYear);
  const { create: createActivity, createBatch, update: updateActivity, remove: removeActivity } = useActivityMutations();
  const { status: reportStatus, updateStatus: updateReportStatus, isLoading: reportStatusLoading } = useReportStatus(selectedExpertId, currentMonth, currentYear);
  const previousMonthDate = useMemo(() => new Date(baseYear, baseMonth - 1, 1), [baseMonth, baseYear]);
  const nextMonthDate = useMemo(() => new Date(baseYear, baseMonth + 1, 1), [baseMonth, baseYear]);
  const { status: previousMonthStatus } = useReportStatus(selectedExpertId, previousMonthDate.getMonth(), previousMonthDate.getFullYear());
  const { status: nextMonthStatus } = useReportStatus(selectedExpertId, nextMonthDate.getMonth(), nextMonthDate.getFullYear());
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);
  const { entries: concurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { sharedDeliverables, isLoading: sharedDeliverablesLoading, mutate: refreshSharedDeliverables } = useSharedDeliverables(selectedExpertId || undefined);
  const visibleSharedDeliverables = useMemo(() => filterSharedRelationsForMonths({
    sharedDeliverables,
    documents,
    allowedMonths: [{ month: currentMonth, year: currentYear }],
  }), [currentMonth, currentYear, documents, sharedDeliverables]);
  const {
    context: sharedActivityRegistrationContext,
    isLoading: sharedActivityRegistrationLoading,
  } = useSharedActivityRegistrationContext(pendingSharedActivityRelationId);
  const { registerForActivity } = useSharedDeliverableMutations();

  useEffect(() => {
    if (!deletedActivityUndo) return undefined;

    const timeout = window.setTimeout(() => {
      setDeletedActivityUndo(null);
    }, 15000);

    return () => window.clearTimeout(timeout);
  }, [deletedActivityUndo]);

  // Get logged in user email
  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;

        if (!user) {
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          router.replace('/auth/login?redirectTo=/expert/peo');
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
        router.replace('/auth/login?redirectTo=/expert/peo');
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Set expert based on logged in user. In admin "view as" mode, user.id is the Expert id.
  useEffect(() => {
    if (isAuthLoading || experts.length === 0 || selectedExpertId) return;

    const normalizedIdentity = userEmail?.toLowerCase();
    const matchingExpert = experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (!normalizedIdentity) return false;
      return expert.email?.toLowerCase() === normalizedIdentity
        || expert.name?.toLowerCase() === normalizedIdentity;
    }) ?? null;
    if (matchingExpert) setSelectedExpertId(matchingExpert.id);
  }, [experts, isAuthLoading, signedInUserId, userEmail, selectedExpertId]);


  // Get selected expert
  const selectedExpert = useMemo(() => {
    const expert = experts.find((e) => e.id === selectedExpertId) || experts[0];
    return expert || { id: '', name: 'Expert', role: '', norma: 8, saCodes: [] };
  }, [experts, selectedExpertId]);
  const isGtExpert = isGtExpertCategory(selectedExpert.category);
  const isComExpert = normalizePeoCategory(selectedExpert.category) === 'com';

  useEffect(() => {
    if ((activeTab === 'gt' && !isGtExpert) || (activeTab === 'dovezi-com' && !isComExpert)) {
      setActiveTab('activitati');
    }
  }, [activeTab, isComExpert, isGtExpert]);

  // Filter activities by expert
  const activities = useMemo(() => {
    if (!selectedExpertId) return [];
    return allMonthActivities.filter((a) => a.expertId === selectedExpertId);
  }, [allMonthActivities, selectedExpertId]);
  const existingSharedActivityCandidates = useMemo(() => {
    const sourceActivity = sharedActivityRegistrationContext?.sourceActivity;
    const sourceRelation = sharedActivityRegistrationContext?.activityRelation;
    if (!sourceActivity && !sourceRelation) return [];

    const sourceDate = sourceActivity?.date || sourceRelation?.sourceActivityDate;
    const sourceSaCode = sourceActivity?.saCode || sourceRelation?.sourceActivitySaCode;
    const sourceTitle = sourceActivity?.title || sourceRelation?.sourceActivityTitle;
    const relatedDocumentKeys = new Set(
      sharedActivityRegistrationContext?.relatedDocuments.flatMap((document) => [
        document.id,
        document.s3Key,
        document.fileHash,
        document.firstPageTextHash,
        document.contentFingerprint,
      ].filter((key): key is string => Boolean(key))) ?? [],
    );

    return activities
      .map((activity) => {
        const hasRelatedDeliverable = (activity.deliverables ?? []).some((deliverable) => [
          deliverable.documentId,
          deliverable.s3Key,
          deliverable.filePath,
          deliverable.fileHash,
          deliverable.firstPageTextHash,
          deliverable.contentFingerprint,
        ].some((key) => key && relatedDocumentKeys.has(key)));
        const score = [
          sourceDate && activity.date === sourceDate,
          sourceSaCode && activity.saCode === sourceSaCode,
          sourceTitle && (activity.title === sourceTitle || activity.activityType === sourceTitle),
          hasRelatedDeliverable,
        ].filter(Boolean).length;

        return { activity, hasRelatedDeliverable, score };
      })
      .filter(({ activity, score }) => {
        if (!sourceDate && !sourceSaCode) return true;
        return score > 0 || activity.date === sourceDate || activity.saCode === sourceSaCode;
      })
      .sort((first, second) => {
        if (second.score !== first.score) return second.score - first.score;
        return first.activity.date.localeCompare(second.activity.date);
      });
  }, [activities, sharedActivityRegistrationContext]);
  const clarificationTargetActivity = useMemo(
    () => clarificationActivityId
      ? activities.find((activity) => activity.id === clarificationActivityId) ?? null
      : null,
    [activities, clarificationActivityId],
  );
  const isClarificationScopedAccess = Boolean(
    clarificationMode
    && clarificationTargetActivity
    && clarificationTargetActivity.pmNotes?.trim()
    && reportStatus?.status === 'clarifications'
    && isCurrentOrPreviousMonth(currentMonth, currentYear),
  );
  const deliverableRows = useMemo(() => buildExpertDeliverableRows(activities), [activities]);

  useEffect(() => {
    if (!pendingSharedActivityRelationId) {
      setSelectedExistingSharedActivityId('');
      return;
    }
    if (
      selectedExistingSharedActivityId
      && existingSharedActivityCandidates.some(({ activity }) => activity.id === selectedExistingSharedActivityId)
    ) {
      return;
    }
    setSelectedExistingSharedActivityId(existingSharedActivityCandidates[0]?.activity.id ?? '');
  }, [existingSharedActivityCandidates, pendingSharedActivityRelationId, selectedExistingSharedActivityId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const openFromHash = () => {
      if (window.location.hash === '#livrabile') {
        setIsDeliverablesDialogOpen(true);
      }
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);

    return () => {
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  const pendingSharedDeliverableContext = useMemo(() => {
    if (!pendingSharedDeliverableRelationId) return null;

    const relation = visibleSharedDeliverables.find((item) => item.id === pendingSharedDeliverableRelationId);
    if (!relation) return null;

    const document = documents.find((item) => item.id === relation.documentId);
    const sourceActivityId = relation.sourceActivityId || document?.sourceActivityId;
    const sourceActivity = sourceActivityId
      ? allMonthActivities.find((activity) => activity.id === sourceActivityId)
      : undefined;
    const sourceExpert = experts.find((expert) => expert.id === relation.sourceExpertId);

    return {
      relation,
      document,
      sourceExpertName: relation.sourceExpertName
        || document?.uploadedByExpertName
        || sourceActivity?.expertName
        || sourceExpert?.name
        || relation.sourceExpertId
        || 'Alt expert',
      theme: relation.sourceActivityTitle
        || relation.sourceActivityType
        || sourceActivity?.title
        || document?.declaredTitle
        || document?.suggestedTitle
        || document?.extractedTitle
        || document?.originalFileName
        || 'Livrabil comun',
      date: relation.sourceActivityDate || sourceActivity?.date || document?.activityDate,
      hours: relation.sourceActivityHours || sourceActivity?.hours,
      description: relation.sourceActivityDescription || sourceActivity?.description,
      location: relation.sourceActivityLocation || sourceActivity?.location,
      dayType: relation.sourceActivityDayType || sourceActivity?.dayType,
      saCode: relation.sourceActivitySaCode || sourceActivity?.saCode || document?.saCode,
      projectId: relation.sourceActivityProjectCode || relation.projectId || document?.projectId || sourceActivity?.projectCode,
      fileName: document?.originalFileName,
      deliverableType: document?.deliverableType,
    };
  }, [allMonthActivities, documents, experts, pendingSharedDeliverableRelationId, visibleSharedDeliverables]);

  const monthlyBlocking = useMemo(
    () =>
      getMonthlyBlockingState({
        expert: selectedExpert,
        activities,
        month: currentMonth,
        year: currentYear,
      }),
    [selectedExpert, activities, currentMonth, currentYear],
  );

  const getMonthOffsetFromBase = (month: number, year: number) =>
    (year - baseYear) * 12 + (month - baseMonth);

  const canOpenMonth = (month: number, year: number) => {
    const offset = getMonthOffsetFromBase(month, year);
    if (offset === 0) return true;
    if (offset === -1) return previousMonthStatus?.expertAccessApproved === true;
    if (offset === 1) return nextMonthStatus?.expertAccessApproved === true;
    return false;
  };
  const calendarDraftActivities = useMemo(
    () => {
      if (!editingActivity) return activities;
      const editingGroupMemberIds = new Set(
        getActivityGroupMembers(editingActivity, activities).map((activity) => activity.id),
      );
      return activities.filter((activity) => !editingGroupMemberIds.has(activity.id));
    },
    [activities, editingActivity],
  );

  const getMonthAccessMessage = (month: number, year: number) =>
    `Luna ${getMonthName(month)} ${year} se poate deschide doar dupa acordul PM.`;

  const handleBlockedMonthChange = (month: number, year: number) => {
    setSaveError(getMonthAccessMessage(month, year));
  };

  const handleMonthChange = (month: number, year: number) => {
    if (isClarificationScopedAccess) {
      setSaveError('În modul clarificări poți modifica doar activitatea marcată de PM.');
      return;
    }

    if (!canOpenMonth(month, year)) {
      handleBlockedMonthChange(month, year);
      return;
    }

    setCurrentMonth(month);
    setCurrentYear(year);
    setSelectedDates([]);
    setSelectedHours({});
    setSaveError(null);
  };

  const availableMonthOptions = useMemo(() => {
    const options = [
      {
        month: baseMonth,
        year: baseYear,
        label: `${getMonthName(baseMonth)} ${baseYear}`,
      },
    ];

    if (previousMonthStatus?.expertAccessApproved) {
      options.unshift({
        month: previousMonthDate.getMonth(),
        year: previousMonthDate.getFullYear(),
        label: `${getMonthName(previousMonthDate.getMonth())} ${previousMonthDate.getFullYear()}`,
      });
    }

    if (nextMonthStatus?.expertAccessApproved) {
      options.push({
        month: nextMonthDate.getMonth(),
        year: nextMonthDate.getFullYear(),
        label: `${getMonthName(nextMonthDate.getMonth())} ${nextMonthDate.getFullYear()}`,
      });
    }

    return options;
  }, [baseMonth, baseYear, nextMonthDate, nextMonthStatus, previousMonthDate, previousMonthStatus]);

  const previousCalendarDate = new Date(currentYear, currentMonth - 1, 1);
  const nextCalendarDate = new Date(currentYear, currentMonth + 1, 1);
  const selectedMonthOffset = getMonthOffsetFromBase(currentMonth, currentYear);
  const monthAccessMessage =
    selectedMonthOffset === 0
      ? 'Luna anterioara si luna viitoare se activeaza dupa acordul PM.'
      : undefined;

  const handleSaveActivities = async (newActivities: Activity[]) => {
    if (reportStatus?.status === 'approved') return;

    setSaveError(null);
    setIsSaving(true);
    try {
      if (!selectedExpertId) {
        throw new Error('Selecteaza un expert inainte de salvare.');
      }

      const editingGroupMembers = editingActivity
        ? getActivityGroupMembersForSelectedDates(editingActivity, activities, selectedDates)
        : [];
      const editingGroupMemberIds = new Set(editingGroupMembers.map((activity) => activity.id));
      if (isClarificationScopedAccess) {
        if (!editingActivity || editingActivity.id !== clarificationActivityId || !editingActivity.pmNotes?.trim()) {
          throw new Error('Poți salva doar activitatea marcată de PM pentru clarificări.');
        }

        const sourceActivity = newActivities.find((activity) => activity.id === editingActivity.id)
          ?? newActivities[0]
          ?? editingActivity;
        const lockedDate = editingActivity.date;
        const sourceHours = Number(sourceActivity.hours);
        const nextActivity: Activity = {
          ...editingActivity,
          hours: Number.isFinite(sourceHours) && sourceHours > 0
            ? sourceHours
            : Number(normalizePontajHoursValue(selectedHours[lockedDate], editingActivity.hours.toString())),
          activityType: sourceActivity.activityType,
          saCode: sourceActivity.saCode,
          catalogActivityId: sourceActivity.catalogActivityId,
          title: sourceActivity.title,
          description: sourceActivity.description,
          activityKeywords: sourceActivity.activityKeywords,
          location: sourceActivity.location,
          dayType: sourceActivity.dayType,
          pmNotes: editingActivity.pmNotes,
          status: editingActivity.status || 'sent',
        };

        const validation = validateActivitiesBeforeCreate({
          expert: selectedExpert,
          existingActivities: activities
            .filter((activity) => activity.id !== editingActivity.id)
            .map((activity): ActivityDraftForValidation => ({
              id: activity.id,
              expertId: activity.expertId,
              date: activity.date,
              hours: Number(activity.hours) || 0,
              status: activity.status,
              projectCode: activity.projectCode,
              saCode: activity.saCode,
              catalogActivityId: activity.catalogActivityId,
              activityType: activity.activityType,
              title: activity.title,
              description: activity.description,
            })),
          newActivities: [{
            id: nextActivity.id,
            expertId: nextActivity.expertId,
            date: nextActivity.date,
            hours: Number(nextActivity.hours) || 0,
            status: nextActivity.status,
            projectCode: nextActivity.projectCode,
            saCode: nextActivity.saCode,
            catalogActivityId: nextActivity.catalogActivityId,
            activityType: nextActivity.activityType,
            title: nextActivity.title,
            description: nextActivity.description,
          }],
          month: currentMonth,
          year: currentYear,
        });

        if (!validation.ok) {
          throw new Error(validation.message || 'Activitatea nu respecta regulile de pontaj.');
        }

        await updateActivity(editingActivity.id, {
          hours: nextActivity.hours,
          activityType: nextActivity.activityType,
          saCode: nextActivity.saCode,
          catalogActivityId: nextActivity.catalogActivityId,
          title: nextActivity.title,
          description: nextActivity.description,
          activityKeywords: nextActivity.activityKeywords,
          location: nextActivity.location,
          dayType: nextActivity.dayType,
          status: nextActivity.status,
          pmNotes: editingActivity.pmNotes,
        });
        await refreshActivities();
        setShowForm(false);
        setEditingActivity(null);
        setActivityResolutionHint(null);
        setSelectedDates([]);
        setSelectedHours({});
        return;
      }

      const submittedActivities = editingActivity
        ? buildSubmittedActivitiesForEdit(
            editingActivity,
            newActivities,
            selectedDates,
            selectedHours,
            editingGroupMembers,
            selectedExpertId,
            normalizePontajHoursValue,
          )
        : newActivities;
      const submittedActivityIds = new Set(submittedActivities.map((activity) => activity.id));

      const toValidationDraft = (activity: Activity): ActivityDraftForValidation => ({
        id: activity.id,
        expertId: activity.expertId || selectedExpertId,
        date: activity.date,
        hours: Number(activity.hours) || 0,
        status: activity.status,
        projectCode: activity.projectCode,
        saCode: activity.saCode,
        catalogActivityId: activity.catalogActivityId,
        activityType: activity.activityType,
        title: activity.title,
        description: activity.description,
      });
      const validation = validateActivitiesBeforeCreate({
        expert: selectedExpert,
        existingActivities: activities
          .filter((activity) => !editingActivity || !editingGroupMemberIds.has(activity.id))
          .filter((activity) => !submittedActivityIds.has(activity.id))
          .map(toValidationDraft),
        newActivities: submittedActivities.map((activity) =>
          toValidationDraft({
            ...activity,
            expertId: selectedExpertId,
          }),
        ),
        month: currentMonth,
        year: currentYear,
      });

      if (!validation.ok) {
        throw new Error(validation.message || 'Activitatea nu respecta regulile de pontaj.');
      }

      if (editingActivity) {
        const { updateActivities, newActivities: activitiesToCreate, deleteActivityIds } = planGroupedActivityEdit(
          editingActivity,
          submittedActivities,
          editingGroupMembers,
          selectedExpertId,
        );
        await Promise.all(updateActivities.map((activity) => updateActivity(activity.id, activity)));
        if (activitiesToCreate.length > 0) {
          await createBatch(activitiesToCreate);
        }
        await Promise.all(deleteActivityIds.map((activityId) => removeActivity(activityId)));
      } else {
        const existingActivityIds = new Set(activities.map((activity) => activity.id));
        const activitiesToUpdate = submittedActivities.filter((activity) => existingActivityIds.has(activity.id));
        const activitiesToCreate = submittedActivities.filter((activity) => !existingActivityIds.has(activity.id));

        await Promise.all(activitiesToUpdate.map((activity) => updateActivity(activity.id, {
          ...activity,
          expertId: selectedExpertId!,
        })));

        const createdActivities = activitiesToCreate.length > 0
          ? await createBatch(activitiesToCreate.map(a => ({
              ...a,
              expertId: selectedExpertId!,
            })))
          : [];
        const savedActivities = [...activitiesToUpdate, ...createdActivities];

        const activityTargetId = savedActivities[0]?.id;
        const deliverableTargetId = pendingSharedActivityRelationId
          ? activityTargetId
          : savedActivities[savedActivities.length - 1]?.id || activityTargetId;
        const deliverableRelationIdsToRegister = [...new Set([
          ...(sharedActivityRegistrationContext?.relatedDeliverableRelations.map((relation) => relation.id) ?? []),
          ...(pendingSharedDeliverableRelationId ? [pendingSharedDeliverableRelationId] : []),
        ])].filter((relationId) => relationId !== pendingSharedActivityRelationId);

        if (pendingSharedActivityRelationId && activityTargetId) {
          await registerForActivity(pendingSharedActivityRelationId, activityTargetId);
        }

        if (deliverableTargetId) {
          for (const relationId of deliverableRelationIdsToRegister) {
            await registerForActivity(relationId, deliverableTargetId);
          }
        }

        if (pendingSharedActivityRelationId || deliverableRelationIdsToRegister.length > 0) {
          await refreshSharedDeliverables();
          resetSharedRegistrationFlow();
        }
      }
      await refreshActivities();
      setShowForm(false);
      setEditingActivity(null);
      setSharedActivityPrefill(null);
      setActivityResolutionHint(null);
      setSelectedDates([]);
      setSelectedHours({});
    } catch (error) {
      console.error('Error saving activities:', error);
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Activitatea nu a fost creată. Verifică norma disponibilă sau contactează administratorul.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditActivity = (activity: Activity, resolutionHint?: ActivityResolutionHint) => {
    if (reportStatus?.status === 'approved') return;
    if (clarificationMode && activity.id !== clarificationActivityId) {
      setSaveError('În modul clarificări poți modifica doar activitatea marcată de PM.');
      return;
    }

    const { activity: activityForEdit, groupMembers } = mergeActivityGroupForEdit(activity, activities);
    const datesForEdit = groupMembers.map((groupActivity) => groupActivity.date);
    const hoursForEdit = Object.fromEntries(
      groupMembers.map((groupActivity) => [groupActivity.date, groupActivity.hours.toString()]),
    );

    setIsDeliverablesDialogOpen(false);
    setEditingActivity(activityForEdit);
    setSharedActivityPrefill(null);
    setActivityResolutionHint(resolutionHint ?? null);
    setSelectedDates(datesForEdit);
    setSelectedHours(hoursForEdit);
    setShowForm(true);
    setActiveTab('activitati');
  };

  useEffect(() => {
    if (!clarificationMode) return;
    if (currentMonth !== queryMonth || currentYear !== queryYear) {
      setCurrentMonth(queryMonth);
      setCurrentYear(queryYear);
      setClarificationAutoOpenedId(null);
    }
  }, [clarificationMode, currentMonth, currentYear, queryMonth, queryYear]);

  useEffect(() => {
    if (clarificationMode || !hasExplicitMonthContext) return;
    if (currentMonth === queryMonth && currentYear === queryYear) return;

    setCurrentMonth(queryMonth);
    setCurrentYear(queryYear);
    setSelectedDates([]);
    setSelectedHours({});
    setShowForm(false);
    setEditingActivity(null);
    setSharedActivityPrefill(null);
    setActivityResolutionHint(null);
    setSaveError(null);
  }, [clarificationMode, currentMonth, currentYear, hasExplicitMonthContext, queryMonth, queryYear]);

  useEffect(() => {
    if (!clarificationMode || !clarificationActivityId || activitiesLoading || reportStatusLoading) return;
    if (!isClarificationScopedAccess || !clarificationTargetActivity) {
      setSaveError('Clarificarea nu poate fi deschisă: activitatea nu este marcată de PM sau luna nu este eligibilă.');
      return;
    }
    if (clarificationAutoOpenedId === clarificationTargetActivity.id) return;

    handleEditActivity(clarificationTargetActivity, {
      id: `pm-clarification-${clarificationTargetActivity.id}`,
      title: 'Clarificare solicitată de PM',
      detail: clarificationTargetActivity.pmNotes || 'PM a solicitat clarificări pentru această activitate.',
      meta: `${formatDisplayDate(clarificationTargetActivity.date)}${clarificationTargetActivity.saCode ? ` / ${clarificationTargetActivity.saCode}` : ''}`,
      section: 'details',
    });
    setClarificationAutoOpenedId(clarificationTargetActivity.id);
  }, [
    activitiesLoading,
    clarificationActivityId,
    clarificationAutoOpenedId,
    clarificationMode,
    clarificationTargetActivity,
    currentMonth,
    currentYear,
    isClarificationScopedAccess,
    queryMonth,
    queryYear,
    reportStatusLoading,
  ]);

  const handleEditDeliverableActivity = (activityId: string) => {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) return;

    handleEditActivity(activity, {
      id: `deliverable-dialog-${activityId}-${Date.now()}`,
      title: 'Revizuire livrabile',
      detail: 'Verifica sau actualizeaza livrabilele atasate acestei activitati.',
      section: 'deliverables',
    });
    clearHashIfCurrent('#livrabile');
  };

  const handleDeliverablesDialogOpenChange = (open: boolean) => {
    setIsDeliverablesDialogOpen(open);
    if (!open) clearHashIfCurrent('#livrabile');
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (reportStatus?.status === 'approved') return;
    if (isClarificationScopedAccess) {
      setSaveError('În modul clarificări nu poți șterge activități.');
      return;
    }

    const activityToDelete = activities.find((activity) => activity.id === activityId);

    try {
      await removeActivity(activityId);
      if (activityToDelete) {
        setDeletedActivityUndo({
          activity: activityToDelete,
        });
      }
      if (editingActivity?.id === activityId) {
        closeActivityForm();
      }
      await refreshActivities();
    } catch (error) {
      console.error('Error deleting activity:', error);
    }
  };

  const handleUndoDeleteActivity = async () => {
    if (!deletedActivityUndo || reportStatus?.status === 'approved') return;

    setIsUndoingDelete(true);
    try {
      await createActivity(toRestoredActivityInput(deletedActivityUndo.activity));
      setDeletedActivityUndo(null);
      await refreshActivities();
    } catch (error) {
      console.error('Error restoring activity:', error);
      setSaveError(error instanceof Error ? error.message : 'Activitatea stearsa nu a putut fi restaurata.');
    } finally {
      setIsUndoingDelete(false);
    }
  };

  const statusLabels: Record<ReportStatus['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'secondary' },
    sent: { label: 'Trimis către PM', variant: 'outline' },
    in_review: { label: 'În verificare PM', variant: 'outline' },
    approved: { label: 'Aprobat', variant: 'default' },
    rejected: { label: 'Respins', variant: 'destructive' },
    clarifications: { label: 'Clarificări solicitate', variant: 'destructive' },
  };

  const currentStatus = reportStatus?.status || 'draft';
  const isApproved = currentStatus === 'approved';
  const isSent = currentStatus === 'sent';
  const isInReview = currentStatus === 'in_review';
  const statusMeta = statusLabels[currentStatus as ReportStatus['status']] || statusLabels.draft;
  const statusDescription = isApproved
    ? 'Luna este aprobată de PM.'
    : isInReview
      ? 'Raportarea este în verificare la PM.'
      : isSent
        ? 'Luna a fost trimisă către PM și așteaptă verificarea.'
        : 'Completează pontajul și trimite luna către PM când pachetul este pregătit.';
  const submitButtonIcon = isApproved
    ? <Lock className="h-4 w-4" />
    : isSent || isInReview
      ? <CheckCircle className="h-4 w-4" />
      : <Send className="h-4 w-4" />;
  const submitButtonLabel = isApproved
    ? 'Lună aprobată'
    : isInReview
      ? 'În verificare PM'
      : isSent
        ? 'Luna trimisă către PM'
        : 'Trimite luna către PM';
  const submitReadiness = useMemo(() => {
    const workingDays = getWorkingDaysListInMonth(currentMonth + 1, currentYear).map(formatDate);
    const activityDates = new Set(activities.map((activity) => activity.date));
    const missingWorkingDays = workingDays.filter((date) => !activityDates.has(date));
    const activitiesMissingDeliverables = getActivitiesMissingDeliverables(activities, {
      expertCategory: selectedExpert.category,
    });
    const deliverableRefs = activities.flatMap((activity) =>
      (activity.deliverables ?? []).map((deliverable) => ({ activity, deliverable })),
    );
    const activityHasUsableDeliverable = createActivityDeliverableAvailabilityResolver(activities);
    const unconfirmedTitles = deliverableRefs.filter(({ deliverable }) =>
      needsTitleConfirmation(deliverable) && deliverable.titleConfirmed !== true,
    );
    const aiReviewDeliverables = deliverableRefs.filter(({ deliverable }) =>
      deliverable.aiStatus === 'review' || deliverable.aiStatus === 'ineligible',
    );
    const gdprActivitiesWithIssues = selectedExpert.category === 'gdpr'
      ? activities.map((activity) => {
          if (isActivityException(activity)) return false;
          const validation = validateGdprActivityDraft({
            templateCode: activity.gdprTemplateCode,
            meta: parseGdprMetaJson(activity.gdprMetaJson),
            description: activity.gdprGeneratedText || activity.description,
            hasDeliverable: activityHasUsableDeliverable(activity),
          });
          return validation.ok ? null : { activity, missingFields: validation.missingFields };
        }).filter((item): item is { activity: Activity; missingFields: string[] } => Boolean(item))
      : [];
    const utilizationPercent = monthlyBlocking.monthlyNorm > 0
      ? Math.round((monthlyBlocking.totalHours / monthlyBlocking.monthlyNorm) * 100)
      : 0;
    const submitThresholdHours = Math.ceil((monthlyBlocking.monthlyNorm * SUBMIT_MIN_NORM_PERCENT) / 100);
    const remainingThresholdHours = Math.max(0, submitThresholdHours - monthlyBlocking.totalHours);
    const pendingSharedActivities = visibleSharedDeliverables.filter((relation) =>
      relation.targetExpertId === selectedExpert.id
      && relation.status === 'pending_registration'
      && relation.documentId.startsWith('activity:'),
    );
    const pendingSharedDeliverables = [
      ...pendingSharedActivities,
      ...filterPendingSharedDeliverablesNotCoveredByActivity({
        expertId: selectedExpert.id,
        sharedDeliverables: visibleSharedDeliverables,
      }),
    ];
    const missingWorkingDayIssues: SubmitReadinessIssue[] = missingWorkingDays.map((date) => ({
      id: `working-day-${date}`,
      title: formatDisplayDate(date),
      detail: 'Zi lucratoare fara pontaj sau exceptie.',
      meta: date,
      actionLabel: 'Adauga activitate',
      action: { type: 'add-activity-date', date },
    }));
    const missingDeliverableIssues: SubmitReadinessIssue[] = activitiesMissingDeliverables.map((activity) => ({
      id: `missing-deliverable-${activity.id}`,
      title: getActivityDisplayTitle(activity),
      detail: 'Activitatea nu are niciun livrabil principal atasat.',
      meta: `${formatDisplayDate(activity.date)}${activity.saCode ? ` / ${activity.saCode}` : ''}`,
      actionLabel: 'Rezolva',
      action: { type: 'edit-activity', activityId: activity.id, section: 'deliverables' },
    }));
    const unconfirmedTitleGroups = unconfirmedTitles.reduce((groups, item) => {
      const group = groups.get(item.activity.id) || {
        activity: item.activity,
        deliverables: [] as Deliverable[],
      };
      group.deliverables.push(item.deliverable);
      groups.set(item.activity.id, group);
      return groups;
    }, new Map<string, { activity: Activity; deliverables: Deliverable[] }>());
    const unconfirmedTitleIssues: SubmitReadinessIssue[] = Array.from(unconfirmedTitleGroups.values()).map(({ activity, deliverables }) => {
      const deliverableNames = deliverables.map(getDeliverableDisplayName).join(', ');
      const messages = deliverables
        .map((deliverable) => deliverable.titleCheckMessage)
        .filter(Boolean)
        .join(' ');
      return {
        id: `title-${activity.id}`,
        title: getActivityDisplayTitle(activity),
        detail: `Titluri neconfirmate: ${deliverableNames}.${messages ? ` ${messages}` : ''}`,
        meta: `${formatDisplayDate(activity.date)}${activity.saCode ? ` / ${activity.saCode}` : ''}`,
        actionLabel: 'Rezolva',
        action: { type: 'edit-activity', activityId: activity.id, section: 'deliverables', deliverableId: deliverables[0]?.id },
      };
    });
    const aiReviewIssues: SubmitReadinessIssue[] = aiReviewDeliverables.map(({ activity, deliverable }) => ({
      id: `ai-${activity.id}-${deliverable.id}`,
      title: getDeliverableDisplayName(deliverable),
      detail: deliverable.aiReason || 'Livrabilul este in review sau marcat neeligibil.',
      meta: `${formatDisplayDate(activity.date)} / ${getActivityDisplayTitle(activity)}`,
      actionLabel: 'Rezolva',
      action: { type: 'edit-activity', activityId: activity.id, section: 'deliverables', deliverableId: deliverable.id },
    }));
    const normIssues: SubmitReadinessIssue[] = utilizationPercent >= SUBMIT_MIN_NORM_PERCENT
      ? []
      : [{
          id: 'monthly-norm-threshold',
          title: 'Pragul minim de submit nu este atins',
          detail: monthlyBlocking.monthlyNorm > 0
            ? `Mai sunt necesare aproximativ ${remainingThresholdHours}h pentru pragul de ${SUBMIT_MIN_NORM_PERCENT}%.`
            : 'Norma lunara nu este configurata pentru luna curenta.',
          meta: `${monthlyBlocking.totalHours}h raportate / ${monthlyBlocking.monthlyNorm}h norma`,
          actionLabel: 'Vezi activitati',
          action: { type: 'review-activities' },
        }];
    const pendingSharedIssues: SubmitReadinessIssue[] = pendingSharedDeliverables.map((relation) => {
      const document = documents.find((item) => item.id === relation.documentId);
      const isActivitySuggestion = relation.documentId.startsWith('activity:');
      const action: SubmitReadinessIssueAction = isActivitySuggestion
        ? { type: 'open-shared-activity', relationId: relation.id }
        : { type: 'open-shared-deliverable', relationId: relation.id };
      return {
        id: `shared-${relation.id}`,
        title: isActivitySuggestion
          ? (relation.sourceActivityTitle || relation.sourceActivityType || 'Activitate comuna propusa')
          : (document?.originalFileName || relation.sourceActivityTitle || 'Livrabil comun in asteptare'),
        detail: isActivitySuggestion
          ? 'Activitate comuna propusa de un coleg, in asteptare.'
          : 'Livrabil comun in asteptare pentru confirmare/inregistrare.',
        meta: `${relation.sourceExpertName || 'Expert'}${relation.sourceActivityDate ? ` / ${formatDisplayDate(relation.sourceActivityDate)}` : ''}`,
        actionLabel: 'Rezolva',
        action,
      };
    });
    const gdprIssues: SubmitReadinessIssue[] = gdprActivitiesWithIssues.map(({ activity, missingFields }) => ({
      id: `gdpr-${activity.id}`,
      title: getActivityDisplayTitle(activity),
      detail: `Campuri/livrabile lipsa: ${missingFields.join(', ') || 'validare GDPR incompleta'}.`,
      meta: `${formatDisplayDate(activity.date)}${activity.saCode ? ` / ${activity.saCode}` : ''}`,
      actionLabel: 'Rezolva',
      action: { type: 'edit-activity', activityId: activity.id, section: 'gdpr' },
    }));

    const items: SubmitReadinessItem[] = [
      {
        key: 'working-days',
        label: 'Zile lucratoare acoperite',
        detail: missingWorkingDays.length === 0
          ? 'Toate zilele lucratoare au pontaj sau exceptie.'
          : `${missingWorkingDays.length} zile lucratoare fara pontaj: ${missingWorkingDays.slice(0, 5).join(', ')}${missingWorkingDays.length > 5 ? '...' : ''}`,
        severity: missingWorkingDays.length === 0 ? 'ok' : 'warning',
        issues: missingWorkingDayIssues,
      },
      {
        key: 'deliverables',
        label: 'Livrabile pe activitati',
        detail: activitiesMissingDeliverables.length === 0
          ? 'Activitatile individuale au livrabil, iar activitatile multi-zi au livrabil final.'
          : `${activitiesMissingDeliverables.length} activitati fara livrabil.`,
        severity: activitiesMissingDeliverables.length === 0 ? 'ok' : 'blocking',
        issues: missingDeliverableIssues,
      },
      {
        key: 'titles',
        label: 'Titluri confirmate',
        detail: unconfirmedTitles.length === 0
          ? 'Toate titlurile livrabilelor sunt confirmate.'
          : `${unconfirmedTitles.length} livrabile au titlul neconfirmat.`,
        severity: unconfirmedTitles.length === 0 ? 'ok' : 'blocking',
        issues: unconfirmedTitleIssues,
      },
      {
        key: 'ai',
        label: 'Verificari AI',
        detail: aiReviewDeliverables.length === 0
          ? 'Nu exista livrabile in review sau ineligible.'
          : `${aiReviewDeliverables.length} livrabile sunt in review sau ineligible.`,
        severity: aiReviewDeliverables.length === 0 ? 'ok' : 'blocking',
        issues: aiReviewIssues,
      },
      {
        key: 'norm',
        label: 'Norma lunara',
        detail: `${monthlyBlocking.totalHours}h / ${monthlyBlocking.monthlyNorm}h (${utilizationPercent}%). Prag submit: ${SUBMIT_MIN_NORM_PERCENT}%.`,
        severity: utilizationPercent >= SUBMIT_MIN_NORM_PERCENT ? 'ok' : 'warning',
        issues: normIssues,
      },
      {
        key: 'shared-deliverables',
        label: 'Livrabile comune',
        detail: pendingSharedDeliverables.length === 0
          ? 'Nu exista livrabile comune in asteptare.'
          : `${pendingSharedDeliverables.length} livrabile comune asteapta confirmare/inregistrare.`,
        severity: pendingSharedDeliverables.length === 0 ? 'ok' : 'warning',
        issues: pendingSharedIssues,
      },
      {
        key: 'gdpr',
        label: 'Reguli GDPR',
        detail: selectedExpert.category !== 'gdpr'
          ? 'Nu se aplica pentru categoria curenta.'
          : gdprActivitiesWithIssues.length === 0
            ? 'Toate activitatile GDPR au template, campuri obligatorii si livrabil acolo unde este necesar.'
            : `${gdprActivitiesWithIssues.length} activitati GDPR au campuri/livrabile lipsa.`,
        severity: selectedExpert.category !== 'gdpr' || gdprActivitiesWithIssues.length === 0 ? 'ok' : 'blocking',
        issues: gdprIssues,
      },
    ];

    const blockingItems = items.filter((item) => item.severity === 'blocking');
    return {
      items,
      blockingItems,
      hasBlockingIssues: activities.length === 0 || blockingItems.length > 0,
      disabledReason: activities.length === 0
        ? 'Adauga cel putin o activitate inainte de trimitere.'
        : blockingItems[0]?.detail || '',
    };
  }, [activities, currentMonth, currentYear, documents, monthlyBlocking, selectedExpert.category, visibleSharedDeliverables]);

  const selectedReadinessItem = selectedReadinessKey
    ? submitReadiness.items.find((item) => item.key === selectedReadinessKey && item.severity !== 'ok') ?? null
    : null;
  const submitButtonTitle = isApproved
    ? 'Luna este aprobată.'
    : isInReview
      ? 'Raportarea este deja în verificare la PM.'
      : isSent
        ? 'Luna a fost deja trimisă către PM.'
        : submitReadiness.disabledReason || undefined;

  const handleSubmitMonth = async () => {
    if (!selectedExpertId || isApproved) return;
    if (submitReadiness.hasBlockingIssues) {
      const firstIssueItem = submitReadiness.blockingItems[0] || submitReadiness.items.find((item) => item.severity !== 'ok');
      if (firstIssueItem) {
        setSelectedReadinessKey(firstIssueItem.key);
      }
      setSaveError(submitReadiness.disabledReason);
      return;
    }

    setSaveError(null);
    await updateReportStatus({
      expertId: selectedExpertId,
      year: currentYear,
      month: currentMonth,
      status: 'sent',
      sentDate: new Date().toISOString(),
      expertAccessApproved: reportStatus?.expertAccessApproved ?? false,
      expertAccessApprovedAt: reportStatus?.expertAccessApprovedAt,
      pmNotes: reportStatus?.pmNotes,
    });
  };

  const getFirstWorkingDateInMonth = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!getNonWorkingDayInfo(date).isNonWorkingDay) {
        return date;
      }
    }

    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  };

  const getDefaultActivityDate = () => {
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];
    if (
      today.getMonth() === currentMonth &&
      today.getFullYear() === currentYear &&
      !getNonWorkingDayInfo(todayDate).isNonWorkingDay
    ) {
      return todayDate;
    }
    return getFirstWorkingDateInMonth();
  };

  const getDefaultHours = () => Math.min(selectedExpert.norma || 8, 8).toString();
  const getDefaultHoursForDate = (date: string) => {
    const editingGroupMemberIds = editingActivity
      ? new Set(getActivityGroupMembers(editingActivity, activities).map((activity) => activity.id))
      : new Set<string>();
    const existingHours = activities
      .filter((activity) => activity.date === date && !editingGroupMemberIds.has(activity.id))
      .reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
    const remainingDailyHours = Math.max(0, 8 - existingHours);
    const preferredHours = Math.min(Number(getDefaultHours()) || 8, remainingDailyHours || 1);
    return Math.max(1, preferredHours).toString();
  };

  const syncSelectedDates = (dates: string[], baseHours = selectedHours) => {
    const uniqueDates = [...new Set(dates)].sort();
    const nextHours = Object.fromEntries(
      uniqueDates.map((date) => [
        date,
        normalizePontajHoursValue(baseHours[date], getDefaultHoursForDate(date)),
      ]),
    );
    setSelectedDates(uniqueDates);
    setSelectedHours(nextHours);
  };

  const resetSharedRegistrationFlow = () => {
    setPendingSharedActivityRelationId(null);
    setPendingSharedDeliverableRelationId(null);
    setSharedActivityPrefill(null);
    setActivityResolutionHint(null);
    setSelectedExistingSharedActivityId('');
    clearSharedRelationQueryParams();
  };

  const handleRegisterSharedActivityOnExisting = async () => {
    if (!pendingSharedActivityRelationId || !selectedExistingSharedActivityId) return;

    setSaveError(null);
    setIsRegisteringExistingSharedActivity(true);
    try {
      await registerForActivity(pendingSharedActivityRelationId, selectedExistingSharedActivityId);
      const relatedRelationIds = sharedActivityRegistrationContext?.relatedDeliverableRelations.map((relation) => relation.id) ?? [];
      for (const relationId of relatedRelationIds) {
        await registerForActivity(relationId, selectedExistingSharedActivityId);
      }
      await Promise.all([refreshActivities(), refreshSharedDeliverables()]);
      resetSharedRegistrationFlow();
      setShowForm(false);
      setEditingActivity(null);
      setSharedActivityPrefill(null);
      setSelectedDates([]);
      setSelectedHours({});
    } catch (error) {
      console.error('Error registering shared activity on existing activity:', error);
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Activitatea comuna nu a putut fi asociata la activitatea existenta.',
      );
    } finally {
      setIsRegisteringExistingSharedActivity(false);
    }
  };

  const closeActivityForm = () => {
    setShowForm(false);
    setEditingActivity(null);
    setActivityResolutionHint(null);
    if (pendingSharedActivityRelationId || pendingSharedDeliverableRelationId) {
      resetSharedRegistrationFlow();
    }
    setSelectedDates([]);
    setSelectedHours({});
  };

  const handleReadinessIssueAction = (issue: SubmitReadinessIssue) => {
    if (!issue.action) return;
    setSaveError(null);

    if (issue.action.type === 'edit-activity') {
      const { activityId, deliverableId, section } = issue.action;
      const activity = activities.find((item) => item.id === activityId);
      if (activity) {
        handleEditActivity(activity, {
          id: `${issue.id}-${Date.now()}`,
          title: issue.title,
          detail: issue.detail,
          meta: issue.meta,
          section,
          deliverableId,
        });
      }
      return;
    }

    if (issue.action.type === 'add-activity-date') {
      if (monthlyBlocking.isBlocked) {
        setSaveError(monthlyBlocking.reason);
        return;
      }
      try {
        assertCanLogHoursOnDate(issue.action.date);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Ziua selectata este nelucratoare.');
        return;
      }
      syncSelectedDates([issue.action.date]);
      setEditingActivity(null);
      setSharedActivityPrefill(null);
      setActivityResolutionHint({
        id: `${issue.id}-${Date.now()}`,
        title: issue.title,
        detail: issue.detail,
        meta: issue.meta,
        section: 'details',
      });
      setShowForm(true);
      setActiveTab('activitati');
      return;
    }

    if (issue.action.type === 'open-shared-activity') {
      setShowForm(false);
      setActivityResolutionHint(null);
      setPendingSharedDeliverableRelationId(null);
      setPendingSharedActivityRelationId(issue.action.relationId);
      setActiveTab('activitati');
      return;
    }

    if (issue.action.type === 'open-shared-deliverable') {
      setShowForm(false);
      setActivityResolutionHint(null);
      setPendingSharedActivityRelationId(null);
      setPendingSharedDeliverableRelationId(issue.action.relationId);
      setActiveTab('activitati');
      return;
    }

    setShowForm(false);
    setActivityResolutionHint(null);
    setActiveTab('activitati');
  };



  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const activityRelationId = params.get('sharedActivityRelationId');
    const deliverableRelationId = params.get('sharedDeliverableRelationId');

    if (activityRelationId && pendingSharedActivityRelationId !== activityRelationId) {
      setPendingSharedActivityRelationId(activityRelationId);
    }
    if (deliverableRelationId && pendingSharedDeliverableRelationId !== deliverableRelationId) {
      setPendingSharedDeliverableRelationId(deliverableRelationId);
    }
  }, [pendingSharedActivityRelationId, pendingSharedDeliverableRelationId]);

  useEffect(() => {
    if (!pendingSharedActivityRelationId || showForm || !selectedExpertId || sharedActivityRegistrationLoading) return;

    const sourceActivity = sharedActivityRegistrationContext?.sourceActivity;
    if (!sourceActivity) {
      setSaveError('Nu am gasit detaliile activitatii comune. Revino in dashboard si incearca din nou.');
      return;
    }

    if (sourceActivity.date) {
      const [targetYear, targetMonth] = sourceActivity.date.split('-').map(Number);
      const normalizedTargetMonth = targetMonth - 1;
      if (
        Number.isInteger(targetYear)
        && Number.isInteger(normalizedTargetMonth)
        && (targetYear !== currentYear || normalizedTargetMonth !== currentMonth)
      ) {
        if (!canOpenMonth(normalizedTargetMonth, targetYear)) {
          setSaveError(getMonthAccessMessage(normalizedTargetMonth, targetYear));
          return;
        }
        setCurrentYear(targetYear);
        setCurrentMonth(normalizedTargetMonth);
        return;
      }
    }

    if (monthlyBlocking.isBlocked) {
      setSaveError(monthlyBlocking.reason);
      return;
    }

    const prefillHours = sourceActivity.hours > 0 ? sourceActivity.hours.toString() : getDefaultHours();
    setSaveError('Verifica activitatea propusa de coleg, ajusteaza daca este nevoie, apoi salveaza pentru a inchide atentionarea.');
    setSharedActivityPrefill({
      date: sourceActivity.date,
      hours: sourceActivity.hours > 0 ? sourceActivity.hours : Number(prefillHours),
      activityType: sourceActivity.activityType,
      saCode: sourceActivity.saCode,
      catalogActivityId: sourceActivity.catalogActivityId,
      title: sourceActivity.title,
      description: sourceActivity.description,
      deliverables: sourceActivity.deliverables,
      location: sourceActivity.location,
      dayType: sourceActivity.dayType,
      projectCode: sourceActivity.projectCode,
      gdprTemplateCode: sourceActivity.gdprTemplateCode,
      gdprMetaJson: sourceActivity.gdprMetaJson,
      gdprGeneratedText: sourceActivity.gdprGeneratedText,
      gdprConclusionCode: sourceActivity.gdprConclusionCode,
      businessHubMetaJson: sourceActivity.businessHubMetaJson,
      eventDurationHours: sourceActivity.eventDurationHours,
      eventExtendedDescription: sourceActivity.eventExtendedDescription,
    });
    syncSelectedDates([sourceActivity.date], { [sourceActivity.date]: prefillHours });
    setEditingActivity(null);
    setActivityResolutionHint(null);
    setShowForm(true);
  }, [
    currentMonth,
    currentYear,
    monthlyBlocking.isBlocked,
    monthlyBlocking.reason,
    pendingSharedActivityRelationId,
    selectedExpertId,
    sharedActivityRegistrationContext,
    sharedActivityRegistrationLoading,
    showForm,
  ]);

  useEffect(() => {
    if (!pendingSharedDeliverableRelationId || showForm || !selectedExpertId || sharedDeliverablesLoading) return;

    if (!pendingSharedDeliverableContext?.relation) {
      setSaveError('Nu am gasit livrabilul comun de asociat. Revino in dashboard si incearca din nou.');
      return;
    }

    if (pendingSharedDeliverableContext.date) {
      const [targetYear, targetMonth] = pendingSharedDeliverableContext.date.split('-').map(Number);
      const normalizedTargetMonth = targetMonth - 1;
      if (
        Number.isInteger(targetYear)
        && Number.isInteger(normalizedTargetMonth)
        && (targetYear !== currentYear || normalizedTargetMonth !== currentMonth)
      ) {
        if (!canOpenMonth(normalizedTargetMonth, targetYear)) {
          setSaveError(getMonthAccessMessage(normalizedTargetMonth, targetYear));
          return;
        }
        setCurrentYear(targetYear);
        setCurrentMonth(normalizedTargetMonth);
        return;
      }
    }

    if (monthlyBlocking.isBlocked) {
      setSaveError(monthlyBlocking.reason);
      return;
    }

    const suggestedDate = pendingSharedDeliverableContext.date
      && !getNonWorkingDayInfo(pendingSharedDeliverableContext.date).isNonWorkingDay
      ? pendingSharedDeliverableContext.date
      : getDefaultActivityDate();
    const suggestedHours = pendingSharedDeliverableContext.hours && pendingSharedDeliverableContext.hours > 0
      ? pendingSharedDeliverableContext.hours.toString()
      : getDefaultHours();

    setSaveError('Completeaza activitatea pentru livrabilul comun, apoi salveaza pentru a inchide atentionarea.');
    if (pendingSharedDeliverableContext.theme || pendingSharedDeliverableContext.saCode) {
      setSharedActivityPrefill({
        date: suggestedDate,
        hours: pendingSharedDeliverableContext.hours || Number(suggestedHours),
        activityType: pendingSharedDeliverableContext.theme,
        title: pendingSharedDeliverableContext.theme,
        description: pendingSharedDeliverableContext.description,
        location: pendingSharedDeliverableContext.location,
        dayType: pendingSharedDeliverableContext.dayType,
        saCode: pendingSharedDeliverableContext.saCode,
        projectCode: pendingSharedDeliverableContext.projectId,
      });
    }
    syncSelectedDates([suggestedDate], { [suggestedDate]: suggestedHours });
    setEditingActivity(null);
    setActivityResolutionHint(null);
    setShowForm(true);
  }, [
    currentMonth,
    currentYear,
    monthlyBlocking.isBlocked,
    monthlyBlocking.reason,
    pendingSharedDeliverableContext,
    pendingSharedDeliverableRelationId,
    selectedExpertId,
    sharedDeliverablesLoading,
    showForm,
  ]);

  const handleAddActivity = () => {
    if (isClarificationScopedAccess) {
      setSaveError('În modul clarificări nu poți adăuga activități noi.');
      return;
    }

    if (monthlyBlocking.isBlocked) {
      setSaveError(monthlyBlocking.reason);
      return;
    }

    setSaveError(null);
    setEditingActivity(null);
    setSharedActivityPrefill(null);
    setActivityResolutionHint(null);
    setShowForm(true);
    setActiveTab('activitati');
  };

  // Auto-open form when dates are selected
  const handleSelectDates = (dates: string[]) => {
    if (isClarificationScopedAccess) {
      setSaveError('În modul clarificări data activității rămâne blocată.');
      return;
    }

    if (monthlyBlocking.isBlocked && dates.length > 0) {
      setSaveError(monthlyBlocking.reason);
      return;
    }

    const blockedDate = dates.find((date) => getNonWorkingDayInfo(date).isNonWorkingDay);
    if (blockedDate) {
      try {
        assertCanLogHoursOnDate(blockedDate);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Ziua selectata este nelucratoare.');
      }
      return;
    }

    setSaveError(null);
    syncSelectedDates(dates);
    if (dates.length > 0) {
      if (!editingActivity && !sharedActivityPrefill) {
        setActivityResolutionHint(null);
      }
      setShowForm(true);
      setActiveTab('activitati');
    } else {
      setActivityResolutionHint(null);
      setShowForm(false);
    }
  };

  const isLoading = isAuthLoading || expertsLoading || activitiesLoading;

  if (isLoading && (experts.length === 0 || !selectedExpertId)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Se încarcă datele...</p>
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
              <Link href="/auth/login?redirectTo=/expert/peo">Mergi la autentificare</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sharedSourceActivity = sharedActivityRegistrationContext?.sourceActivity;
  const sharedSourceRelation = sharedActivityRegistrationContext?.activityRelation;
  const sharedSourceExpertName = sharedActivityRegistrationContext?.sourceExpert?.name
    || sharedSourceActivity?.expertName
    || sharedSourceRelation?.sourceExpertName
    || sharedSourceRelation?.sourceExpertId
    || 'Expert nespecificat';
  const sharedSourceDate = sharedSourceActivity?.date || sharedSourceRelation?.sourceActivityDate;
  const sharedSourceHours = sharedSourceActivity?.hours || sharedSourceRelation?.sourceActivityHours || 0;
  const sharedSourceTheme = sharedSourceActivity?.title
    || sharedSourceActivity?.activityType
    || sharedSourceRelation?.sourceActivityTitle
    || sharedSourceRelation?.sourceActivityType
    || 'Tema nespecificata';
  const sharedSourceDescription = sharedSourceActivity?.description || sharedSourceRelation?.sourceActivityDescription;
  const sharedSourceSaCode = sharedSourceActivity?.saCode || sharedSourceRelation?.sourceActivitySaCode;
  const sharedSourceProjectCode = sharedSourceActivity?.projectCode || sharedSourceRelation?.sourceActivityProjectCode;
  const formKey = editingActivity
    ? `edit-${editingActivity.id}-${activityResolutionHint?.id || 'manual'}`
    : sharedActivityPrefill
      ? `prefill-${pendingSharedActivityRelationId || pendingSharedDeliverableRelationId || selectedDates.join('-')}`
      : `new-${selectedDates.join('-')}-${activityResolutionHint?.id || 'manual'}`;
  const activityFormElement = (
    <ActivityForm
      key={formKey}
      selectedDates={selectedDates}
      selectedHours={selectedHours}
      onSelectedHoursChange={setSelectedHours}
      expertId={selectedExpertId || ''}
      expertName={selectedExpert.name}
      expert={selectedExpert as import('@/lib/types').Expert}
      allExperts={collaborationExperts.length > 0 ? collaborationExperts : experts}
      allActivities={allMonthActivities}
      documents={documents}
      colleagueDocuments={colleagueDocuments}
      month={currentMonth}
      year={currentYear}
      onSave={handleSaveActivities}
      onCancel={isClarificationScopedAccess ? () => router.push(`/expert/clarificari?month=${currentMonth}&year=${currentYear}`) : closeActivityForm}
      initialActivity={editingActivity || undefined}
      prefillActivity={sharedActivityPrefill || undefined}
      resolutionHint={activityResolutionHint || undefined}
      isSaving={isSaving}
      layout="workspace"
      showObservationRail={false}
    />
  );
  const showPopoutForm = showForm && Boolean(sharedActivityPrefill);

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert/peo"
        navItems={expertNavItems}
        contentClassName={showForm ? 'max-w-none' : undefined}
        eyebrow="Modul Expert"
        title={isClarificationScopedAccess ? 'Clarificare PM' : showForm ? 'Adaugă activitate' : 'Activitățile mele'}
        description={
          isClarificationScopedAccess
            ? 'Modifică doar activitatea marcată de PM. Data, expertul și luna rămân blocate.'
            : showForm
            ? 'Completează datele activității pentru pontaj și raportarea lunară.'
            : 'Vizualizează, filtrează și gestionează activitățile raportate.'
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/expert">
                <ArrowLeft className="h-4 w-4" />
                Înapoi la pontaj
              </Link>
            </Button>
            {showForm ? (
              <Badge variant="secondary" className="h-10 rounded-lg px-3 text-sm font-medium">
                Pontaj pentru: {selectedExpert.name}
              </Badge>
            ) : (
              <Select value={selectedExpertId || ''} onValueChange={(id) => setSelectedExpertId(id)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Selectează expert" />
              </SelectTrigger>
              <SelectContent>
                {experts.map((expert) => (
                  <SelectItem key={expert.id} value={expert.id}>
                    {expert.name}
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
            )}
            {!showForm && normalizePeoCategory(selectedExpert.category) === 'bh' && (
              <MonthlyReportExport
                expert={selectedExpert as Expert}
                activities={activities}
                concurrentProjects={concurrentProjects}
                concurrentTimesheetEntries={concurrentTimesheetEntries.filter((entry) => entry.expertId === selectedExpertId)}
                month={currentMonth}
                year={currentYear}
              />
            )}
            {!showForm && (
              <Button onClick={handleAddActivity} disabled={!selectedExpert.id || isApproved || monthlyBlocking.isBlocked || isClarificationScopedAccess}>
                <Plus className="h-4 w-4" />
                Adaugă activitate
              </Button>
            )}
            <UserMenu />
          </>
        }
        quickTabs={[
          { label: 'Activități', href: '#activitati', icon: ClipboardList, active: true },
          { label: 'Calendar', href: '#calendar', icon: CalendarDays },
          { label: 'Livrabile', href: '#livrabile', icon: Upload },
          { label: 'Rapoarte', href: '#rapoarte', icon: FileText },
        ]}
        aside={showForm ? undefined : (
          <>
            <RightInfoCard title="Rezumat zi" icon={Clock3}>
              <p className="text-sm font-semibold text-muted-foreground">Luni, 12 mai 2026</p>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total ore introduse</p>
                  <p className="mt-1 text-4xl font-bold text-slate-950">
                    {selectedDates.reduce((sum, date) => sum + Number(normalizePontajHoursValue(selectedHours[date], getDefaultHours())), 0)}h
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">din 8h disponibile</span>
              </div>
              <ProgressBar value={Math.min(100, selectedDates.reduce((sum, date) => sum + Number(normalizePontajHoursValue(selectedHours[date], getDefaultHours())), 0) * 12.5)} className="mt-4" />
              <Link href="#calendar" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Vezi detaliile zilei
              </Link>
            </RightInfoCard>

            {!showForm && (
            <RightInfoCard title="Status raportare" icon={ClipboardList}>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-muted-foreground">Luna curentă</span>
                  <Badge variant="conform">Deschisă</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pontaj</span>
                  <Badge variant={isApproved ? 'conform' : 'in_lucru'}>{isApproved ? 'Aprobat' : 'În lucru'}</Badge>
                </div>
              </div>
            </RightInfoCard>
            )}

            <RightInfoCard title="Sfaturi completare" icon={CheckCircle}>
              <div className="space-y-3 text-sm leading-6">
                {[
                  'Completează date, titlu și descrierea activității.',
                  'Atașează documente relevante, dacă este cazul.',
                  'Asigură-te că activitatea se încadrează în subactivitatea selectată.',
                  'Maximum 8 ore raportate pe zi.',
                ].map((tip) => (
                  <div key={tip} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-[#36c2a0]" />
                    {tip}
                  </div>
                ))}
              </div>
            </RightInfoCard>
          </>
        )}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                Status raportare - {getMonthName(currentMonth)} {currentYear}
              </h2>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              {reportStatusLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {reportStatus?.pmNotes ? (
              <p className="text-sm text-muted-foreground">Observații PM: {reportStatus.pmNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {statusDescription}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Normă lunară: {monthlyBlocking.totalHours}h / {monthlyBlocking.monthlyNorm}h, {monthlyBlocking.remainingHours}h disponibile.
            </p>
            {monthlyBlocking.isBlocked && (
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                {monthlyBlocking.reason}
              </p>
            )}
          </div>
          <span title={submitButtonTitle}>
            <Button
              onClick={handleSubmitMonth}
              disabled={
                isApproved
                || isSent
                || isInReview
              }
            >
            {submitButtonIcon}
            {submitButtonLabel}
            </Button>
          </span>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Submit readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {submitReadiness.items.map((item) => {
                const isActionable = item.severity !== 'ok';
                const isSelected = selectedReadinessKey === item.key;
                const cardClassName = [
                  'flex w-full items-start gap-2 rounded-md border bg-background p-3 text-left transition-colors',
                  isActionable ? 'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : '',
                  isSelected ? 'border-primary ring-2 ring-primary/30' : '',
                ].filter(Boolean).join(' ');
                const cardContent = (
                  <>
                    {item.severity === 'ok' ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <AlertTriangle
                        className={
                          item.severity === 'blocking'
                            ? 'mt-0.5 h-4 w-4 shrink-0 text-red-600'
                            : 'mt-0.5 h-4 w-4 shrink-0 text-amber-600'
                        }
                      />
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <Badge
                          variant={item.severity === 'blocking' ? 'destructive' : item.severity === 'warning' ? 'outline' : 'secondary'}
                        >
                          {item.severity === 'blocking' ? 'Blocant' : item.severity === 'warning' ? 'Atentie' : 'OK'}
                        </Badge>
                        {isActionable && item.issues.length > 0 && (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {item.issues.length} detalii
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </>
                );

                return isActionable ? (
                  <button
                    key={item.key}
                    type="button"
                    className={cardClassName}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedReadinessKey(item.key)}
                  >
                    {cardContent}
                  </button>
                ) : (
                  <div key={item.key} className={cardClassName}>
                    {cardContent}
                  </div>
                );
              })}
            </div>

            {selectedReadinessItem && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Detalii blocaj: {selectedReadinessItem.label}
                    </p>
                    <p className="text-xs text-slate-600">{selectedReadinessItem.detail}</p>
                  </div>
                  <Badge variant={selectedReadinessItem.severity === 'blocking' ? 'destructive' : 'outline'}>
                    {selectedReadinessItem.severity === 'blocking' ? 'Blocant' : 'Atentie'}
                  </Badge>
                </div>

                {selectedReadinessItem.issues.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nu mai exista detalii active pentru acest blocaj.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedReadinessItem.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-white p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-slate-900">{issue.title}</p>
                          {issue.meta && (
                            <p className="text-xs text-muted-foreground">{issue.meta}</p>
                          )}
                          <p className="text-xs text-slate-700">{issue.detail}</p>
                        </div>
                        {issue.action && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleReadinessIssueAction(issue)}
                          >
                            {issue.actionLabel || 'Rezolva'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div id="livrabile" className="scroll-mt-24" />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isGtExpert && isComExpert ? 'grid-cols-5' : isGtExpert || isComExpert ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="activitati">Activitati</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            {isGtExpert && <TabsTrigger value="gt">Grup Tinta</TabsTrigger>}
            {isComExpert && <TabsTrigger value="dovezi-com">Dovezi COM</TabsTrigger>}
            <TabsTrigger value="export">Export RA</TabsTrigger>
          </TabsList>

          {/* Tab: Activitati - pentru adaugare/editare activitati */}
          <TabsContent id="activitati" value="activitati" forceMount className="space-y-6 scroll-mt-24">
            {pendingSharedActivityRelationId && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 space-y-3">
                    <div>
                      <p className="font-semibold">Adaugi o activitate comuna sugerata</p>
                      <p className="mt-1 text-blue-800">
                        Formularul este precompletat cu datele declarate de coleg. Verifica si ajusteaza pontajul tau inainte de salvare.
                      </p>
                    </div>
                    {sharedActivityRegistrationContext ? (
                      <div className="grid gap-2 rounded-md border border-blue-200 bg-white/70 p-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Declarat de</p>
                          <p className="mt-1 font-medium">{sharedSourceExpertName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Cand a avut loc</p>
                          <p className="mt-1 font-medium">
                            {sharedSourceDate ? formatDisplayDate(sharedSourceDate) : 'Data nespecificata'}
                            {sharedSourceHours > 0
                              ? `, ${sharedSourceHours}h`
                              : ''}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-xs font-medium uppercase text-blue-600">Tema</p>
                          <p className="mt-1 font-medium">{sharedSourceTheme}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Incadrare</p>
                          <p className="mt-1 font-medium">
                            {[sharedSourceSaCode, sharedSourceProjectCode]
                              .filter(Boolean)
                              .join(' / ') || 'Neprecizata'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Livrabile comune</p>
                          <p className="mt-1 font-medium">
                            {sharedActivityRegistrationContext.relatedDocuments.length > 0
                              ? `${sharedActivityRegistrationContext.relatedDocuments.length} se vor asocia la salvare`
                              : 'Nu exista livrabil comun atasat acestei sugestii'}
                          </p>
                        </div>
                        {sharedSourceDescription && (
                          <div className="md:col-span-2">
                            <p className="text-xs font-medium uppercase text-blue-600">Descriere coleg</p>
                            <p className="mt-1 whitespace-pre-wrap text-blue-900">
                              {sharedSourceDescription}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-blue-800">Se incarca detaliile activitatii comune...</p>
                    )}
                    {sharedActivityRegistrationContext && (
                      <div className="rounded-md border border-blue-200 bg-white/70 p-3">
                        <p className="text-xs font-medium uppercase text-blue-600">Confirmare fara dublare pontaj</p>
                        <p className="mt-1 text-blue-800">
                          Daca ai deja activitatea in raportare, confirm-o aici ca existenta si asociaza livrabilul comun fara sa adaugi zile sau ore noi.
                        </p>
                        {existingSharedActivityCandidates.length > 0 ? (
                          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                            <Select
                              value={selectedExistingSharedActivityId}
                              onValueChange={setSelectedExistingSharedActivityId}
                              disabled={isRegisteringExistingSharedActivity}
                            >
                              <SelectTrigger className="min-h-10 md:flex-1">
                                <SelectValue placeholder="Alege activitatea existenta" />
                              </SelectTrigger>
                              <SelectContent>
                                {existingSharedActivityCandidates.map(({ activity, hasRelatedDeliverable }) => (
                                  <SelectItem key={activity.id} value={activity.id}>
                                    {formatDisplayDate(activity.date)}
                                    {Number(activity.hours) > 0 ? `, ${activity.hours}h` : ''}
                                    {' - '}
                                    {getActivityDisplayTitle(activity)}
                                    {hasRelatedDeliverable ? ' - livrabil detectat' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              onClick={handleRegisterSharedActivityOnExisting}
                              disabled={!selectedExistingSharedActivityId || isRegisteringExistingSharedActivity}
                              className="md:w-auto"
                            >
                              {isRegisteringExistingSharedActivity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Confirma existenta
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-2 text-blue-800">
                            Nu am gasit o activitate existenta compatibila in luna curenta. Poti salva formularul doar daca activitatea chiar lipseste din pontaj.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {pendingSharedDeliverableRelationId && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 space-y-3">
                    <div>
                      <p className="font-semibold">Asociezi un livrabil comun in pontajul tau</p>
                      <p className="mt-1 text-blue-800">
                        Salveaza activitatea de mai jos pentru ca livrabilul sa fie marcat ca inregistrat pe activitatea ta.
                      </p>
                    </div>
                    {pendingSharedDeliverableContext ? (
                      <div className="grid gap-2 rounded-md border border-blue-200 bg-white/70 p-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Declarat de</p>
                          <p className="mt-1 font-medium">{pendingSharedDeliverableContext.sourceExpertName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Cand a avut loc</p>
                          <p className="mt-1 font-medium">{formatDisplayDate(pendingSharedDeliverableContext.date)}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-xs font-medium uppercase text-blue-600">Tema</p>
                          <p className="mt-1 font-medium">{pendingSharedDeliverableContext.theme}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Document</p>
                          <p className="mt-1 font-medium">{pendingSharedDeliverableContext.fileName || 'Document comun'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-blue-600">Incadrare</p>
                          <p className="mt-1 font-medium">
                            {[pendingSharedDeliverableContext.saCode, pendingSharedDeliverableContext.deliverableType, pendingSharedDeliverableContext.projectId]
                              .filter(Boolean)
                              .join(' / ') || 'Neprecizata'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-800">Se incarca detaliile livrabilului comun...</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {saveError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{saveError}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Activități PEO</h2>
                <p className="text-sm text-muted-foreground">
                  Adaugă activități, livrabile și documente justificative{isGtExpert ? ' și intrări pentru grupul țintă' : ''}.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button onClick={handleAddActivity} disabled={!selectedExpert.id || isApproved || monthlyBlocking.isBlocked || showForm || isClarificationScopedAccess}>
                  <Plus className="h-4 w-4" />
                  {showForm ? 'Formular deschis' : 'Adaugă activitate'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {monthlyBlocking.remainingHours}h disponibile din {monthlyBlocking.monthlyNorm}h
                </p>
              </div>
            </div>

            <div className={showForm && !showPopoutForm ? 'grid gap-6 xl:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] xl:items-start' : 'grid gap-6 lg:grid-cols-3'}>
              {/* Calendar Section */}
              <div className={showForm && !showPopoutForm ? 'xl:row-span-2 xl:sticky xl:top-24 xl:self-start' : 'lg:col-span-1'}>
                <MultiSelectCalendar
                  selectedDates={selectedDates}
                  onSelectDates={handleSelectDates}
                  selectedHours={selectedHours}
                  onSelectedHoursChange={setSelectedHours}
                  activities={calendarDraftActivities}
                  onMonthChange={handleMonthChange}
                  onBlockedMonthChange={handleBlockedMonthChange}
                  canGoToPreviousMonth={canOpenMonth(previousCalendarDate.getMonth(), previousCalendarDate.getFullYear())}
                  canGoToNextMonth={canOpenMonth(nextCalendarDate.getMonth(), nextCalendarDate.getFullYear())}
                  monthAccessMessage={monthAccessMessage}
                  expertNorma={selectedExpert.norma || 8}
                  displayMonth={currentMonth}
                  displayYear={currentYear}
                />

                {/* Form opens automatically when dates are selected */}
              </div>

              {showForm && !showPopoutForm && (
                <div className="min-w-0">
                  {activityFormElement}
                </div>
              )}

              <div className={showForm && !showPopoutForm ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
                <Card className={showForm && !showPopoutForm ? 'overflow-hidden' : undefined}>
                  <CardHeader className={showForm && !showPopoutForm ? 'space-y-1 pb-3' : undefined}>
                    <CardTitle className={showForm && !showPopoutForm ? 'text-base' : undefined}>
                      {showForm && !showPopoutForm ? 'Context activitati' : 'Activitati'} - {selectedExpert.name} - {getMonthName(currentMonth)}{' '}
                      {currentYear}
                    </CardTitle>
                    {showForm && !showPopoutForm && (
                      <p className="text-xs text-muted-foreground">
                        Jurnalul ramane aici pentru comparare rapida in timp ce completezi formularul.
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className={showForm && !showPopoutForm ? 'max-h-[42rem] overflow-y-auto p-0' : undefined}>
                    {activitiesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ActivitiesTable
                        activities={activities}
                        onEdit={handleEditActivity}
                        onDelete={handleDeleteActivity}
                        activeActivityId={editingActivity?.id}
                        compact={false}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Calendar - vizualizare calendar cu statistici si detalii pe zi */}
          <TabsContent id="calendar" value="calendar" className="space-y-6 scroll-mt-24">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Select
                  value={`${currentMonth}-${currentYear}`}
                  onValueChange={(value) => {
                    const [m, y] = value.split('-').map(Number);
                    handleMonthChange(m, y);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonthOptions.map((option) => (
                      <SelectItem key={`${option.month}-${option.year}`} value={`${option.month}-${option.year}`}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedExpert.name} - Norma: {selectedExpert.norma || 8}h/zi
              </div>
            </div>
            
            <CalendarView
              expert={selectedExpert as Expert}
              activities={activities}
              month={currentMonth}
              year={currentYear}
              onAddForDay={(date) => {
                if (monthlyBlocking.isBlocked) {
                  setSaveError(monthlyBlocking.reason);
                  return;
                }
                try {
                  assertCanLogHoursOnDate(date);
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : 'Ziua selectata este nelucratoare.');
                  return;
                }
                setSaveError(null);
                syncSelectedDates([date]);
                setSharedActivityPrefill(null);
                setActivityResolutionHint(null);
                setShowForm(true);
                setActiveTab('activitati');
              }}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
            />
          </TabsContent>

          {/* Tab: Grup Tinta - doar pentru Expert Recrutare si Selectie GT */}
          {isGtExpert && (
            <TabsContent value="gt">
              <Card>
                <CardHeader>
                  <CardTitle>Grup Tinta - {getMonthName(currentMonth)} {currentYear}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nicio activitate cu Grup Tinta inregistrata in {getMonthName(currentMonth)} {currentYear}.</p>
                    <p className="text-sm mt-2">
                      Expertul GT poate marca implicarea GT direct in formularul de activitate.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isComExpert && (
            <TabsContent value="dovezi-com" className="space-y-6 scroll-mt-24">
              <MonthlyEvidencePanel
                expert={selectedExpert as Expert}
                activities={activities}
                month={currentMonth}
                year={currentYear}
                isApproved={isApproved}
                onUpdateActivity={updateActivity}
                onRefreshActivities={refreshActivities}
              />
            </TabsContent>
          )}

          {/* Tab: Export RA - generare raport si export */}
          <TabsContent id="rapoarte" value="export" className="scroll-mt-24">
            <div className="space-y-4">
              <div className="flex justify-end">
                <MonthlyReportExport
                  expert={selectedExpert as Expert}
                  activities={activities}
                  concurrentProjects={concurrentProjects}
                  concurrentTimesheetEntries={concurrentTimesheetEntries.filter((entry) => entry.expertId === selectedExpertId)}
                  month={currentMonth}
                  year={currentYear}
                />
              </div>
              <ReportGenerator
                activities={activities}
                month={currentMonth}
                year={currentYear}
                expertName={selectedExpert.name}
              />
            </div>
          </TabsContent>
        </Tabs>
        {showPopoutForm && (
          <div className="fixed bottom-4 right-4 z-40 max-h-[calc(100vh-2rem)] w-[min(760px,calc(100vw-2rem))] overflow-y-auto rounded-lg border bg-background shadow-2xl">
            {activityFormElement}
          </div>
        )}
        <ExpertDeliverablesDialog
          open={isDeliverablesDialogOpen}
          onOpenChange={handleDeliverablesDialogOpenChange}
          rows={deliverableRows}
          expertName={selectedExpert.name}
          monthLabel={`${getMonthName(currentMonth)} ${currentYear}`}
          onEditActivity={handleEditDeliverableActivity}
        />
      </DashboardShell>

      {deletedActivityUndo && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950">Activitatea a fost stearsa.</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {getActivityDisplayTitle(deletedActivityUndo.activity)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleUndoDeleteActivity}
              disabled={isUndoingDelete}
            >
              {isUndoingDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Undo
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => setDeletedActivityUndo(null)}
              aria-label="Inchide notificarea"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </>
  );
}

export default function ExpertDashboard() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Se incarca pontajul...</span>
        </div>
      </div>
    }>
      <ExpertDashboardContent />
    </Suspense>
  );
}
