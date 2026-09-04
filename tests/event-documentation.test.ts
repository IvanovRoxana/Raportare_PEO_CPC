import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEventDateConflictActivities,
  groupEventActivitiesWithDateConflicts,
  isActivityEventForDocumentation,
  requiresSameDayForSharedActivity,
} from '../lib/event-documentation.ts';
import type { Activity, ActivityCatalog } from '../lib/types.ts';

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
  {
    id: 'collaborative-event-material',
    category: 'ap',
    saCode: 'SA3.4',
    activityNumber: 3,
    serviceCategory: 'Reprezentare si participare la evenimente',
    activityName: 'Elaborare materiale suport eveniment',
    requiresSameDayForSharedDeliverable: false,
  },
  {
    id: 'event-flag-only',
    category: 'ap',
    saCode: 'SA3.4',
    activityNumber: 4,
    serviceCategory: 'Infrastructura dialog social',
    isEvent: true,
    activityName: 'Participare webinar',
  },
  {
    id: 'explicit-standard',
    category: 'ap',
    saCode: 'SA3.4',
    activityNumber: 5,
    serviceCategory: 'Reprezentare si participare la evenimente',
    isEvent: false,
    activityName: 'Pregatire materiale eveniment',
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

test('PM classifies rows with isEvent as event participation', () => {
  assert.equal(
    isActivityEventForDocumentation({
      catalogActivityId: 'event-flag-only',
      activityType: 'Participare webinar',
      title: 'Participare webinar',
    }, catalog),
    true,
  );
});

test('PM keeps explicitly non-event catalog rows as standard activities', () => {
  assert.equal(
    isActivityEventForDocumentation({
      catalogActivityId: 'explicit-standard',
      activityType: 'Pregatire materiale eveniment',
      title: 'Pregatire materiale eveniment',
    }, catalog),
    false,
  );
});

test('PM allows the catalog to exempt collaborative event deliverables from same-day alerts', () => {
  assert.equal(
    isActivityEventForDocumentation({
      catalogActivityId: 'collaborative-event-material',
      activityType: 'Elaborare materiale suport eveniment',
      title: 'Materiale suport Conferinta Nationala',
    }, catalog),
    true,
  );
  assert.equal(
    requiresSameDayForSharedActivity({
      catalogActivityId: 'collaborative-event-material',
      activityType: 'Elaborare materiale suport eveniment',
      title: 'Materiale suport Conferinta Nationala',
    }, catalog),
    false,
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

test('PM detects the same event reported on different days', () => {
  const activities = [
    {
      id: 'a1',
      expertId: 'e1',
      date: '2026-08-10',
      hours: 2,
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Conferinta Nationala a Angajatorilor',
    },
    {
      id: 'a2',
      expertId: 'e2',
      date: '2026-08-11',
      hours: 2,
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Participare la Conferința Națională a Angajatorilor',
    },
    {
      id: 'a3',
      expertId: 'e3',
      date: '2026-08-11',
      hours: 2,
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Participare la Conferinta Nationala a Angajatorilor',
    },
  ] as Activity[];

  const groups = groupEventActivitiesWithDateConflicts(activities, catalog);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].dates, ['2026-08-10', '2026-08-11']);
  assert.deepEqual(getEventDateConflictActivities(activities, catalog).map((activity) => activity.id), ['a1', 'a2', 'a3']);
});

test('PM ignores same collaborative deliverable reported on different days when catalog allows it', () => {
  const activities = [
    {
      id: 'a1',
      expertId: 'e1',
      date: '2026-08-10',
      hours: 2,
      catalogActivityId: 'collaborative-event-material',
      activityType: 'Elaborare materiale suport eveniment',
      title: 'Materiale suport Conferinta Nationala a Angajatorilor',
    },
    {
      id: 'a2',
      expertId: 'e2',
      date: '2026-08-11',
      hours: 2,
      catalogActivityId: 'collaborative-event-material',
      activityType: 'Elaborare materiale suport eveniment',
      title: 'Materiale suport Conferința Națională a Angajatorilor',
    },
  ] as Activity[];

  assert.equal(groupEventActivitiesWithDateConflicts(activities, catalog).length, 0);
  assert.deepEqual(getEventDateConflictActivities(activities, catalog), []);
});

test('PM ignores different events on different days', () => {
  const activities = [
    {
      id: 'a1',
      expertId: 'e1',
      date: '2026-08-10',
      hours: 2,
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Conferinta Nationala a Angajatorilor',
    },
    {
      id: 'a2',
      expertId: 'e2',
      date: '2026-08-11',
      hours: 2,
      catalogActivityId: 'event-participation',
      activityType: 'Participare la eveniment',
      title: 'Summit Comunicare si CSR',
    },
  ] as Activity[];

  assert.equal(groupEventActivitiesWithDateConflicts(activities, catalog).length, 0);
});
