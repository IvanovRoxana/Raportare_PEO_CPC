import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expert, ExpertNormContract } from '../lib/types.ts';
import {
  allocateLeaveEntries,
  calculateCapacitySnapshot,
} from '../lib/time-capacity.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert',
  norma: 6,
};

function contract(overrides: Partial<ExpertNormContract> = {}): ExpertNormContract {
  return {
    id: 'contract-1',
    expertId: expert.id,
    validFrom: '2026-06-01',
    peoNormUnit: 'HOURS_PER_DAY',
    peoNormValue: 6,
    peoDailyCap: 6,
    cimNormUnit: 'HOURS_PER_DAY',
    cimNormValue: 8,
    cimDailyCap: 8,
    leaveHoursPerDay: 8,
    status: 'ACTIVE',
    justification: 'test',
    ...overrides,
  };
}

test('calculeaza plafonul lunar PEO din norma PEO, nu din referinta zilnica', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract({
      peoNormValue: 4,
      peoDailyCap: 8,
    })],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 84);
  assert.equal(snapshot.cimMonthlyLimit, 168);
});

test('permite 8 ore PEO intr-o zi cand CIM permite, fara conflict PEO zilnic', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract({
      peoNormValue: 6,
      peoDailyCap: 6,
    })],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 8,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 126);
  assert.equal(snapshot.conflicts.some((conflict) => conflict.code === 'DAILY_PEO_EXCEEDED'), false);
  assert.equal(snapshot.conflicts.length, 0);
});

test('blocheaza doar CIM cand totalul zilnic depaseste norma CIM 6h', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract({
      peoNormValue: 4,
      peoDailyCap: 6,
      cimNormValue: 6,
      cimDailyCap: 6,
      leaveHoursPerDay: 6,
    })],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 7,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 84);
  assert.equal(snapshot.conflicts.some((conflict) => conflict.code === 'DAILY_CIM_EXCEEDED'), true);
  assert.equal(snapshot.conflicts.some((conflict) => conflict.code === 'DAILY_PEO_EXCEEDED'), false);
});

test('contractul PEO lunar pastreaza plafonul fix si verifica ziua prin CIM', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract({
      peoNormUnit: 'HOURS_PER_MONTH',
      peoNormValue: 130,
      peoDailyCap: 1,
    })],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 8,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 130);
  assert.equal(snapshot.conflicts.some((conflict) => conflict.code === 'DAILY_PEO_EXCEEDED'), false);
  assert.equal(snapshot.conflicts.length, 0);
});

test('permite proiecte concurente pana la limita CIM zilnica', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract()],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 5,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    concurrentEntries: [{
      id: 'concurrent-entry',
      concurrentProjectId: 'project-1',
      date: '2026-06-02',
      hours: 3,
      status: 'draft',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.dailyTotals['2026-06-02'], 8);
  assert.equal(snapshot.conflicts.length, 0);
});

test('blocheaza activitatile in zilele cu CO introdus in calendar', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract()],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 1,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    leaveEntries: [{
      id: 'leave-entry',
      expertId: expert.id,
      date: '2026-06-02',
      month: 5,
      year: 2026,
      type: 'CO',
      totalHours: 8,
      peoHours: 6,
      cpcHours: 2,
      source: 'FINANCIAL',
      status: 'DRAFT',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.conflicts[0]?.code, 'LEAVE_DAY_LOCKED');
});

test('blocheaza proiecte concurente peste limita CIM zilnica', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract()],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 6,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    concurrentEntries: [{
      id: 'concurrent-entry',
      concurrentProjectId: 'project-1',
      date: '2026-06-02',
      hours: 3,
      status: 'draft',
    }],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.dailyTotals['2026-06-02'], 9);
  assert.equal(snapshot.conflicts[0]?.code, 'DAILY_CIM_EXCEEDED');
});

test('repartizeaza sapte zile CO in 30 ore PEO si 26 ore CPC', () => {
  const leaves = allocateLeaveEntries({
    expert,
    contracts: [contract({
      peoNormUnit: 'HOURS_PER_MONTH',
      peoNormValue: 30,
      peoDailyCap: 6,
    })],
    month: 5,
    year: 2026,
    dates: ['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08', '2026-06-09', '2026-06-10'],
    source: 'EXPERT',
  });

  assert.equal(leaves.reduce((sum, entry) => sum + entry.totalHours, 0), 56);
  assert.equal(leaves.reduce((sum, entry) => sum + entry.peoHours, 0), 30);
  assert.equal(leaves.reduce((sum, entry) => sum + entry.cpcHours, 0), 26);
  assert.deepEqual(leaves.slice(-2).map((entry) => entry.cpcHours), [8, 8]);
});

test('muta diferenta pe CPC cand soldul PEO este partial', () => {
  const [leave] = allocateLeaveEntries({
    expert,
    contracts: [contract({
      peoNormUnit: 'HOURS_PER_MONTH',
      peoNormValue: 3,
      peoDailyCap: 6,
    })],
    month: 5,
    year: 2026,
    dates: ['2026-06-02'],
    source: 'EXPERT',
  });

  assert.equal(leave.peoHours, 3);
  assert.equal(leave.cpcHours, 5);
});

test('CO automat foloseste norma PEO zilnica pentru split, nu totalul CIM', () => {
  const [leave] = allocateLeaveEntries({
    expert,
    contracts: [contract({
      peoNormUnit: 'HOURS_PER_DAY',
      peoNormValue: 6,
      peoDailyCap: 6,
      cimNormUnit: 'HOURS_PER_DAY',
      cimNormValue: 8,
      cimDailyCap: 8,
      leaveHoursPerDay: 8,
    })],
    month: 5,
    year: 2026,
    dates: ['2026-06-02'],
    source: 'EXPERT',
  });

  assert.equal(leave.totalHours, 8);
  assert.equal(leave.peoHours, 6);
  assert.equal(leave.cpcHours, 2);
});

test('blocheaza CO daca ziua contine deja ore lucrate', () => {
  assert.throws(() => allocateLeaveEntries({
    expert,
    contracts: [contract()],
    activities: [{
      id: 'activity',
      expertId: expert.id,
      date: '2026-06-02',
      hours: 2,
      activityType: 'test',
      title: 'test',
      status: 'draft',
    }],
    month: 5,
    year: 2026,
    dates: ['2026-06-02'],
    source: 'EXPERT',
  }), /norma CIM/);
});

test('CO introdus de financiar este blocat pentru expert', () => {
  const [leave] = allocateLeaveEntries({
    expert,
    contracts: [contract()],
    month: 5,
    year: 2026,
    dates: ['2026-06-02'],
    source: 'FINANCIAL',
  });

  assert.equal(leave.lockedForExpert, true);
});

test('aplica versiunile de contract de la data lor de inceput', () => {
  const firstVersion = contract({ id: 'contract-before' });
  const secondVersion = contract({
    id: 'contract-after',
    validFrom: '2026-06-15',
    peoNormValue: 4,
    peoDailyCap: 4,
  });
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [firstVersion, secondVersion],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 102);
  assert.equal(snapshot.cimMonthlyLimit, 168);
});
