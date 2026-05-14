'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  MessageSquare,
  Eye,
  FileWarning,
  FolderOpen,
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
  useReportStatus,
  useReportStatusByMonth,
  useActivitiesByMonth,
  useAuditLogs,
  useDocuments,
  useSharedDeliverables,
  useGrupTintaByMonth,
  useAllConcurrentProjects,
} from '@/hooks/use-backend-data';
import { buildDashboardComplianceRows } from '@/lib/reporting-dashboard';
import { getSignedInUser, type AppUser } from '@/lib/aws/auth';
import { buildPmDashboardSummary } from '@/lib/pm-dashboard';
import { canAccessExpertId, resolveDataAccessScope } from '@/lib/access-control';
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
  const {
    status: reportStatus,
    updateStatus: updateReportStatus,
    isLoading: reportStatusLoading,
  } = useReportStatus(selectedExpertId, selectedMonth, selectedYear);
  const { statuses: monthlyReportStatuses } = useReportStatusByMonth(selectedMonth, selectedYear);
  const { activities: monthActivities } = useActivitiesByMonth(selectedMonth, selectedYear);
  const { auditLogs } = useAuditLogs(hasExtendedExpertAccess ? null : selectedExpertId, selectedMonth, selectedYear);
  const { documents } = useDocuments();
  const { sharedDeliverables } = useSharedDeliverables(hasExtendedExpertAccess ? undefined : selectedExpertId ?? undefined);
  const { entries: grupTintaEntries } = useGrupTintaByMonth(selectedMonth, selectedYear);
  const { projects: concurrentProjects } = useAllConcurrentProjects();

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
    if (experts.length === 0) return;

    setSelectedExpertId((currentId) => {
      if (currentId && experts.some((expert) => expert.id === currentId)) {
        return currentId;
      }

      return experts[0].id;
    });
  }, [experts]);

  // Load API key
  useEffect(() => {
    if (apiKey) {
      setLocalApiKey(apiKey);
    }
  }, [apiKey]);

  // Load verification data when it changes
  useEffect(() => {
    if (verification) {
      setPontajData(verification.pontajRows || verification.pontajData || []);
      setRaportData(verification.raportRows || verification.raportActivitateData || []);
      setLivrabileData(verification.livrabilRows || verification.livrabileData || []);
      setCrossExpertData(verification.crossExpertRows || verification.crossExpertData || []);
    } else {
      setPontajData([]);
      setRaportData([]);
      setLivrabileData([]);
      setCrossExpertData([]);
    }
  }, [verification]);

  // Load neconformitati and notes
  useEffect(() => {
    setLocalNeconformitati(neconformitati);
  }, [neconformitati]);

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  // Get selected expert
  const selectedExpert = useMemo(() => {
    return experts.find((e) => e.id === selectedExpertId) || experts[0] || { id: '', name: 'Expert', role: '' };
  }, [experts, selectedExpertId]);

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
      pmNotes,
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
        experts,
        activities: monthActivities,
        auditLogs,
        month: selectedMonth,
        year: selectedYear,
      }),
    [experts, monthActivities, auditLogs, selectedMonth, selectedYear]
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
      .filter((relation) => relation.status === 'pending_registration')
      .map((relation) => ({
        relation,
        document: documents.find((document) => document.id === relation.documentId),
        sourceExpert: experts.find((expert) => expert.id === relation.sourceExpertId),
        targetExpert: experts.find((expert) => expert.id === relation.targetExpertId),
      }));
  }, [documents, experts, sharedDeliverables]);
  const pmSummary = useMemo(
    () =>
      buildPmDashboardSummary({
        experts,
        activities: monthActivities,
        reportStatuses: monthlyReportStatuses,
        documents,
        sharedDeliverables,
      }),
    [documents, experts, monthActivities, monthlyReportStatuses, sharedDeliverables]
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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {hasExtendedExpertAccess ? 'PM Dashboard - Verificare' : 'Raportarea mea - Verificare'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Cod Proiect: 302141
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Expert Selector */}
              <Select
                value={selectedExpertId || ''}
                onValueChange={(id) => setSelectedExpertId(id)}
                disabled={!hasExtendedExpertAccess}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Expert" />
                </SelectTrigger>
                <SelectContent>
                  {experts.map((expert) => (
                    <SelectItem key={expert.id} value={expert.id}>
                      {expert.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month Selector */}
              <Select
                value={selectedMonth.toString()}
                onValueChange={(v) => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="w-[130px]">
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

              {/* Year Selector */}
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-[90px]">
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

              {canManagePmReview && (
                <Button variant="outline" onClick={saveVerificationData} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salveaza
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
      </header>

      {/* Statistics Bar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status lună:</span>
              <Badge variant={currentReportStatusMeta.variant}>{currentReportStatusMeta.label}</Badge>
              {reportStatusLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Pontaj:</span>
              <Badge variant={pontajVerified === pontajData.length && pontajData.length > 0 ? 'default' : 'secondary'}>
                {pontajVerified}/{pontajData.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Raport:</span>
              <Badge variant={raportVerified === raportData.length && raportData.length > 0 ? 'default' : 'secondary'}>
                {raportVerified}/{raportData.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Livrabile:</span>
              <Badge variant={livrabileMatched === livrabileData.length && livrabileData.length > 0 ? 'default' : 'secondary'}>
                {livrabileMatched}/{livrabileData.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Neconformitati:</span>
              <Badge variant={unresolvedIssues > 0 ? 'destructive' : 'secondary'}>
                {unresolvedIssues} nerezolvate
              </Badge>
            </div>
            {verificationLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {reportStatus?.pmNotes && (
            <p className="mt-2 text-xs text-muted-foreground">Observații status: {reportStatus.pmNotes}</p>
          )}
          {canManagePmReview && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMonthlyStatus('in_review')}>
                <Eye className="h-4 w-4" />
                În verificare
              </Button>
              <Button variant="outline" size="sm" onClick={requestClarifications}>
                <MessageSquare className="h-4 w-4" />
                Cere clarificări
              </Button>
              <Button variant="outline" size="sm" onClick={rejectMonth}>
                <XCircle className="h-4 w-4" />
                Respinge
              </Button>
              <Button size="sm" onClick={() => setMonthlyStatus('approved', reportStatus?.pmNotes)}>
                <CheckCircle className="h-4 w-4" />
                Aprobă luna
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <section className="mb-6 grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {hasExtendedExpertAccess ? 'Experți monitorizați' : 'Raportare vizibilă'}
            </p>
            <p className="mt-1 text-2xl font-bold">{pmSummary.totalExperts}</p>
            <p className="mt-1 text-xs text-muted-foreground">Draft {pmSummary.statusCounts.draft} / Trimis {pmSummary.statusCounts.sent} / Aprobat {pmSummary.statusCounts.approved}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Ore pontate</p>
            <p className="mt-1 text-2xl font-bold">{dashboardTotals.totalHours}h</p>
            <p className="mt-1 text-xs text-muted-foreground">Rămase {dashboardTotals.totalRemaining}h</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Zile fara activitate</p>
            <p className="mt-1 text-2xl font-bold">{dashboardTotals.missingDays}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Zile blocate</p>
            <p className="mt-1 text-2xl font-bold">{dashboardTotals.blockedDays}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Alerte documente</p>
            <p className="mt-1 text-2xl font-bold">{pmSummary.titleIssues + pmSummary.pendingSharedDeliverables}</p>
            <p className="mt-1 text-xs text-muted-foreground">Titlu {pmSummary.titleIssues} / comune {pmSummary.pendingSharedDeliverables}</p>
          </div>
        </section>

        <section className="mb-6 rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="text-base font-semibold">
              {hasExtendedExpertAccess ? 'Status lunar pentru toți experții' : 'Status lunar pentru raportarea mea'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {hasExtendedExpertAccess
                ? 'Centralizează rolul, categoria, norma, orele pontate, statusul raportării și problemele lunii selectate.'
                : 'Afișează strict rolul, norma, orele pontate, statusul raportării și problemele proprii pentru luna selectată.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Expert</th>
                  <th className="px-4 py-3 font-medium">Categorie</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ore / normă</th>
                  <th className="px-4 py-3 font-medium">Completare</th>
                  <th className="px-4 py-3 font-medium">Probleme</th>
                  <th className="px-4 py-3 font-medium">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {dashboardRows.map((row) => {
                  const expert = experts.find((item) => item.id === row.expertId);
                  const monthlyStatus = reportStatusByExpertId.get(row.expertId)?.status || 'draft';
                  const statusMeta = statusLabels[monthlyStatus] || statusLabels.draft;
                  const issues = [
                    row.hasDailyLimitIssue ? '8h/zi' : null,
                    row.hasMonthlyNormIssue ? 'normă lunară' : null,
                    row.hasProjectNormIssue ? 'normă proiect' : null,
                    row.missingActivityDays.length > 0 ? `${row.missingActivityDays.length} zile lipsă` : null,
                    row.blockedDays.length > 0 ? `${row.blockedDays.length} zile blocate` : null,
                    row.adminInterventions > 0 ? `${row.adminInterventions} intervenții admin` : null,
                  ].filter(Boolean);

                  return (
                    <tr key={row.expertId} className="border-t">
                      <td className="px-4 py-3 font-medium">{row.expertName}</td>
                      <td className="px-4 py-3">{row.category || '-'}</td>
                      <td className="px-4 py-3">{row.role || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </td>
                      <td className="px-4 py-3">{row.totalHours}h / {row.monthlyNorm}h</td>
                      <td className="px-4 py-3">{row.utilizationPercent}%</td>
                      <td className="px-4 py-3">
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((issue) => (
                              <Badge key={issue} variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                                {issue}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {expert && (
                          <Button variant="outline" size="sm" onClick={() => openDossier(expert)}>
                            <FolderOpen className="h-4 w-4" />
                            Dosar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {(eventDocumentIssues.length > 0 || titleIssues.length > 0) && (
          <section className="mb-6 grid gap-3 md:grid-cols-2">
            {eventDocumentIssues.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-amber-950">
                  <FileWarning className="h-4 w-4" />
                  Evenimente fără MOM sau dovadă eveniment ({eventDocumentIssues.length})
                </div>
                <div className="mt-2 space-y-1 text-sm text-amber-950">
                  {eventDocumentIssues.slice(0, 4).map((activity) => (
                    <div key={activity.id}>{activity.date} - {activity.expertName}: {activity.title || activity.activityType}</div>
                  ))}
                </div>
              </div>
            )}
            {titleIssues.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Documente cu title_mismatch ({titleIssues.length})
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {titleIssues.slice(0, 4).map((document) => (
                    <div key={document.id}>{document.declaredTitle || document.originalFileName}</div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {pendingSharedDeliverables.length > 0 && (
          <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-amber-950">
              <AlertCircle className="h-4 w-4" />
              Livrabile comune in asteptarea inregistrarii ({pendingSharedDeliverables.length})
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {pendingSharedDeliverables.map(({ relation, document, sourceExpert, targetExpert }) => (
                <div key={relation.id} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                  <div className="font-medium">
                    {document?.declaredTitle || document?.suggestedTitle || document?.originalFileName || relation.documentId}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Incarcat de {sourceExpert?.name || relation.sourceExpertId} pentru {targetExpert?.name || relation.targetExpertId}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {document?.projectId && <Badge variant="outline">{document.projectId}</Badge>}
                    {document?.saCode && <Badge variant="outline">{document.saCode}</Badge>}
                    {document?.activityDate && <Badge variant="outline">{document.activityDate}</Badge>}
                    <Badge variant="secondary">{relation.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
              experts={experts}
              activities={monthActivities}
              concurrentProjects={concurrentProjects}
              reportStatuses={monthlyReportStatuses}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="progres">
            <ProgressReportTab
              experts={experts}
              activities={monthActivities}
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="gt">
            <GTProgressTab
              experts={experts}
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
