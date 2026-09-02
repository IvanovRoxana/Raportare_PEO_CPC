import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activitiesTableSource = readFileSync(
  new URL('../components/expert/activities-table.tsx', import.meta.url),
  'utf8',
);

test('jurnalul separa activitatile cu acelasi periodGroupId dupa identitatea activitatii', () => {
  assert.match(activitiesTableSource, /const activityIdentityKey = catalogKey/);
  assert.match(activitiesTableSource, /activity\.catalogActivityId/);
  assert.match(activitiesTableSource, /activity\.saCode/);
  assert.match(activitiesTableSource, /activity\.activityType \|\| activity\.title/);
  assert.match(activitiesTableSource, /`period:\$\{activity\.periodGroupId\}:\$\{activityIdentityKey\}`/);
});
