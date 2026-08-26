'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AlertTriangle, CalendarDays, CheckCircle2, FileArchive, FileText, Loader2, RefreshCw, SearchIcon, Trash2, Upload } from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { UserMenu } from '@/components/user-menu';
import { useActivitiesByMonth, useActivityCatalog, useExperts, useIndexedDeliverableCandidateMutations, useIndexedDeliverableCandidates } from '@/hooks/use-backend-data';
import { getSignedInUser } from '@/lib/aws/auth';
import { configureAmplify } from '@/lib/aws/client';
import { formatDate, generateId, getMonthName } from '@/lib/backend-store';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';
import { extractDocxFirstPageText, extractDocxTextWithSource, extractHtmlTextWithSource, extractImageTextWithSource, extractPdfFirstPageTextWithSource, extractPdfTextWithSource, extractXlsxTextWithSource, isImageFile } from '@/lib/document-utils';
import { hashFirstPageText, normalizeDocumentTextForFingerprint } from '@/lib/document-sharing';
import fallbackActivityCatalog from '@/data/import/activity-catalog.json';
import type { Activity, ActivityCatalog, Deliverable, Expert, IndexedDeliverableCandidate } from '@/lib/types';

type AiAnalysis = Pick<IndexedDeliverableCandidate, 'eligibilityStatus' | 'eligibilityReason' | 'eligibilityScore' | 'confidence' | 'suggestedSaCode' | 'suggestedActivityCatalogId' | 'suggestedActivityName' | 'suggestedTitle' | 'suggestedType' | 'suggestedDescription' | 'suggestedResult' | 'keywords' | 'warnings' | 'alternativeMatches' | 'ragUsed' | 'ragSummary' | 'modelAuditId'>;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: getMonthName(index) }));

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function fileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || 'unknown';
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function inferDate(fileName: string, text: string) {
  const haystack = `${fileName} ${text}`;
  const iso = haystack.match(/\b(20\d{2})[-_.](0?[1-9]|1[0-2])[-_.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const ro = haystack.match(/\b(0?[1-9]|[12]\d|3[01])[-_.](0?[1-9]|1[0-2])[-_.](20\d{2})\b/);
  if (ro) return `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}`;
  return undefined;
}

function inferDeliverableType(fileName: string, text: string) {
  const haystack = `${fileName} ${text}`.toLowerCase();
  if (haystack.includes('raport')) return 'raport';
  if (haystack.includes('minuta') || haystack.includes('proces verbal') || haystack.includes('pv')) return 'proces verbal';
  if (haystack.includes('prezentare') || haystack.includes('ppt')) return 'prezentare';
  if (haystack.includes('lista') || haystack.includes('participanti')) return 'lista participanti';
  if (haystack.includes('metodologie') || haystack.includes('ghid')) return 'material suport';
  if (haystack.includes('foto') || haystack.includes('screenshot')) return 'dovada vizuala';
  return 'livrabil';
}

function extractKeywords(fileName: string, text: string) {
  const ignored = new Set(['pentru', 'privind', 'raport', 'livrabil', 'document', 'final', 'draft', 'luna', 'proiect', 'concordia']);
  const words = `${fileName} ${text}`.toLowerCase().replace(/[^a-z0-9ăâîșț\s-]/gi, ' ').split(/\s+/).map((word) => word.trim()).filter((word) => word.length >= 4 && !ignored.has(word));
  const counts = new Map<string, number>();
  words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return Array.from(counts.entries()).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0])).slice(0, 8).map(([word]) => word);
}

async function extractFileText(file: File) {
  const fileName = file.name.toLowerCase();
  if (isImageFile(file.name) || file.type.startsWith('image/')) {
    const result = await extractImageTextWithSource(file);
    return { text: result.text || '', firstPageText: result.text || '' };
  }
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    const [firstPageText, result] = await Promise.all([extractDocxFirstPageText(file), extractDocxTextWithSource(file)]);
    return { text: result.text || firstPageText || '', firstPageText: firstPageText || result.text?.slice(0, 5000) || '' };
  }
  if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
    const [firstPage, full] = await Promise.all([extractPdfFirstPageTextWithSource(file), extractPdfTextWithSource(file)]);
    return { text: full.text || firstPage.text || '', firstPageText: firstPage.text || full.text?.slice(0, 5000) || '' };
  }
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const result = await extractXlsxTextWithSource(file);
    return { text: result.text || '', firstPageText: result.text?.slice(0, 5000) || '' };
  }
  if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    const result = await extractHtmlTextWithSource(file);
    return { text: result.text || '', firstPageText: result.text?.slice(0, 5000) || '' };
  }
  if (['txt', 'csv', 'md', 'json', 'xml', 'rtf'].includes(fileExtension(file.name))) {
    const text = (await file.text()).replace(/\s+/g, ' ').trim();
    return { text, firstPageText: text.slice(0, 5000) };
  }
  return { text: '', firstPageText: '' };
}

function eligibilityLabel(status: string) {
  if (status === 'eligibil') return 'Eligibil';
  if (status === 'neeligibil') return 'Neeligibil';
  if (status === 'necesita_revizie') return 'Necesita revizie';
  if (status === 'uploaded') return 'Incarcat';
  return 'In analiza';
}

function eligibilityVariant(status: string) {
  if (status === 'eligibil') return 'conform';
  if (status === 'neeligibil') return 'neconform';
  if (status === 'necesita_revizie') return 'cu_observatii';
  return 'outline';
}

function buildCatalogPayload(catalog: ActivityCatalog[]) {
  return catalog.map((item) => ({
    id: item.id,
    category: item.category,
    saCode: item.saCode,
    serviceCategory: item.serviceCategory,
    activityNumber: item.activityNumber,
    activityName: item.activityName,
    description: item.description,
    objectives: item.objectives,
    deliverables: item.deliverables,
    indicators: item.indicators,
  }));
}

function normalizeCatalogCategory(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

async function getJsonAuthHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // RAG can continue server-side without the user token.
  }
  return headers;
}

async function analyzeCandidate(input: { candidate: IndexedDeliverableCandidate; expert?: Expert; catalog: ActivityCatalog[]; existingActivities: Activity[] }): Promise<AiAnalysis> {
  const response = await fetch('/api/ai/analyze-indexed-deliverable', {
    method: 'POST',
    headers: await getJsonAuthHeaders(),
    body: JSON.stringify({
      candidate: input.candidate,
      expert: input.expert,
      catalogCandidates: buildCatalogPayload(input.catalog),
      existingActivities: input.existingActivities,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Analiza AI a esuat.');
  return data;
}

function buildDraftPayload(candidate: IndexedDeliverableCandidate, expert: Expert) {
  const monthIndex = candidate.reportingMonth - 1;
  const parsedDate = candidate.detectedDate ? new Date(`${candidate.detectedDate}T00:00:00`) : null;
  const detectedDate = parsedDate && parsedDate.getMonth() === monthIndex && parsedDate.getFullYear() === candidate.reportingYear ? candidate.detectedDate : undefined;
  const defaultHours = expert.oreZi ?? expert.dailyHours ?? expert.norma ?? 8;
  const deliverable: Deliverable = {
    id: `indexed-${candidate.id}`,
    fileName: candidate.fileName,
    originalFileName: candidate.originalFileName || candidate.fileName,
    fileType: candidate.mimeType,
    fileSize: candidate.fileSize,
    filePath: candidate.storagePath,
    s3Key: candidate.s3Key || candidate.storagePath,
    uploadedByExpertId: candidate.expertId,
    uploadedByExpertName: candidate.uploadedByName,
    expertId: candidate.expertId,
    projectCode: candidate.projectCode,
    month: monthIndex,
    year: candidate.reportingYear,
    activityDate: detectedDate,
    saCode: candidate.suggestedSaCode,
    deliverableType: candidate.suggestedType || 'livrabil',
    uploaded: true,
    uploadedAt: new Date().toISOString(),
    declaredTitle: candidate.suggestedTitle,
    docTitle: candidate.suggestedTitle,
    docText: candidate.extractedText,
    suggestedTitle: candidate.suggestedTitle,
    firstPageText: candidate.extractedTextPreview,
    firstPageTextHash: candidate.firstPageTextHash,
    contentFingerprint: candidate.contentFingerprint,
    titleSource: 'auto_detected',
    titleConfirmed: true,
    titleCheckStatus: 'matched',
    eligibilityCheck: {
      status: candidate.eligibilityStatus,
      score: candidate.eligibilityScore ?? 0,
      summary: candidate.eligibilityReason || 'Validat din fluxul de indexare livrabile.',
      checks: [],
      missingElements: [],
      recommendations: candidate.warnings ?? [],
      riskFlags: [],
    },
  };

  return {
    candidateId: candidate.id,
    expertId: candidate.expertId,
    month: monthIndex,
    year: candidate.reportingYear,
    selectedDates: detectedDate ? [detectedDate] : [],
    selectedHours: detectedDate ? { [detectedDate]: String(defaultHours) } : {},
    activity: {
      id: generateId(),
      expertId: candidate.expertId,
      expertName: expert.name,
      date: detectedDate || formatDate(new Date(candidate.reportingYear, monthIndex, 1)),
      hours: defaultHours,
      activityType: candidate.suggestedActivityName || candidate.suggestedTitle || candidate.fileName,
      catalogActivityId: candidate.suggestedActivityCatalogId,
      saCode: candidate.suggestedSaCode,
      title: candidate.suggestedTitle || candidate.suggestedActivityName || candidate.fileName,
      description: candidate.suggestedDescription || candidate.eligibilityReason || '',
      activitySummary: candidate.suggestedResult || candidate.suggestedTitle || candidate.fileName,
      activityKeywords: (candidate.keywords ?? []).join(', '),
      location: 'Birou',
      dayType: 'lucratoare',
      status: 'draft',
      projectCode: candidate.projectCode || expert.projectCode || '302141',
      deliverables: [deliverable],
    } satisfies Partial<Activity>,
  };
}

export function DeliverableIndexingLab() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const selectedMonth = Number(month);
  const selectedYear = Number(year);
  const { experts, isLoading: expertsLoading } = useExperts();
  const { catalog } = useActivityCatalog();
  const currentExpert = useMemo(() => {
    const normalizedEmail = signedInEmail?.toLowerCase();
    return experts.find((expert) => {
      if (signedInUserId && expert.id === signedInUserId) return true;
      if (normalizedEmail && expert.email?.toLowerCase() === normalizedEmail) return true;
      return false;
    }) ?? experts[0] ?? null;
  }, [experts, signedInEmail, signedInUserId]);
  const { activities } = useActivitiesByMonth(selectedMonth - 1, selectedYear);
  const visibleActivities = useMemo(() => activities.filter((activity) => !currentExpert?.id || activity.expertId === currentExpert.id), [activities, currentExpert?.id]);
  const visibleCatalog = useMemo(() => {
    const sourceCatalog = catalog.length > 0 ? catalog : fallbackActivityCatalog as ActivityCatalog[];
    const expertCategory = normalizeCatalogCategory(currentExpert?.category);
    const categoryCatalog = expertCategory
      ? sourceCatalog.filter((item) => normalizeCatalogCategory(item.category) === expertCategory)
      : sourceCatalog;
    const scopedCatalog = categoryCatalog.length > 0 ? categoryCatalog : sourceCatalog;
    const allowedSaCodes = new Set(currentExpert?.saCodes ?? []);
    if (allowedSaCodes.size === 0) return scopedCatalog;
    const saCatalog = scopedCatalog.filter((item) => allowedSaCodes.has(item.saCode));
    return saCatalog.length > 0 ? saCatalog : scopedCatalog;
  }, [catalog, currentExpert?.category, currentExpert?.saCodes]);
  const { candidates, isLoading: candidatesLoading, isUnavailable, mutate: refreshCandidates } = useIndexedDeliverableCandidates(currentExpert?.id ?? null, selectedMonth, selectedYear);
  const { create, update, remove } = useIndexedDeliverableCandidateMutations();

  useEffect(() => {
    let isMounted = true;
    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;
        if (!user) {
          router.replace('/auth/login?redirectTo=/expert/livrabile-indexare');
          return;
        }
        setSignedInUserId(user.id ?? null);
        setSignedInEmail(user.email ?? null);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        router.replace('/auth/login?redirectTo=/expert/livrabile-indexare');
      });
    return () => {
      isMounted = false;
    };
  }, [router]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return candidates;
    return candidates.filter((item) => [item.fileName, item.suggestedTitle, item.suggestedType, item.suggestedSaCode, item.suggestedActivityName, item.detectedDate, item.extractedTextPreview, ...(item.keywords ?? [])].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [candidates, query]);

  const summary = useMemo(() => {
    const total = filteredItems.length;
    const eligible = filteredItems.filter((item) => item.eligibilityStatus === 'eligibil').length;
    const review = filteredItems.filter((item) => item.eligibilityStatus === 'necesita_revizie').length;
    const averageScore = total ? Math.round(filteredItems.reduce((sum, item) => sum + (item.eligibilityScore ?? 0), 0) / total) : 0;
    return { total, eligible, review, averageScore };
  }, [filteredItems]);

  const saveAndAnalyzeFile = async (file: File, index: number, total: number) => {
    if (!currentExpert) throw new Error('Nu am gasit expertul curent.');
    configureAmplify();
    const extracted = await extractFileText(file);
    const extractedText = extracted.text.slice(0, 30000);
    const extractedTextPreview = (extracted.firstPageText || extracted.text).slice(0, 1500);
    const detectedDate = inferDate(file.name, extractedTextPreview);
    const suggestedTitle = titleFromFileName(file.name);
    const suggestedType = inferDeliverableType(file.name, extractedTextPreview);
    const keywords = extractKeywords(file.name, extractedTextPreview);
    const firstPageTextHash = await hashFirstPageText(extractedTextPreview);
    const contentFingerprint = normalizeDocumentTextForFingerprint(extractedTextPreview).slice(0, 500);
    const storagePath = `deliverable-index/${selectedYear}/${String(selectedMonth).padStart(2, '0')}/${currentExpert.id}/${Date.now()}-${safeFileName(file.name)}`;
    const uploaded = await uploadAuthenticatedData({ path: storagePath, data: file, options: { contentType: file.type || 'application/octet-stream' } }).result;
    const created = await create({
      owner: signedInUserId ?? currentExpert.id,
      expertId: currentExpert.id,
      uploadedBy: signedInUserId ?? currentExpert.id,
      uploadedByName: currentExpert.name,
      reportingMonth: selectedMonth,
      reportingYear: selectedYear,
      projectCode: currentExpert.projectCode ?? '302141',
      fileName: file.name,
      originalFileName: file.name,
      storagePath: uploaded.path,
      s3Key: uploaded.path,
      mimeType: file.type || 'application/octet-stream',
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      firstPageTextHash,
      contentFingerprint,
      extractedText,
      extractedTextPreview,
      detectedDate,
      suggestedTitle,
      suggestedType,
      eligibilityStatus: extractedText.trim().length >= 40 ? 'necesita_revizie' : 'neeligibil',
      eligibilityReason: extractedText.trim().length >= 40 ? 'Livrabil incarcat si citit. Analiza AI trebuie rulata pentru incadrare.' : 'Nu a fost extras text suficient pentru eligibilitate automata.',
      eligibilityScore: extractedText.trim().length >= 40 ? 35 : 10,
      confidence: 'low',
      alternativeMatches: [],
      keywords,
      warnings: extractedText.trim().length >= 40 ? [] : ['Text extras insuficient; necesita verificare manuala.'],
      notes: `Fisier ${index + 1}/${total} incarcat prin indexare bulk.`,
      ragUsed: false,
      status: 'indexed',
    });

    try {
      setAnalyzingId(created.id);
      const analysis = await analyzeCandidate({ candidate: created, expert: currentExpert, catalog: visibleCatalog, existingActivities: visibleActivities });
      await update(created.id, { ...analysis, status: analysis.eligibilityStatus === 'eligibil' ? 'approved_for_use' : 'needs_review' });
    } catch (analysisError) {
      await update(created.id, {
        status: 'needs_review',
        eligibilityStatus: 'necesita_revizie',
        eligibilityReason: analysisError instanceof Error ? analysisError.message : 'Analiza AI nu a putut fi finalizata.',
        warnings: ['Analiza AI nu a putut fi finalizata. Livrabilul ramane pentru revizie.'],
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const reanalyzeCandidate = async (candidate: IndexedDeliverableCandidate) => {
    if (!currentExpert) {
      setError('Nu am gasit expertul curent pentru reanalizare.');
      return;
    }
    setError(null);
    setAnalyzingId(candidate.id);
    try {
      const analysis = await analyzeCandidate({
        candidate,
        expert: currentExpert,
        catalog: visibleCatalog,
        existingActivities: visibleActivities,
      });
      await update(candidate.id, {
        ...analysis,
        status: analysis.eligibilityStatus === 'eligibil' ? 'approved_for_use' : 'needs_review',
      });
      await refreshCandidates();
    } catch (analysisError) {
      await update(candidate.id, {
        status: 'needs_review',
        eligibilityStatus: 'necesita_revizie',
        eligibilityReason: analysisError instanceof Error ? analysisError.message : 'Analiza AI nu a putut fi finalizata.',
        warnings: ['Analiza AI nu a putut fi finalizata. Livrabilul ramane pentru revizie.'],
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    if (!currentExpert) {
      setError('Nu am gasit expertul curent pentru indexare.');
      return;
    }
    if (visibleCatalog.length === 0) {
      setError('Catalogul de activitati nu este disponibil pentru expertul curent.');
      return;
    }
    setIsIndexing(true);
    setError(null);
    setProgress(0);
    try {
      for (const [index, file] of fileArray.entries()) {
        await saveAndAnalyzeFile(file, index, fileArray.length);
        setProgress(Math.round(((index + 1) / fileArray.length) * 100));
      }
      await refreshCandidates();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : 'Indexarea livrabilelor a esuat.');
    } finally {
      setIsIndexing(false);
      window.setTimeout(() => setProgress(0), 800);
    }
  };

  const approveCandidate = async (candidate: IndexedDeliverableCandidate) => {
    if (!currentExpert) return;
    const approved = await update(candidate.id, {
      status: 'approved_for_use',
      eligibilityStatus: candidate.eligibilityStatus === 'neeligibil' ? 'necesita_revizie' : candidate.eligibilityStatus,
      approvedAt: new Date().toISOString(),
      approvedBy: signedInUserId ?? currentExpert.id,
    });
    const draft = buildDraftPayload(approved, currentExpert);
    window.sessionStorage.setItem(`peo-agent-draft-${approved.id}`, JSON.stringify(draft));
    router.push(`/expert/peo?month=${draft.month}&year=${draft.year}&agentDraftId=${approved.id}`);
  };

  const isLoading = isAuthLoading || expertsLoading;

  if (isLoading) {
    return (
      <DashboardShell activeHref="/expert/livrabile-indexare" navItems={expertNavItems} eyebrow="Modul Expert" title="Indexare livrabile" description="Pregatim modulul separat de formularul lunar.">
        <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-dashed border-border bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell activeHref="/expert/livrabile-indexare" navItems={expertNavItems} eyebrow="Agent livrabile" title="Indexare livrabile" reportingMonth={`${getMonthName(selectedMonth - 1)} ${selectedYear}`} description="Incarci bulk fisierele lunii, agentul verifica eligibilitatea si propune drafturi de activitati. Formularul manual ramane neschimbat." actions={<UserMenu />}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><Upload className="h-5 w-5 text-primary" />Incarcare bulk pentru luna</CardTitle>
                <CardDescription>Fisierele se salveaza in Storage si candidatele se pastreaza in backend pe luna/an/expert.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[180px_140px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Luna</Label>
                    <Select value={month} onValueChange={setMonth} disabled={isIndexing}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTH_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>An</Label>
                    <Input value={year} onChange={(event) => setYear(event.target.value)} disabled={isIndexing} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cautare</Label>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="titlu, data, SA, cuvant cheie" className="pl-9" />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-primary/30 bg-[#f7fbff] p-6" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFiles(event.dataTransfer.files); }}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-white p-3 shadow-sm"><SearchIcon className="h-6 w-6 text-primary" /></div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-950">Zona de incarcare</h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">PDF, DOCX, XLSX, imagini si fisiere text sunt citite local, apoi agentul cere analiza AI pentru incadrare.</p>
                      </div>
                    </div>
                    <Input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); }} />
                    <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isIndexing || !currentExpert}>
                      {isIndexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Alege fisiere
                    </Button>
                  </div>
                  {isIndexing || progress > 0 ? (
                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700"><span>{analyzingId ? 'Agentul verifica eligibilitatea' : 'Agentul citeste fisierele'}</span><span>{progress}%</span></div>
                      <Progress value={progress} />
                    </div>
                  ) : null}
                  {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertTriangle className="h-4 w-4" />{error}</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-primary" />Drafturi propuse</CardTitle>
                <CardDescription>Sunt afisate doar candidatele pentru {getMonthName(selectedMonth - 1)} {selectedYear}.</CardDescription>
              </CardHeader>
              <CardContent>
                {candidatesLoading ? (
                  <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : isUnavailable ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Backend-ul pentru candidate nu este disponibil. Dupa deploy-ul Amplify al modelului nou, lista va fi persistenta.</div>
                ) : filteredItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-slate-50 px-4 py-10 text-center">
                    <FileArchive className="mx-auto h-8 w-8 text-muted-foreground" />
                    <h2 className="mt-3 text-base font-semibold text-slate-950">Nu exista livrabile indexate pentru luna selectata</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Incarca fisierele lunii ca sa vezi prima analiza si propunerile de activitate.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Livrabil</TableHead><TableHead>Propunere</TableHead><TableHead>Eligibilitate</TableHead><TableHead>Scor</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="max-w-[24rem] whitespace-normal">
                            <div className="font-semibold text-slate-950">{item.suggestedTitle || item.fileName}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{item.fileName} · {formatFileSize(item.fileSize)}</div>
                            <div className="mt-2 flex flex-wrap gap-1">{(item.keywords ?? []).slice(0, 5).map((keyword) => <Badge key={keyword} variant="outline" className="bg-white">{keyword}</Badge>)}</div>
                            {item.extractedTextPreview ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.extractedTextPreview}</p> : null}
                          </TableCell>
                          <TableCell className="max-w-[20rem] whitespace-normal"><div className="text-sm font-semibold">{item.suggestedSaCode || 'SA n/a'}</div><div className="mt-1 text-xs text-muted-foreground">{item.suggestedActivityName || item.suggestedType || 'Fara incadrare'}</div></TableCell>
                          <TableCell className="max-w-[20rem] whitespace-normal"><Badge variant={eligibilityVariant(item.eligibilityStatus)}>{eligibilityLabel(item.eligibilityStatus)}</Badge><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.eligibilityReason}</p></TableCell>
                          <TableCell><div className="w-28 space-y-1"><div className="text-xs font-semibold">{item.eligibilityScore ?? 0}%</div><Progress value={item.eligibilityScore ?? 0} /></div></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="ghost" size="sm" disabled={isIndexing || analyzingId === item.id} onClick={() => void reanalyzeCandidate(item)}>
                                {analyzingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Reanalizeaza
                              </Button>
                              <Button type="button" variant="outline" size="sm" disabled={isIndexing || item.eligibilityStatus === 'neeligibil'} onClick={() => void approveCandidate(item)}><CheckCircle2 className="h-4 w-4" />Foloseste draft</Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /><span className="sr-only">Sterge livrabil</span></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" />Rezumat luna</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-slate-50 p-3"><div className="text-2xl font-bold text-slate-950">{summary.total}</div><div className="text-xs text-muted-foreground">candidate</div></div>
                  <div className="rounded-md border border-border bg-slate-50 p-3"><div className="text-2xl font-bold text-slate-950">{summary.eligible}</div><div className="text-xs text-muted-foreground">eligibile</div></div>
                </div>
                <div className="space-y-2"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Scor mediu</span><span className="font-semibold">{summary.averageScore}%</span></div><Progress value={summary.averageScore} /></div>
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{summary.review} livrabile necesita revizie inainte de draft.</div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 text-primary" />Regula fluxului</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>Agentul recomanda, expertul decide. Activitatea finala se creeaza numai dupa validarea expertului si salvarea formularului.</p>
                <Textarea readOnly value="Livrabilele din indexare sunt filtrate pe luna. Un draft aprobat deschide formularul cu descriere, SA si livrabil atasat; tabul Livrabile ramane disponibil pentru completari." className="min-h-28 resize-none bg-slate-50 text-sm" />
              </CardContent>
            </Card>
          </aside>
        </div>
      </DashboardShell>
    </>
  );
}
