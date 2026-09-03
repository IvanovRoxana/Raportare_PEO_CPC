import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activityFormSource = readFileSync(
  new URL('../components/expert/activity-form.tsx', import.meta.url),
  'utf8',
);

test('formularul permite salvarea activitatilor noi din orice pas valid', () => {
  assert.match(activityFormSource, /const canSaveFromCurrentStep = true;/);
  assert.match(activityFormSource, /disabled=\{!canSaveFromCurrentStep \|\| isSaveDisabled \|\| isSaving \|\| isSubmittingActivity\}/);
});
