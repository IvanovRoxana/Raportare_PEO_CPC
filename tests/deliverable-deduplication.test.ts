import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeDeliverablesBySignature,
  findActivityOwningDeliverableSignature,
  findMonthlyDeliverableDuplicate,
  getDeliverableDocumentSignature,
  hasSameDeliverableDocument,
} from '../lib/deliverable-deduplication.ts';
import { planDeliverableSync } from '../lib/activity-deliverable-sync.ts';
import type { Activity, Deliverable } from '../lib/types.ts';

function deliverable(id: string, overrides: Partial<Deliverable> = {}): Deliverable {
  return {
    id,
    activityId: 'activity-existing',
    fileName: 'raport.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    firstPageTextHash: 'shared-cover',
    contentFingerprint: 'shared-extracted-text',
    declaredTitle: 'Raport lunar',
    ...overrides,
  };
}

function activity(id: string, document: Deliverable): Activity {
  return {
    id,
    expertId: 'expert-1',
    date: '2026-06-03',
    hours: 2,
    activityType: 'Raportare',
    title: 'Raportare',
    deliverables: [document],
  };
}

function findDuplicate(existing: Deliverable, candidate: Deliverable) {
  return findMonthlyDeliverableDuplicate({
    existingActivities: [activity('activity-existing', existing)],
    nextActivities: [activity('activity-next', candidate)],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });
}

test('validarea lunara gaseste acelasi fisier salvat sau proaspat incarcat sub alt documentId', () => {
  const existing = deliverable('saved', { documentId: 'document-existing', fileHash: 'same-bytes' });
  for (const fileData of [undefined, 'data:application/pdf;base64,c2FtZQ==']) {
    const candidate = deliverable('next', { documentId: 'document-new', fileHash: 'same-bytes', fileData });
    const duplicate = findDuplicate(existing, candidate);

    assert.equal(duplicate?.existingActivity.id, 'activity-existing');
    assert.equal(duplicate?.activity.id, 'activity-next');
    assert.equal(duplicate?.existingDeliverable.id, 'saved');
    assert.equal(hasSameDeliverableDocument(existing, candidate), true);
    assert.equal(dedupeDeliverablesBySignature([existing, candidate]).length, 1);
  }
});

test('documentId salvat pastreaza identitatea cand o referinta nu are hash', () => {
  const existing = deliverable('saved', { documentId: 'document-shared', fileHash: 'same-bytes' });
  const candidate = deliverable('next', { documentId: 'document-shared' });

  assert.equal(getDeliverableDocumentSignature(existing), 'document:document-shared');
  assert.ok(findDuplicate(existing, candidate));
  assert.equal(dedupeDeliverablesBySignature([existing, candidate]).length, 1);
});

test('acelasi documentId salvat ramane identitate chiar cu hash istoric inconsistent', () => {
  const existing = deliverable('saved', { documentId: 'document-shared', fileHash: 'old-hash' });
  const candidate = deliverable('next', { documentId: 'document-shared', fileHash: 'new-hash' });

  assert.equal(hasSameDeliverableDocument(existing, candidate), true);
  assert.ok(findDuplicate(existing, candidate));
  const distinct = deliverable('distinct', { documentId: 'document-distinct', fileHash: 'new-hash' });
  assert.deepEqual(dedupeDeliverablesBySignature([existing, candidate, distinct]).map((item) => item.id), [
    'saved', 'distinct',
  ]);
});

test('inlocuirea unui fisier ignora documentId anterior si pastreaza octetii diferiti', () => {
  const existing = deliverable('saved', { documentId: 'document-shared', fileHash: 'old-hash' });
  const candidate = deliverable('next', {
    documentId: 'document-shared',
    fileHash: 'new-hash',
    fileData: 'data:application/pdf;base64,bmV3',
  });

  assert.equal(findDuplicate(existing, candidate), null);
  assert.equal(hasSameDeliverableDocument(existing, candidate), false);
  assert.equal(dedupeDeliverablesBySignature([existing, candidate]).length, 2);
});

test('titlul coperta si metadatele identice nu sterg fisiere distincte cu hash diferit sau necunoscut', () => {
  for (const hashes of [['hash-a', 'hash-b'], ['hash-a', undefined], [undefined, undefined]]) {
    const existing = deliverable('saved', { fileHash: hashes[0] });
    const candidate = deliverable('next', { fileHash: hashes[1] });

    assert.equal(findDuplicate(existing, candidate), null);
    assert.equal(hasSameDeliverableDocument(existing, candidate), false);
    const plan = planDeliverableSync([existing], [existing, candidate]);
    assert.deepEqual(plan.toDelete, []);
    assert.deepEqual(plan.toUpdate.map((item) => item.id), ['saved']);
    assert.deepEqual(plan.toCreate.map((item) => item.id), ['next']);
  }
});

test('hash-ul fisierului proaspat incarcat rezolva proprietarul documentului salvat', () => {
  const existing = deliverable('saved', { documentId: 'document-existing', fileHash: 'same-bytes' });
  const candidate = deliverable('next', { fileHash: 'same-bytes', fileData: 'data:application/pdf;base64,c2FtZQ==' });

  assert.equal(findActivityOwningDeliverableSignature(
    [activity('activity-existing', existing)],
    getDeliverableDocumentSignature(candidate),
  )?.id, 'activity-existing');
});

test('reutilizarea confirmata elimina referintele aceluiasi fisier si pastreaza fisierele distincte', () => {
  const existing = deliverable('saved', { documentId: 'document-existing', fileHash: 'same-bytes' });
  const candidate = deliverable('next', { documentId: 'document-new', fileHash: 'same-bytes' });
  const duplicate = findDuplicate(existing, candidate);
  assert.ok(duplicate);
  const fresh = deliverable('fresh', { fileHash: 'same-bytes', fileData: 'data:application/pdf;base64,c2FtZQ==' });
  const distinct = deliverable('distinct', { fileHash: 'different-bytes' });
  const remaining = [candidate, fresh, distinct].filter((document) => !hasSameDeliverableDocument(document, duplicate.deliverable));

  assert.deepEqual(remaining.map((document) => document.id), ['distinct']);
  assert.equal(findMonthlyDeliverableDuplicate({
    existingActivities: [activity('activity-existing', existing)],
    nextActivities: [{ ...activity('activity-next', candidate), deliverables: remaining }],
    expertId: 'expert-1', month: 5, year: 2026,
  }), null);
});
