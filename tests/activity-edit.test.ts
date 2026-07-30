import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSubmittedActivitiesForEdit,
  compileActivitiesByPeriodGroup,
  dedupeDeliverables,
  executeGroupedActivityDeletion,
  getActivityGroupMembers,
  getActivityGroupMembersForSelectedDates,
  mergeActivityGroupForEdit,
  prepareExistingActivityUpdate,
  planGroupedActivityDeletion,
  planGroupedActivityEdit,
  splitActivityEditPayload,
} from '../lib/activity-edit.ts';
import { planDeliverableSync } from '../lib/activity-deliverable-sync.ts';
import {
  areActivitiesCompatibleForDeliverableGroup,
  findActivityOwningDeliverableSignature,
  findMonthlyDeliverableDuplicate,
  getDeliverableDocumentSignature,
} from '../lib/deliverable-deduplication.ts';
import { getActivitiesMissingDeliverables } from '../lib/submit-readiness.ts';
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

test('editarea seriei aplica orele selectate pe fiecare zi', () => {
  const periodGroupId = 'activity-period:period-1';
  const groupMembers = [
    activity('activity-4', { date: '2026-06-15', hours: 8, periodGroupId }),
    activity('activity-5', { date: '2026-06-16', hours: 8, periodGroupId }),
  ];
  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [
      activity('activity-4', { date: '2026-06-15', hours: 2, periodGroupId }),
      activity('activity-5', { date: '2026-06-16', hours: 1, periodGroupId }),
    ],
    groupMembers.map((item) => item.date),
    { '2026-06-15': '2', '2026-06-16': '1' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
    'series',
  );

  assert.equal(submitted.find((item) => item.date === '2026-06-15')?.hours, 2);
  assert.equal(submitted.find((item) => item.date === '2026-06-16')?.hours, 1);
});

test('editarea cu schimbare de data pastreaza id-ul si livrabilele existente', () => {
  const existingDeliverable = deliverable('deliverable-1', {
    titleConfirmed: true,
    titleCheckStatus: 'verified',
    eligibilityCheck: {
      status: 'eligibil',
      score: 100,
      summary: 'Validat anterior',
      checks: [],
      missingElements: [],
      recommendations: [],
      riskFlags: [],
    },
  });
  const editing = activity('activity-1', {
    date: '2026-06-22',
    hours: 2,
    deliverables: [existingDeliverable],
  });
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [activity('activity-1', {
      date: '2026-06-27',
      hours: 2,
      deliverables: [existingDeliverable],
    })],
    ['2026-06-27'],
    { '2026-06-27': '2' },
    [editing],
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const plan = planGroupedActivityEdit(editing, submitted, [editing], 'expert-1');

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].id, 'activity-1');
  assert.equal(submitted[0].date, '2026-06-27');
  assert.deepEqual(submitted[0].deliverables, [existingDeliverable]);
  assert.deepEqual(plan.updateActivities.map((item) => item.id), ['activity-1']);
  assert.equal(plan.newActivities.length, 0);
  assert.equal(plan.deleteActivityIds.length, 0);
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

test('editarea din aplicatie poate pastra zilele lipsa fara stergere implicita', () => {
  const periodGroupId = 'activity-period:period-1';
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId }),
    activity('activity-5', { date: '2026-06-05', periodGroupId }),
  ];
  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', { date: '2026-06-04', periodGroupId })],
    ['2026-06-04'],
    { '2026-06-04': '6' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const plan = planGroupedActivityEdit(groupMembers[0], submitted, groupMembers, 'expert-1', false);

  assert.deepEqual(plan.updateActivities.map((item) => item.id), ['activity-4']);
  assert.equal(plan.newActivities.length, 0);
  assert.deepEqual(plan.deleteActivityIds, []);
});

test('editarea multi-day regrupeaza activitati existente pe zilele selectate', () => {
  const existingActivities = [
    activity('activity-4', { date: '2026-06-04', hours: 4, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-5', { date: '2026-06-05', hours: 4, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-12', { date: '2026-06-12', hours: 4, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-18', { date: '2026-06-18', hours: 2, saCode: 'SA3.4', activityType: 'Analiza legislativa', title: 'Titlu deja salvat' }),
  ];
  const editing = existingActivities[0];
  const selectedDates = existingActivities.map((item) => item.date);
  const membersForEdit = getActivityGroupMembersForSelectedDates(editing, existingActivities, selectedDates);
  const submitted = buildSubmittedActivitiesForEdit(
    editing,
    [
      activity('activity-4', {
        date: '2026-06-04',
        hours: 6,
        saCode: 'SA3.4',
        activityType: 'Analiza legislativa',
        deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
      }),
      activity('generated-5', { date: '2026-06-05', hours: 6, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
      activity('generated-12', { date: '2026-06-12', hours: 6, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
      activity('generated-18', { date: '2026-06-18', hours: 6, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    ],
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
  assert.equal(plan.updateActivities.find((item) => item.id === 'activity-18')?.hours, 2);
  assert.equal(plan.updateActivities.find((item) => item.id === 'activity-18')?.title, 'Titlu deja salvat');
});

test('editarea multi-day pastreaza randul existent dar ataseaza livrabilul nou pe ziua existenta', () => {
  const periodGroupId = 'activity-period:period-1';
  const existingActivities = [
    activity('activity-4', { date: '2026-06-04', hours: 4, periodGroupId, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-18', {
      date: '2026-06-18',
      hours: 2,
      periodGroupId,
      saCode: 'SA3.4',
      activityType: 'Analiza legislativa',
      title: 'Titlu deja salvat',
      deliverables: [],
    }),
  ];
  const selectedDates = existingActivities.map((item) => item.date);
  const membersForEdit = getActivityGroupMembersForSelectedDates(existingActivities[0], existingActivities, selectedDates);
  const submitted = buildSubmittedActivitiesForEdit(
    existingActivities[0],
    [
      activity('activity-4', { date: '2026-06-04', hours: 8, periodGroupId, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
      activity('generated-18', {
        date: '2026-06-18',
        hours: 8,
        periodGroupId,
        saCode: 'SA3.4',
        activityType: 'Analiza legislativa',
        deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
      }),
    ],
    selectedDates,
    Object.fromEntries(selectedDates.map((date) => [date, '8'])),
    membersForEdit,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );
  const preservedDay = submitted.find((item) => item.id === 'activity-18');

  assert.equal(preservedDay?.hours, 2);
  assert.equal(preservedDay?.title, 'Titlu deja salvat');
  assert.equal(preservedDay?.deliverables?.[0]?.documentId, 'document-1');
});

test('editarea unei singure zile o desprinde din serie si pastreaza celelalte zile neschimbate', () => {
  const periodGroupId = 'activity-period:period-1';
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', hours: 4, periodGroupId, title: 'Activitate veche' }),
    activity('activity-5', { date: '2026-06-05', hours: 6, periodGroupId, title: 'Activitate veche' }),
  ];
  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', { date: '2026-06-04', hours: 8, periodGroupId, title: 'Activitate noua' })],
    groupMembers.map((item) => item.date),
    { '2026-06-04': '8', '2026-06-05': '8' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
    'single',
  );

  assert.equal(submitted.find((item) => item.id === 'activity-4')?.title, 'Activitate noua');
  assert.notEqual(submitted.find((item) => item.id === 'activity-4')?.periodGroupId, periodGroupId);
  assert.equal(submitted.find((item) => item.id === 'activity-5')?.title, 'Activitate veche');
  assert.equal(submitted.find((item) => item.id === 'activity-5')?.hours, 6);
  assert.equal(submitted.find((item) => item.id === 'activity-5')?.periodGroupId, periodGroupId);
});

test('editarea intregii serii propaga activitatea si livrabilele, pastrand datele specifice fiecarei zile', () => {
  const periodGroupId = 'activity-period:period-1';
  const firstDeliverable = deliverable('deliverable-1');
  const secondDeliverable = deliverable('deliverable-2');
  const replacementDeliverable = deliverable('deliverable-new', { documentId: 'document-new' });
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', hours: 4, periodGroupId, title: 'Activitate veche', deliverables: [firstDeliverable] }),
    activity('activity-5', { date: '2026-06-05', hours: 6, periodGroupId, title: 'Activitate veche', deliverables: [secondDeliverable] }),
  ];
  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', {
      date: '2026-06-04',
      hours: 8,
      periodGroupId,
      title: 'Activitate noua',
      activityType: 'Activitate noua',
      catalogActivityId: 'catalog-new',
      deliverables: [replacementDeliverable],
    })],
    groupMembers.map((item) => item.date),
    { '2026-06-04': '8', '2026-06-05': '8' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
    'series',
  );

  assert.deepEqual(submitted.map((item) => item.id), ['activity-4', 'activity-5']);
  assert.ok(submitted.every((item) => item.title === 'Activitate noua'));
  assert.ok(submitted.every((item) => item.catalogActivityId === 'catalog-new'));
  assert.deepEqual(submitted.map((item) => item.hours), [4, 6]);
  assert.deepEqual(submitted.map((item) => item.deliverables?.map((deliverable) => deliverable.id)), [
    ['deliverable-new'],
    ['deliverable-new'],
  ]);
  assert.ok(submitted.every((item) => item.periodGroupId === periodGroupId));
});

test('livrabilul atasat pe ultima zi deblocheaza toate activitatile din perioada editata', () => {
  const periodGroupId = 'activity-period:edit-activity-4';
  const sharedDeliverable = deliverable('deliverable-1', {
    documentId: 'document-1',
    sourceActivityId: 'andreea-activity-1',
    uploadedByExpertId: 'expert-andreea',
  });
  const activities = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [] }),
    activity('activity-18', { date: '2026-06-18', periodGroupId, deliverables: [sharedDeliverable] }),
  ];

  assert.deepEqual(getActivitiesMissingDeliverables(activities), []);
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


test('inlocuirea livrabilului pe grup multi-day elimina livrabilul vechi de pe toate zilele grupului', () => {
  const periodGroupId = 'activity-period:period-1';
  const oldDeliverable = deliverable('deliverable-old', { documentId: 'document-old' });
  const newDeliverable = deliverable('deliverable-new', { documentId: 'document-new' });
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [oldDeliverable] }),
    activity('activity-5', { date: '2026-06-05', periodGroupId, deliverables: [deliverable('deliverable-old-copy', { documentId: 'document-old' })] }),
  ];

  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [newDeliverable] })],
    ['2026-06-04', '2026-06-05'],
    { '2026-06-04': '6', '2026-06-05': '6' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );

  assert.equal(submitted.flatMap((item) => item.deliverables ?? []).length, 1);
  assert.equal(submitted.flatMap((item) => item.deliverables ?? [])[0].documentId, 'document-new');
  assert.equal(submitted.find((item) => item.date === '2026-06-05')?.deliverables?.length, 0);
});

test('stergerea zilei care detine livrabilul il reataseaza pe o zi ramasa din grup', () => {
  const periodGroupId = 'activity-period:period-1';
  const sharedDeliverable = deliverable('deliverable-1', { documentId: 'document-1' });
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [sharedDeliverable] }),
    activity('activity-5', { date: '2026-06-05', periodGroupId, deliverables: [] }),
  ];

  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-5', { date: '2026-06-05', periodGroupId })],
    ['2026-06-05'],
    { '2026-06-05': '6' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].date, '2026-06-05');
  assert.equal(submitted[0].deliverables?.[0]?.documentId, 'document-1');
});

test('extinderea grupului existent pastreaza un singur livrabil comun deduplicat', () => {
  const periodGroupId = 'activity-period:period-1';
  const sharedDeliverable = deliverable('deliverable-1', { documentId: 'document-1' });
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [sharedDeliverable] }),
    activity('activity-5', { date: '2026-06-05', periodGroupId, deliverables: [] }),
  ];

  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [sharedDeliverable] })],
    ['2026-06-04', '2026-06-05', '2026-06-06'],
    { '2026-06-04': '6', '2026-06-05': '6', '2026-06-06': '4' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );

  assert.equal(submitted.length, 3);
  assert.equal(submitted.flatMap((item) => item.deliverables ?? []).length, 1);
  assert.equal(dedupeDeliverables(submitted.flatMap((item) => item.deliverables ?? [])).length, 1);
});

test('activitatile cu acelasi periodGroupId dar identitate diferita nu sunt grupate impreuna', () => {
  const periodGroupId = 'activity-period:period-1';
  const activities = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, saCode: 'SA3.4', activityType: 'Analiza legislativa' }),
    activity('activity-5', { date: '2026-06-05', periodGroupId, saCode: 'SA3.5', activityType: 'Raportare' }),
  ];

  assert.equal(getActivityGroupMembers(activities[0], activities).length, 1);
  assert.equal(compileActivitiesByPeriodGroup(activities).length, 2);
});

test('grupurile corupte cu doua activitati pe aceeasi zi se editeaza ca rand individual', () => {
  const periodGroupId = 'activity-period:andreea-iulie';
  const activities = [
    activity('activity-1', {
      date: '2026-07-06',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
    activity('activity-duplicate', {
      date: '2026-07-06',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
    activity('activity-hooked', {
      date: '2026-07-10',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
  ];

  assert.deepEqual(
    getActivityGroupMembers(activities[0], activities).map((item) => item.id),
    ['activity-1'],
  );
});

test('selectia de date nu reataseaza duplicatele unui grup corupt la editare', () => {
  const periodGroupId = 'activity-period:andreea-iulie';
  const activities = [
    activity('activity-1', {
      date: '2026-07-06',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
    activity('activity-duplicate', {
      date: '2026-07-07',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
    activity('activity-other-day', {
      date: '2026-07-08',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
    activity('activity-duplicate-other-day', {
      date: '2026-07-08',
      periodGroupId,
      catalogActivityId: 'catalog-sa34',
      activityType: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
      title: 'SA3.4 - Elaborare document de pozitie / analiza legislativa',
    }),
  ];

  assert.deepEqual(
    getActivityGroupMembersForSelectedDates(
      activities[0],
      activities,
      ['2026-07-06', '2026-07-07', '2026-07-08'],
    ).map((item) => item.id),
    ['activity-1'],
  );
});

test('grupurile legacy cu workingGroupId activity-period sunt editate ca grup modern', () => {
  const legacyGroupId = 'activity-period:legacy-1';
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', workingGroupId: legacyGroupId, deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })] }),
    activity('activity-5', { date: '2026-06-05', workingGroupId: legacyGroupId, deliverables: [] }),
  ];

  const submitted = buildSubmittedActivitiesForEdit(
    groupMembers[0],
    [activity('activity-4', { date: '2026-06-04', workingGroupId: legacyGroupId })],
    ['2026-06-04', '2026-06-05'],
    { '2026-06-04': '6', '2026-06-05': '6' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
  );

  assert.ok(submitted.every((item) => item.periodGroupId === legacyGroupId));
  assert.equal(submitted.flatMap((item) => item.deliverables ?? []).length, 1);
});

test('activitatile legacy fara identificator sunt deschise si normalizate ca grup la editare', () => {
  const groupMembers = [
    activity('legacy-day-1', {
      date: '2026-06-04',
      createdAt: '2026-06-20T10:00:00.000Z',
    }),
    activity('legacy-day-2', {
      date: '2026-06-05',
      createdAt: '2026-06-20T10:00:05.000Z',
    }),
  ];

  assert.deepEqual(
    getActivityGroupMembers(groupMembers[0], groupMembers).map((item) => item.id),
    ['legacy-day-1', 'legacy-day-2'],
  );

  const merged = mergeActivityGroupForEdit(groupMembers[0], groupMembers);
  assert.equal(merged.groupMembers.length, 2);
  assert.equal(merged.activity.periodGroupId, 'activity-period:legacy-legacy-day-1');

  const submitted = buildSubmittedActivitiesForEdit(
    merged.activity,
    [merged.activity],
    groupMembers.map((item) => item.date),
    { '2026-06-04': '6', '2026-06-05': '6' },
    groupMembers,
    'expert-1',
    (value, fallback) => String(value ?? fallback),
    'series',
  );
  assert.ok(submitted.every((item) => (
    item.periodGroupId === 'activity-period:legacy-legacy-day-1'
    && item.workingGroupId === 'activity-period:legacy-legacy-day-1'
  )));
});

test('stergerea directa a holderului muta livrabilul pe prima zi ramasa', () => {
  const periodGroupId = 'activity-period:period-delete';
  const sharedDeliverable = deliverable('deliverable-delete', { documentId: 'document-delete' });
  const groupMembers = [
    activity('activity-4', {
      date: '2026-06-04',
      periodGroupId,
      deliverables: [sharedDeliverable],
    }),
    activity('activity-5', {
      date: '2026-06-05',
      periodGroupId,
      deliverables: [],
    }),
  ];

  const plan = planGroupedActivityDeletion(groupMembers[0], groupMembers);

  assert.equal(plan.updateActivities.length, 1);
  assert.equal(plan.updateActivities[0].id, 'activity-5');
  assert.equal(plan.updateActivities[0].deliverables?.[0]?.documentId, 'document-delete');
  assert.deepEqual(plan.previousActivities, [groupMembers[1]]);
});

test('stergerea directa nu dubleaza livrabilul deja pastrat in grup', () => {
  const periodGroupId = 'activity-period:period-delete';
  const firstCopy = deliverable('deliverable-1', { documentId: 'document-shared' });
  const secondCopy = deliverable('deliverable-2', { documentId: 'document-shared' });
  const groupMembers = [
    activity('activity-4', { date: '2026-06-04', periodGroupId, deliverables: [firstCopy] }),
    activity('activity-5', { date: '2026-06-05', periodGroupId, deliverables: [secondCopy] }),
  ];

  const plan = planGroupedActivityDeletion(groupMembers[0], groupMembers);

  assert.deepEqual(plan.updateActivities, []);
  assert.deepEqual(plan.previousActivities, []);
});

test('stergerea group-aware actualizeaza holderul inainte sa stearga activitatea', async () => {
  const events: string[] = [];
  const previous = activity('activity-5', { deliverables: [] });
  const updated = activity('activity-5', {
    deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
  });

  await executeGroupedActivityDeletion(
    'activity-4',
    { updateActivities: [updated], previousActivities: [previous] },
    async (id) => {
      events.push(`update:${id}`);
    },
    async (id) => {
      events.push(`delete:${id}`);
    },
  );

  assert.deepEqual(events, ['update:activity-5', 'delete:activity-4']);
});

test('stergerea group-aware restaureaza holderul daca stergerea esueaza', async () => {
  const events: string[] = [];
  const previous = activity('activity-5', { deliverables: [] });
  const updated = activity('activity-5', {
    deliverables: [deliverable('deliverable-1', { documentId: 'document-1' })],
  });

  await assert.rejects(
    executeGroupedActivityDeletion(
      'activity-4',
      { updateActivities: [updated], previousActivities: [previous] },
      async (id, updates) => {
        events.push(`update:${id}:${updates.deliverables?.length ?? 0}`);
      },
      async (id) => {
        events.push(`delete:${id}`);
        throw new Error('delete failed');
      },
    ),
    /delete failed/,
  );

  assert.deepEqual(events, [
    'update:activity-5:1',
    'delete:activity-4',
    'update:activity-5:0',
  ]);
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

test('validarea lunara detecteaza duplicatul intre doua activitati noi din acelasi batch', () => {
  const duplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [],
    nextActivities: [
      activity('activity-new-1', {
        date: '2026-06-03',
        deliverables: [deliverable('deliverable-new-1', { documentId: 'document-common' })],
      }),
      activity('activity-new-2', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-new-2', { documentId: 'document-common' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.ok(duplicate);
  assert.equal(duplicate.existingActivity.id, 'activity-new-1');
  assert.equal(duplicate.activity.id, 'activity-new-2');
  assert.equal(duplicate.signature, 'document:document-common');
});

test('validarea lunara raporteaza duplicatul nou fata de activitatea existenta cand documentul apare de mai multe ori', () => {
  const duplicate = findMonthlyDeliverableDuplicate({
    existingActivities: [
      activity('activity-existing', {
        date: '2026-06-03',
        deliverables: [deliverable('deliverable-existing', { documentId: 'document-common' })],
      }),
    ],
    nextActivities: [
      activity('activity-new-1', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-new-1', { documentId: 'document-common' })],
      }),
      activity('activity-new-2', {
        date: '2026-06-11',
        deliverables: [deliverable('deliverable-new-2', { documentId: 'document-common' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.ok(duplicate);
  assert.equal(duplicate.existingActivity.id, 'activity-existing');
  assert.equal(duplicate.activity.id, 'activity-new-1');
  assert.equal(duplicate.signature, 'document:document-common');
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

test('gruparea livrabilului accepta doar activitati cu aceeasi identitate', () => {
  const current = activity('activity-current', {
    catalogActivityId: 'catalog-current',
    activityType: 'Actualizare raportare',
  });
  const compatible = activity('activity-compatible', {
    catalogActivityId: 'catalog-current',
    activityType: 'Actualizare raportare',
  });
  const incompatible = activity('activity-incompatible', {
    catalogActivityId: 'catalog-other',
    activityType: 'Activare experti in comunicare',
  });

  assert.equal(areActivitiesCompatibleForDeliverableGroup(current, compatible), true);
  assert.equal(areActivitiesCompatibleForDeliverableGroup(current, incompatible), false);
});

test('activitatile COM de comunicare sunt compatibile multi-group in aceeasi serie', () => {
  const aliniere = activity('com-aliniere', {
    catalogActivityId: 'catalog-aliniere',
    activityType: 'Aliniere experti in comunicare',
    title: 'Aliniere experti in comunicare',
  });
  const articole = activity('com-articole', {
    catalogActivityId: 'catalog-articole',
    activityType: 'Articole pe concordia.ro',
    title: 'Articole pe concordia.ro',
  });
  const some = activity('com-some', {
    catalogActivityId: 'catalog-some',
    activityType: 'Content digital si vizual SoMe',
    title: 'Content digital si vizual SoMe',
  });
  const other = activity('com-other', {
    catalogActivityId: 'catalog-other',
    activityType: 'Analiza media',
    title: 'Analiza media',
  });

  assert.equal(areActivitiesCompatibleForDeliverableGroup(aliniere, articole), true);
  assert.equal(areActivitiesCompatibleForDeliverableGroup(articole, some), true);
  assert.equal(areActivitiesCompatibleForDeliverableGroup(aliniere, other), false);
  const groupedAliniere = { ...aliniere, periodGroupId: 'activity-period:com-june' };
  assert.deepEqual(
    getActivityGroupMembers(groupedAliniere, [
      groupedAliniere,
      { ...articole, periodGroupId: 'activity-period:com-june' },
      { ...some, periodGroupId: 'activity-period:com-june' },
      { ...other, periodGroupId: 'activity-period:com-june' },
    ]).map((item) => item.id),
    ['com-aliniere', 'com-articole', 'com-some'],
  );
  assert.equal(compileActivitiesByPeriodGroup([
    groupedAliniere,
    { ...articole, periodGroupId: 'activity-period:com-june' },
    { ...some, periodGroupId: 'activity-period:com-june' },
    { ...other, periodGroupId: 'activity-period:com-june' },
  ]).length, 2);
});

test('gruparea livrabilului nu considera compatibile activitati fara identitate', () => {
  const current = activity('activity-current', {
    saCode: undefined,
    catalogActivityId: undefined,
    activityType: '',
    title: '',
  });
  const candidate = activity('activity-candidate', {
    saCode: undefined,
    catalogActivityId: undefined,
    activityType: '',
    title: '',
  });

  assert.equal(areActivitiesCompatibleForDeliverableGroup(current, candidate), false);
});

test('validarea lunara ignora duplicatele exclusiv istorice fara legatura cu livrabilul curent', () => {
  const duplicateHistory = [
    activity('activity-old-1', {
      deliverables: [deliverable('deliverable-old-1', { documentId: 'document-old' })],
    }),
    activity('activity-old-2', {
      date: '2026-06-04',
      deliverables: [deliverable('deliverable-old-2', { documentId: 'document-old' })],
    }),
  ];

  const duplicate = findMonthlyDeliverableDuplicate({
    existingActivities: duplicateHistory,
    nextActivities: [
      activity('activity-current', {
        date: '2026-06-10',
        deliverables: [deliverable('deliverable-current', { documentId: 'document-current' })],
      }),
    ],
    expertId: 'expert-1',
    month: 5,
    year: 2026,
  });

  assert.equal(duplicate, null);
});

test('livrabilul existent rezolva activitatea care il detine chiar daca legatura salvata este orfana', () => {
  const owner = activity('activity-owner', {
    deliverables: [deliverable('deliverable-owner', { documentId: 'document-1' })],
  });
  const signature = getDeliverableDocumentSignature(
    deliverable('selected-deliverable', { documentId: 'document-1' }),
  );

  const source = findActivityOwningDeliverableSignature(
    [owner],
    signature,
    'activity-deleted',
  );

  assert.equal(source?.id, 'activity-owner');
});

test('livrabilul orfan ramane fara activitate sursa si poate fi atasat activitatii curente', () => {
  const signature = getDeliverableDocumentSignature(
    deliverable('selected-deliverable', { documentId: 'document-orphan' }),
  );
  const source = findActivityOwningDeliverableSignature(
    [activity('activity-other', {
      deliverables: [deliverable('deliverable-other', { documentId: 'document-other' })],
    })],
    signature,
    'activity-deleted',
  );

  assert.equal(source, undefined);
});
