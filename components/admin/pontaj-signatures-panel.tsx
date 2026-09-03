'use client';

import { useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Save, SearchIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useExperts } from '@/hooks/use-backend-data';
import { expertIdentityKey } from '@/lib/expert-merge';
import type { Expert } from '@/lib/types';

type SignatureDraft = {
  managerName: string;
  managerTitle: string;
  legalRepresentativeName: string;
  legalRepresentativeTitle: string;
  authorizedRepresentativeName: string;
  authorizedRepresentativeTitle: string;
};

const emptyDraft: SignatureDraft = {
  managerName: '',
  managerTitle: '',
  legalRepresentativeName: '',
  legalRepresentativeTitle: '',
  authorizedRepresentativeName: '',
  authorizedRepresentativeTitle: '',
};

function buildDraft(expert: Expert): SignatureDraft {
  return {
    managerName: expert.managerName || '',
    managerTitle: expert.managerTitle || '',
    legalRepresentativeName: expert.legalRepresentativeName || '',
    legalRepresentativeTitle: expert.legalRepresentativeTitle || '',
    authorizedRepresentativeName: expert.authorizedRepresentativeName || '',
    authorizedRepresentativeTitle: expert.authorizedRepresentativeTitle || '',
  };
}

function normalizeDraft(draft: SignatureDraft): SignatureDraft {
  return {
    managerName: draft.managerName.trim(),
    managerTitle: draft.managerTitle.trim(),
    legalRepresentativeName: draft.legalRepresentativeName.trim(),
    legalRepresentativeTitle: draft.legalRepresentativeTitle.trim(),
    authorizedRepresentativeName: draft.authorizedRepresentativeName.trim(),
    authorizedRepresentativeTitle: draft.authorizedRepresentativeTitle.trim(),
  };
}

function signatureSummary(expert: Expert) {
  if (expert.legalRepresentativeName) return `Reprezentant legal: ${expert.legalRepresentativeName}`;
  if (expert.authorizedRepresentativeName) return `Imputernicit: ${expert.authorizedRepresentativeName}`;
  if (expert.managerName) return `Manager: ${expert.managerName}`;
  return 'Fallback template: MIHAELA GRIGORAS';
}

function buildExpertCreateInput(expert: Expert, updates: Partial<Expert>): Omit<Expert, 'id'> {
  return {
    userId: expert.userId,
    name: updates.name || expert.name,
    role: updates.role || expert.role || 'Expert',
    email: updates.email ?? expert.email,
    phone: updates.phone ?? expert.phone,
    avatarUrl: updates.avatarUrl ?? expert.avatarUrl,
    category: updates.category ?? expert.category,
    norma: expert.norma ?? 8,
    normType: expert.normType,
    oreZi: expert.oreZi,
    dailyHours: expert.dailyHours,
    manualMonthlyNorm: expert.manualMonthlyNorm,
    projectMonthlyNorm: expert.projectMonthlyNorm,
    basePositionConcordia: expert.basePositionConcordia,
    positionInProject: updates.positionInProject ?? expert.positionInProject,
    projectCode: updates.projectCode ?? expert.projectCode,
    projectTitle: updates.projectTitle ?? expert.projectTitle,
    contractNumber: updates.contractNumber ?? expert.contractNumber,
    contractType: updates.contractType ?? expert.contractType,
    expertExperienceCategory: updates.expertExperienceCategory ?? expert.expertExperienceCategory,
    hourlyRate: updates.hourlyRate ?? expert.hourlyRate,
    managerName: updates.managerName ?? expert.managerName,
    managerTitle: updates.managerTitle ?? expert.managerTitle,
    legalRepresentativeName: updates.legalRepresentativeName ?? expert.legalRepresentativeName,
    legalRepresentativeTitle: updates.legalRepresentativeTitle ?? expert.legalRepresentativeTitle,
    authorizedRepresentativeName: updates.authorizedRepresentativeName ?? expert.authorizedRepresentativeName,
    authorizedRepresentativeTitle: updates.authorizedRepresentativeTitle ?? expert.authorizedRepresentativeTitle,
    jobDescriptionText: updates.jobDescriptionText ?? expert.jobDescriptionText,
    aiReportingInstructions: updates.aiReportingInstructions ?? expert.aiReportingInstructions,
    beneficiary: updates.beneficiary ?? expert.beneficiary,
    saCodes: updates.saCodes ?? expert.saCodes ?? [],
    hasPmAccess: updates.hasPmAccess ?? expert.hasPmAccess ?? false,
    cognitoGroups: updates.cognitoGroups ?? expert.cognitoGroups,
    isActive: updates.isActive ?? expert.isActive ?? true,
  };
}

async function getAccessToken() {
  const token = (await fetchAuthSession({ forceRefresh: true })).tokens?.accessToken?.toString();
  if (!token) throw new Error('Nu am gasit sesiunea Cognito curenta.');
  return token;
}

async function writeExpertSignatures({
  action,
  expert,
  input,
  token,
}: {
  action: 'create' | 'update';
  expert: Expert;
  input: Partial<Expert>;
  token: string;
}) {
  const response = await fetch('/api/admin/experts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      action,
      id: action === 'update' ? expert.id : undefined,
      input: action === 'update' ? input : buildExpertCreateInput(expert, input),
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Nu am putut salva semnaturile pentru pontaj.');
  return data?.data as Expert;
}

export function PontajSignaturesPanel() {
  const { experts, isLoading, mutate } = useExperts({ includeInactive: true });
  const {
    experts: persistedExperts,
    isLoading: isLoadingPersistedExperts,
    mutate: mutatePersistedExperts,
  } = useExperts({ includeInactive: true, includeFallback: false });
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, SignatureDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persistedExpertsByKey = useMemo(
    () => new Map(persistedExperts.map((expert) => [expertIdentityKey(expert), expert])),
    [persistedExperts],
  );
  const visibleExperts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ro-RO');
    return experts
      .filter((expert) => expert.isActive !== false)
      .filter((expert) => {
        if (!normalizedQuery) return true;
        return [
          expert.name,
          expert.email || '',
          expert.positionInProject || '',
          expert.role || '',
          signatureSummary(expert),
        ].join(' ').toLocaleLowerCase('ro-RO').includes(normalizedQuery);
      });
  }, [experts, query]);

  function getDraft(expert: Expert) {
    return drafts[expert.id] ?? buildDraft(expert);
  }

  function updateDraft(expert: Expert, field: keyof SignatureDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [expert.id]: {
        ...(current[expert.id] ?? buildDraft(expert)),
        [field]: value,
      },
    }));
  }

  async function saveExpert(expert: Expert) {
    const nextDraft = normalizeDraft(getDraft(expert));
    const hasApprover = Boolean(nextDraft.managerName || nextDraft.legalRepresentativeName || nextDraft.authorizedRepresentativeName);
    if (!hasApprover) {
      setError(`Completeaza cel putin un semnatar pentru ${expert.name}.`);
      setMessage(null);
      return;
    }

    setSavingId(expert.id);
    setError(null);
    setMessage(null);

    try {
      const token = await getAccessToken();
      const persistedExpert = persistedExpertsByKey.get(expertIdentityKey(expert));
      const writableExpert = persistedExpert ?? expert;
      const saved = await writeExpertSignatures({
        action: persistedExpert ? 'update' : 'create',
        expert: writableExpert,
        input: nextDraft,
        token,
      });

      await mutate();
      await mutatePersistedExperts();
      setDrafts((current) => ({ ...current, [expert.id]: buildDraft({ ...expert, ...saved, ...nextDraft }) }));
      setMessage(`Semnaturile pentru ${expert.name} au fost salvate. Exportul pontajului le va prelua automat.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Salvarea semnaturilor a esuat.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Semnaturi pontaj
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configureaza semnatarii folositi in blocul final din Pontaj PEO si Pontaj consolidat.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full max-w-md space-y-2">
              <Label htmlFor="pontaj-signatures-search">Cauta expert</Label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pontaj-signatures-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Nume, email, functie sau semnatar"
                />
              </div>
            </div>
            <Badge variant="secondary" className="w-fit">{visibleExperts.length} experti activi</Badge>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Eroare</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {message ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Salvat</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Expert</TableHead>
                  <TableHead className="min-w-[260px]">Manager proiect</TableHead>
                  <TableHead className="min-w-[260px]">Reprezentant legal</TableHead>
                  <TableHead className="min-w-[260px]">Imputernicit</TableHead>
                  <TableHead className="w-[120px] text-right">Actiune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isLoadingPersistedExperts ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : null}
                {!isLoading && !isLoadingPersistedExperts && visibleExperts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nu exista experti pentru filtrul curent.
                    </TableCell>
                  </TableRow>
                ) : null}
                {!isLoading && !isLoadingPersistedExperts && visibleExperts.map((expert) => {
                  const draft = getDraft(expert);
                  const persisted = persistedExpertsByKey.has(expertIdentityKey(expert));
                  const isSaving = savingId === expert.id;

                  return (
                    <TableRow key={expert.id}>
                      <TableCell className="align-top">
                        <div className="font-medium text-slate-950">{expert.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{expert.positionInProject || expert.role || '-'}</div>
                        <div className="mt-2 text-xs text-slate-600">{signatureSummary(expert)}</div>
                        {!persisted ? <Badge variant="outline" className="mt-2">va fi persistat</Badge> : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid gap-2">
                          <Input
                            value={draft.managerName}
                            onChange={(event) => updateDraft(expert, 'managerName', event.target.value)}
                            placeholder="Nume manager proiect"
                          />
                          <Input
                            value={draft.managerTitle}
                            onChange={(event) => updateDraft(expert, 'managerTitle', event.target.value)}
                            placeholder="Functie manager"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid gap-2">
                          <Input
                            value={draft.legalRepresentativeName}
                            onChange={(event) => updateDraft(expert, 'legalRepresentativeName', event.target.value)}
                            placeholder="Nume reprezentant legal"
                          />
                          <Input
                            value={draft.legalRepresentativeTitle}
                            onChange={(event) => updateDraft(expert, 'legalRepresentativeTitle', event.target.value)}
                            placeholder="Functie reprezentant"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid gap-2">
                          <Input
                            value={draft.authorizedRepresentativeName}
                            onChange={(event) => updateDraft(expert, 'authorizedRepresentativeName', event.target.value)}
                            placeholder="Nume imputernicit"
                          />
                          <Input
                            value={draft.authorizedRepresentativeTitle}
                            onChange={(event) => updateDraft(expert, 'authorizedRepresentativeTitle', event.target.value)}
                            placeholder="Functie imputernicit"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button type="button" size="sm" onClick={() => void saveExpert(expert)} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Salveaza
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
