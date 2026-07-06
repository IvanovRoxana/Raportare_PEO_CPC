import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpertDeliverableRows, isUploadedDeliverable } from '../lib/expert-deliverables.ts';
import type { Activity, Deliverable } from '../lib/types.ts';

function deliverable(overrides: Partial<Deliverable>): Deliverable {
  return {
    id: overrides.id || 'deliverable-1',
    fileName: overrides.fileName ?? '',
    fileType: overrides.fileType ?? '',
    fileSize: overrides.fileSize ?? 0,
    ...overrides,
  };
}

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: overrides.id || 'activity-1',
    date: overrides.date || '2026-05-12',
    expertId: overrides.expertId || 'expert-1',
    hours: overrides.hours ?? 4,
    activityType: overrides.activityType || 'Analiza',
    title: overrides.title || 'Analiza documente',
    saCode: overrides.saCode,
    deliverables: overrides.deliverables,
  };
}

test('detecteaza livrabilele incarcate dupa fisier, S3 sau documentId', () => {
  assert.equal(isUploadedDeliverable(deliverable({ id: 'empty' })), false);
  assert.equal(isUploadedDeliverable(deliverable({ id: 'file', fileName: 'raport.pdf' })), true);
  assert.equal(isUploadedDeliverable(deliverable({ id: 's3', s3Key: 'projects/peo/doc.pdf' })), true);
  assert.equal(isUploadedDeliverable(deliverable({ id: 'doc', documentId: 'doc_1' })), true);
  assert.equal(isUploadedDeliverable(deliverable({ id: 'flag', uploaded: true })), true);
});

test('construieste randuri doar pentru livrabile incarcate si pastreaza contextul activitatii', () => {
  const rows = buildExpertDeliverableRows([
    activity({ id: 'empty-activity', deliverables: [] }),
    activity({
      id: 'activity-1',
      date: '2026-05-08',
      title: 'Intalnire parteneri',
      activityType: 'Intalnire',
      saCode: 'SA1.1',
      deliverables: [
        deliverable({ id: 'slot-empty' }),
        deliverable({
          id: 'deliverable-1',
          fileName: 'minute.pdf',
          declaredTitle: 'Minute intalnire',
          deliverableType: 'Minute intalnire / MOM',
        }),
        deliverable({
          id: 'deliverable-2',
          fileName: '',
          documentId: 'doc_2',
          s3Key: 'projects/peo/doc_2/adresa.pdf',
        }),
      ],
    }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.activityId), ['activity-1', 'activity-1']);
  const minuteRow = rows.find((row) => row.deliverable.id === 'deliverable-1');
  const documentRow = rows.find((row) => row.deliverable.id === 'deliverable-2');

  assert.ok(minuteRow);
  assert.equal(minuteRow.activityDate, '2026-05-08');
  assert.equal(minuteRow.activityTitle, 'Intalnire parteneri');
  assert.equal(minuteRow.activityType, 'Intalnire');
  assert.equal(minuteRow.saCode, 'SA1.1');
  assert.equal(minuteRow.title, 'Minute intalnire');
  assert.ok(documentRow);
  assert.equal(documentRow.fileName, 'doc_2');
  assert.equal(documentRow.auditReference, 'doc_2');
});
