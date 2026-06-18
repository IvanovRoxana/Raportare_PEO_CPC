'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';

type AiStatusResponse = {
  ok: boolean;
  provider: string;
  model: string;
  configured: {
    apiKey: boolean;
    deliverableEligibilityCheck: boolean;
  };
  governance: {
    auditLog: string;
    auditLogToConsole: boolean;
    failClosed: boolean;
    rateLimitPerMinute: number;
    rateLimitPerDay: number;
    dailyCostLimitUsd: number;
    monthlyCostLimitUsd: number;
    requestCostLimitUsd: number;
  };
};

export function AiApiStatusPanel() {
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/status', { cache: 'no-store' });
      const data = (await response.json()) as AiStatusResponse;
      setStatus(data);

      if (!response.ok && response.status !== 503) {
        setError('Statusul AI nu a putut fi citit. Verifică logurile aplicației.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statusul AI nu a putut fi citit.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const configured = Boolean(status?.configured.apiKey);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : configured ? (
                  <CheckCircle2 className="h-5 w-5 text-[#087a63]" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                Status API AI
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Verificare server-side pentru cheia OpenAI și limitele de guvernanță. Cheia nu este afișată niciodată în browser.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadStatus} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Reîncarcă
            </Button>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <StatusRow label="Conexiune AI" value={configured ? 'Configurată' : 'Cheie lipsă'} ok={configured} />
                <StatusRow label="Provider" value={status?.provider || 'openai'} ok />
                <StatusRow label="Model" value={status?.model || 'gpt-4o-mini'} ok />
                <StatusRow
                  label="Eligibilitate livrabile"
                  value={status?.configured.deliverableEligibilityCheck ? 'Activă' : 'Inactivă'}
                  ok={Boolean(status?.configured.deliverableEligibilityCheck)}
                  neutral={!status?.configured.deliverableEligibilityCheck}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-200 bg-amber-50/70">
          <CardHeader>
            <CardTitle className="text-base">Unde se introduce cheia API?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-amber-950">
            <p>
              Cheia OpenAI se configurează doar ca variabilă de mediu server-side, nu în dashboard, ca să nu fie salvată sau expusă în interfață.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Local: creează/actualizează <code className="rounded bg-white px-1 py-0.5">.env.local</code> cu{' '}
                <code className="rounded bg-white px-1 py-0.5">OPENAI_API_KEY=...</code>.
              </li>
              <li>
                Producție: adaugă <code className="rounded bg-white px-1 py-0.5">OPENAI_API_KEY</code> în AWS Amplify Hosting → Environment variables / Secrets.
              </li>
              <li>După modificare, redeploy/restart și revino aici pentru verificarea statusului.</li>
            </ol>
            <a
              className="inline-flex items-center gap-2 font-semibold text-amber-900 underline underline-offset-4"
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
            >
              Deschide pagina OpenAI API keys
              <span aria-hidden="true">↗</span>
            </a>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Guvernanță și limite active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoPill label="Audit log" value={status?.governance.auditLog || 'data/audit/ai-audit.ndjson'} />
            <InfoPill label="Rate limit / minut" value={String(status?.governance.rateLimitPerMinute ?? 20)} />
            <InfoPill label="Rate limit / zi" value={String(status?.governance.rateLimitPerDay ?? 500)} />
            <InfoPill label="Cost maxim / cerere" value={`$${status?.governance.requestCostLimitUsd ?? 2}`} />
            <InfoPill label="Cost maxim / zi" value={`$${status?.governance.dailyCostLimitUsd ?? 25}`} />
            <InfoPill label="Cost maxim / lună" value={`$${status?.governance.monthlyCostLimitUsd ?? 300}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, value, ok, neutral = false }: { label: string; value: string; ok: boolean; neutral?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-white p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <StatusBadge status={neutral ? 'informativ' : ok ? 'deschisa' : 'cu_observatii'}>{value}</StatusBadge>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}
