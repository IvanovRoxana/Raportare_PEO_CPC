import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activityFormSource = readFileSync(
  new URL('../components/expert/activity-form.tsx', import.meta.url),
  'utf8',
);
const expertPeoPageSource = readFileSync(
  new URL('../app/expert/peo/page.tsx', import.meta.url),
  'utf8',
);

test('formularul citeste colaboratorii si din prefillActivity', () => {
  assert.match(activityFormSource, /const collaborationSeed = initialActivity \|\| prefillActivity/);
  assert.match(activityFormSource, /new Set<string>\(collaborationSeed\.takenByExperts \|\| \[\]\)/);
  assert.match(activityFormSource, /collaborationSeed\.deliverables\?\.forEach/);
  assert.match(activityFormSource, /collaborationSeed\?\.shareStatus === 'shared'/);
});

test('prefill-ul activitatilor comune pastreaza colaboratorii si livrabilele comune', () => {
  assert.match(expertPeoPageSource, /const sourceCollaborators = Array\.from\(new Set\(\[/);
  assert.match(expertPeoPageSource, /sourceActivity\.deliverables\?\.flatMap\(\(deliverable\) => deliverable\.sharedWithExpertIds \?\? \[\]\)/);
  assert.match(expertPeoPageSource, /const sharedDeliverables = sourceActivity\.deliverables\?\.map/);
  assert.match(expertPeoPageSource, /isCommonDeliverable: true/);
  assert.match(expertPeoPageSource, /shareStatus: 'shared'/);
  assert.match(expertPeoPageSource, /takenByExperts: sourceCollaborators/);
});
