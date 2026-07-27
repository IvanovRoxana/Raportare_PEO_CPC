'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AlertTriangle, CheckCircle2, Database, FileText, Loader2, RefreshCw, Save, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useExperts } from '@/hooks/use-backend-data';

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

const SOURCE_TYPES = [
  { value: 'fisa_post', label: 'Fisa post' },
  { value: 'scop_sa', label: 'Scop SA' },
  { value: 'cerere_finantare', label: 'Cerere finantare' },
  { value: 'manual_beneficiar', label: 'Manual beneficiar' },
  { value: 'descriere_activitati', label: 'Descriere activitati' },
  { value: 'raportare_aprobata_oir', label: 'Raportare aprobata OIR' },
  { value: 'other', label: 'Alta sursa' },
];

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
  const [ragSourceType, setRagSourceType] = useState('raportare_aprobata_oir');
  const [ragText, setRagText] = useState('');
  const [ragAdminToken, setRagAdminToken] = useState('');
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    if (!expertId && activeExperts[0]) {
      setExpertId(activeExperts[0].id);
      setCategory(activeExperts[0].category || '');
      setSaCode(activeExperts[0].saCodes?.[0] || '');
    }
  }, [activeExperts, expertId]);

  useEffect(() => {
    setJobDescriptionDraft(selectedExpert?.jobDescriptionText || '');
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

  useEffect(() => {
    if (expertId || category || saCode) {
      void loadHealth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertId, category, saCode, month, year]);

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

  async function indexRagDocument() {
    if (!ragTitle.trim() || !ragText.trim()) {
      setError('Completeaza titlul si textul documentului RAG.');
      return;
    }
    if (!ragAdminToken.trim()) {
      setError('Introdu tokenul RAG admin pentru indexare. Tokenul nu se salveaza in browser.');
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
          title: ragTitle.trim(),
          sourceType: ragSourceType,
          text: ragText.trim(),
          category: category || selectedExpert?.category,
          expertId: selectedExpert?.id,
          expertName: selectedExpert?.name,
          expertRole: selectedExpert?.positionInProject || selectedExpert?.role,
          projectCode: selectedExpert?.projectCode,
          month: Number.isFinite(Number(month)) ? Number(month) : undefined,
          year: Number.isFinite(Number(year)) ? Number(year) : undefined,
          saCode: saCode || undefined,
          approvalStatus: ragSourceType === 'raportare_aprobata_oir' ? 'approved' : undefined,
          createdBy: 'admin-ai-context-health',
          metadata: { source: 'admin-ai-context-health' },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Indexarea documentului RAG a esuat.');
      setMessage(`Document indexat: ${data?.chunks ?? 0} fragmente.`);
      setRagText('');
      await loadHealth();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Indexarea documentului RAG a esuat.');
    } finally {
      setIndexing(false);
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
                  {categories.map((item) => (
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
                  {saCodes.map((item) => (
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

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-primary" />
              Indexare sursa RAG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
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
                    {SOURCE_TYPES.map((source) => (
                      <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <Textarea
              rows={8}
              value={ragText}
              onChange={(event) => setRagText(event.target.value)}
              placeholder="Lipeste textul documentului care trebuie indexat pentru AI."
            />
            <p className="text-xs text-muted-foreground">
              Documentul va fi indexat cu expertul, categoria, SA, luna/anul si proiectul selectate in filtrul de mai sus.
            </p>
            <Button type="button" onClick={indexRagDocument} disabled={indexing}>
              {indexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Indexeaza documentul
            </Button>
          </CardContent>
        </Card>
      </div>
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
