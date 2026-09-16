import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillProjectPage } from '../lib/rag/project-backfill.ts';

test('backfill fills missing document and chunk projects, preserving existing codes', async () => {
  for (const model of ['KnowledgeDocument', 'KnowledgeChunk'] as const) {
    const writes: string[] = [];
    const result = await backfillProjectPage(model, null, async (query, variables) => {
      if (query.startsWith('query')) return { [`list${model}s`]: { items: [
        { id: 'missing' }, { id: 'empty', projectCode: '' }, { id: 'null', projectCode: null },
        { id: 'other', projectCode: '999999' }, { id: 'done', projectCode: '302141' },
      ], nextToken: 'page-2' } };
      const input = variables.input as { id: string; projectCode: string };
      assert.equal(input.projectCode, '302141');
      assert.ok(variables.condition, 'must protect concurrent edits and deletions');
      writes.push(input.id);
      return { [`update${model}`]: { id: input.id } };
    });
    assert.deepEqual(writes, ['missing', 'empty', 'null']);
    assert.deepEqual(result, { updated: 3, failed: [], nextToken: 'page-2' });
  }
});

test('backfill preserves cursor on empty filtered pages and reports partial failures', async () => {
  assert.deepEqual(await backfillProjectPage('KnowledgeChunk', null, async () => ({
    listKnowledgeChunks: { items: [], nextToken: 'more' },
  })), { updated: 0, failed: [], nextToken: 'more' });
  const result = await backfillProjectPage('KnowledgeDocument', null, async (query) => {
    if (query.startsWith('query')) return { listKnowledgeDocuments: { items: [{ id: 'failed' }] } };
    throw new Error('Conditional update failed');
  });
  assert.deepEqual(result, { updated: 0, failed: ['failed'], nextToken: null });
});
