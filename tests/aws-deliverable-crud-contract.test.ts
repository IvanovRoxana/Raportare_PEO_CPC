import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');

function getActivityUpdateSource() {
  const startMarker = 'async update(id: string, updates: Partial<Activity>): Promise<void>';
  const endMarker = 'async delete(id: string): Promise<void>';
  const start = awsStoreSource.indexOf(startMarker);
  const end = awsStoreSource.indexOf(endMarker, start);

  assert.notEqual(start, -1, 'Nu a fost gasita metoda activitiesService.update');
  assert.notEqual(end, -1, 'Nu a fost gasita limita metodei activitiesService.update');
  return awsStoreSource.slice(start, end);
}

test('CRUD-ul livrabilelor din update citeste starea existenta prin indexul activityId', () => {
  const updateSource = getActivityUpdateSource();

  assert.match(updateSource, /planDeliverableSync\(/);
  assert.match(updateSource, /listDeliverablesByActivityId<any>\(client\.models\.Deliverable, id\)/);
  assert.doesNotMatch(
    updateSource,
    /listModel<any>\(client\.models\.Deliverable, \{ activityId:/,
  );
});
