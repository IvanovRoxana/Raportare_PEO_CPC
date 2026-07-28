import test from 'node:test';
import assert from 'node:assert/strict';

import { isActivityEventForDocumentation } from '../lib/event-documentation.ts';
import type { ActivityCatalog } from '../lib/types.ts';

const catalog = [
  {
    id: 'standard-event-preparation',
    category: 'ap',
    saCode: 'SA3.4',
    activityNumber: 1,
    serviceCategory: 'Infrastructura dialog social',
    activityName: 'Organizare eveniment / pregatire lista potentiali invitati',
  },
  {
    id: 'event-participation',
    category: 'ap',
    saCode: 'SA3.4',
    activityNumber: 2,
    serviceCategory: 'Reprezentare si participare la evenimente',
    activityName: 'Participare la eveniment',
  },
] as ActivityCatalog[];

test('PM does not classify standard event preparation as event participation', () => {
  assert.equal(
    isActivityEventForDocumentation({
      catalogActivityId: 'standard-event-preparation',
      activityType: 'Organizare eveniment / pregatire lista potentiali invitati',
      title: 'Organizare eveniment / pregatire lista potentiali invitati',
    }, catalog),
    false,
  );
});

test('PM classifies the event service category as event participation', () => {
  assert.equal(
    isActivityEventForDocumentation({
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Participare la eveniment',
    }, catalog),
    true,
  );
});

test('PM keeps title fallback only for legacy activities without catalog id', () => {
  assert.equal(
    isActivityEventForDocumentation({
      activityType: 'Participare la conferinta',
      title: 'Participare la conferinta',
    }, catalog),
    true,
  );
});
