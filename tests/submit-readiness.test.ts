import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createActivityPeriodGroupId,
  getActivitiesMissingDeliverables,
} from '../lib/submit-readiness.ts';
import { serializeBusinessHubMeta } from '../lib/business-hub-reporting.ts';
import type { Activity } from '../lib/types.ts';

const baseActivity = (overrides: Partial<Activity>): Activity => ({
  id: overrides.id ?? 'activity',
  date: overrides.date ?? '2026-05-06',
  expertId: 'expert-1',
  expertName: 'Expert Test',
  hours: 8,
  activityType: 'Activitate test',
  title: 'Activitate test',
  dayType: 'lucratoare',
  ...overrides,
});

test('validarea livrabilelor accepta un livrabil final pentru o activitate multi-zi', () => {
  const periodGroupId = createActivityPeriodGroupId('period-1');
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', periodGroupId, deliverables: [] }),
    baseActivity({ id: 'day-2', date: '2026-05-07', periodGroupId, deliverables: [] }),
    baseActivity({
      id: 'day-3',
      date: '2026-05-08',
      periodGroupId,
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('validarea livrabilelor accepta un periodGroupId existent fara prefix de perioada', () => {
  const periodGroupId = 'existing-period-group';
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', periodGroupId, deliverables: [] }),
    baseActivity({
      id: 'day-2',
      date: '2026-05-07',
      periodGroupId,
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('un periodGroupId contaminat nu acopera activitati diferite cu acelasi livrabil', () => {
  const periodGroupId = 'existing-period-group';
  const activities: Activity[] = [
    baseActivity({
      id: 'newsletter',
      date: '2026-06-03',
      periodGroupId,
      saCode: 'SA3.4',
      catalogActivityId: 'newsletter',
      activityType: 'Redactare Newsletter lunar CPC',
      title: 'Redactare Newsletter lunar CPC',
      deliverables: [{ id: 'deliverable-1', fileName: 'newsletter.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 1234 }],
    }),
    baseActivity({
      id: 'analiza',
      date: '2026-06-18',
      periodGroupId,
      saCode: 'SA3.4',
      catalogActivityId: 'analiza-legislativa',
      activityType: 'Elaborare document de pozitie / analiza legislativa',
      title: 'Elaborare document de pozitie / analiza legislativa',
      deliverables: [],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['analiza']);
});

test('un livrabil pe o zi acopera toate zilele compatibile din acelasi periodGroupId', () => {
  const periodGroupId = 'existing-period-group';
  const activities: Activity[] = [
    baseActivity({
      id: 'analiza-1',
      date: '2026-06-03',
      periodGroupId,
      saCode: 'SA3.4',
      catalogActivityId: 'analiza-legislativa',
      activityType: 'Elaborare document de pozitie / analiza legislativa',
      title: 'Elaborare document de pozitie / analiza legislativa',
      deliverables: [],
    }),
    baseActivity({
      id: 'analiza-2',
      date: '2026-06-18',
      periodGroupId,
      saCode: 'SA3.4',
      catalogActivityId: 'analiza-legislativa',
      activityType: 'Elaborare document de pozitie / analiza legislativa',
      title: 'Elaborare document de pozitie / analiza legislativa',
      deliverables: [{ id: 'deliverable-1', fileName: 'analiza.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('activitatile fara grup isi pastreaza validarea individuala de livrabil', () => {
  const activities: Activity[] = [baseActivity({ id: 'standalone', deliverables: [] })];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['standalone']);
});

test('activitatile Business Hub cu registru structurat nu cer livrabil individual', () => {
  const activities: Activity[] = [
    baseActivity({
      id: 'bh-registry',
      activityType: 'Coordonarea activitatilor Business Hub',
      title: 'Coordonarea activitatilor Business Hub',
      saCode: 'SA3.2',
      deliverables: [],
      businessHubMetaJson: serializeBusinessHubMeta({
        entityName: 'CPBR',
        eventTitle: 'Sedinta de lucru',
        date: '2026-05-06',
        startTime: '10:00',
        endTime: '12:00',
      }),
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities, { expertCategory: 'bh' });

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('activitatile Business Hub cu registru incomplet raman in validarea de livrabil', () => {
  const activities: Activity[] = [
    baseActivity({
      id: 'bh-incomplete',
      activityType: 'Coordonarea activitatilor Business Hub',
      title: 'Coordonarea activitatilor Business Hub',
      saCode: 'SA3.2',
      deliverables: [],
      businessHubMetaJson: serializeBusinessHubMeta({
        entityName: 'CPBR',
        date: '2026-05-06',
      }),
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities, { expertCategory: 'bh' });

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['bh-incomplete']);
});

test('activitatile multi-zi raman blocante cand grupul nu are niciun livrabil', () => {
  const periodGroupId = createActivityPeriodGroupId('period-2');
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', periodGroupId, deliverables: [] }),
    baseActivity({ id: 'day-2', date: '2026-05-07', periodGroupId, deliverables: [] }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['day-1', 'day-2']);
});

test('activitatile salvate anterior cu workingGroupId de perioada raman validate ca grup', () => {
  const workingGroupId = createActivityPeriodGroupId('legacy-period-1');
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', workingGroupId, deliverables: [] }),
    baseActivity({
      id: 'day-2',
      date: '2026-05-07',
      workingGroupId,
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('workingGroupId fara prefix de perioada nu grupeaza activitatile existente accidental', () => {
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', workingGroupId: 'legacy-group', deliverables: [] }),
    baseActivity({
      id: 'day-2',
      date: '2026-05-07',
      workingGroupId: 'legacy-group',
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['day-1']);
});

test('activitatile istorice fara workingGroupId sunt grupate cand par create in aceeasi salvare multi-zi', () => {
  const activities: Activity[] = [
    baseActivity({
      id: 'legacy-day-1',
      date: '2026-05-06',
      createdAt: '2026-05-20T10:00:00.000Z',
      deliverables: [],
    }),
    baseActivity({
      id: 'legacy-day-2',
      date: '2026-05-07',
      createdAt: '2026-05-20T10:00:05.000Z',
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});

test('activitatile istorice similare create separat nu sunt grupate automat', () => {
  const activities: Activity[] = [
    baseActivity({
      id: 'legacy-day-1',
      date: '2026-05-06',
      createdAt: '2026-05-20T10:00:00.000Z',
      deliverables: [],
    }),
    baseActivity({
      id: 'legacy-day-2',
      date: '2026-05-07',
      createdAt: '2026-05-20T10:05:00.000Z',
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['legacy-day-1']);
});

test('activitatile SoMe lunare sunt acoperite de un singur livrabil chiar daca lipseste gruparea tehnica', () => {
  const activities: Activity[] = [
    baseActivity({
      id: 'some-day-1',
      date: '2026-06-04',
      saCode: 'SA3.4',
      catalogActivityId: 'content-digital-vizual-some',
      activityType: 'Content digital si vizual SoMe',
      title: 'Content digital si vizual SoMe',
      deliverables: [],
    }),
    baseActivity({
      id: 'some-day-2',
      date: '2026-06-22',
      saCode: 'SA3.4',
      catalogActivityId: 'content-digital-vizual-some',
      activityType: 'Content digital si vizual SoMe',
      title: 'Content digital si vizual SoMe',
      deliverables: [],
    }),
    baseActivity({
      id: 'some-final-day',
      date: '2026-06-30',
      saCode: 'SA3.4',
      catalogActivityId: 'content-digital-vizual-some',
      activityType: 'Content digital si vizual SoMe',
      title: 'Content digital si vizual SoMe',
      deliverables: [{
        id: 'deliverable-1',
        fileName: 'screenshots.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1234,
      }],
    }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), []);
});
