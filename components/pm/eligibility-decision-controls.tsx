'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { eligibilityRequest } from '@/lib/eligibility-client';
import { useActivityCatalog } from '@/hooks/use-backend-data';
import { mutate } from 'swr';
import { EligibilityAssessmentDetails } from '@/components/expert/eligibility-assessment-details';
import type { DeliverableEligibilityCheck } from '@/lib/types';

export function EligibilityDecisionControls({ runId }: { runId: string }) {
  const { catalog } = useActivityCatalog();
  const [decision, setDecision] = useState('request_clarification');
  const [reason, setReason] = useState('');
  const [saCode, setSaCode] = useState('');
  const [activityId, setActivityId] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [newEvaluation, setNewEvaluation] = useState<DeliverableEligibilityCheck | null>(null);
  async function save() {
    setPending(true); setMessage('');
    try {
      const result = await eligibilityRequest('/api/eligibility/decisions', { runId, decision, reason, replacementSaCode: saCode || undefined, replacementActivityId: activityId || undefined });
      setNewEvaluation(result.evaluation || null);
      void mutate(`/api/eligibility/runs/${encodeURIComponent(runId)}`);
      setMessage(result.evaluationError ? `Decizia este salvata. Reevaluarea necesita reluare: ${result.evaluationError}`
        : result.evaluation?.runId ? `Decizie salvata. Evaluare noua: ${result.evaluation.runId}` : 'Decizia a fost salvata separat de rezultatul AI.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Decizia nu a putut fi salvata.'); }
    finally { setPending(false); }
  }
  return <div className="mt-3 space-y-2 rounded-md border bg-white p-3">
    <label className="block text-sm font-medium">Decizie PM
      <select className="mt-1 block w-full rounded-md border p-2" value={decision} onChange={(event) => setDecision(event.target.value)}>
        <option value="confirm">Confirma</option><option value="reject">Respinge</option>
        <option value="request_clarification">Solicita clarificari</option><option value="approve_exception">Aproba o exceptie</option>
        <option value="reclassify">Reincadreaza si reevalueaza</option>
      </select>
    </label>
    <Textarea aria-label="Justificarea deciziei PM" placeholder="Justificarea deciziei" value={reason} onChange={(event) => setReason(event.target.value)} />
    {decision === 'reclassify' ? <div className="grid gap-2 sm:grid-cols-2">
      <select aria-label="SA noua" className="rounded-md border p-2" value={saCode} onChange={(event) => { setSaCode(event.target.value); setActivityId(''); }}>
        <option value="">Alege subactivitatea</option>{[...new Set(catalog.filter((item) => item.isActive !== false).map((item) => item.saCode))].sort().map((sa) => <option key={sa} value={sa}>{sa}</option>)}
      </select>
      <select aria-label="Activitatea noua din catalog" className="rounded-md border p-2" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
        <option value="">Alege activitatea</option>{catalog.filter((item) => item.isActive !== false && item.saCode === saCode).map((item) => <option key={item.id} value={item.id}>{item.activityName}</option>)}
      </select>
    </div> : null}
    <Button type="button" disabled={pending || reason.trim().length < 12} onClick={save}>{pending ? 'Se salveaza…' : 'Inregistreaza decizia'}</Button>
    {message ? <p className="text-sm" role="status">{message}</p> : null}
    {newEvaluation ? <EligibilityAssessmentDetails check={newEvaluation} /> : null}
  </div>;
}
