import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeliverableAttachmentDate,
  getFinalDeliverableAttachmentDate,
  shouldAttachUploadedDeliverablesToDate,
} from '../lib/activity-deliverables.ts';

test('alege ultima data selectata pentru atasarea livrabilelor incarcate', () => {
  assert.equal(
    getFinalDeliverableAttachmentDate(['2026-05-07', '2026-05-06', '2026-05-08']),
    '2026-05-08',
  );
});

test('atasarea livrabilelor se face doar pe activitatea finala cand sunt mai multe date', () => {
  const selectedDates = ['2026-05-06', '2026-05-07', '2026-05-08'];

  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-06'), false);
  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-07'), false);
  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-08'), true);
});

test('atasarea livrabilelor prefera ziua editata cand este in selectie', () => {
  const selectedDates = ['2026-05-06', '2026-05-07', '2026-05-08'];

  assert.equal(getDeliverableAttachmentDate(selectedDates, '2026-05-07'), '2026-05-07');
  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-06', '2026-05-07'), false);
  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-07', '2026-05-07'), true);
  assert.equal(shouldAttachUploadedDeliverablesToDate(selectedDates, '2026-05-08', '2026-05-07'), false);
});

test('atasarea livrabilelor revine la ultima zi cand ziua preferata nu este selectata', () => {
  const selectedDates = ['2026-05-06', '2026-05-07', '2026-05-08'];

  assert.equal(getDeliverableAttachmentDate(selectedDates, '2026-05-10'), '2026-05-08');
});
