import 'server-only';
import { randomUUID } from 'node:crypto';
import { eligibilityStore, eligibilityTable, immutablePut } from './eligibility-server-store.ts';
import type { DeliverableEligibilityCheck } from './types.ts';

export type EligibilityRun = {
  id: string; runId: string; evaluationKey: string; expertId: string; projectCode: string; saCode: string;
  actorId: string; status: string; authoritative: boolean; createdAt: string;
  inputSnapshot: Record<string, unknown>; resultJson?: DeliverableEligibilityCheck; completedAt?: string;
};
export async function findReusableEligibilityRun(evaluationKey: string) {
  const runs = await eligibilityStore.list<EligibilityRun>('EligibilityEvaluationRun', { field: 'evaluationKey', value: evaluationKey });
  return runs.filter((run) => run.status === 'completed' && run.authoritative && run.resultJson)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
}
export async function startEligibilityRun(input: Omit<EligibilityRun, 'id' | 'runId' | 'status' | 'createdAt'>) {
  const runId = `elg_${randomUUID()}`;
  const run: EligibilityRun = { ...input, id: runId, runId, status: 'pending', createdAt: new Date().toISOString() };
  await eligibilityStore.transact([immutablePut('EligibilityEvaluationRun', run)]);
  return run;
}
export async function completeEligibilityRun(run: EligibilityRun, result: DeliverableEligibilityCheck) {
  await eligibilityStore.transact([
    { Update: {
      TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: run.id },
      UpdateExpression: 'SET #status = :completed, resultJson = :result, authoritative = :authoritative, completedAt = :at, updatedAt = :at',
      ConditionExpression: '#status = :pending AND evaluationKey = :key', ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed', ':pending': 'pending', ':key': run.evaluationKey, ':result': result, ':authoritative': result.authoritative === true, ':at': new Date().toISOString() },
    } },
    ...(result.criterionFindings || []).map((finding) => immutablePut('EligibilityEvaluationEvidence', {
      id: `${run.runId}:${finding.criterionId}`, runId: run.runId, criterionId: finding.criterionId,
      evidenceJson: { ...finding, sources: (result.sourceEvidence || []).filter((source) => finding.evidenceIds.includes(source.chunkId)) },
    })),
  ]);
}

export async function failEligibilityRun(run: EligibilityRun) {
  await eligibilityStore.transact([{ Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: run.id },
    UpdateExpression: 'SET #status = :failed, completedAt = :at', ConditionExpression: '#status = :pending',
    ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':failed': 'failed', ':pending': 'pending', ':at': new Date().toISOString() } } }]);
}
