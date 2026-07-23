import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActivitySaveWorkBlockInput } from '../lib/activity-report/activity-save-work-block.ts';
import { createActivityPeriodGroupId } from '../lib/submit-readiness.ts';
import type { Activity, Deliverable } from '../lib/types.ts';

function deliverable(overrides: Partial<Deliverable>): Deliverable {
  return {
    id: 'deliverable-1',
    fileName: 'livrabil.pdf',
    fileType: 'application/pdf',
    fileSize: 100,
    uploaded: true,
    ...overrides,
  };
}

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    expertId: 'expert-1',
    projectCode: '302141',
    date: '2026-06-02',
    hours: 2,
    activityType: 'Analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    deliverables: [],
    ...overrides,
  };
}

test('activitate single-day creeaza input work block complet', () => {
  const input = buildActivitySaveWorkBlockInput({
    savedActivities: [activity({ deliverables: [deliverable({ id: 'd1' })] })],
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
  });

  assert.equal(input?.id, 'work-block:activity:activity-1');
  assert.deepEqual(input?.activityIds, ['activity-1']);
  assert.deepEqual(input?.allocatedHoursByActivityId, { 'activity-1': 2 });
  assert.deepEqual(input?.deliverableIds, ['d1']);
  assert.equal(input?.title, 'Analiza acte normative');
  assert.equal(input?.saCode, 'SA3.4');
  assert.equal(input?.reportingFlowType, 'deliverable');
});

test('serie multi-day aduna toate zilele si orele', () => {
  const periodGroupId = createActivityPeriodGroupId('series-1');
  const input = buildActivitySaveWorkBlockInput({
    savedActivities: [
      activity({ id: 'a2', date: '2026-06-05', hours: 3, periodGroupId }),
      activity({ id: 'a1', date: '2026-06-02', hours: 2, periodGroupId }),
    ],
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
  });

  assert.equal(input?.id, `work-block:${periodGroupId}`);
  assert.deepEqual(input?.activityIds, ['a1', 'a2']);
  assert.deepEqual(input?.allocatedHoursByActivityId, { a1: 2, a2: 3 });
});

test('livrabile diferite in zile diferite intra in acelasi work block al seriei', () => {
  const periodGroupId = createActivityPeriodGroupId('series-deliverables');
  const input = buildActivitySaveWorkBlockInput({
    savedActivities: [
      activity({ id: 'a1', date: '2026-06-02', periodGroupId, deliverables: [deliverable({ id: 'd1' })] }),
      activity({ id: 'a2', date: '2026-06-03', periodGroupId, deliverables: [deliverable({ id: 'd2' })] }),
    ],
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
  });

  assert.equal(input?.id, `work-block:${periodGroupId}`);
  assert.deepEqual(input?.deliverableIds, ['d1', 'd2']);
});

test('modifica intreaga serie actualizeaza acelasi work block', () => {
  const periodGroupId = createActivityPeriodGroupId('existing-series');
  const existingBundles = [{
    workBlock: {
      id: `work-block:${periodGroupId}`,
      expertId: 'expert-1',
      projectCode: '302141',
      month: 5,
      year: 2026,
      title: 'Titlu vechi',
      saCode: 'SA3.4',
      reportingFlowType: 'deliverable' as const,
      status: 'draft' as const,
    },
    activityLinks: [],
    deliverableLinks: [],
  }];

  const input = buildActivitySaveWorkBlockInput({
    savedActivities: [
      activity({ id: 'a1', date: '2026-06-02', periodGroupId, title: 'Titlu nou' }),
      activity({ id: 'a2', date: '2026-06-03', periodGroupId, title: 'Titlu nou' }),
    ],
    editScope: 'series',
    sourceActivityId: 'a1',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    existingBundles,
  });

  assert.equal(input?.id, `work-block:${periodGroupId}`);
  assert.equal(input?.title, 'Titlu nou');
  assert.equal(input?.existingBundles, existingBundles);
});

test('editarea unei singure zile nu contamineaza restul seriei', () => {
  const seriesGroupId = createActivityPeriodGroupId('series-original');
  const detachedGroupId = createActivityPeriodGroupId('single-a1');
  const input = buildActivitySaveWorkBlockInput({
    savedActivities: [
      activity({ id: 'a1', date: '2026-06-02', periodGroupId: detachedGroupId, title: 'Zi editata' }),
      activity({ id: 'a2', date: '2026-06-03', periodGroupId: seriesGroupId, title: 'Zi ramasa' }),
    ],
    editScope: 'single',
    sourceActivityId: 'a1',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
  });

  assert.equal(input?.id, `work-block:${detachedGroupId}`);
  assert.deepEqual(input?.activityIds, ['a1']);
});
