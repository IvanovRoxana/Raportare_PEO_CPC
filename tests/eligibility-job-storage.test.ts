import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Exercise the real store functions with an AWS-boundary stub. No credentials or network.
type Write = { Put?: Record<string, unknown>; Update?: Record<string, unknown>; Delete?: Record<string, unknown> };
const transactions: Write[][] = [];
let conflict = false, unavailable = false;
let replay: { runId: string; evaluationKey: string } | null = null;
const existing = { id: 'existing', runId: 'existing', status: 'running' };
const store = {
  async transact(items: Write[]) {
    transactions.push(items);
    if (unavailable) throw new Error('DynamoDB unavailable');
    if (conflict) throw Object.assign(new Error('Conflict'), { name: 'ConditionalCheckFailedException' });
  },
  async get(_model: string, id: string) { if (id.startsWith('attempt:')) return replay; return id.startsWith('active:') ? { runId: 'existing' } : existing; },
};
const bridge = globalThis as unknown as { __eligibilityTestStore: typeof store };
bridge.__eligibilityTestStore = store;
async function loadApi() {
const compiled = await build({ stdin: { contents: `export * from './lib/eligibility-jobs.ts'; export { completeEligibilityRun } from './lib/eligibility-run-store.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'aws-boundary', setup(b) {
    b.onResolve({ filter: /eligibility-server-store(\.ts)?$/ }, () => ({ path: 'store', namespace: 'stub' }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: args.path === 'server-only' ? '' : `
      export const eligibilityStore = globalThis.__eligibilityTestStore;
      export const eligibilityTable = (model) => model;
      export const immutablePut = (model, item) => ({ Put: { TableName: model, Item: item, ConditionExpression: 'attribute_not_exists(id)' } });
    ` }));
  } }] });
return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
}
const apiPromise = loadApi();
const input = { idempotencyKey: 'attempt', requestKey: 'request', evaluationKey: 'key', identity: { id: 'actor', username: 'actor' },
  input: { expertId: 'expert', projectCode: 'project', currentSaCode: 'SA1', deliverables: [{ id: 'c', serverDocumentId: 'd' }] }, versions: {} };

test('acceptance commits run, outbox, deduplication and lookup atomically', async () => {
  const api = await apiPromise;
  transactions.length = 0;
  const run = await api.acceptEligibilityJob(input, { documents: [{ id: 'd' }] });
  assert.equal(run.status, 'pending');
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].length, 5);
  assert.deepEqual(transactions[0].map((w) => w.Put?.TableName), ['EligibilityEvaluationRun', 'EligibilityRuntime', 'EligibilityRuntime', 'EligibilityRuntime', 'EligibilityRuntime']);
  assert.equal((transactions[0][1].Put?.Item as { runId: string }).runId, run.runId);
  unavailable = true;
  await assert.rejects(api.acceptEligibilityJob(input, {}), /DynamoDB unavailable/);
  unavailable = false;
});
test('concurrent acceptance recovers existing run; a lost lease cannot be claimed', async () => {
  const api = await apiPromise;
  conflict = true;
  assert.equal((await api.acceptEligibilityJob(input, {})).runId, 'existing');
  assert.equal(await api.claimEligibilityJob({ ...input, id: 'job:r', runId: 'r', state: 'pending', attempts: 0, deadline: Date.now() + 60000 }), null);
  conflict = false;
});
test('completion writes result, evidence, terminal job and unlock in one fenced transaction', async () => {
  const api = await apiPromise;
  transactions.length = 0;
  const job = { ...input, id: 'job:r', runId: 'r', state: 'running', attempts: 1, leaseToken: 'owner' };
  await api.completeEligibilityRun({ id: 'r', runId: 'r', evaluationKey: 'key', inputSnapshot: { documents: [{ id: 'd', fileHash: 'version1' }] } },
    { authoritative: true, criterionFindings: [{ criterionId: 'criterion', evidenceIds: [] }] }, job);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].length, 4);
  const updates = transactions[0].filter((item) => item.Update).map((item) => item.Update!);
  for (const update of updates) {
    assert.match(String(update.ConditionExpression), /leaseToken = :token/);
    assert.match(String(update.ConditionExpression), /leaseUntil > :now/);
    assert.equal((update.ExpressionAttributeValues as Record<string, unknown>)[':token'], 'owner');
  }
  conflict = true;
  await assert.rejects(api.completeEligibilityRun({ id: 'r', runId: 'r', evaluationKey: 'key', inputSnapshot: {} }, { criterionFindings: [] }, job));
  conflict = false;
});
test('third transient failure becomes terminal and releases deduplication atomically', async () => {
  const api = await apiPromise;
  transactions.length = 0;
  await api.failOrRetryEligibilityJob({ ...input, id: 'job:r', runId: 'r', state: 'running', attempts: 3, leaseToken: 'owner', deadline: Date.now() + 60000 }, { code: 'ELIGIBILITY_TIMEOUT', stage: 'model' }, true);
  assert.ok(transactions[0].some((w) => w.Delete));
  const runUpdate = transactions[0].find((w) => w.Update?.TableName === 'EligibilityEvaluationRun')!.Update!;
  assert.equal((runUpdate.ExpressionAttributeValues as Record<string, unknown>)[':status'], 'failed');
  assert.match(String(runUpdate.UpdateExpression), /completedAt/);
});


test('a repeated client attempt recovers its completed run after a lost response', async () => {
  const api = await apiPromise;
  conflict = true;
  existing.status = 'completed';
  replay = { runId: 'existing', evaluationKey: 'key' };
  assert.equal((await api.acceptEligibilityJob(input, {})).status, 'completed');
  await assert.rejects(api.acceptEligibilityJob({ ...input, evaluationKey: 'different' }, {}), /IDEMPOTENCY_CONFLICT/);
  conflict = false; replay = null; existing.status = 'running';
});

test('a duplicate SQS message cannot bypass the retry backoff', async () => {
  const api = await apiPromise;
  transactions.length = 0;
  assert.equal(await api.claimEligibilityJob({ ...input, id: 'job:r', runId: 'r', state: 'pending', attempts: 1,
    deadline: Date.now() + 60000, retryAfter: Date.now() + 20000 }), null);
  assert.equal(transactions.length, 0);
});
