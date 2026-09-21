'use client';
import { fetchAuthSession } from 'aws-amplify/auth';
import { pollEligibilityRun, EligibilityTransportError, type EligibilityProgress, type EligibilityRunResponse } from './eligibility-polling';
import { evaluationFailureFromResponse, EligibilityEvaluationRequestError } from './eligibility-evaluation-diagnostics';

async function request(path: string, body?: string) {
  const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  if (!token) throw new EligibilityTransportError(401, 'Sesiunea Cognito lipseste.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const value = await response.json().catch(() => null);
  if (response.status === 409 && value?.code === 'ELIGIBILITY_IN_PROGRESS' && value.runId) return value;
  if (!response.ok || !value) {
    const diagnostic = evaluationFailureFromResponse(value?.diagnostic);
    if (diagnostic) throw new EligibilityEvaluationRequestError(diagnostic);
    throw new EligibilityTransportError(response.status, value?.error || 'Evaluarea nu a produs un verdict. Conexiunea cu serviciul este temporar indisponibilă.');
  }
  return value;
}
export const lookupEligibilityRun = (body: string): Promise<{ runId: string | null }> => request('/api/eligibility/runs/lookup', body);
export const watchEligibilityRun = (runId: string, progress: (p: EligibilityProgress) => void, isCurrent: () => boolean) =>
  pollEligibilityRun(runId, { read: () => request(`/api/eligibility/runs/${encodeURIComponent(runId)}`) as Promise<EligibilityRunResponse>, progress, isCurrent });

export async function requestDeliverableEligibility(body: string, progress: (p: EligibilityProgress) => void, isCurrent: () => boolean) {
  // The server reads originals; omit browser text from the acceptance request.
  const supplied = JSON.parse(body);
  const allowed = ['expertId', 'projectCode', 'currentSaCode', 'primaryDeliverableId', 'selectedActivityId',
    'selectedActivityName', 'classificationMode', 'currentDescription', 'workingGroupActivities', 'deliverableOptions',
    'activityGroupId', 'workBlockId', 'periodGroupId', 'workingGroupId', 'activityDates', 'month', 'year'];
  body = JSON.stringify({ clientRequestId: crypto.randomUUID(), ...Object.fromEntries(allowed.map((key) => [key, supplied[key]])),
    deliverables: supplied.deliverables?.map((d: { id: string; serverDocumentId?: string; isPrimary?: boolean }) => ({ id: d.id, serverDocumentId: d.serverDocumentId || d.id, isPrimary: d.isPrimary })),
    activityCatalogCandidates: supplied.activityCatalogCandidates?.map((c: { id: string }) => ({ id: c.id })),
  });
  let value;
  try { value = await request('/api/ai/check-deliverable-eligibility', body); }
  catch (error) {
    if (error instanceof EligibilityEvaluationRequestError || error instanceof EligibilityTransportError && error.status < 500) throw error;
    // A lost 202 response must not start another evaluation. Look up the accepted request first.
    const recovered = await lookupEligibilityRun(body).catch(() => null);
    if (recovered?.runId) value = recovered;
    else value = await request('/api/ai/check-deliverable-eligibility', body);
  }
  if (!value?.runId) throw new Error('Evaluarea nu a produs un verdict. Referința rulării lipsește.');
  progress({ runId: value.runId, executionStatus: value.executionStatus || 'pending', stage: value.stage, message: 'În așteptare' });
  return watchEligibilityRun(value.runId, progress, isCurrent);
}
