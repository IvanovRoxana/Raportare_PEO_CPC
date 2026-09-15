'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AlertTriangle, CheckCircle2, Database, FileText, Loader2, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useExperts } from '@/hooks/use-backend-data';
import { extractDocxTextWithSource, extractPdfTextWithSource } from '@/lib/document-utils';

type HealthStatus = 'ok' | 'warning' | 'missing' | 'not_applicable';

type HealthCard = {
  id: string;
  title: string;
  status: HealthStatus;
  count: number;
  detail: string;
  recommendedAction?: string | null;
};

type HealthResponse = {
  filters: {
    expertId?: string;
    category?: string;
    saCode?: string;
    month?: number;
    year?: number;
  };
  rules?: { activeRuleset: boolean; catalogCount: number };
  expert: {
    id: string;
    name: string;
    role: string;
    category?: string;
    positionInProject?: string;
    projectCode?: string;
    hasJobDescriptionText: boolean;
    hasAiReportingInstructions: boolean;
  } | null;
  cards: HealthCard[];
  warnings: string[];
  recentAudits: Array<{
    id: string;
    expertName?: string;
    activityName?: string;
    confidence?: string;
    applied?: boolean;
    createdAt?: string;
  }>;
};

type RagLibraryDocument = {
  id: string;
  title: string;
  sourceType: string;
  category?: string;
  projectCode?: string;
  saCode?: string;
  expertName?: string;
  originalFileName?: string;
  indexedAt?: string;
};

const SOURCE_TYPES = [
  { value: 'fisa_post', label: 'Fisa post' },
  { value: 'scop_sa', label: 'Scop SA' },
  { value: 'cerere_finantare', label: 'Cerere finantare' },
  { value: 'manual_beneficiar', label: 'Manual beneficiar' },
  { value: 'descriere_activitati', label: 'Descriere activitati' },
  { value: 'raportare_aprobata_oir', label: 'Raportare aprobata OIR' },
  { value: 'raport_activitate_aprobat', label: 'RA aprobat (ultimele 12 luni)' },
  { value: 'livrabil_aprobat', label: 'Livrabil aprobat (ultimele 12 luni)' },
  { value: 'other', label: 'Alta sursa' },
];

type RagIndexScope = 'project' | 'subactivity' | 'expert' | 'other';

const INDEX_SCOPE_OPTIONS: Array<{ value: RagIndexScope; label: string }> = [
  { value: 'project', label: 'Proiect' },
  { value: 'subactivity', label: 'Subactivitate / SA' },
  { value: 'expert', label: 'Expert / rol' },
  { value: 'other', label: 'Alte surse' },
];

const SOURCE_TYPES_BY_SCOPE: Record<RagIndexScope, string[]> = {
  project: ['cerere_finantare', 'manual_beneficiar'],
  subactivity: ['scop_sa', 'descriere_activitati', 'cerere_finantare'],
  expert: ['fisa_post', 'raport_activitate_aprobat', 'livrabil_aprobat', 'raportare_aprobata_oir'],
  other: ['other', 'raport_activitate_aprobat', 'livrabil_aprobat', 'raportare_aprobata_oir'],
};

const currentDate = new Date();

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function getAccessToken() {
  const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
  if (!token) throw new Error('Nu am gasit sesiunea Cognito curenta.');
  return token;
}

function statusBadgeClass(status: HealthStatus) {
  if (status === 'ok') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'warning') return 'border-amber-300 bg-amber-50 text-amber-900';
  if (status === 'missing') return 'border-red-300 bg-red-50 text-red-800';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function statusLabel(status: HealthStatus) {
  if (status === 'ok') return 'OK';
  if (status === 'warning') return 'Atentie';
  if (status === 'missing') return 'Lipsa';
  return 'N/A';
}

export function AiContextHealthPanel() {
  const { experts, isLoading: expertsLoading, mutate: refreshExperts } = useExperts();
  const activeExperts = useMemo(
    () => experts.filter((expert) => expert.isActive !== false),
    [experts],
  );
  const categories = useMemo(
    () => uniq(experts.map((expert) => expert.category || '')).sort(),
    [experts],
  );
  const saCodes = useMemo(
    () => uniq(experts.flatMap((expert) => expert.saCodes || [])).sort(),
    [experts],
  );

  const [expertId, setExpertId] = useState('');
  const [category, setCategory] = useState('');
  const [saCode, setSaCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));
  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedExpert = useMemo(
    () => experts.find((expert) => expert.id === expertId) || null,
    [expertId, experts],
  );
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState('');
  const [savingJobDescription, setSavingJobDescription] = useState(false);

  const [ragTitle, setRagTitle] = useState('');
  const [indexScope, setIndexScope] = useState<RagIndexScope>('project');
  const [ragSourceType, setRagSourceType] = useState('cerere_finantare');
  const [ragText, setRagText] = useState('');
  const [ragActivityName, setRagActivityName] = useState('');
  const [ragExtractionSource, setRagExtractionSource] = useState<'native' | 'ocr' | undefined>();
  const [ragAdminToken, setRagAdminToken] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [extractingRagFile, setExtractingRagFile] = useState(false);
  const [ragFileName, setRagFileName] = useState('');
  const [ragFileInputKey, setRagFileInputKey] = useState(0);
  const [ragTextIsExtracted, setRagTextIsExtracted] = useState(false);
  const [libraryDocuments, setLibraryDocuments] = useState<RagLibraryDocument[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [ragDialogOpen, setRagDialogOpen] = useState(false);
  const ragFormRef = useRef<HTMLDivElement>(null);

  const libraryCategories = useMemo(
    () => uniq(libraryDocuments.map((document) => document.category || '')),
    [libraryDocuments],
  );
  const librarySaCodes = useMemo(
    () => uniq(libraryDocuments.map((document) => document.saCode || '')),
    [libraryDocuments],
  );

  const ragPreviewLength = 2000;

  useEffect(() => {
    if (!expertId && activeExperts[0]) {
      setExpertId(activeExperts[0].id);
      setCategory(activeExperts[0].category || '');
      setSaCode(activeExperts[0].saCodes?.[0] || '');
    }
  }, [activeExperts, expertId]);

  useEffect(() => {
    setJobDescriptionDraft(selectedExpert?.jobDescriptionText || '');
    if (selectedExpert?.projectCode) setProjectCode(selectedExpert.projectCode);
    if (selectedExpert?.category) setCategory(selectedExpert.category);
    if (!saCode && selectedExpert?.saCodes?.[0]) setSaCode(selectedExpert.saCodes[0]);
  }, [saCode, selectedExpert]);

  async function loadHealth() {
    setLoadingHealth(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (expertId) params.set('expertId', expertId);
      if (category) params.set('category', category);
      if (saCode) params.set('saCode', saCode);
      if (projectCode) params.set('projectCode', projectCode);
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      const response = await fetch(`/api/admin/ai-context-health?${params.toString()}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Nu am putut citi sanatatea contextului AI.');
      setHealth(data as HealthResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nu am putut citi sanatatea contextului AI.');
      setHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }

  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/rag/library', {
        cache: 'no-store',
        headers: { authorization: `Bearer ${token}`, 'x-rag-admin-token': ragAdminToken.trim() },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Biblioteca RAG nu a putut fi incarcata.');
      setLibraryDocuments(data?.documents || []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Biblioteca RAG nu a putut fi incarcata.');
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function removeFromLibrary(id: string) {
    if (!window.confirm('Scoti documentul din biblioteca RAG?')) return;
    setDeletingDocumentId(id);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/rag/library', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-rag-admin-token': ragAdminToken.trim() },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Documentul nu a putut fi scos din biblioteca RAG.');
      setLibraryDocuments((documents) => documents.filter((document) => document.id !== id));
      setMessage('Documentul a fost scos din biblioteca RAG.');
      await loadHealth();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Documentul nu a putut fi scos din biblioteca RAG.');
    } finally {
      setDeletingDocumentId(null);
    }
  }

  function configureSource(scope: RagIndexScope, sourceType: string) {
    setIndexScope(scope);
    setRagSourceType(sourceType);
    setRagDialogOpen(true);
    window.setTimeout(() => ragFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  useEffect(() => {
    if (expertId || category || saCode) {
      void loadHealth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertId, category, saCode, projectCode, month, year]);

  async function saveJobDescription() {
    if (!selectedExpert) return;
    setSavingJobDescription(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/experts', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          id: selectedExpert.id,
          input: { jobDescriptionText: jobDescriptionDraft.trim() },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Nu am putut salva fisa postului.');
      setMessage('Fisa postului a fost salvata.');
      await refreshExperts();
      await loadHealth();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nu am putut salva fisa postului.');
    } finally {
      setSavingJobDescription(false);
    }
  }

  async function indexRagDocument(overrides: { text?: string; title?: string; extractionSource?: 'native' | 'ocr' } = {}) {
    const textToIndex = overrides.text ?? ragText;
    const titleToIndex = overrides.title ?? ragTitle;
    if (!titleToIndex.trim() || !textToIndex.trim()) {
      setError('Completeaza titlul si textul documentului RAG.');
      return;
    }
    if (!ragAdminToken.trim()) {
      setError('Introdu tokenul RAG admin pentru indexare. Tokenul nu se salveaza in browser.');
      return;
    }
    if (!projectCode.trim() && indexScope !== 'expert') {
      setError('Completeaza codul proiectului pentru aceasta sursa.');
      return;
    }
    if (indexScope === 'subactivity' && !saCode.trim()) {
      setError('Selecteaza un cod SA pentru sursa subactivitatii.');
      return;
    }
    if (indexScope === 'expert' && !selectedExpert) {
      setError('Selecteaza expertul pentru fisa postului, RA sau livrabilul aprobat.');
      return;
    }
    if (indexScope === 'project' && ragSourceType !== 'cerere_finantare' && ragSourceType !== 'manual_beneficiar') {
      setError('Alege Cerere finantare sau Manual beneficiar pentru o sursa de proiect.');
      return;
    }
    if (['raport_activitate_aprobat', 'livrabil_aprobat'].includes(ragSourceType) && !ragActivityName.trim()) {
      setError('Completeaza activitatea pentru raportul sau livrabilul aprobat.');
      return;
    }

    setIndexing(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/rag/index-document', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-rag-admin-token': ragAdminToken.trim(),
        },
        body: JSON.stringify({
          title: titleToIndex.trim(),
          sourceType: ragSourceType,
          text: textToIndex.trim(),
          // Project sources remain separate from the expert because they have no expertId,
          // but keep the selected category so they remain visible in the RAG library.
          category: category || selectedExpert?.category,
          expertId: indexScope === 'expert' ? selectedExpert?.id : undefined,
          expertName: indexScope === 'expert' ? selectedExpert?.name : undefined,
          expertRole: indexScope === 'expert' ? selectedExpert?.positionInProject || selectedExpert?.role : undefined,
          projectCode: projectCode.trim() || undefined,
          month: Number.isFinite(Number(month)) ? Number(month) : undefined,
          year: Number.isFinite(Number(year)) ? Number(year) : undefined,
          saCode: ['raport_activitate_aprobat', 'livrabil_aprobat'].includes(ragSourceType)
            ? saCode.trim() || undefined
            : indexScope === 'subactivity' ? saCode : undefined,
          activityName: ragActivityName.trim() || undefined,
          approvalStatus: ['raportare_aprobata_oir', 'raport_activitate_aprobat', 'livrabil_aprobat'].includes(ragSourceType) ? 'approved' : undefined,
          originalFileName: ragFileName || undefined,
          extractionSource: overrides.extractionSource ?? ragExtractionSource,
          extractionComplete: Boolean(textToIndex.trim()),
          createdBy: 'admin-ai-context-health',
          metadata: { source: 'admin-ai-context-health', scope: indexScope },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Indexarea documentului RAG a esuat.');
      setMessage(data?.duplicate ? 'Documentul exista deja in baza RAG; nu a fost duplicat.' : `Document indexat: ${data?.chunks ?? 0} fragmente.`);
      setRagText('');
      setRagFileName('');
      setRagTitle('');
      setRagExtractionSource(undefined);
      setRagTextIsExtracted(false);
      setRagFileInputKey((key) => key + 1);
      await loadLibrary();
      await loadHealth();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Indexarea documentului RAG a esuat.');
    } finally {
      setIndexing(false);
    }
  }

  async function handleRagFileUpload(file?: File | null) {
    if (!file) return;
    setExtractingRagFile(true);
    setError(null);
    setMessage(null);
    setRagFileName(file.name);
    try {
      const isDocx = file.name.toLowerCase().endsWith('.docx')
        || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const result = isDocx
        ? await extractDocxTextWithSource(file)
        : await extractPdfTextWithSource(file);
      if (!result.text?.trim()) throw new Error('Nu am putut extrage text util din document. Lipeste textul manual.');
      setRagText(result.text.trim());
      setRagExtractionSource(result.source);
      setRagTextIsExtracted(true);
      if (!ragTitle.trim()) setRagTitle(file.name.replace(/\.(pdf|docx)$/i, ''));
      setMessage('Documentul a fost incarcat. Verifica preview-ul si apasa „Indexeaza documentul”.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Extragerea documentului a esuat.');
    } finally {
      setExtractingRagFile(false);
    }
  }

  const okCount = health?.cards.filter((card) => card.status === 'ok').length ?? 0;
  const issueCount = health?.cards.filter((card) => card.status === 'missing' || card.status === 'warning').length ?? 0;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-primary" />
              AI Context Health
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Verifica sursele folosite de Agentul PEO si completeaza contextul lipsa inainte de generarea descrierilor.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadHealth} disabled={loadingHealth}>
            {loadingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reincarca
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-2 md:col-span-2">
              <Label>Expert</Label>
              <Select value={expertId} onValueChange={setExpertId} disabled={expertsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege expert" />
                </SelectTrigger>
                <SelectContent>
                  {activeExperts.map((expert) => (
                    <SelectItem key={expert.id} value={expert.id}>
                      {expert.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categorie</Label>
              <Select value={category || 'none'} onValueChange={(value) => setCategory(value === 'none' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nespecificat</SelectItem>
                  {uniq([...categories, ...libraryCategories]).sort().map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SA</Label>
              <Select value={saCode || 'none'} onValueChange={(value) => setSaCode(value === 'none' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="SA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nespecificat</SelectItem>
                  {uniq([...saCodes, ...librarySaCodes]).sort().map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Luna</Label>
                <Input type="number" min={1} max={12} value={month} onChange={(event) => setMonth(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>An</Label>
                <Input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
              </div>
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryPill label="Surse OK" value={String(okCount)} tone="ok" />
            <SummaryPill label="De completat" value={String(issueCount)} tone={issueCount > 0 ? 'warning' : 'ok'} />
            <SummaryPill label="Audituri recente" value={String(health?.recentAudits.length ?? 0)} tone="neutral" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {(health?.cards ?? []).map((card) => (
              <div key={card.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-950">{card.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
                  </div>
                  <Badge variant="outline" className={statusBadgeClass(card.status)}>
                    {statusLabel(card.status)}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.id === 'project-sources' && <Button type="button" variant="outline" size="sm" onClick={() => configureSource('project', 'cerere_finantare')}><Plus className="h-3 w-3" />Adauga proiect</Button>}
                  {card.id === 'sa-purpose' && <Button type="button" variant="outline" size="sm" onClick={() => configureSource('subactivity', 'scop_sa')}><Plus className="h-3 w-3" />Adauga SA</Button>}
                  {card.id === 'job-description' && <Button type="button" variant="outline" size="sm" onClick={() => configureSource('expert', 'fisa_post')}><Plus className="h-3 w-3" />Adauga expert</Button>}
                  {card.id === 'category-rag' && <Button type="button" variant="outline" size="sm" onClick={() => configureSource('project', 'manual_beneficiar')}><Plus className="h-3 w-3" />Adauga categorie</Button>}
                  {card.id === 'approved-reports' && <Button type="button" variant="outline" size="sm" onClick={() => configureSource('expert', 'raport_activitate_aprobat')}><Plus className="h-3 w-3" />Adauga raport</Button>}
                </div>
                {card.recommendedAction && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{card.recommendedAction}</p>
                )}
              </div>
            ))}
          </div>

          {health?.warnings.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Avertismente AI recente
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {health.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}

          <section className="rounded-xl border bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">Verificări și audit recent</h3>
                <p className="mt-1 text-xs text-muted-foreground">Ultimele evaluări pentru expertul și perioada selectate.</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            {health?.recentAudits.length ? (
              <div className="space-y-2">
                {health.recentAudits.map((audit) => (
                  <div key={audit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                    <span className="font-medium text-slate-900">{audit.activityName || 'Activitate neevaluată'}</span>
                    <span className="text-muted-foreground">{audit.confidence || 'fără încredere'} · {audit.applied ? 'aplicată' : 'neaplicată'}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Nu există evaluări recente pentru filtrele curente.</p>}
          </section>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Fisa post expert
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
              {selectedExpert ? `${selectedExpert.name} - ${selectedExpert.positionInProject || selectedExpert.role}` : 'Alege un expert.'}
            </div>
            <Textarea
              rows={8}
              value={jobDescriptionDraft}
              onChange={(event) => setJobDescriptionDraft(event.target.value)}
              placeholder="Lipeste aici atributiile/fisa postului expertului."
              disabled={!selectedExpert}
            />
            <Button type="button" onClick={saveJobDescription} disabled={!selectedExpert || savingJobDescription}>
              {savingJobDescription ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salveaza fisa postului
            </Button>
          </CardContent>
        </Card>

        <Dialog open={ragDialogOpen} onOpenChange={setRagDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" className="h-auto min-h-28 w-full justify-start rounded-2xl border border-dashed border-primary/40 bg-blue-50 p-5 text-left text-primary shadow-sm hover:bg-blue-100">
              <Plus className="h-5 w-5" />
              <span><span className="block font-semibold">Adauga document nou</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Alege categoria, incarca documentul si salveaza-l in biblioteca si baza de date.</span></span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adauga sursa in biblioteca RAG</DialogTitle>
              <DialogDescription>Documentul este salvat pe server ca sursa separata pentru proiect, SA, categorie sau expert.</DialogDescription>
            </DialogHeader>
        <Card ref={ragFormRef} className="rounded-2xl border-0 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-primary" />
              Indexare sursa RAG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Încarcă aici documentele de referință. Alege nivelul potrivit: Proiect pentru cererea de finanțare/manual, Subactivitate pentru scopul SA, Expert / rol pentru fișa de post și RA/livrabile aprobate.
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Nivel sursă</Label>
                <Select
                  value={indexScope}
                  onValueChange={(value) => {
                    const nextScope = value as RagIndexScope;
                    setIndexScope(nextScope);
                    setRagSourceType(SOURCE_TYPES_BY_SCOPE[nextScope][0]);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDEX_SCOPE_OPTIONS.map((scope) => (
                      <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cod proiect *</Label>
                <Input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="302141" />
              </div>
              <div className="space-y-2">
                <Label>Categorie *</Label>
                <Select value={category || 'none'} onValueChange={(value) => setCategory(value === 'none' ? '' : value)}>
                  <SelectTrigger><SelectValue placeholder="Alege categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nespecificat</SelectItem>
                    {uniq([...categories, ...libraryCategories]).sort().map((item) => (
                      <SelectItem key={`rag-category-${item}`} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Titlu document</Label>
                <Input value={ragTitle} onChange={(event) => setRagTitle(event.target.value)} placeholder="Ex: Raportare aprobata iunie AP" />
              </div>
              <div className="space-y-2">
                <Label>Tip sursa</Label>
                <Select value={ragSourceType} onValueChange={setRagSourceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.filter((source) => SOURCE_TYPES_BY_SCOPE[indexScope].includes(source.value)).map((source) => (
                      <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {['raport_activitate_aprobat', 'livrabil_aprobat'].includes(ragSourceType) && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Activitate *</Label>
                  <Input value={ragActivityName} onChange={(event) => setRagActivityName(event.target.value)} placeholder="Denumirea exacta din catalogul de activitati" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Token RAG admin</Label>
              <Input
                type="password"
                value={ragAdminToken}
                onChange={(event) => setRagAdminToken(event.target.value)}
                placeholder="Token temporar pentru indexare; nu se salveaza"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rag-source-document">Document oficial (PDF sau DOCX)</Label>
              <Input
                key={ragFileInputKey}
                id="rag-source-document"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => void handleRagFileUpload(event.target.files?.[0])}
                disabled={extractingRagFile}
              />
              <p className="text-xs text-muted-foreground">
                {extractingRagFile ? 'Se extrage textul...' : ragFileName || 'Alege un document pentru extragere automata.'}
              </p>
            </div>
            <Textarea
              rows={8}
              value={ragTextIsExtracted ? ragText.slice(0, ragPreviewLength) : ragText}
              readOnly={ragTextIsExtracted}
              onChange={(event) => {
                setRagTextIsExtracted(false);
                setRagText(event.target.value);
              }}
              placeholder="Preview-ul textului extras va aparea aici."
            />
            <p className="text-xs text-muted-foreground">
              {ragTextIsExtracted
                ? `Se afișează primele ${ragPreviewLength} caractere ca preview; la indexare se folosește textul extras integral. `
                : ''}
              Încărcarea nu indexează automat documentul. Pentru RA și livrabile aprobate sunt acceptate doar documentele din ultimele 12 luni.
            </p>
            <Button type="button" onClick={() => void indexRagDocument()} disabled={indexing || extractingRagFile}>
              {indexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Indexeaza documentul
            </Button>
          </CardContent>
        </Card>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Biblioteca RAG</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Surse comune de proiect, SA, categorie și expert. Proiectul nu înlocuiește sursele expertului.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadLibrary()} disabled={loadingLibrary || !ragAdminToken.trim()}>
            {loadingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reincarca
          </Button>
        </CardHeader>
        <CardContent>
          {!libraryDocuments.length ? <p className="text-sm text-muted-foreground">Apasa Reincarca pentru a vedea documentele indexate.</p> : (
            <div className="space-y-2">
              {libraryDocuments.map((document) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{document.title}</div>
                    <div className="text-xs text-muted-foreground">{document.sourceType} · {document.projectCode || 'fără proiect'}{document.saCode ? ` · ${document.saCode}` : ''}{document.category ? ` · ${document.category}` : ''}</div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => void removeFromLibrary(document.id)} disabled={deletingDocumentId === document.id}>
                    {deletingDocumentId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Scoate
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warning' | 'neutral' }) {
  const className = tone === 'ok'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-slate-50 text-slate-900';
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
