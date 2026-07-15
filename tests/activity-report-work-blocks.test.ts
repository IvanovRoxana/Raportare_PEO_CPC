import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWorkBlocks,
  calculateWorkBlockHours,
  groupWorkBlocksBySA,
  sortWorkBlocks,
  validateWorkBlockAllocation,
  type ReportingWorkBlockBundle,
} from '../lib/activity-report/work-blocks.ts';
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

test('construieste un work block implicit per activitate cand nu exista periodGroupId', () => {
  const bundles = buildWorkBlocks([
    activity({ id: 'activity-1', date: '2026-06-02' }),
    activity({ id: 'activity-2', date: '2026-06-05' }),
  ]);

  assert.equal(bundles.length, 2);
  assert.deepEqual(bundles.map((bundle) => bundle.activityLinks.length), [1, 1]);
  assert.equal(calculateWorkBlockHours(bundles[0].activityLinks), 2);
});

test('grupeaza mai multe zile cu acelasi periodGroupId intr-un singur work block', () => {
  const bundles = buildWorkBlocks([
    activity({ id: 'activity-1', date: '2026-06-02', hours: 2, periodGroupId: 'legislation-june' }),
    activity({ id: 'activity-2', date: '2026-06-05', hours: 3, periodGroupId: 'legislation-june' }),
    activity({ id: 'activity-3', date: '2026-06-10', hours: 1, periodGroupId: 'legislation-june' }),
  ]);

  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].workBlock.id, 'work-block:legislation-june');
  assert.equal(calculateWorkBlockHours(bundles[0].activityLinks), 6);
  assert.deepEqual(bundles[0].activityLinks.map((link) => link.activityDate), ['2026-06-02', '2026-06-05', '2026-06-10']);
});

test('asociaza mai multe livrabile aceluiasi work block fara sa modifice livrabilele', () => {
  const firstDeliverable = { id: 'deliverable-1', fileName: 'Agenda.docx', fileType: 'docx', fileSize: 10 };
  const secondDeliverable = { id: 'deliverable-2', fileName: 'Minuta.docx', fileType: 'docx', fileSize: 12 };
  const bundles = buildWorkBlocks([
    activity({
      id: 'activity-1',
      periodGroupId: 'meeting',
      deliverables: [firstDeliverable],
    }),
    activity({
      id: 'activity-2',
      date: '2026-06-03',
      periodGroupId: 'meeting',
      deliverables: [secondDeliverable],
    }),
  ]);

  assert.equal(bundles.length, 1);
  assert.deepEqual(bundles[0].deliverableLinks.map((link) => link.deliverableId), ['deliverable-1', 'deliverable-2']);
  assert.deepEqual([firstDeliverable.id, secondDeliverable.id], ['deliverable-1', 'deliverable-2']);
});

test('deduplica acelasi livrabil in acelasi work block', () => {
  const deliverable = { id: 'deliverable-1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 };
  const bundles = buildWorkBlocks([
    activity({ id: 'activity-1', periodGroupId: 'analysis', deliverables: [deliverable] }),
    activity({ id: 'activity-2', date: '2026-06-03', periodGroupId: 'analysis', deliverables: [deliverable] }),
  ]);

  assert.equal(bundles[0].deliverableLinks.length, 1);
  assert.equal(bundles[0].deliverableLinks[0].isPrimary, true);
});

test('grupeaza work block-urile pe SA si sorteaza cronologic in fiecare SA', () => {
  const bundles = buildWorkBlocks([
    activity({ id: 'activity-late', date: '2026-06-20', saCode: 'SA3.4', title: 'Tarziu' }),
    activity({ id: 'activity-early', date: '2026-06-02', saCode: 'SA3.4', title: 'Devreme' }),
    activity({ id: 'activity-other-sa', date: '2026-06-01', saCode: 'SA3.5', title: 'Alt SA' }),
  ]);

  const grouped = groupWorkBlocksBySA(bundles);

  assert.deepEqual(Object.keys(grouped), ['SA3.4', 'SA3.5']);
  assert.deepEqual(grouped['SA3.4'].map((bundle) => bundle.activityLinks[0].activityId), ['activity-early', 'activity-late']);
});

test('sorteaza work block-urile dupa SA si prima data', () => {
  const bundles = buildWorkBlocks([
    activity({ id: 'b', date: '2026-06-10', saCode: 'SA3.4' }),
    activity({ id: 'a', date: '2026-06-02', saCode: 'SA3.4' }),
  ]);

  assert.deepEqual(sortWorkBlocks(bundles).map((bundle) => bundle.activityLinks[0].activityId), ['a', 'b']);
});

test('valideaza ca totalul alocat nu depaseste orele pontate', () => {
  const sourceActivities = [activity({ id: 'activity-1', hours: 2 })];
  const bundles = buildWorkBlocks(sourceActivities);
  const invalidBundles: ReportingWorkBlockBundle[] = [{
    ...bundles[0],
    activityLinks: [{ ...bundles[0].activityLinks[0], allocatedHours: 3 }],
  }];

  const problems = validateWorkBlockAllocation(sourceActivities, invalidBundles);

  assert.equal(problems.some((problem) => problem.code === 'over_allocated_activity'), true);
});

test('valideaza ore negative si activitati inexistente', () => {
  const sourceActivities = [activity({ id: 'activity-1', hours: 2 })];
  const bundles = buildWorkBlocks(sourceActivities);
  const invalidBundles: ReportingWorkBlockBundle[] = [{
    ...bundles[0],
    activityLinks: [{
      ...bundles[0].activityLinks[0],
      id: 'bad-link',
      activityId: 'missing-activity',
      allocatedHours: -1,
    }],
  }];

  const problems = validateWorkBlockAllocation(sourceActivities, invalidBundles);

  assert.equal(problems.some((problem) => problem.code === 'missing_activity'), true);
  assert.equal(problems.some((problem) => problem.code === 'negative_allocated_hours'), true);
});

test('valideaza work block fara SA si fara ore', () => {
  const sourceActivities = [activity({ id: 'activity-1', hours: 0, saCode: '' })];
  const bundles = buildWorkBlocks(sourceActivities);

  const problems = validateWorkBlockAllocation(sourceActivities, bundles);

  assert.equal(problems.some((problem) => problem.code === 'missing_sa'), true);
  assert.equal(problems.some((problem) => problem.code === 'zero_hour_work_block'), true);
});

test('infereaza tipurile principale de flux raportabil', () => {
  assert.equal(buildWorkBlocks([activity({ id: 'leave', dayType: 'CO', title: 'Concediu' })])[0].workBlock.reportingFlowType, 'leave');
  assert.equal(buildWorkBlocks([activity({ id: 'event', title: 'Eveniment national' })])[0].workBlock.reportingFlowType, 'event');
  assert.equal(buildWorkBlocks([activity({ id: 'meeting', title: 'Reuniune TF Consumers' })])[0].workBlock.reportingFlowType, 'meeting');
  assert.equal(buildWorkBlocks([activity({ id: 'deliverable', deliverables: [{ id: 'd1', fileName: 'Doc.docx', fileType: 'docx', fileSize: 1 }] })])[0].workBlock.reportingFlowType, 'deliverable');
});
