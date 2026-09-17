'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { eligibilityRequest } from '@/lib/eligibility-client';
import type { Expert } from '@/lib/types';

type Readiness = { enabled: boolean; runtimeReady: boolean; ready: boolean; model: string;
  ruleset: { id: string; version: number } | null; missingCriteriaSources: string[];
  sources: Array<{ id: string; title: string; version: string; published: boolean; extractionComplete: boolean }> };

export function PeoEligibilityAgentPanel({ experts = [] }: { experts?: Expert[] }) {
  const [expertId, setExpertId] = useState('');
  const [saCode, setSaCode] = useState('');
  const [result, setResult] = useState<Readiness | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const expert = experts.find((item) => item.id === expertId);
  async function diagnose() {
    setPending(true); setError(''); setResult(null);
    try { setResult(await eligibilityRequest('/api/eligibility/readiness', { expertId, saCode })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Diagnosticul nu este disponibil.'); }
    finally { setPending(false); }
  }
  return <section className="space-y-3 rounded-md border bg-white p-5" aria-label="Pregatire agent eligibilitate">
    <h2 className="text-lg font-bold">Agentul de eligibilitate: surse și diagnostic</h2>
    <p className="text-sm text-muted-foreground">Verifică sursele și cerințele disponibile înaintea evaluării. Diagnosticul nu apelează modelul AI. Decizia PM rămâne separată de evaluarea documentelor.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Expert pentru diagnostic" className="rounded-md border p-2" value={expertId} onChange={(event) => { setExpertId(event.target.value); setSaCode(''); setResult(null); }}>
        <option value="">Alege expertul</option>{experts.filter((item) => item.isActive !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select aria-label="SA pentru diagnostic" className="rounded-md border p-2" value={saCode} onChange={(event) => { setSaCode(event.target.value); setResult(null); }}>
        <option value="">Alege SA</option>{expert?.saCodes?.map((sa) => <option key={sa} value={sa}>{sa}</option>)}
      </select>
      <Button type="button" disabled={pending || !expertId || !saCode} onClick={diagnose}>{pending ? 'Se verifică…' : 'Verifică pregătirea'}</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {result ? <div className="space-y-2 text-sm" role="status">
      <p className="font-semibold">{result.ready ? 'Context pregătit pentru cerințele generale.' : 'Configurarea necesită completare.'}</p>
      <p>{result.enabled ? 'Evaluarea este activată pe server.' : 'Evaluarea este dezactivată pe server.'} {!result.runtimeReady ? 'Infrastructura agentului necesită publicare.' : ''}</p>
      {!result.ruleset ? <p>Publică un registru de cerințe aprobat pentru proiect.</p> : <p>Versiunea cerințelor: {result.ruleset.version}.</p>}
      {result.missingCriteriaSources.length ? <p>Surse lipsă pentru: {result.missingCriteriaSources.join(', ')}.</p> : null}
      <ul className="list-disc pl-5">{result.sources.map((source) => <li key={source.id}>{source.title} — {source.published && source.extractionComplete ? 'publicată și extrasă' : 'necesită procesare'}.</li>)}</ul>
      <p className="text-muted-foreground">Cerințele specifice activității se verifică după încadrare. Agentul poate consulta documentele și sursele permise. Salvarea în ciornă rămâne disponibilă când AI nu răspunde.</p>
    </div> : null}
  </section>;
}
