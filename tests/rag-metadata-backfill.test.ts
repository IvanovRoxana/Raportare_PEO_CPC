import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillRagMetadataPage } from '../lib/rag/metadata-backfill.ts';

test('metadata migration propagates project, canonical role and scope across every chunk page without inventing completeness', async () => {
  const writes: Record<string, unknown>[] = [];
  const result = await backfillRagMetadataPage('documents-page', async (query, variables) => {
    if (query.includes('query MetadataBackfill')) {
      assert.equal(variables.nextToken, 'documents-page');
      return { listKnowledgeDocuments: { items: [{ id: 'job', sourceType: 'fisa_post', category: 'cr',
        expertRole: 'Coordonator centru regional', saCode: 'SA3.4', updatedAt: 'before' }], nextToken: 'more-documents' } };
    }
    if (query.includes('query BackfillChunkScope')) return { listKnowledgeChunkByDocumentId: {
      items: [{ id: variables.nextToken ? 'chunk-2' : 'chunk-1', updatedAt: 'before' }], nextToken: variables.nextToken ? null : 'next-chunks',
    } };
    const input = variables.input as Record<string, unknown>;
    assert.deepEqual(variables.condition, { updatedAt: { eq: 'before' } });
    assert.equal(input.projectCode, '302141');
    assert.equal(input.roleId, 'coordonator-regional');
    assert.equal('extractionComplete' in input, false);
    assert.equal('publishedGeneration' in input, false);
    if (input.id !== 'job') { assert.equal(input.category, 'cr'); assert.equal(input.saCode, 'SA3.4'); }
    writes.push(input);
    return {};
  });
  assert.deepEqual(writes.map((item) => item.id), ['job', 'chunk-1', 'chunk-2']);
  assert.deepEqual(result, { updated: 1, failed: [], nextToken: 'more-documents' });
});

test('metadata migration skips ambiguous job descriptions and does not change chunks after a concurrent parent edit', async () => {
  const writes: string[] = [];
  const result = await backfillRagMetadataPage(null, async (query, variables) => {
    if (query.includes('query MetadataBackfill')) return { listKnowledgeDocuments: { items: [
      { id: 'ambiguous', sourceType: 'fisa_post', projectCode: '302141', updatedAt: 'before' },
      { id: 'changed', sourceType: 'cerere_finantare', projectCode: '302141', updatedAt: 'before' },
    ] } };
    writes.push(String((variables.input as { id: string }).id));
    throw new Error('Conditional update failed');
  });
  assert.deepEqual(writes, ['changed']);
  assert.deepEqual(result, { updated: 0, failed: ['ambiguous', 'changed'], nextToken: null });
});
