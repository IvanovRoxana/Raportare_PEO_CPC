import 'server-only';
import { randomUUID } from 'node:crypto';
import { eligibilityStore, eligibilityTable, immutablePut } from './eligibility-server-store.ts';
import { isConditionalConflict } from './eligibility-runtime-store.ts';
import type { EligibilityRun } from './eligibility-run-store.ts';
import type { EligibilityJobInput } from './eligibility-job-input.ts';
import { ELIGIBILITY_JOB_MAX_ATTEMPTS, ELIGIBILITY_JOB_LEASE_MS, ELIGIBILITY_JOB_DEADLINE_MS } from './eligibility-job-policy.ts';
import type { EvaluationFailure } from './eligibility-evaluation-diagnostics.ts';

export type EligibilityJob = {
  id: string; kind: 'eligibility-job'; dispatchPartition?: string; runId: string; requestKey: string; evaluationKey: string; idempotencyKey: string;
  identity: { id: string; username: string }; input: EligibilityJobInput; versions: unknown;
  state: 'pending' | 'running' | 'completed' | 'failed'; attempts: number;
  nextDispatchAt: number; deadline: number; leaseUntil?: number; leaseToken?: string; retryAfter?: number;
};
export const getEligibilityJob = (runId: string) => eligibilityStore.get<EligibilityJob>('EligibilityRuntime', `job:${runId}`);

export async function acceptEligibilityJob(input: Omit<EligibilityJob, 'id' | 'kind' | 'runId' | 'state' | 'attempts' | 'nextDispatchAt' | 'deadline'>, snapshot: Record<string, unknown>) {
  const runId = `elg_${randomUUID()}`, now = Date.now();
  const run: EligibilityRun = { id: runId, runId, evaluationKey: input.evaluationKey, actorId: input.identity.id,
    expertId: input.input.expertId, projectCode: input.input.projectCode!, saCode: input.input.currentSaCode,
    status: 'pending', authoritative: false, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    stage: 'queued', asyncJob: true, inputSnapshot: snapshot };
  const job: EligibilityJob = { ...input, id: `job:${runId}`, kind: 'eligibility-job', dispatchPartition: 'eligibility', runId, state: 'pending', attempts: 0,
    nextDispatchAt: now, deadline: now + ELIGIBILITY_JOB_DEADLINE_MS };
  // The outbox is the job row itself. No HTTP success is returned before all three writes commit.
  try {
    await eligibilityStore.transact([
      immutablePut('EligibilityEvaluationRun', run), immutablePut('EligibilityRuntime', job),
      immutablePut('EligibilityRuntime', { id: `active:${input.evaluationKey}`, runId }),
      immutablePut('EligibilityRuntime', { id: `attempt:${input.idempotencyKey}`, runId, evaluationKey: input.evaluationKey }),
      { Put: { TableName: eligibilityTable('EligibilityRuntime'), Item: { id: `request:${input.requestKey}`, runId } } },
    ]);
    return run;
  } catch (error) {
    if (!isConditionalConflict(error)) throw error;
    const attempt = await eligibilityStore.get<{ runId: string; evaluationKey: string }>('EligibilityRuntime', `attempt:${input.idempotencyKey}`);
    if (attempt) {
      if (attempt.evaluationKey !== input.evaluationKey) throw new Error('ELIGIBILITY_IDEMPOTENCY_CONFLICT');
      const accepted = await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', attempt.runId);
      if (accepted) return accepted;
    }
    const active = await eligibilityStore.get<{ runId: string }>('EligibilityRuntime', `active:${input.evaluationKey}`);
    const existing = active && await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', active.runId);
    if (!existing || !['pending', 'running'].includes(existing.status)) throw error;
    return existing;
  }
}

export async function claimEligibilityJob(job: EligibilityJob) {
  const now = Date.now(), leaseToken = randomUUID();
  if (job.deadline <= now || job.attempts >= ELIGIBILITY_JOB_MAX_ATTEMPTS || (job.retryAfter || 0) > now) return null;
  try {
    await eligibilityStore.transact([
      { Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
        UpdateExpression: 'SET #state = :running, leaseToken = :token, leaseUntil = :until, nextDispatchAt = :until, attempts = attempts + :one REMOVE retryAfter',
        ConditionExpression: '(#state = :pending OR (#state = :running AND leaseUntil <= :now)) AND attempts = :attempts AND deadline > :now AND (attribute_not_exists(retryAfter) OR retryAfter <= :now)',
        ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':running': 'running', ':pending': 'pending', ':token': leaseToken,
          ':until': now + ELIGIBILITY_JOB_LEASE_MS, ':now': now, ':attempts': job.attempts, ':one': 1 } } },
      { Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: job.runId },
        UpdateExpression: 'SET #status = :running, leaseToken = :token, leaseUntil = :until, updatedAt = :at, stage = :stage',
        ConditionExpression: '#status = :pending OR (#status = :running AND leaseUntil <= :now)',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':running': 'running', ':pending': 'pending', ':token': leaseToken,
          ':until': now + ELIGIBILITY_JOB_LEASE_MS, ':now': now, ':at': new Date(now).toISOString(), ':stage': 'context' } } },
    ]);
    return { ...job, state: 'running' as const, attempts: job.attempts + 1, leaseToken, leaseUntil: now + ELIGIBILITY_JOB_LEASE_MS };
  } catch (error) { if (isConditionalConflict(error)) return null; throw error; }
}

export function jobFence(job: EligibilityJob) {
  return { ConditionCheck: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
    ConditionExpression: '#state = :running AND leaseToken = :token AND leaseUntil > :now', ExpressionAttributeNames: { '#state': 'state' },
    ExpressionAttributeValues: { ':running': 'running', ':token': job.leaseToken, ':now': Date.now() } } };
}
export async function heartbeatEligibilityJob(job: EligibilityJob, stage: string) {
  const now = Date.now();
  await eligibilityStore.transact([
    { Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
      UpdateExpression: 'SET leaseUntil = :until, nextDispatchAt = :until', ConditionExpression: '#state = :running AND leaseToken = :token AND leaseUntil > :now',
      ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':running': 'running', ':token': job.leaseToken, ':now': now, ':until': now + ELIGIBILITY_JOB_LEASE_MS } } },
    { Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: job.runId },
      UpdateExpression: 'SET leaseUntil = :until, updatedAt = :at, stage = :stage', ConditionExpression: '#status = :running AND leaseToken = :token',
      ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':running': 'running', ':token': job.leaseToken,
        ':until': now + ELIGIBILITY_JOB_LEASE_MS, ':at': new Date(now).toISOString(), ':stage': stage } } },
  ]);
}

export function finishJobWrites(job: EligibilityJob, state: 'completed' | 'failed') {
  return [
    { Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
      UpdateExpression: 'SET #state = :terminal REMOVE leaseToken, leaseUntil, dispatchPartition',
      ConditionExpression: '#state = :running AND leaseToken = :token AND leaseUntil > :now',
      ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':terminal': state, ':running': 'running', ':token': job.leaseToken, ':now': Date.now() } } },
    { Delete: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: `active:${job.evaluationKey}` },
      ConditionExpression: 'runId = :run', ExpressionAttributeValues: { ':run': job.runId } } },
  ];
}

export async function failOrRetryEligibilityJob(job: EligibilityJob, failure: EvaluationFailure, retry: boolean, audit: Record<string, unknown> = {}) {
  const pending = retry && job.attempts < ELIGIBILITY_JOB_MAX_ATTEMPTS && Date.now() < job.deadline;
  const state = pending ? 'pending' : 'failed';
  const jobWrite = pending ? [{ Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
    UpdateExpression: 'SET #state = :pending, nextDispatchAt = :next, retryAfter = :next REMOVE leaseToken, leaseUntil',
    ConditionExpression: '#state = :running AND leaseToken = :token AND leaseUntil > :now',
    ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':pending': 'pending', ':running': 'running', ':token': job.leaseToken,
      ':now': Date.now(), ':next': Date.now() + 10_000 * 2 ** (job.attempts - 1) } } }] : finishJobWrites(job, 'failed');
  await eligibilityStore.transact([...jobWrite, { Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: job.runId },
    UpdateExpression: `SET #status = :status, updatedAt = :at, executionJson = :execution, errorCode = :code, stage = :stage${pending ? '' : ', completedAt = :at'} REMOVE leaseToken, leaseUntil`,
    ConditionExpression: '#status = :running AND leaseToken = :token', ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': state, ':running': 'running', ':token': job.leaseToken, ':at': new Date().toISOString(),
      ':execution': { ...audit, failure, attempts: job.attempts }, ':code': failure.code, ':stage': pending ? 'queued' : failure.stage } } }]);
}

/** Compare-and-swap against the observed lease; never reap a worker that renewed it. */
export async function expireEligibilityJob(job: EligibilityJob) {
  const now = Date.now();
  await eligibilityStore.transact([
    { Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
      UpdateExpression: 'SET #state = :failed REMOVE dispatchPartition',
      ConditionExpression: '(#state = :pending OR (#state = :running AND leaseUntil <= :now)) AND attempts = :attempts AND (deadline <= :now OR attempts >= :max)',
      ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':failed': 'failed', ':pending': 'pending', ':running': 'running',
        ':now': now, ':attempts': job.attempts, ':max': ELIGIBILITY_JOB_MAX_ATTEMPTS } } },
    { Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: job.runId },
      UpdateExpression: 'SET #status = :failed, errorCode = :code, updatedAt = :at, completedAt = :at',
      ConditionExpression: '#status = :pending OR (#status = :running AND leaseUntil <= :now)', ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':failed': 'failed', ':pending': 'pending', ':running': 'running', ':now': now,
        ':code': 'ELIGIBILITY_EXECUTION_INTERRUPTED', ':at': new Date(now).toISOString() } } },
    { Delete: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: `active:${job.evaluationKey}` },
      ConditionExpression: 'runId = :run', ExpressionAttributeValues: { ':run': job.runId } } },
  ]);
}
