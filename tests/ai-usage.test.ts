import assert from 'node:assert/strict';
import test from 'node:test';
import { aiModelId, estimateAiUsageCost, runMeteredAiCall } from '../lib/ai-usage.ts';
test('model IDs and embedding usage are accounted separately', () => {
  assert.equal(aiModelId({ modelId: 'actual-model' }), 'actual-model');
  assert.equal(estimateAiUsageCost({ inputTokens: 1000, outputTokens: 500, embeddingTokens: 2000 }, { input: 1, output: 2, embedding: 0.1 }), 0.0022);
});
test('every failed attempt and successful retry is metered; exhausted budget prevents the next attempt', async () => {
  const attempts: number[] = [];
  let calls = 0;
  const value = await runMeteredAiCall({ call: async () => { if (++calls < 3) throw new Error('provider unavailable'); return 42; },
    maxRetries: 2, preflight: () => {}, record: async ({ retry }) => { attempts.push(retry); } });
  assert.equal(value, 42); assert.deepEqual(attempts, [0, 1, 2]);
  calls = 0;
  await assert.rejects(runMeteredAiCall({ call: async () => { calls++; throw new Error('failure'); }, maxRetries: 2,
    preflight: () => { if (calls) throw new Error('budget exceeded'); }, record: async () => {} }), /budget exceeded/);
  assert.equal(calls, 1);
});
