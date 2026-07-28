'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileArchive,
  FileText,
  Loader2,
  SearchIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { AdminViewAsBanner } from '@/components/admin/admin-view-as-banner';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { UserMenu } from '@/components/user-menu';
import { getSignedInUser } from '@/lib/aws/auth';
import { getMonthName } from '@/lib/backend-store';

type IndexedDeliverableStatus = 'indexed' | 'needs_review' | 'unsupported';

type IndexedDeliverable = {
  id: string;
  fileName: string;
  extension: string;
  size: number;
  month: number;
  year: number;
  status: IndexedDeliverableStatus;
  confidence: number;
  inferredTitle: string;
  suggestedType: string;
  keywords: string[];
  extractedDate?: string;
  textPreview?: string;
  notes?: string;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: getMonthName(index),
}));

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'xml', 'html', 'rtf']);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const PDF_EXTENSIONS = new Set(['pdf']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff']);

function safeStorageKey(month: number, year: number) {
  return `deliverable-indexing-lab-${year}-${String(month).padStart(2, '0')}`;
}

function fileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || 'unknown';
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

function inferDate(fileName: string, text: string) {
  const haystack = `${fileName} ${text}`;
  const iso = haystack.match(/\b(20\d{2})[-_.](0?[1-9]|1[0-2])[-_.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const ro = haystack.match(/\b(0?[1-9]|[12]\d|3[01])[-_.](0?[1-9]|1[0-2])[-_.](20\d{2})\b/);
  if (ro) {
    return `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}`;
  }

  return undefined;
}

function extractKeywords(fileName: string, text: string) {
  const ignored = new Set([
    'pentru',
    'privind',
    'raport',
    'livrabil',
    'document',
    'final',
    'draft',
    'luna',
    'proiect',
    'concordia',
  ]);
  const words = `${fileName} ${text}`
    .toLowerCase()
    .replace(/[^a-z0-9ăâîșț\s-]/gi, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !ignored.has(word));

  const counts = new Map<string, number>();
  words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return Array.from(counts.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 6)
    .map(([word]) => word);
}

function statusLabel(status: IndexedDeliverableStatus) {
  if (status === 'indexed') return 'Indexat';
  if (status === 'needs_review') return 'De revizuit';
  return 'Metadate doar';
}

function statusVariant(status: IndexedDeliverableStatus) {
  if (status === 'indexed') return 'conform';
  if (status === 'needs_review') return 'cu_observatii';
  return 'outline';
}

async function readFilePreview(file: File) {
  const extension = fileExtension(file.name);
  if (!TEXT_EXTENSIONS.has(extension)) return '';

  const text = await file.text();
  return text.replace(/\s+/g, ' ').trim().slice(0, 900);
}

async function indexFile(file: File, month: number, year: number): Promise<IndexedDeliverable> {
  const extension = fileExtension(file.name);
  const textPreview = await readFilePreview(file);
  const hasReadableText = textPreview.length > 20;
  const isKnownBinary = PDF_EXTENSIONS.has(extension) || OFFICE_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension);
  const extractedDate = inferDate(file.name, textPreview);
  const title = titleFromFileName(file.name);
  const keywords = extractKeywords(file.name, textPreview);
  const confidence = Math.min(
    96,
    35
      + (hasReadableText ? 35 : 0)
      + (extractedDate ? 12 : 0)
      + (keywords.length >= 3 ? 10 : keywords.length * 2)
      + (isKnownBinary ? 4 : 0),
  );

  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    fileName: file.name,
    extension,
    size: file.size,
    month,
    year,
    status: hasReadableText ? 'indexed' : isKnownBinary ? 'needs_review' : 'unsupported',
    confidence,
    inferredTitle: title || file.name,
    suggestedType: inferDeliverableType(file.name, textPreview),
    keywords,
    extractedDate,
    textPreview: textPreview || undefined,
    notes: hasReadableText
      ? 'Text extras local din fisier.'
      : isKnownBinary
        ? 'Fisier recunoscut. In acest MVP se indexeaza metadatele si numele; extragerea OCR/PDF/DOCX poate fi conectata ulterior.'
        : 'Tip de fisier necunoscut; pastrez doar metadatele.',
  };
}

export function DeliverableIndexingLab() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [items, setItems] = useState<IndexedDeliverable[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const selectedMonth = Number(month);
  const selectedYear = Number(year);
  const storageKey = safeStorageKey(selectedMonth, selectedYear);

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;
        if (!user) {
          router.replace('/auth/login?redirectTo=/expert/livrabile-indexare');
          return;
        }
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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setItems(saved ? JSON.parse(saved) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const monthItems = items.filter((item) => item.month === selectedMonth && item.year === selectedYear);
    if (!normalizedQuery) return monthItems;

    return monthItems.filter((item) =>
      [
        item.fileName,
        item.inferredTitle,
        item.suggestedType,
        item.extractedDate,
        item.textPreview,
        ...item.keywords,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [items, query, selectedMonth, selectedYear]);

  const summary = useMemo(() => {
    const total = filteredItems.length;
    const indexed = filteredItems.filter((item) => item.status === 'indexed').length;
    const needsReview = filteredItems.filter((item) => item.status === 'needs_review').length;
    const averageConfidence = total
      ? Math.round(filteredItems.reduce((sum, item) => sum + item.confidence, 0) / total)
      : 0;

    return { total, indexed, needsReview, averageConfidence };
  }, [filteredItems]);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsIndexing(true);
    setError(null);
    setProgress(0);

    try {
      const nextItems: IndexedDeliverable[] = [];
      for (const [index, file] of fileArray.entries()) {
        nextItems.push(await indexFile(file, selectedMonth, selectedYear));
        setProgress(Math.round(((index + 1) / fileArray.length) * 100));
      }

      setItems((current) => [...nextItems, ...current]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : 'Indexarea livrabilelor a esuat.');
    } finally {
      setIsIndexing(false);
      window.setTimeout(() => setProgress(0), 800);
    }
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const clearCurrentMonth = () => {
    setItems((current) => current.filter((item) => item.month !== selectedMonth || item.year !== selectedYear));
  };

  if (isAuthLoading) {
    return (
      <DashboardShell
        activeHref="/expert/livrabile-indexare"
        navItems={expertNavItems}
        eyebrow="Modul Expert"
        title="Indexare livrabile"
        description="Pregatim modulul separat de formularul lunar."
      >
        <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-dashed border-border bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <>
      <AdminViewAsBanner />
      <DashboardShell
        activeHref="/expert/livrabile-indexare"
        navItems={expertNavItems}
        eyebrow="Agent livrabile"
        title="Indexare livrabile"
        reportingMonth={`${getMonthName(selectedMonth - 1)} ${selectedYear}`}
        description="Incarci bulk fisierele lunii, iar agentul face o prima citire locala si creeaza candidate pentru livrabile existente. Formularul de pontaj nu este modificat."
        actions={<UserMenu />}
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Upload className="h-5 w-5 text-primary" />
                  Incarcare bulk pentru luna
                </CardTitle>
                <CardDescription>
                  Fisierele sunt citite in browser si tinute ca index separat pentru luna selectata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[180px_140px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Luna</Label>
                    <Select value={month} onValueChange={setMonth} disabled={isIndexing}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>An</Label>
                    <Input value={year} onChange={(event) => setYear(event.target.value)} disabled={isIndexing} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cautare in index</Label>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="titlu, data, tip, cuvant cheie"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-lg border border-dashed border-primary/30 bg-[#f7fbff] p-6"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleFiles(event.dataTransfer.files);
                  }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-white p-3 shadow-sm">
                        <SearchIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-950">Zona de incarcare</h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                          Trage fisiere aici sau alege-le din calculator. PDF/DOCX/XLSX primesc metadate in MVP;
                          TXT/CSV/MD/JSON primesc si text extras.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files) void handleFiles(event.target.files);
                        }}
                      />
                      <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isIndexing}>
                        {isIndexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Alege fisiere
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={clearCurrentMonth}
                        disabled={isIndexing || filteredItems.length === 0}
                      >
                        <Trash2 className="h-4 w-4" />
                        Goleste luna
                      </Button>
                    </div>
                  </div>

                  {isIndexing || progress > 0 ? (
                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Agentul citeste fisierele</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  ) : null}

                  {error ? (
                    <div className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertTriangle className="h-4 w-4" />
                      {error}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-5 w-5 text-primary" />
                  Livrabile candidate
                </CardTitle>
                <CardDescription>
                  Aceste rezultate sunt vizibile doar in modulul de indexare pentru luna curenta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-slate-50 px-4 py-10 text-center">
                    <FileArchive className="mx-auto h-8 w-8 text-muted-foreground" />
                    <h2 className="mt-3 text-base font-semibold text-slate-950">Nu exista livrabile indexate pentru luna selectata</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Incarca un set de fisiere ca sa vezi prima citire si propunerile de clasificare.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fisier</TableHead>
                        <TableHead>Tip sugerat</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Incredere</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="max-w-[24rem] whitespace-normal">
                            <div className="flex items-start gap-3">
                              <FileText className="mt-1 h-4 w-4 shrink-0 text-primary" />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-950">{item.inferredTitle}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.fileName} · {formatFileSize(item.size)}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.keywords.map((keyword) => (
                                    <Badge key={keyword} variant="outline" className="bg-white">
                                      {keyword}
                                    </Badge>
                                  ))}
                                </div>
                                {item.textPreview ? (
                                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {item.textPreview}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{item.suggestedType}</Badge>
                          </TableCell>
                          <TableCell>{item.extractedDate || 'n/a'}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="w-28 space-y-1">
                              <div className="text-xs font-semibold">{item.confidence}%</div>
                              <Progress value={item.confidence} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Sterge livrabil</span>
                            </Button>
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Rezumat luna
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-slate-50 p-3">
                    <div className="text-2xl font-bold text-slate-950">{summary.total}</div>
                    <div className="text-xs text-muted-foreground">livrabile candidate</div>
                  </div>
                  <div className="rounded-md border border-border bg-slate-50 p-3">
                    <div className="text-2xl font-bold text-slate-950">{summary.indexed}</div>
                    <div className="text-xs text-muted-foreground">cu text citit</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Incredere medie</span>
                    <span className="font-semibold">{summary.averageConfidence}%</span>
                  </div>
                  <Progress value={summary.averageConfidence} />
                </div>
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {summary.needsReview} fisiere necesita extragere avansata sau verificare manuala.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Urmatorul pas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  Dupa ce validam calitatea indexarii, putem conecta aceste candidate la selectorul
                  “Livrabile existente” si le filtram strict dupa luna.
                </p>
                <Textarea
                  readOnly
                  value="Regula propusa: livrabilele indexate pentru Iunie 2026 apar doar cand formularul este pe Iunie 2026. Salvarea in activitate ramane confirmata manual."
                  className="min-h-24 resize-none bg-slate-50 text-sm"
                />
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Formularul de pontaj ramane neatins in acest MVP.
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </DashboardShell>
    </>
  );
}
