'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { Settings, ArrowLeft, Save, Loader2, AlertCircle, CheckCircle, XCircle, MessageSquare, Eye } from 'lucide-react';
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
} from '@/hooks/use-backend-data';
import type {
  PontajRow,
  RaportRow,
  LivrabilRow,
  CrossExpertRow,
  Neconformitate,
  VerificationNote,
  ReportStatus,
} from '@/lib/types';
import { UserMenu } from '@/components/user-menu';

export default function PMDashboard() {
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [localApiKey, setLocalApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  // Set default expert when experts load
  useEffect(() => {
    if (experts.length > 0 && !selectedExpertId) {
      setSelectedExpertId(experts[0].id);
    }
  }, [experts, selectedExpertId]);

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
    if (!selectedExpertId) return;
    
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
  const currentReportStatusMeta = statusLabels[currentReportStatus];

  const setMonthlyStatus = async (status: ReportStatus['status'], pmNotes?: string) => {
    if (!selectedExpertId) return;

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

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: getMonthName(i),
  }));

  const years = Array.from({ length: 5 }, (_, i) => ({
    value: new Date().getFullYear() - 2 + i,
    label: (new Date().getFullYear() - 2 + i).toString(),
  }));

  const isLoading = expertsLoading || apiKeyLoading;
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
                <h1 className="text-xl font-bold text-foreground">PM Dashboard - Verificare</h1>
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

              {/* Save Button */}
              <Button variant="outline" onClick={saveVerificationData} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salveaza
              </Button>

              {/* Settings */}
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
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="pontaj" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="pontaj">Pontaj Excel</TabsTrigger>
            <TabsTrigger value="raport">Raport Activitate</TabsTrigger>
            <TabsTrigger value="livrabile">Livrabile</TabsTrigger>
            <TabsTrigger value="cross-expert">Cross-Expert</TabsTrigger>
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

          <TabsContent value="cross-expert">
            <CrossExpertTab data={crossExpertData} onDataChange={setCrossExpertData} />
          </TabsContent>

          <TabsContent value="neconformitati">
            <NeconformitatiTab data={localNeconformitati} onDataChange={handleNeconformitatiChange} />
          </TabsContent>

          <TabsContent value="note">
            <NotesTab data={localNotes} onDataChange={handleNotesChange} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
