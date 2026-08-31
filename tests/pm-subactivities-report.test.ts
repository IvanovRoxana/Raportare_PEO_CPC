import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPmSubactivityReportGroups } from '../lib/pm-subactivities-report.ts';
import type { Activity, ActivityCatalog, Expert } from '../lib/types.ts';

const experts = [
  { id: 'e1', name: 'Andreea Cojocaru', role: 'Expert', category: 'ap', isActive: true },
  { id: 'e2', name: 'Radu Ianos', role: 'Expert', category: 'ap', isActive: true },
] as Expert[];

const catalog = [{
  id: 'cat-1',
  category: 'ap',
  saCode: 'SA3.4',
  serviceCategory: 'Informare',
  activityNumber: 1,
  activityName: 'Monitorizare legislativa',
  description: 'Monitorizare si analiza legislativa.',
  deliverables: 'Raport de monitorizare',
}] as ActivityCatalog[];

test('grupeaza subactivitatile PM pe cod SA si totalizeaza orele', () => {
  const groups = buildPmSubactivityReportGroups({
    experts,
    catalog,
    activities: [
      {
        id: 'a1',
        expertId: 'e1',
        date: '2026-08-03',
        hours: 6,
        saCode: 'SA 3.4',
        catalogActivityId: 'cat-1',
        activityType: 'Monitorizare legislativa',
        title: 'Monitorizare legislativa',
        description: 'Analiza oportunitatilor europene.',
        deliverables: [{ id: 'd1', fileName: 'raport.pdf' }],
      },
      {
        id: 'a2',
        expertId: 'e2',
        date: '2026-08-04',
        hours: 2,
        saCode: 'SA3.4',
        activityType: 'Monitorizare legislativa',
        title: 'Monitorizare legislativa',
      },
      {
        id: 'a3',
        expertId: 'e1',
        date: '2026-08-05',
        hours: 3,
        saCode: 'SA3.5',
        activityType: 'Raportare',
        title: 'Raportare',
      },
    ] as Activity[],
  });

  assert.deepEqual(groups.map((group) => group.saCode), ['SA3.4', 'SA3.5']);
  assert.equal(groups[0].totalHours, 8);
  assert.equal(groups[0].expertCount, 2);
  assert.equal(groups[0].deliverableCount, 1);
  assert.equal(groups[0].rows[0].catalogDescription, 'Monitorizare si analiza legislativa.');
  assert.equal(groups[0].rows[0].expectedDeliverables, 'Raport de monitorizare');
});
