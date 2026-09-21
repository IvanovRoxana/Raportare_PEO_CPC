import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as policy from '../lib/eligibility-job-policy.ts';
import * as execution from '../lib/eligibility-execution.ts';
import * as diagnostics from '../lib/eligibility-evaluation-diagnostics.ts';
import * as evaluation from '../lib/eligibility-evaluation.ts';
import * as input from '../lib/eligibility-job-input.ts';
import { EligibilityAccessError } from '../lib/eligibility-authorization.ts';

function load<T>(name: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const compiled = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), compiled)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id];
  }, exports, ...Object.values(globals));
  return exports as T;
}
test('outbox survives SQS outage and acknowledges only after publication', async () => {
  const events: string[] = [];
  let offline = true;
  const dispatcher = load<typeof import('../lib/eligibility-dispatcher.ts')>('eligibility-dispatcher', {
    'server-only': {}, './eligibility-environment.ts': { eligibilityRegion: 'test' },
    '@aws-sdk/client-sqs': { SendMessageCommand: class {}, SQSClient: class { async send() { events.push('send'); if (offline) throw new Error('offline'); } } },
    './eligibility-server-store.ts': { eligibilityTable: (name: string) => name, eligibilityStore: { transact: async () => { events.push('ack'); } } },
    './eligibility-jobs.ts': {}, './eligibility-job-policy.ts': policy,
    './eligibility-runtime-store.ts': { isConditionalConflict: () => false },
  }, { process: { env: { ELIGIBILITY_QUEUE_URL: 'queue' } } });
  const job = { id: 'job:r', runId: 'r', state: 'pending', attempts: 0, nextDispatchAt: 0, deadline: Date.now() + 60000 } as Parameters<typeof dispatcher.dispatchEligibilityJob>[0];
  await assert.rejects(dispatcher.dispatchEligibilityJob(job), /offline/);
  assert.deepEqual(events, ['send']);
  offline = false;
  await dispatcher.dispatchEligibilityJob(job);
  assert.deepEqual(events, ['send', 'send', 'ack']);
});
test('worker reauthorizes before evaluation and refuses revoked or changed documents', async () => {
  for (const scenario of ['success', 'revoked', 'changed', 'transient'] as const) {
    let evaluated = false;
    const failures: Array<{ retry: boolean; code: string }> = [];
    const resolved = { documents: [{ id: 'd', fileHash: 'hash', s3Key: 'key' }], expert: { id: 'e' }, parents: [] };
    const versions = { documents: input.eligibilityDocumentVersions(resolved.documents), expert: evaluation.evaluationHash(resolved.expert), sources: evaluation.evaluationHash([]) };
    const job = { runId: 'r', state: 'pending', attempts: 0, identity: { id: 'u', username: 'u' }, versions,
      input: { expertId: 'e', projectCode: 'p', currentSaCode: 'sa', deliverables: [{ id: 'c', serverDocumentId: 'd' }] } };
    const worker = load<typeof import('../lib/eligibility-worker.ts')>('eligibility-worker', {
      'server-only': {},
      './eligibility-jobs.ts': { getEligibilityJob: async () => job, claimEligibilityJob: async () => ({ ...job, attempts: 1, leaseToken: 'owner' }),
        heartbeatEligibilityJob: async () => {}, failOrRetryEligibilityJob: async (_job: unknown, failure: { code: string }, retry: boolean) => { failures.push({ code: failure.code, retry }); } },
      './eligibility-server-store.ts': { eligibilityStore: { get: async () => ({ runId: 'r' }) } },
      './eligibility-worker-actor.ts': { readEligibilityWorkerActor: async () => { if (scenario === 'revoked') throw new EligibilityAccessError('Acces revocat.'); return { id: 'u' }; } },
      './eligibility-resolver.ts': { resolveEligibilityContext: async () => ({ ...resolved, documents: scenario === 'changed' ? [{ ...resolved.documents[0], fileHash: 'new' }] : resolved.documents }) },
      './eligibility-job-input.ts': input, './eligibility-evaluation.ts': evaluation,
      './eligibility-service.ts': { evaluateEligibility: async (req: Request) => {
        evaluated = true;
        assert.equal(req.headers.get('authorization'), null);
        assert.equal((await req.json()).deliverables[0].serverDocumentId, 'd');
        if (scenario === 'transient') throw { statusCode: 503 };
      } },
      './eligibility-evaluation-diagnostics.ts': diagnostics, './eligibility-execution.ts': execution,
      './eligibility-job-policy.ts': policy, './eligibility-runtime-store.ts': { isConditionalConflict: () => false },
    }, { console: { info: () => {}, error: () => {} } });
    await worker.executeEligibilityJob('r');
    assert.equal(evaluated, scenario === 'success' || scenario === 'transient');
    if (scenario === 'success') assert.deepEqual(failures, []);
    else assert.equal(failures[0].retry, scenario === 'transient');
    if (scenario === 'changed') assert.equal(failures[0].code, 'ELIGIBILITY_STALE');
  }
});
