import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveKnownActivityContinuation } from '../lib/activity-continuation.ts';
import type { Activity, ActivityCatalog } from '../lib/types.ts';

const source: Activity = { id: 'source', expertId: 'expert', date: '2026-06-02', projectCode: '302141', hours: 2,
  title: 'Consultare', activityType: 'Consultare', catalogActivityId: 'catalog', saCode: 'SA3.4',
  deliverables: [{ id: 'd1', documentId: 'doc1', fileHash: 'bytes-1', fileName: 'consultare.pdf', fileSize: 20, fileType: 'application/pdf' }] };
const catalog: ActivityCatalog = { id: 'catalog', category: 'ap', saCode: 'SA3.4', activityName: 'Consultare', activityNumber: 1, serviceCategory: 'Consultari' };
const document = (identity: { documentId?: string; fileHash?: string; fileData?: string; fileName?: string }) => ({ fileName: 'consultare.pdf', fileType: 'application/pdf', fileSize: 20, ...identity });
const request = { sourceActivityId: source.id, activities: [source], documents: [document({ fileHash: 'bytes-1' })], catalog: [catalog],
  expertId: 'expert', expertCategory: 'ap', projectCode: '302141', month: 5, year: 2026 };

test('known exact document resolves canonical source independently of AI availability', () => {
  assert.equal(resolveKnownActivityContinuation(request)?.id, source.id);
  assert.equal(resolveKnownActivityContinuation({ ...request, documents: [document({ documentId: 'doc1' })] })?.id, source.id);
});

test('similar cover or filename cannot justify adopting an existing activity', () => {
  assert.equal(resolveKnownActivityContinuation({ ...request, documents: [document({ fileName: 'consultare.pdf' })] }), null);
  assert.equal(resolveKnownActivityContinuation({ ...request, documents: [document({ documentId: 'doc1', fileData: 'new-file', fileHash: 'other-bytes' })] }), null);
});

test('every document must match the source, including extra evidence or photos', () => {
  assert.equal(resolveKnownActivityContinuation({ ...request, documents: [...request.documents, document({ fileHash: 'new-photo' })] }), null);
  assert.equal(resolveKnownActivityContinuation({ ...request, documents: [] }), null);
});

test('foreign scope, inactive catalog and pending sources cannot be continued', () => {
  for (const override of [{ expertId: 'other' }, { projectCode: 'other' }, { month: 6 }, { expertCategory: 'com' }]) {
    assert.equal(resolveKnownActivityContinuation({ ...request, ...override }), null);
  }
  assert.equal(resolveKnownActivityContinuation({ ...request, catalog: [{ ...catalog, isActive: false }] }), null);
  assert.equal(resolveKnownActivityContinuation({ ...request, activities: [{ ...source, activityType: 'pending_classification' }] }), null);
});
