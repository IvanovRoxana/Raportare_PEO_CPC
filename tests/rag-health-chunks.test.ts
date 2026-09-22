import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHealthChunks, type HealthChunk } from '../lib/rag/health-chunks.ts';

test('health counts isolate projects and SAs, ignore inactive sources and include uncategorized project documents', () => {
  const chunks: HealthChunk[] = [
    { id: 'global', sourceType: 'cerere_finantare', projectCode: '302141', status: 'active' },
    ...['SA3.2', 'SA3.3', 'SA3.4'].map((saCode) => ({ id: saCode, saCode, sourceType: 'scop_sa', projectCode: '302141', status: 'active' })),
    { id: 'other', sourceType: 'scop_sa', saCode: 'SA3.2', projectCode: 'other', status: 'active' },
    { id: 'inactive', sourceType: 'scop_sa', saCode: 'SA3.2', projectCode: '302141', status: 'inactive' },
    { id: 'job', sourceType: 'fisa_post', expertId: 'expert', category: 'com', projectCode: '302141', status: 'active' },
    { id: 'unscoped-job', sourceType: 'fisa_post', expertId: 'expert', category: 'com', status: 'active' },
  ];
  const result = selectHealthChunks(chunks, { projectCode: '302141', saCode: 'SA3.2', category: 'com', expertId: 'expert' });
  assert.deepEqual(result.projectSourceChunks.map((item) => item.id), ['global']);
  assert.deepEqual(result.subactivitySourceChunks.map((item) => item.id), ['SA3.2']);
  assert.deepEqual(result.expertFisaPostChunks.map((item) => item.id), ['job']);
  assert.equal(selectHealthChunks(chunks, {}).subactivitySourceChunks.length, 0);
});

test('category health does not turn a global project document into a category-specific source', () => {
  const chunks: HealthChunk[] = [
    { id: 'funding', sourceType: 'cerere_finantare', projectCode: '302141', status: 'active' },
    { id: 'manual', sourceType: 'manual_beneficiar', projectCode: '302141', status: 'active' },
    { id: 'category', sourceType: 'descriere_activitati', projectCode: '302141', category: 'com', saCode: 'SA3.2', status: 'active' },
  ];
  const result = selectHealthChunks(chunks, { projectCode: '302141', category: 'com', saCode: 'SA3.2' });
  assert.deepEqual(result.projectSourceChunks.map((item) => item.id), ['funding', 'manual']);
  assert.deepEqual(result.categoryReferenceChunks.map((item) => item.id), ['category']);
});
