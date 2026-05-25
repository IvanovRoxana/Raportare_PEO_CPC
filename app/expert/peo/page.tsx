'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle, ClipboardList, Clock3, FileText, Loader2, Plus, Send, Lock, AlertTriangle, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { ActivityForm } from '@/components/expert/activity-form';
import { ActivitiesTable } from '@/components/expert/activities-table';
import { ReportGenerator } from '@/components/expert/report-generator';
import { MonthlyReportExport } from '@/components/expert/monthly-report-export';
import { getMonthName } from '@/lib/backend-store';
import {
  useActivitiesByMonth,
  useActivityMutations,
  useCollaborationExperts,
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
import { isGtExpertCategory } from '@/lib/peo-category';
import { parseGdprMetaJson, validateGdprActivityDraft } from '@/lib/gdpr-reporting';
import { assertCanLogHoursOnDate, getNonWorkingDayInfo } from '@/lib/non-working-days';
import { formatDate, formatDateRo } from '@/lib/app-utils';
import { isExceptionActivity } from '@/lib/peo-constants';
import { getWorkingDaysListInMonth } from '@/lib/working-hours';
import {
  buildSelectedHoursForDates,
  getMonthlyBlockingState,
  normalizePontajHoursValue,
  validateActivitiesBeforeCreate,
  type ActivityDraftForValidation,
} from '@/lib/pontaj-rules';

type SubmitReadinessSeverity = 'ok' | 'warning' | 'blocking';

interface SubmitReadinessItem {
  label: string;
  detail: string;
  severity: SubmitReadinessSeverity;
}

const SUBMIT_MIN_NORM_PERCENT = 80;

function isActivityException(activity: Activity) {
  return activity.dayType === 'CO'
    || activity.dayType === 'CM'
    || Number(activity.hours) === 0
    || isExceptionActivity(activity.activityType || activity.title || '');
}

function hasUsableDeliverable(deliverables?: Deliverable[]) {
  return (deliverables ?? []).some((deliverable) =>
    Boolean(deliverable.filePath || deliverable.s3Key || deliverable.fileName || deliverable.documentId),
  );
}

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

function formatDisplayDate(date?: string) {
  return date ? formatDateRo(date) : 'Neprecizata';
}

export default function ExpertDashboard() {
  const router = useRouter();
  const today = new Date();
  const baseMonth = today.getMonth();
  const baseYear = today.getFullYear();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<Record<string, string>>({});
  const [currentMonth, setCurrentMonth] = useState(baseMonth);
  const [currentYear, setCurrentYear] = useState(baseYear);
  const [activeTab, setActiveTab] = useState('activitati');
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSharedActivityRelationId, setPendingSharedActivityRelationId] = useState<string | null>(null);
  const [pendingSharedDeliverableRelationId, setPendingSharedDeliverableRelationId] = useState<string | null>(null);
  const [sharedActivityPrefill, setSharedActivityPrefill] = useState<Partial<Activity> | null>(null);

  // Data hooks
  const { experts, isLoading: expertsLoading } = useExperts();
  const { experts: collaborationExperts } = useCollaborationExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading, mutate: refreshActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { documents } = useDocuments();
  const { createBatch, update: updateActivity, remove: removeActivity } = useActivityMutations();
  const { status: reportStatus, updateStatus: updateReportStatus, isLoading: reportStatusLoading } = useReportStatus(selectedExpertId, currentMonth, currentYear);
  const previousMonthDate = useMemo(() => new Date(baseYear, baseMonth - 1, 1), [baseMonth, baseYear]);
  const nextMonthDate = useMemo(() => new Date(baseYear, baseMonth + 1, 1), [baseMonth, baseYear]);
  const { status: previousMonthStatus } = useReportStatus(selectedExpertId, previousMonthDate.getMonth(), previousMonthDate.getFullYear());
  const { status: nextMonthStatus } = useReportStatus(selectedExpertId, nextMonthDate.getMonth(), nextMonthDate.getFullYear());
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);
  const { entries: concurrentTimesheetEntries } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { sharedDeliverables, isLoading: sharedDeliverablesLoading, mutate: refreshSharedDeliverables } = useSharedDeliverables(selectedExpertId || undefined);
  const {
    context: sharedActivityRegistrationContext,
    isLoading: sharedActivityRegistrationLoading,
  } = useSharedActivityRegistrationContext(pendingSharedActivityRelationId);
  const { registerForActivity } = useSharedDeliverableMutations();

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

  // Set expert based on logged in user's email
  useEffect(() => {
    if (isAuthLoading || experts.length === 0 || selectedExpertId) return;

    const matchingExpert = userEmail
      ? experts.find(e => e.email?.toLowerCase() === userEmail.toLowerCase() || e.name?.toLowerCase() === userEmail.toLowerCase())
      : null;
    if (matchingExpert) setSelectedExpertId(matchingExpert.id);
  }, [experts, isAuthLoading, userEmail, selectedExpertId]);


  // Get selected expert
  const selectedExpert = useMemo(() => {
    const expert = experts.find((e) => e.id === selectedExpertId) || experts[0];
    return expert || { id: '', name: 'Expert', role: '', norma: 8, saCodes: [] };
  }, [experts, selectedExpertId]);
  const isGtExpert = isGtExpertCategory(selectedExpert.category);

  useEffect(() => {
    if (activeTab === 'gt' && !isGtExpert) {
      setActiveTab('activitati');
    }
  }, [activeTab, isGtExpert]);

  // Filter activities by expert
  const activities = useMemo(() => {
    if (!selectedExpertId) return [];
    return allMonthActivities.filter((a) => a.expertId === selectedExpertId);
  }, [allMonthActivities, selectedExpertId]);
  const pendingSharedDeliverableContext = useMemo(() => {
    if (!pendingSharedDeliverableRelationId) return null;

    const relation = sharedDeliverables.find((item) => item.id === pendingSharedDeliverableRelationId);
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
  }, [allMonthActivities, documents, experts, pendingSharedDeliverableRelationId, sharedDeliverables]);

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

  const getMonthAccessMessage = (month: number, year: number) =>
    `Luna ${getMonthName(month)} ${year} se poate deschide doar dupa acordul PM.`;

  const handleBlockedMonthChange = (month: number, year: number) => {
    setSaveError(getMonthAccessMessage(month, year));
  };

  const handleMonthChange = (month: number, year: number) => {
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

      const toValidationDraft = (activity: Activity): ActivityDraftForValidation => ({
        id: activity.id,
        expertId: activity.expertId || selectedExpertId,
        date: activity.date,
        hours: Number(activity.hours) || 0,
        status: activity.status,
        projectCode: activity.projectCode,
      });
      const validation = validateActivitiesBeforeCreate({
        expert: selectedExpert,
        existingActivities: activities
          .filter((activity) => !editingActivity || activity.id !== editingActivity.id)
          .map(toValidationDraft),
        newActivities: newActivities.map((activity) =>
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
        // Update existing activity
        for (const activity of newActivities) {
          await updateActivity(activity.id, activity);
        }
      } else {
        // Add new activities
        const createdActivities = await createBatch(newActivities.map(a => ({
          ...a,
          expertId: selectedExpertId!,
        })));

        const activityTargetId = createdActivities[0]?.id;
        const deliverableTargetId = pendingSharedActivityRelationId
          ? activityTargetId
          : createdActivities[createdActivities.length - 1]?.id || activityTargetId;
        const deliverableRelationIdsToRegister = [...new Set([
          ...(sharedActivityRegistrationContext?.relatedDeliverableRelations.map((relation) => relation.id) ?? []),
          ...(pendingSharedDeliverableRelationId ? [pendingSharedDeliverableRelationId] : []),
        ])].filter((relationId) => relationId !== pendingSharedActivityRelationId);

        if (pendingSharedActivityRelationId && createdActivities[0]?.id) {
          await registerForActivity(pendingSharedActivityRelationId, createdActivities[0].id);
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

  const handleEditActivity = (activity: Activity) => {
    if (reportStatus?.status === 'approved') return;

    setEditingActivity(activity);
    setSharedActivityPrefill(null);
    setSelectedDates([activity.date]);
    setSelectedHours({ [activity.date]: activity.hours.toString() });
    setShowForm(true);
    setActiveTab('activitati');
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (reportStatus?.status === 'approved') return;

    try {
      const activityContext = activities.find((activity) => activity.id === activityId);
      await removeActivity(activityId, activityContext);
      await refreshActivities();
    } catch (error) {
      console.error('Error deleting activity:', error);
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
  const statusMeta = statusLabels[currentStatus as ReportStatus['status']] || statusLabels.draft;
  const submitReadiness = useMemo(() => {
    const workingDays = getWorkingDaysListInMonth(currentMonth + 1, currentYear).map(formatDate);
    const activityDates = new Set(activities.map((activity) => activity.date));
    const missingWorkingDays = workingDays.filter((date) => !activityDates.has(date));
    const activitiesMissingDeliverables = activities.filter((activity) =>
      !isActivityException(activity)
      && !(selectedExpert.category === 'gdpr' && activity.gdprTemplateCode)
      && !hasUsableDeliverable(activity.deliverables),
    );
    const deliverables = activities.flatMap((activity) => activity.deliverables ?? []);
    const unconfirmedTitles = deliverables.filter((deliverable) =>
      needsTitleConfirmation(deliverable) && deliverable.titleConfirmed !== true,
    );
    const aiReviewDeliverables = deliverables.filter((deliverable) =>
      deliverable.aiStatus === 'review' || deliverable.aiStatus === 'ineligible',
    );
    const gdprActivitiesWithIssues = selectedExpert.category === 'gdpr'
      ? activities.filter((activity) => {
          if (isActivityException(activity)) return false;
          const validation = validateGdprActivityDraft({
            templateCode: activity.gdprTemplateCode,
            meta: parseGdprMetaJson(activity.gdprMetaJson),
            description: activity.gdprGeneratedText || activity.description,
            hasDeliverable: hasUsableDeliverable(activity.deliverables),
          });
          return !validation.ok;
        })
      : [];
    const utilizationPercent = monthlyBlocking.monthlyNorm > 0
      ? Math.round((monthlyBlocking.totalHours / monthlyBlocking.monthlyNorm) * 100)
      : 0;
    const pendingSharedDeliverables = sharedDeliverables.filter((relation) =>
      relation.status === 'pending_registration',
    );

    const items: SubmitReadinessItem[] = [
      {
        label: 'Zile lucratoare acoperite',
        detail: missingWorkingDays.length === 0
          ? 'Toate zilele lucratoare au pontaj sau exceptie.'
          : `${missingWorkingDays.length} zile lucratoare fara pontaj: ${missingWorkingDays.slice(0, 5).join(', ')}${missingWorkingDays.length > 5 ? '...' : ''}`,
        severity: missingWorkingDays.length === 0 ? 'ok' : 'warning',
      },
      {
        label: 'Livrabile pe activitati',
        detail: activitiesMissingDeliverables.length === 0
          ? 'Toate activitatile ne-exceptie au cel putin un livrabil.'
          : `${activitiesMissingDeliverables.length} activitati fara livrabil.`,
        severity: activitiesMissingDeliverables.length === 0 ? 'ok' : 'blocking',
      },
      {
        label: 'Titluri confirmate',
        detail: unconfirmedTitles.length === 0
          ? 'Toate titlurile livrabilelor sunt confirmate.'
          : `${unconfirmedTitles.length} livrabile au titlul neconfirmat.`,
        severity: unconfirmedTitles.length === 0 ? 'ok' : 'blocking',
      },
      {
        label: 'Verificari AI',
        detail: aiReviewDeliverables.length === 0
          ? 'Nu exista livrabile in review sau ineligible.'
          : `${aiReviewDeliverables.length} livrabile sunt in review sau ineligible.`,
        severity: aiReviewDeliverables.length === 0 ? 'ok' : 'blocking',
      },
      {
        label: 'Norma lunara',
        detail: `${monthlyBlocking.totalHours}h / ${monthlyBlocking.monthlyNorm}h (${utilizationPercent}%). Prag submit: ${SUBMIT_MIN_NORM_PERCENT}%.`,
        severity: utilizationPercent >= SUBMIT_MIN_NORM_PERCENT ? 'ok' : 'warning',
      },
      {
        label: 'Livrabile comune',
        detail: pendingSharedDeliverables.length === 0
          ? 'Nu exista livrabile comune in asteptare.'
          : `${pendingSharedDeliverables.length} livrabile comune asteapta confirmare/inregistrare.`,
        severity: pendingSharedDeliverables.length === 0 ? 'ok' : 'warning',
      },
      {
        label: 'Reguli GDPR',
        detail: selectedExpert.category !== 'gdpr'
          ? 'Nu se aplica pentru categoria curenta.'
          : gdprActivitiesWithIssues.length === 0
            ? 'Toate activitatile GDPR au template, campuri obligatorii si livrabil acolo unde este necesar.'
            : `${gdprActivitiesWithIssues.length} activitati GDPR au campuri/livrabile lipsa.`,
        severity: selectedExpert.category !== 'gdpr' || gdprActivitiesWithIssues.length === 0 ? 'ok' : 'blocking',
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
  }, [activities, currentMonth, currentYear, monthlyBlocking, selectedExpert.category, sharedDeliverables]);

  const handleSubmitMonth = async () => {
    if (!selectedExpertId || isApproved) return;
    if (submitReadiness.hasBlockingIssues) {
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

  const syncSelectedDates = (dates: string[], baseHours = selectedHours) => {
    const uniqueDates = [...new Set(dates)].sort();
    const nextHours = buildSelectedHoursForDates(uniqueDates, baseHours, getDefaultHours());
    setSelectedDates(uniqueDates);
    setSelectedHours(nextHours);
  };

  const resetSharedRegistrationFlow = () => {
    setPendingSharedActivityRelationId(null);
    setPendingSharedDeliverableRelationId(null);
    setSharedActivityPrefill(null);
    clearSharedRelationQueryParams();
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
      location: sourceActivity.location,
      dayType: sourceActivity.dayType,
      projectCode: sourceActivity.projectCode,
      gdprTemplateCode: sourceActivity.gdprTemplateCode,
      gdprMetaJson: sourceActivity.gdprMetaJson,
      gdprGeneratedText: sourceActivity.gdprGeneratedText,
      gdprConclusionCode: sourceActivity.gdprConclusionCode,
    });
    syncSelectedDates([sourceActivity.date], { [sourceActivity.date]: prefillHours });
    setEditingActivity(null);
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
    if (monthlyBlocking.isBlocked) {
      setSaveError(monthlyBlocking.reason);
      return;
    }

    setSaveError(null);
    if (selectedDates.length === 0) {
      syncSelectedDates([getDefaultActivityDate()]);
    }
    setEditingActivity(null);
    setSharedActivityPrefill(null);
    setShowForm(true);
    setActiveTab('activitati');
  };

  // Auto-open form when dates are selected
  const handleSelectDates = (dates: string[]) => {
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
      setEditingActivity(null);
      setSharedActivityPrefill(null);
      setShowForm(true);
      setActiveTab('activitati');
    } else {
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

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert/peo"
        navItems={expertNavItems}
        eyebrow="Modul Expert"
        title={showForm ? 'Adaugă activitate' : 'Activitățile mele'}
        description={
          showForm
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
              <Select value={selectedExpertId || ''} onValueChange={(id: string) => setSelectedExpertId(id)}>
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
            {!showForm && (
              <Button onClick={handleAddActivity} disabled={!selectedExpert.id || isApproved || monthlyBlocking.isBlocked}>
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
        aside={
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
        }
      >
        {!showForm && (
          <>
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
                Completează pontajul și trimite luna către PM când pachetul este pregătit.
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
          <span title={submitReadiness.disabledReason || undefined}>
            <Button
              onClick={handleSubmitMonth}
              disabled={
                submitReadiness.hasBlockingIssues
                || isApproved
                || currentStatus === 'sent'
                || currentStatus === 'in_review'
              }
            >
            {isApproved ? <Lock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isApproved ? 'Lună aprobată' : 'Trimite luna către PM'}
            </Button>
          </span>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Submit readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {submitReadiness.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-2 rounded-md border bg-background p-3"
                >
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
                    </div>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </>
        )}

        <div id="livrabile" className="scroll-mt-24" />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isGtExpert ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="activitati">Activitati</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            {isGtExpert && <TabsTrigger value="gt">Grup Tinta</TabsTrigger>}
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
                <Button onClick={handleAddActivity} disabled={!selectedExpert.id || isApproved || monthlyBlocking.isBlocked}>
                  <Plus className="h-4 w-4" />
                  Adaugă activitate
                </Button>
                <p className="text-xs text-muted-foreground">
                  {monthlyBlocking.remainingHours}h disponibile din {monthlyBlocking.monthlyNorm}h
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Calendar Section */}
              <div className="lg:col-span-1">
                <MultiSelectCalendar
                  selectedDates={selectedDates}
                  onSelectDates={handleSelectDates}
                  selectedHours={selectedHours}
                  onSelectedHoursChange={setSelectedHours}
                  activities={activities}
                  onMonthChange={handleMonthChange}
                  onBlockedMonthChange={handleBlockedMonthChange}
                  canGoToPreviousMonth={canOpenMonth(previousCalendarDate.getMonth(), previousCalendarDate.getFullYear())}
                  canGoToNextMonth={canOpenMonth(nextCalendarDate.getMonth(), nextCalendarDate.getFullYear())}
                  monthAccessMessage={monthAccessMessage}
                  expertNorma={selectedExpert.norma || 8}
                />

                {/* Form opens automatically when dates are selected */}
              </div>

              {/* Form / Table Section */}
              <div className="lg:col-span-2">
                {showForm ? (
                  <ActivityForm
                    selectedDates={selectedDates}
                    selectedHours={selectedHours}
                    onSelectedHoursChange={setSelectedHours}
                    expertId={selectedExpertId || ''}
                    expertName={selectedExpert.name}
                    expert={selectedExpert as import('@/lib/types').Expert}
                    allExperts={collaborationExperts.length > 0 ? collaborationExperts : experts}
                    allActivities={allMonthActivities}
                    month={currentMonth}
                    year={currentYear}
                    apiKey={null}
                    onSave={handleSaveActivities}
                    onCancel={() => {
                      setShowForm(false);
                      setEditingActivity(null);
                      if (pendingSharedActivityRelationId || pendingSharedDeliverableRelationId) {
                        resetSharedRegistrationFlow();
                      }
                      setSelectedDates([]);
                      setSelectedHours({});
                    }}
                    initialActivity={editingActivity || undefined}
                    prefillActivity={sharedActivityPrefill || undefined}
                    isSaving={isSaving}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Activitati - {selectedExpert.name} - {getMonthName(currentMonth)}{' '}
                        {currentYear}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {activitiesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <ActivitiesTable
                          activities={activities}
                          onEdit={handleEditActivity}
                          onDelete={handleDeleteActivity}
                        />
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Tab: Calendar - vizualizare calendar cu statistici si detalii pe zi */}
          <TabsContent id="calendar" value="calendar" className="space-y-6 scroll-mt-24">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Select
                  value={`${currentMonth}-${currentYear}`}
                  onValueChange={(value: string) => {
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
      </DashboardShell>
    </>
  );
}
