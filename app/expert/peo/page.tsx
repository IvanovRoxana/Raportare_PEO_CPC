'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, ArrowLeft, Loader2, Plus, Send, Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { MultiSelectCalendar } from '@/components/expert/multi-select-calendar';
import { CalendarView } from '@/components/expert/calendar-view';
import { ActivityForm } from '@/components/expert/activity-form';
import { ActivitiesTable } from '@/components/expert/activities-table';
import { ReportGenerator } from '@/components/expert/report-generator';
import { MonthlyReportExport } from '@/components/expert/monthly-report-export';
import { getMonthName } from '@/lib/backend-store';
import { useExperts, useActivitiesByMonth, useActivityMutations, useApiKey, useReportStatus, useConcurrentProjects, useSharedDeliverables, useSharedDeliverableMutations } from '@/hooks/use-backend-data';
import type { Activity, Deliverable, Expert, ReportStatus } from '@/lib/types';
import { UserMenu } from '@/components/user-menu';
import { getSignedInUser } from '@/lib/aws/auth';
import { isGtExpertCategory } from '@/lib/peo-category';
import { assertCanLogHoursOnDate, getNonWorkingDayInfo } from '@/lib/non-working-days';
import { formatDate } from '@/lib/app-utils';
import { isExceptionActivity } from '@/lib/peo-constants';
import { getWorkingDaysListInMonth } from '@/lib/working-hours';
import {
  getMonthlyBlockingState,
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

export default function ExpertDashboard() {
  const today = new Date();
  const baseMonth = today.getMonth();
  const baseYear = today.getFullYear();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<Record<string, string>>({});
  const [currentMonth, setCurrentMonth] = useState(baseMonth);
  const [currentYear, setCurrentYear] = useState(baseYear);
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [localApiKey, setLocalApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSharedActivityRelationId, setPendingSharedActivityRelationId] = useState<string | null>(null);

  // Data hooks
  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading, mutate: refreshActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { createBatch, update: updateActivity, remove: removeActivity } = useActivityMutations();
  const { apiKey, setApiKey, isLoading: apiKeyLoading } = useApiKey();
  const { status: reportStatus, updateStatus: updateReportStatus, isLoading: reportStatusLoading } = useReportStatus(selectedExpertId, currentMonth, currentYear);
  const previousMonthDate = useMemo(() => new Date(baseYear, baseMonth - 1, 1), [baseMonth, baseYear]);
  const nextMonthDate = useMemo(() => new Date(baseYear, baseMonth + 1, 1), [baseMonth, baseYear]);
  const { status: previousMonthStatus } = useReportStatus(selectedExpertId, previousMonthDate.getMonth(), previousMonthDate.getFullYear());
  const { status: nextMonthStatus } = useReportStatus(selectedExpertId, nextMonthDate.getMonth(), nextMonthDate.getFullYear());
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);
  const { sharedDeliverables, mutate: refreshSharedDeliverables } = useSharedDeliverables(selectedExpertId || undefined);
  const { registerForActivity } = useSharedDeliverableMutations();

  // Get logged in user email
  useEffect(() => {
    getSignedInUser().then((user) => {
      if (user?.email) {
        setUserEmail(user.email);
      }
    });
  }, []);

  // Set expert based on logged in user's email
  useEffect(() => {
    if (experts.length === 0 || selectedExpertId) return;

    const matchingExpert = userEmail
      ? experts.find(e => e.email?.toLowerCase() === userEmail.toLowerCase())
      : null;
    setSelectedExpertId((matchingExpert ?? experts[0]).id);
  }, [experts, userEmail, selectedExpertId]);


  // Load API key when it changes
  useEffect(() => {
    if (apiKey) {
      setLocalApiKey(apiKey);
    }
  }, [apiKey]);

  // Get selected expert
  const selectedExpert = useMemo(() => {
    const expert = experts.find((e) => e.id === selectedExpertId) || experts[0];
    return expert || { id: '', name: 'Expert', role: '', norma: 8, saCodes: [] };
  }, [experts, selectedExpertId]);
  const isGtExpert = isGtExpertCategory(selectedExpert.category);

  // Filter activities by expert
  const activities = useMemo(() => {
    if (!selectedExpertId) return [];
    return allMonthActivities.filter((a) => a.expertId === selectedExpertId);
  }, [allMonthActivities, selectedExpertId]);

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

        if (pendingSharedActivityRelationId && createdActivities[0]?.id) {
          await registerForActivity(pendingSharedActivityRelationId, createdActivities[0].id);
          await refreshSharedDeliverables();
          setPendingSharedActivityRelationId(null);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
      await refreshActivities();
      setShowForm(false);
      setEditingActivity(null);
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
    setSelectedDates([activity.date]);
    setSelectedHours({ [activity.date]: activity.hours.toString() });
    setShowForm(true);
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (reportStatus?.status === 'approved') return;

    try {
      await removeActivity(activityId);
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
      !isActivityException(activity) && !hasUsableDeliverable(activity.deliverables),
    );
    const deliverables = activities.flatMap((activity) => activity.deliverables ?? []);
    const unconfirmedTitles = deliverables.filter((deliverable) =>
      needsTitleConfirmation(deliverable) && deliverable.titleConfirmed !== true,
    );
    const aiReviewDeliverables = deliverables.filter((deliverable) =>
      deliverable.aiStatus === 'review' || deliverable.aiStatus === 'ineligible',
    );
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
  }, [activities, currentMonth, currentYear, monthlyBlocking, sharedDeliverables]);

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

  const handleSaveSettings = async () => {
    try {
      await setApiKey(localApiKey);
      setSettingsOpen(false);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
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
    const nextHours: Record<string, string> = {};
    uniqueDates.forEach((date) => {
      nextHours[date] = baseHours[date] || getDefaultHours();
    });
    setSelectedDates(uniqueDates);
    setSelectedHours(nextHours);
  };



  useEffect(() => {
    if (typeof window === 'undefined' || pendingSharedActivityRelationId) return;
    const relationId = new URLSearchParams(window.location.search).get('sharedActivityRelationId');
    if (relationId) {
      setPendingSharedActivityRelationId(relationId);
    }
  }, [pendingSharedActivityRelationId]);

  useEffect(() => {
    if (!pendingSharedActivityRelationId || showForm || !selectedExpertId) return;
    if (monthlyBlocking.isBlocked) {
      setSaveError(monthlyBlocking.reason);
      return;
    }
    setSaveError('Completeaza activitatea sugerata, apoi salveaza pentru a inchide atentionarea de activitate comuna.');
    syncSelectedDates([getDefaultActivityDate()]);
    setEditingActivity(null);
    setShowForm(true);
  }, [pendingSharedActivityRelationId, showForm, selectedExpertId, monthlyBlocking.isBlocked, monthlyBlocking.reason]);

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
    setShowForm(true);
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
      setShowForm(true);
    } else {
      setShowForm(false);
    }
  };

  const isLoading = expertsLoading || activitiesLoading || apiKeyLoading;

  if (isLoading && experts.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Se încarcă datele...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/expert">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground">Pontaj Experți</h1>
                <p className="text-sm text-muted-foreground">
                  {getMonthName(currentMonth)} {currentYear} - Cod Proiect: 302141
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Select
                value={selectedExpertId || ''}
                onValueChange={(id) => setSelectedExpertId(id)}
              >
                <SelectTrigger className="w-[200px]">
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

              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Setări</DialogTitle>
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
                        Necesar pentru funcțiile AI (generare rapoarte, verificare titluri)
                      </p>
                    </div>
                    <Button onClick={handleSaveSettings} className="w-full">
                      Salvează
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
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

        <Tabs defaultValue="activitati" className="space-y-6">
          <TabsList className={`grid w-full ${isGtExpert ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="activitati">Activitati</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            {isGtExpert && <TabsTrigger value="gt">Grup Tinta</TabsTrigger>}
            <TabsTrigger value="export">Export RA</TabsTrigger>
          </TabsList>

          {/* Tab: Activitati - pentru adaugare/editare activitati */}
          <TabsContent value="activitati" className="space-y-6">
            {pendingSharedActivityRelationId && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Adaugi o activitate pornita dintr-o sugestie de activitate comuna. La salvare, atentionarea va fi marcata ca rezolvata.</p>
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
                    allExperts={experts}
                    allActivities={allMonthActivities}
                    month={currentMonth}
                    year={currentYear}
                    apiKey={localApiKey || null}
                    onSave={handleSaveActivities}
                    onCancel={() => {
                      setShowForm(false);
                      setEditingActivity(null);
                      setSelectedDates([]);
                      setSelectedHours({});
                    }}
                    initialActivity={editingActivity || undefined}
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
          <TabsContent value="calendar" className="space-y-6">
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
                setShowForm(true);
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
          <TabsContent value="export">
            <div className="space-y-4">
              <div className="flex justify-end">
                <MonthlyReportExport
                  expert={selectedExpert as Expert}
                  activities={activities}
                  concurrentProjects={concurrentProjects}
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
      </main>
    </div>
  );
}
