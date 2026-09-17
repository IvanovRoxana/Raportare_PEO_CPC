'use client';

import { useState } from 'react';
import { useAuditLogs, useDocuments, useAiEligibilityRulesets } from '@/hooks/use-backend-data';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DataRecordsPanel() {
  const { documents, isLoading, isUnavailable, error } = useDocuments();
  const { auditLogs, isLoading: loadingAudit, error: auditError } = useAuditLogs();
  const { rulesets, isLoading: loadingRules, error: rulesError } = useAiEligibilityRulesets();
  const [query, setQuery] = useState('');
  const matching = documents.filter((document) => `${document.originalFileName} ${document.uploadedByExpertName || ''} ${document.saCode || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-5">
    <Card>
      <CardHeader><CardTitle>Documente, stocare și rezultate salvate</CardTitle>
        <p className="text-sm text-muted-foreground">Registrul documentelor disponibile în aplicație și al verificărilor asociate. Evaluarea și decizia PM rămân în fluxul de livrabile.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input aria-label="Caută documente" placeholder="Nume fișier, expert sau SA…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {isLoading ? <p>Se încarcă documentele…</p> : error || isUnavailable ? <p role="alert">Registrul documentelor nu este disponibil.</p> : <>
          <p className="text-sm text-muted-foreground">{matching.length} documente găsite în registrul încărcat.</p>
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{['Document / expert', 'Stocare', 'Rezultat verificare'].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead>
              <tbody>{matching.map((document) => <tr key={document.id} className="border-t align-top">
                <td className="p-3"><p className="font-medium">{document.originalFileName}</p><p className="text-xs text-muted-foreground">{document.uploadedByExpertName || document.uploadedByExpertId} · {document.saCode || 'SA nespecificată'}</p></td>
                <td className="max-w-xs break-all p-3 text-xs">{document.s3Key || 'Fără cheie de stocare'}<p className="mt-1 text-muted-foreground">{Math.round(document.fileSize / 1024)} KB</p></td>
                <td className="p-3">{document.eligibilityCheck ? <><p>{document.eligibilityCheck.status} · {document.eligibilityCheck.score ?? '—'}</p><p className="mt-1 text-xs text-muted-foreground">{document.eligibilityCheck.summary}</p></> : 'Fără verificare salvată'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Reguli de eligibilitate persistate</CardTitle></CardHeader><CardContent>
      <p className="mb-3 text-sm text-muted-foreground">Registru de versiuni. Editarea și publicarea se fac în PM → AI + RAG / Knowledge → Reguli, model și instrucțiuni.</p>
      {loadingRules ? <p>Se încarcă regulile…</p> : rulesError ? <p role="alert">Regulile nu au putut fi citite.</p> : rulesets.length ? rulesets.map((ruleset) => <p key={ruleset.id} className="border-t py-2 text-sm">{ruleset.title} · versiunea {ruleset.version} · {ruleset.status}</p>) : <p className="text-sm text-muted-foreground">Niciun set de reguli disponibil.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Jurnal de modificări</CardTitle></CardHeader><CardContent>
      {loadingAudit ? <p>Se încarcă jurnalul…</p> : auditError ? <p role="alert">Jurnalul nu a putut fi citit.</p> : <div className="max-h-96 space-y-2 overflow-auto">
        {!auditLogs.length && <p className="text-sm text-muted-foreground">Nicio înregistrare disponibilă.</p>}
        {[...auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{entry.actionType}</p><p className="text-xs text-muted-foreground">{entry.actorName || entry.actorId} · {entry.createdAt}</p>{entry.justification && <p className="mt-1">{entry.justification}</p>}</div>)}
      </div>}
    </CardContent></Card>
  </div>;
}
