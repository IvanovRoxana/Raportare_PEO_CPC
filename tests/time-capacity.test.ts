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

test('calculeaza separat plafoanele PEO si CIM zilnice', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract()],
    month: 5,
    year: 2026,
  });

  assert.equal(snapshot.peoMonthlyLimit, 126);
  assert.equal(snapshot.cimMonthlyLimit, 168);
});

test('contractul PEO lunar pastreaza plafonul fix si maximum 6 ore pe zi', () => {
  const snapshot = calculateCapacitySnapshot({
    expert,
    contracts: [contract({
      peoNormUnit: 'HOURS_PER_MONTH',
      peoNormValue: 130,
      peoDailyCap: 6,
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

  assert.equal(snapshot.peoMonthlyLimit, 130);
  assert.equal(snapshot.conflicts[0]?.code, 'DAILY_PEO_EXCEEDED');
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