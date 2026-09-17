import 'server-only';
import { randomUUID } from 'node:crypto';
import { eligibilityStore, eligibilityTable, immutablePut } from './eligibility-server-store.ts';
import type { DeliverableEligibilityCheck } from './types.ts';
import { reserveEvaluation, releaseEvaluation } from './eligibility-runtime-store.ts';
import type { EligibilityActivityBinding } from './eligibility-binding.ts';

export class EligibilityInProgress extends Error {
  runId: string;
  constructor(runId: string) { super('Evaluarea este deja in curs.'); this.name = 'EligibilityInProgress'; this.runId = runId; }
}

export type EligibilityRun = {
  id: string; runId: string; evaluationKey: string; expertId: string; projectCode: string; saCode: string;
  actorId: string; status: string; authoritative: boolean; createdAt: string;
  inputSnapshot: Record<string, unknown>; resultJson?: DeliverableEligibilityCheck; completedAt?: string;
  errorCode?: string;
  activityBinding?: EligibilityActivityBinding;
  activityBindings?: EligibilityActivityBinding[];
};
export async function findReusableEligibilityRun(evaluationKey: string) {
  const runs = await eligibilityStore.list<EligibilityRun>('EligibilityEvaluationRun', { field: 'evaluationKey', value: evaluationKey });
  return runs.filter((run) => run.status === 'completed' && run.authoritative && run.resultJson)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
}
export async function startEligibilityRun(input: Omit<EligibilityRun, 'id' | 'runId' | 'status' | 'createdAt'>) {
  const runId = `elg_${randomUUID()}`;
  const reservation = await reserveEvaluation(input.evaluationKey, runId);
  if (!reservation.acquired) throw new EligibilityInProgress(reservation.runId);
  const run: EligibilityRun = { ...input, id: runId, runId, status: 'pending', createdAt: new Date().toISOString() };
  try { await eligibilityStore.transact([immutablePut('EligibilityEvaluationRun', run)]); }
  catch (error) { await releaseEvaluation(input.evaluationKey, runId).catch(() => undefined); throw error; }
  return run;
}
export async function completeEligibilityRun(run: EligibilityRun, result: DeliverableEligibilityCheck) {
  await eligibilityStore.transact([
    { Update: {
      TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: run.id },
      UpdateExpression: 'SET #status = :completed, resultJson = :result, inputSnapshot = :snapshot, authoritative = :authoritative, completedAt = :at, updatedAt = :at',
      ConditionExpression: '#status = :pending AND evaluationKey = :key', ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed', ':pending': 'pending', ':key': run.evaluationKey, ':result': result, ':snapshot': run.inputSnapshot, ':authoritative': result.authoritative === true, ':at': new Date().toISOString() },
    } },
    ...(result.criterionFindings || []).map((finding) => immutablePut('EligibilityEvaluationEvidence', {
      id: `${run.runId}:${finding.criterionId}`, runId: run.runId, criterionId: finding.criterionId,
      evidenceJson: { ...finding, sources: (result.sourceEvidence || []).filter((source) => finding.evidenceIds.includes(source.chunkId)) },
    })),
  ]);
}

export async function failEligibilityRun(run: EligibilityRun, error?: unknown, executionJson: Record<string, unknown> = {}) {
  const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'ELIGIBILITY_EXECUTION_FAILED';
  await eligibilityStore.transact([{ Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: run.id },
    UpdateExpression: 'SET #status = :failed, completedAt = :at, errorCode = :code, executionJson = :execution', ConditionExpression: '#status = :pending',
    ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':failed': 'failed', ':pending': 'pending', ':at': new Date().toISOString(), ':code': errorCode, ':execution': executionJson } } }]);
}
