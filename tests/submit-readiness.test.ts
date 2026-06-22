import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createActivityPeriodGroupId,
  getActivitiesMissingDeliverables,
} from '../lib/submit-readiness.ts';
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
  const workingGroupId = createActivityPeriodGroupId('period-1');
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', workingGroupId, deliverables: [] }),
    baseActivity({ id: 'day-2', date: '2026-05-07', workingGroupId, deliverables: [] }),
    baseActivity({
      id: 'day-3',
      date: '2026-05-08',
      workingGroupId,
      deliverables: [{ id: 'deliverable-1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1234 }],
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

test('activitatile multi-zi raman blocante cand grupul nu are niciun livrabil', () => {
  const workingGroupId = createActivityPeriodGroupId('period-2');
  const activities: Activity[] = [
    baseActivity({ id: 'day-1', date: '2026-05-06', workingGroupId, deliverables: [] }),
    baseActivity({ id: 'day-2', date: '2026-05-07', workingGroupId, deliverables: [] }),
  ];

  const missingDeliverables = getActivitiesMissingDeliverables(activities);

  assert.deepEqual(missingDeliverables.map((activity) => activity.id), ['day-1', 'day-2']);
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
