import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDraftWorkBlockActivityOptions,
  getUnallocatedActivityCount,
  getUnallocatedHoursTotal,
} from '../lib/activity-report/draft-work-block-options.ts';
import { prepareDraftWorkBlockBundle } from '../lib/activity-report/draft-work-blocks.ts';
import type { Activity } from '../lib/types.ts';

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    expertId: 'expert-1',
    date: '2026-06-02',
    hours: 2,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    projectCode: '302141',
    ...overrides,
  };
}

test('calculeaza orele ramase pentru activitati partial alocate', () => {
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', hours: 3 }),
    activity({ id: 'a2', date: '2026-06-03', hours: 2 }),
  ];
  const existingBundle = prepareDraftWorkBlockBundle({
    id: 'wb-1',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza partiala',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
    allocatedHoursByActivityId: { a1: 1.5 },
  }, activities).bundle;

  const options = buildDraftWorkBlockActivityOptions({
    activities,
    existingBundles: existingBundle ? [existingBundle] : [],
  });

  assert.deepEqual(options.map((option) => [option.activityId, option.allocatedHours, option.remainingHours]), [
    ['a1', 1.5, 1.5],
    ['a2', 0, 2],
  ]);
  assert.equal(getUnallocatedActivityCount(options), 2);
  assert.equal(getUnallocatedHoursTotal(options), 3.5);
});

test('marcheaza activitatile complet alocate', () => {
  const activities = [activity({ id: 'a1', hours: 2 })];
  const existingBundle = prepareDraftWorkBlockBundle({
    id: 'wb-1',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza completa',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
  }, activities).bundle;

  const [option] = buildDraftWorkBlockActivityOptions({
    activities,
    existingBundles: existingBundle ? [existingBundle] : [],
  });

  assert.equal(option.remainingHours, 0);
  assert.equal(option.isFullyAllocated, true);
  assert.equal(getUnallocatedActivityCount([option]), 0);
});

test('exclude work block-ul curent cand editeaza alocarea', () => {
  const activities = [activity({ id: 'a1', hours: 2 })];
  const existingBundle = prepareDraftWorkBlockBundle({
    id: 'wb-edit',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza editata',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
  }, activities).bundle;

  const [option] = buildDraftWorkBlockActivityOptions({
    activities,
    existingBundles: existingBundle ? [existingBundle] : [],
    editingWorkBlockId: 'wb-edit',
  });

  assert.equal(option.allocatedHours, 0);
  assert.equal(option.remainingHours, 2);
  assert.equal(option.isFullyAllocated, false);
});

test('sorteaza optiunile cronologic si foloseste fallback pentru SA lipsa', () => {
  const options = buildDraftWorkBlockActivityOptions({
    activities: [
      activity({ id: 'late', date: '2026-06-10', title: 'B', saCode: '' }),
      activity({ id: 'early', date: '2026-06-02', title: 'A', saCode: 'SA3.4' }),
    ],
  });

  assert.deepEqual(options.map((option) => option.activityId), ['early', 'late']);
  assert.equal(options[1].saCode, 'SA neprecizata');
});
