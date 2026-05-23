import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
