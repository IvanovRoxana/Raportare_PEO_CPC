import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDraftWorkBlockBundle } from '../lib/activity-report/draft-work-blocks.ts';
import { buildWorkBlocks } from '../lib/activity-report/work-blocks.ts';
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

test('pregateste un draft work block multi-day cu mai multe livrabile fara sa modifice activitatile', () => {
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', hours: 2 }),
    activity({ id: 'a2', date: '2026-06-05', hours: 3 }),
  ];

  const result = prepareDraftWorkBlockBundle({
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza acte normative iunie',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a2', 'a1'],
    deliverableIds: ['d1', 'd2'],
  }, activities);

  assert.deepEqual(result.issues, []);
  assert.equal(result.bundle?.workBlock.status, 'draft');
  assert.deepEqual(result.bundle?.activityLinks.map((link) => link.activityId), ['a1', 'a2']);
  assert.deepEqual(result.bundle?.activityLinks.map((link) => link.allocatedHours), [2, 3]);
  assert.deepEqual(result.bundle?.deliverableLinks.map((link) => link.deliverableId), ['d1', 'd2']);
  assert.deepEqual(activities.map((item) => item.hours), [2, 3]);
});

test('refuza draft-ul cand alocarea ar dubla orele unei activitati existente', () => {
  const activities = [activity({ id: 'a1', hours: 2 })];
  const existingBundles = buildWorkBlocks(activities);

  const result = prepareDraftWorkBlockBundle({
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza suplimentara',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
    allocatedHoursByActivityId: { a1: 1 },
    existingBundles,
  }, activities);

  assert.equal(result.bundle, null);
  assert.equal(result.issues.some((issue) => issue.code === 'over_allocated_activity'), true);
});

test('refuza activitati din alt expert sau alta luna', () => {
  const activities = [
    activity({ id: 'other-expert', expertId: 'expert-2' }),
    activity({ id: 'other-month', date: '2026-07-01' }),
  ];

  const result = prepareDraftWorkBlockBundle({
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza',
    saCode: 'SA3.4',
    reportingFlowType: 'other',
    activityIds: ['other-expert', 'other-month'],
  }, activities);

  assert.equal(result.bundle, null);
  assert.equal(result.issues.some((issue) => issue.code === 'activity_expert_mismatch'), true);
  assert.equal(result.issues.some((issue) => issue.code === 'activity_outside_period'), true);
});

test('refuza draft-uri fara titlu, SA sau activitati', () => {
  const result = prepareDraftWorkBlockBundle({
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: ' ',
    saCode: '',
    reportingFlowType: 'other',
    activityIds: [],
  }, []);

  assert.equal(result.bundle, null);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['missing_activity_selection', 'missing_title', 'missing_sa'],
  );
});
