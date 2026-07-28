'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { BriefcaseBusiness, FileText, Loader2, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useExperts } from '@/hooks/use-backend-data';
import { extractPdfTextWithSource } from '@/lib/document-utils';
import type { Expert } from '@/lib/types';

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function getCategoryKey(expert: Expert) {
  return expert.expertExperienceCategory?.trim() || expert.category?.trim() || '';
}

async function getAccessToken() {
  const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
  if (!token) throw new Error('Nu am gasit sesiunea Cognito curenta.');
  return token;
}

async function updateExpertJobDescription(expertId: string, jobDescriptionText: string, token: string) {
  const response = await fetch('/api/admin/experts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      action: 'update',
      id: expertId,
      input: { jobDescriptionText },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Nu am putut salva responsabilitatile categoriei.');
}

export function PeoExpertCategoriesPanel() {
  const { experts, isLoading, mutate } = useExperts({ includeInactive: true });
  const activeExperts = useMemo(
    () => experts.filter((expert) => expert.isActive !== false),
    [experts],
  );
  const categories = useMemo(
    () => unique(activeExperts.map(getCategoryKey)),
    [activeExperts],
  );
  const [category, setCategory] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchingExperts = useMemo(
    () => activeExperts.filter((expert) => getCategoryKey(expert) === category),
    [activeExperts, category],
  );

  useEffect(() => {
    const savedResponsibilities = matchingExperts.find((expert) => expert.jobDescriptionText?.trim())?.jobDescriptionText;
    setResponsibilities(savedResponsibilities || '');
    setPdfName('');
  }, [category, matchingExperts]);

  async function handlePdfUpload(file?: File | null) {
    if (!file) return;
    setExtractingPdf(true);
    setError(null);
    setMessage(null);
    setPdfName(file.name);
    try {
      const result = await extractPdfTextWithSource(file);
      if (!result.text?.trim()) {
        throw new Error('Nu am putut extrage text util din PDF. Completeaza responsabilitatile manual.');
      }
      setResponsibilities(result.text.trim());
      setMessage(`Text extras din ${file.name}. Revizuieste responsabilitatile inainte de salvare.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Extragerea textului din PDF a esuat.');
    } finally {
      setExtractingPdf(false);
    }
  }

  async function saveCategoryResponsibilities() {
    if (!category) {
      setError('Alege o categorie expert PEO.');
      return;
    }
    if (!responsibilities.trim()) {
      setError('Completeaza responsabilitatile pentru categoria selectata.');
      return;
    }
    if (matchingExperts.length === 0) {
      setError('Nu exista experti activi in categoria selectata.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAccessToken();
      await Promise.all(matchingExperts.map((expert) => (
        updateExpertJobDescription(expert.id, responsibilities.trim(), token)
      )));
      await mutate();
      setMessage(`Responsabilitatile au fost salvate pentru ${matchingExperts.length} expert(i) din categoria ${category}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Salvarea responsabilitatilor a esuat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
            Categorii experti PEO
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configureaza responsabilitatile folosite in coloana Anexa 10 „Responsabilitati si sarcini conform contractului / fisei postului”.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <Label>Categorie expert</Label>
              <Select value={category} onValueChange={setCategory} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="peo-category-job-description-pdf">Fisa postului PDF</Label>
              <Input
                id="peo-category-job-description-pdf"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => void handlePdfUpload(event.target.files?.[0])}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" disabled={extractingPdf}>
                {extractingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {pdfName || 'PDF'}
              </Button>
            </div>
          </div>

          {category ? (
            <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
              Categoria selectata are {matchingExperts.length} expert(i) activ(i). Salvarea aplica responsabilitatile pe profilurile lor, iar Anexa 10 le preia automat.
            </div>
          ) : null}

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}

          <div className="space-y-2">
            <Label htmlFor="peo-category-responsibilities">Responsabilitati</Label>
            <Textarea
              id="peo-category-responsibilities"
              rows={10}
              value={responsibilities}
              onChange={(event) => setResponsibilities(event.target.value)}
              placeholder="Completeaza responsabilitatile categoriei sau incarca fisa postului PDF pentru extragere text."
            />
          </div>

          <Button type="button" onClick={saveCategoryResponsibilities} disabled={saving || extractingPdf}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salveaza responsabilitatile categoriei
          </Button>

          <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
            „Activitate prestata” ramane generata din summary-ul work block-ului si trece prin deduplicare la export, ca sa evite textele repetate in tabel.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
