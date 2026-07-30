'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { BriefcaseBusiness, Loader2, Save, Upload } from 'lucide-react';
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

function getPositionKey(expert: Expert) {
  return expert.positionInProject?.trim() || '';
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
  if (!response.ok) throw new Error(data?.error || 'Nu am putut salva responsabilitatile pozitiei in proiect.');
}

export function PeoExpertCategoriesPanel() {
  const { experts, isLoading, mutate } = useExperts({ includeInactive: true });
  const activeExperts = useMemo(
    () => experts.filter((expert) => expert.isActive !== false),
    [experts],
  );
  const projectPositions = useMemo(
    () => unique(activeExperts.map(getPositionKey)),
    [activeExperts],
  );
  const [projectPosition, setProjectPosition] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchingExperts = useMemo(
    () => activeExperts.filter((expert) => getPositionKey(expert) === projectPosition),
    [activeExperts, projectPosition],
  );

  useEffect(() => {
    const savedResponsibilities = matchingExperts.find((expert) => expert.jobDescriptionText?.trim())?.jobDescriptionText;
    setResponsibilities(savedResponsibilities || '');
    setPdfName('');
  }, [projectPosition, matchingExperts]);

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
    if (!projectPosition) {
      setError('Alege o pozitie in proiect.');
      return;
    }
    if (!responsibilities.trim()) {
      setError('Completeaza responsabilitatile pentru pozitia selectata.');
      return;
    }
    if (matchingExperts.length === 0) {
      setError('Nu exista experti activi cu pozitia selectata.');
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
      setMessage(`Responsabilitatile au fost salvate pentru ${matchingExperts.length} expert(i) cu pozitia ${projectPosition}.`);
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
              <Label>Pozitie in proiect</Label>
              <Select value={projectPosition} onValueChange={setProjectPosition} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege pozitia" />
                </SelectTrigger>
                <SelectContent>
                  {projectPositions.map((item) => (
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

          {projectPosition ? (
            <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
              Pozitia selectata are {matchingExperts.length} expert(i) activ(i). Salvarea aplica responsabilitatile pe profilurile lor, iar Anexa 10 le preia automat.
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
              placeholder="Completeaza responsabilitatile pozitiei in proiect sau incarca fisa postului PDF pentru extragere text."
            />
          </div>

          <Button type="button" onClick={saveCategoryResponsibilities} disabled={saving || extractingPdf}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salveaza responsabilitatile pozitiei
          </Button>

          <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
            „Activitate prestata” ramane generata din summary-ul work block-ului si trece prin deduplicare la export, ca sa evite textele repetate in tabel.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
