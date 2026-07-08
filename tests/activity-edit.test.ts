import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSubmittedActivitiesForEdit,
  compileActivitiesByPeriodGroup,
  dedupeDeliverables,
  getActivityGroupMembers,
  getActivityGroupMembersForSelectedDates,
  prepareExistingActivityUpdate,
  planGroupedActivityEdit,
  splitActivityEditPayload,
} from '../lib/activity-edit.ts';
import { planDeliverableSync } from '../lib/activity-deliverable-sync.ts';
import { findMonthlyDeliverableDuplicate } from '../lib/deliverable-deduplication.ts';
import type { Activity, Deliverable } from '../lib/types.ts';

function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    date: '2026-06-03',
    expertId: 'expert-1',
    hours: 6,
    activityType: 'Activitate initiala',
    title: 'Activitate initiala',
    ...overrides,
  };
}

function deliverable(id: string, overrides: Partial<Deliverable> = {}): Deliverable {
  return {
    id,
    activityId: 'activity-1',
    fileName: `${id}.docx`,
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 1024,
    ...overrides,
  };
}

test('editarea unei activitati pastreaza id-ul activitatii existente', () => {
  const updated = prepareExistingActivityUpdate(
    { id: 'activity-1' },
    [activity('activity-1', { title: 'Activitate modificata', expertId: 'wrong-expert' })],
    'expert-1',
  );

  assert.equal(updated.id, 'activity-1');
  assert.equal(updated.expertId, 'expert-1');
  assert.equal(updated.title, 'Activitate modificata');
});

test('editarea unei activitati refuza payload-uri care ar crea sau modifica alt rand', () => {
  assert.throws(
    () => prepareExistingActivityUpdate({ id: 'activity-1' }, [activity('new-activity')], 'expert-1'),
    /identificatorul existent/,
  );

  assert.throws(
    () => prepareExistingActivityUpdate({ id: 'activity-1' }, [activity('activity-1'), activity('activity-2')], 'expert-1'),
    /o singura activitate/,
  );
});

test('editarea unei activitati separa zilele noi pentru creare', () => {
  const { existingActivity, newActivities } = splitActivityEditPayload(
    { id: 'activity-1' },
    [
      activity('activity-1', { date: '2026-06-03', title: 'Activitate modificata' }),
      activity('new-activity', { date: '2026-06-04', expertId: 'wrong-expert' }),
    ],
    'expert-1',
  );

  assert.equal(existingActivity.id, 'activity-1');
  assert.equal(existingActivity.date, '2026-06-03');
  assert.equal(existingActivity.expertId, 'expert-1');
  assert.deepEqual(newActivities.map((item) => item.date), ['2026-06-04']);
  assert.equal(newActivities[0].expertId, 'expert-1');
});

test('editarea multi-day a unei activitati vechi creeaza identitate de grup fara migrare AWS', () => {
  const editing = activity('activity-1', { date: '2026-06-05' });
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [activity('activity-1', { date: '2026-06-05' })],
    ['2026-06-04', '2026-06-05', '2026-06-11'],
    { '2026-06-04': '6', '2026-06-05': '6', '2026-06-11': '4' },
    [editing],
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const plan = planGroupedActivityEdit(editing, submitted, [editing], 'expert-1');

  assert.equal(plan.updateActivities.length, 1);
  assert.equal(plan.newActivities.length, 2);
  assert.equal(plan.deleteActivityIds.length, 0);
  assert.ok(submitted.every((item) => item.periodGroupId?.startsWith('activity-period:')));
  assert.equal(new Set(submitted.map((item) => item.periodGroupId)).size, 1);
});

test('editarea pastreaza orele din formular cand selectedHours este invechit', () => {
  const editing = activity('activity-1', { date: '2026-06-05', hours: 5 });
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [activity('activity-1', { date: '2026-06-05', hours: 5 })],
    ['2026-06-05'],
    { '2026-06-05': '8' },
    [editing],
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].hours, 5);
});

test('editarea unui grup actualizeaza zilele pastrate, creeaza zilele noi si sterge doar ziua scoasa', () => {
  const periodGroupId = 'activity-period:period-1';
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId }),
    activity('activity-5', { date: '2026-06-05', periodGroupId }),
    activity('activity-11', { date: '2026-06-11', periodGroupId }),
  ];
  const editing = groupMembers[1];
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [activity('activity-5', { date: '2026-06-05', periodGroupId })],
    ['2026-06-05', '2026-06-11', '2026-06-20'],
    { '2026-06-05': '6', '2026-06-11': '6', '2026-06-20': '2' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const plan = planGroupedActivityEdit(editing, submitted, groupMembers, 'expert-1');

  assert.deepEqual(plan.updateActivities.map((item) => item.id).sort(), ['activity-11', 'activity-5']);
  assert.equal(plan.newActivities.length, 1);
  assert.equal(plan.newActivities[0].date, '2026-06-20');
  assert.deepEqual(plan.deleteActivityIds, ['activity-4']);
  assert.ok([...plan.updateActivities, ...plan.newActivities].every((item) => item.periodGroupId === periodGroupId));
});

test('editarea multi-day regrupeaza activitati existente pe zilele selectate', () => {
  const existingActivities = [
    activity('activity-4', { date: '2026-06-04', saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-5', { date: '2026-06-05', saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-12', { date: '2026-06-12', saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-18', { date: '2026-06-18', saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
  ];
  const editing = existingActivities[0];
  const selectedDates = existingActivities.map((item) => item.date);
  const membersForEdit = getActivityGroupMembersForSelectedDates(editing, existingActivities, selectedDates);
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [activity('activity-4', {
      date: '2026-06-04',
      saCode: 'SA3.4',
      activityType: 'Analiza legislativa',
      deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
    })],
    selectedDates,
    Object.fromEntries(selectedDates.map((date) => [date, '6'])),
    membersForEdit,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const plan = planGroupedActivityEdit(editing, submitted, membersForEdit, 'expert-1');

  assert.deepEqual(plan.updateActivities.map((item) => item.id).sort(), ['activity-12', 'activity-18', 'activity-4', 'activity-5']);
  assert.equal(plan.newActivities.length, 0);
  assert.equal(plan.deleteActivityIds.length, 0);
  assert.equal(new Set(plan.updateActivities.map((item) => item.periodGroupId)).size, 1);
  assert.equal(new Set(plan.updateActivities.map((item) => item.workingGroupId)).size, 1);
});

test('grupurile de activitati expun livrabile deduplicate pentru raportare', () => {
  const periodGroupId = 'activity-period:period-1';
  const sharedDeliverable = deliverable('deliverable-1', { documentId: 'document-1', s3Key: 'docs/document-1.docx' });
  const activities = [
    activity('activity-4', { date: '2026-06-04', hours: 6, periodGroupId, deliverables: [sharedDeliverable] }),
    activity('activity-5', {
      date: '2026-06-05',
      hours: 4,
      periodGroupId,
      deliverables: [deliverable('deliverable-copy', { documentId: 'document-1', s3Key: 'docs/document-1.docx' })],
    }),
  ];

  assert.equal(getActivityGroupMembers(activities[0], activities).length, 2);
  assert.equal(dedupeDeliverables(activities.flatMap((item) => item.deliverables ?? [])).length, 1);

  const compiled = compileActivitiesByPeriodGroup(activities);
  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].date, '2026-06-04, 2026-06-05');
  assert.equal(compiled[0].hours, 10);
  assert.equal(compiled[0].deliverables?.length, 1);
});

test('sincronizarea livrabilelor actualizeaza livrabilul existent fara sa il recreeze', () => {
  const existing = [deliverable('deliverable-1')];
  const next = [deliverable('deliverable-1', { declaredTitle: 'Titlu modificat' })];
  const plan = planDeliverableSync(existing, next);

  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toDelete, []);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].id, 'deliverable-1');
  assert.equal(plan.toUpdate[0].declaredTitle, 'Titlu modificat');
});

test('sincronizarea livrabilelor sterge doar livrabilul eliminat si creeaza doar livrabilul nou', () => {
  const existing = [deliverable('deliverable-1'), deliverable('deliverable-2')];
  const next = [deliverable('deliverable-1'), deliverable('new-deliverable')];
  const plan = planDeliverableSync(existing, next);

  assert.deepEqual(plan.toUpdate.map((item) => item.id), ['deliverable-1']);
  assert.deepEqual(plan.toCreate.map((item) => item.id), ['new-deliverable']);
  assert.deepEqual(plan.toDelete, [{ id: 'deliverable-2' }]);
});

test('sincronizarea livrabilelor uneste duplicatele din acelasi payload inainte de creare', () => {
  const next = [
    deliverable('new-deliverable', { documentId: 'document-1', declaredTitle: 'Titlu confirmat' }),
    deliverable('duplicate-deliverable', { documentId: 'document-1', s3Key: 'docs/document-1.docx' }),
  ];
  const plan = planDeliverableSync([], next);

  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toCreate[0].id, 'new-deliverable');
  assert.equal(plan.toCreate[0].documentId, 'document-1');
  assert.equal(plan.toCreate[0].s3Key, 'docs/document-1.docx');
  assert.equal(plan.toCreate[0].declaredTitle, 'Titlu confirmat');
});

test('validarea lunara marcheaza acelasi document pe alta activitate ca duplicat', () => {
  const duplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [
      activity('activity-1', {
        date: '2026-06-03',
        deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
      }),
    ],
    nextActivities: [
      activity('activity-2', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-2', { documentId: 'document-1' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.ok(duplicate);
  assert.equal(duplicate.existingActivity.id, 'activity-1');
  assert.equal(duplicate.activity.id, 'activity-2');
});

test('validarea lunara permite acelasi document in alta luna si fisiere cu hash diferit', () => {
  const otherMonthDuplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [
      activity('activity-1', {
        date: '2026-05-31',
        deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
      }),
    ],
    nextActivities: [
      activity('activity-2', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-2', { documentId: 'document-1' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  const differentHashDuplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [
      activity('activity-1', {
        date: '2026-06-03',
        deliverables: [deliverable('deliverable-1', { fileName: 'raport.docx', fileHash: 'hash-1' })],
      }),
    ],
    nextActivities: [
      activity('activity-2', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-2', { fileName: 'raport.docx', fileHash: 'hash-2' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.equal(otherMonthDuplicate, null);
  assert.equal(differentHashDuplicate, null);
});

test('validarea lunara ignora documentId vechi cand slotul are fisier nou incarcat', () => {
  const duplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [
      activity('activity-1', {
        date: '2026-06-03',
        deliverables: [deliverable('deliverable-1', { documentId: 'document-1', fileHash: 'hash-1' })],
      }),
    ],
    nextActivities: [
      activity('activity-2', {
        date: '2026-06-10',
        deliverables: [
          deliverable('deliverable-2', {
            documentId: 'document-1',
            fileName: 'raport-nou.docx',
            fileHash: 'hash-2',
            fileData: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,abc',
          }),
        ],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.equal(duplicate, null);
});
