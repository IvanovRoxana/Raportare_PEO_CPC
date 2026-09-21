import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibilityJobAction, eligibilityRetryable, ELIGIBILITY_JOB_LEASE_MS } from '../lib/eligibility-job-policy.ts';
import { parseEligibilityJobInput, eligibilityRequestKey, eligibilityDocumentVersions } from '../lib/eligibility-job-input.ts';
import { pollEligibilityRun, EligibilityPollingStopped, EligibilityTransportError } from '../lib/eligibility-polling.ts';
import { EligibilityExecutionError } from '../lib/eligibility-execution.ts';
import type { DeliverableEligibilityCheck } from '../lib/types.ts';

const input = { expertId: 'e1', projectCode: 'p1', currentSaCode: 'SA1', deliverables: [{ id: 'c1', serverDocumentId: 'draft_1', isPrimary: true }] };
test('job inputs discard browser text, secrets and untrusted role claims', () => {
  const parsed = parseEligibilityJobInput({ ...input, extractedText: 'secret text', token: 'secret', roles: ['admin'],
    deliverables: [{ ...input.deliverables[0], extractedText: 'browser supplied text', fileHash: 'fake' }] });
  assert.deepEqual(parsed, input);
  assert.throws(() => parseEligibilityJobInput({ ...input, deliverables: [input.deliverables[0], input.deliverables[0]] }));
});
test('idempotency keys isolate users and assessment context; document order is stable', () => {
  const body = parseEligibilityJobInput({ ...input, deliverables: [...input.deliverables, { id: 'c2', serverDocumentId: 'draft_2' }], activityDates: ['2026-09-20', '2026-09-21'] });
  const key = eligibilityRequestKey('a1', body);
  assert.equal(key, eligibilityRequestKey('a1', { ...body, deliverables: body.deliverables.slice().reverse(), activityDates: body.activityDates!.slice().reverse() }));
  assert.notEqual(key, eligibilityRequestKey('a2', body));
  assert.equal(key, eligibilityRequestKey('a1', { ...body, deliverables: body.deliverables.map((d) => ({ ...d, id: `reloaded-${d.id}` })) }));
  assert.notEqual(key, eligibilityRequestKey('a1', { ...body, selectedActivityId: 'changed' }));
  assert.notDeepEqual(eligibilityDocumentVersions([{ id: 'd', fileHash: 'a' }]), eligibilityDocumentVersions([{ id: 'd', fileHash: 'b' }]));
});
test('recovery preserves a live worker past 180s and detects expired leases and attempt limits', () => {
  const job = { state: 'running', attempts: 1, nextDispatchAt: 0, deadline: 2_000_000, leaseUntil: 300_000 + ELIGIBILITY_JOB_LEASE_MS };
  assert.equal(eligibilityJobAction(job, 300_000), 'none');
  assert.equal(eligibilityJobAction(job, 400_000), 'dispatch');
  assert.equal(eligibilityJobAction({ ...job, attempts: 3 }, 400_000), 'fail');
  assert.equal(eligibilityJobAction({ ...job, state: 'pending', deadline: 200_000 }, 300_000), 'fail');
  assert.equal(eligibilityJobAction({ ...job, state: 'completed' }, 3_000_000), 'none');
});
test('retry policy excludes revoked access, invalid findings, stale documents and budget failures', () => {
  for (const code of ['ELIGIBILITY_STALE', 'ELIGIBILITY_FINDINGS_INCOMPLETE', 'ELIGIBILITY_SHARED_BUDGET', 'ELIGIBILITY_BUDGET_EXHAUSTED']) {
    assert.equal(eligibilityRetryable(new EligibilityExecutionError(code, 'failure', 502)), false);
  }
  assert.equal(eligibilityRetryable({ name: 'EligibilityAccessError', status: 503 }), false);
  assert.equal(eligibilityRetryable({ statusCode: 429, data: { error: { code: 'insufficient_quota' } } }), false);
  assert.equal(eligibilityRetryable({ cause: { code: 'ECONNRESET' } }), true);
  for (const error of [{ statusCode: 503 }, { statusCode: 429 }, { code: 'ECONNRESET' }, new EligibilityExecutionError('ELIGIBILITY_TIMEOUT', 'timeout', 504)]) {
    assert.equal(eligibilityRetryable(error), true);
  }
});
test('polling survives network errors, runs beyond 90s, and uses bounded backoff', async () => {
  let calls = 0, elapsed = 0;
  const delays: number[] = [], messages: string[] = [];
  const result = { status: 'neconcludent', summary: 'Dovezi insuficiente.' } as DeliverableEligibilityCheck;
  const actual = await pollEligibilityRun('run1', {
    isCurrent: () => true,
    read: async () => {
      calls++;
      if ([2, 4].includes(calls)) throw new EligibilityTransportError(504, 'gateway');
      return elapsed < 100_000 ? { runId: 'run1', executionStatus: 'running', stage: 'model' }
        : { runId: 'run1', executionStatus: 'completed', current: true, result };
    },
    progress: (value) => { messages.push(value.message); assert.notEqual(value.executionStatus, 'failed'); },
    sleep: async (ms) => { delays.push(ms); elapsed += ms; },
  });
  assert.equal(actual, result);
  assert.equal(delays[0], 2000);
  assert.equal(Math.max(...delays), 10000);
  assert.ok(messages.some((message) => message.includes('Reconectare')));
});
test('polling stops after context change and never applies a late verdict', async () => {
  let current = true;
  await assert.rejects(pollEligibilityRun('run1', { isCurrent: () => current, progress: () => assert.fail('late progress'),
    read: async () => { current = false; return { runId: 'run1', executionStatus: 'completed', current: true, result: { summary: 'late' } as DeliverableEligibilityCheck }; },
  }), EligibilityPollingStopped);
});
test('failed and stale runs are technical errors, not verdicts', async () => {
  for (const run of [{ runId: 'r', executionStatus: 'failed', errorCode: 'ELIGIBILITY_STALE' },
    { runId: 'r', executionStatus: 'completed', current: false }]) {
    await assert.rejects(pollEligibilityRun('r', { isCurrent: () => true, progress: () => {}, read: async () => run }));
  }
});
