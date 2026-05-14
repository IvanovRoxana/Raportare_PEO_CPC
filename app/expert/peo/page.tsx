'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, ArrowLeft, Loader2, Plus, Send, Lock, AlertTriangle } from 'lucide-react';
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
import { useExperts, useActivitiesByMonth, useActivityMutations, useApiKey, useReportStatus, useConcurrentProjects } from '@/hooks/use-backend-data';
import type { Activity, Expert, ReportStatus } from '@/lib/types';
import { UserMenu } from '@/components/user-menu';
import { getSignedInUser } from '@/lib/aws/auth';
import { isGtExpertCategory } from '@/lib/peo-category';
import { assertCanLogHoursOnDate, getNonWorkingDayInfo } from '@/lib/non-working-days';
import { getMonthlyBlockingState } from '@/lib/pontaj-rules';

export default function ExpertDashboard() {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<Record<string, string>>({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [localApiKey, setLocalApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Data hooks
  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: allMonthActivities, isLoading: activitiesLoading, mutate: refreshActivities } = useActivitiesByMonth(currentMonth, currentYear);
  const { create: createActivity, createBatch, update: updateActivity, remove: removeActivity } = useActivityMutations();
  const { apiKey, setApiKey, isLoading: apiKeyLoading } = useApiKey();
  const { status: reportStatus, updateStatus: updateReportStatus, isLoading: reportStatusLoading } = useReportStatus(selectedExpertId, currentMonth, currentYear);
  const { projects: concurrentProjects } = useConcurrentProjects(selectedExpertId);

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

  const handleMonthChange = (month: number, year: number) => {
    setCurrentMonth(month);
    setCurrentYear(year);
    setSelectedDates([]);
    setSelectedHours({});
  };

  const handleSaveActivities = async (newActivities: Activity[]) => {
    if (reportStatus?.status === 'approved') return;

    setSaveError(null);
    setIsSaving(true);
    try {
      newActivities
        .filter((activity) => (Number(activity.hours) || 0) > 0)
        .forEach((activity) => assertCanLogHoursOnDate(activity.date));

      if (editingActivity) {
        // Update existing activity
        for (const activity of newActivities) {
          await updateActivity(activity.id, activity);
        }
      } else {
        // Add new activities
        await createBatch(newActivities.map(a => ({
          ...a,
          expertId: selectedExpertId!,
        })));
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

  const handleSubmitMonth = async () => {
    if (!selectedExpertId || activities.length === 0 || isApproved) return;

    await updateReportStatus({
      expertId: selectedExpertId,
      year: currentYear,
      month: currentMonth,
      status: 'sent',
      sentDate: new Date().toISOString(),
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
          <Button onClick={handleSubmitMonth} disabled={activities.length === 0 || isApproved || currentStatus === 'sent' || currentStatus === 'in_review'}>
            {isApproved ? <Lock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isApproved ? 'Lună aprobată' : 'Trimite luna către PM'}
          </Button>
        </div>

        <Tabs defaultValue="activitati" className="space-y-6">
          <TabsList className={`grid w-full ${isGtExpert ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="activitati">Activitati</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            {isGtExpert && <TabsTrigger value="gt">Grup Tinta</TabsTrigger>}
            <TabsTrigger value="export">Export RA</TabsTrigger>
          </TabsList>

          {/* Tab: Activitati - pentru adaugare/editare activitati */}
          <TabsContent value="activitati" className="space-y-6">
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
              <Button onClick={handleAddActivity} disabled={!selectedExpert.id || isApproved || monthlyBlocking.isBlocked}>
                <Plus className="h-4 w-4" />
                Adaugă activitate
              </Button>
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
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i} value={`${i}-${currentYear}`}>
                        {getMonthName(i)} {currentYear}
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
