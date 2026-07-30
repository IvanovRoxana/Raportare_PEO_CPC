import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activityFormSource = readFileSync(
  new URL('../components/expert/activity-form.tsx', import.meta.url),
  'utf8',
);

test('formularul permite activitatile COM lunare fara livrabil principal pe fiecare zi', () => {
  assert.match(activityFormSource, /isComCommunicationMultiGroupActivity/);
  assert.match(activityFormSource, /const usesMonthlyComDeliverable = !isEvent[\s\S]*effectiveActivityTitle/);
  assert.match(activityFormSource, /&& !usesMonthlyComDeliverable[\s\S]*!hasMainDeliverableForSave/);
  assert.match(activityFormSource, /&& !usesMonthlyComDeliverable[\s\S]*!hasUploadedMainDeliverable/);
});
