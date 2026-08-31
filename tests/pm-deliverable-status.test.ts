import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPmDeliverableStatus,
  isPmDeliverableInMonth,
} from '../lib/pm-deliverable-status.ts';
import type { DeliverableEligibilityCheck } from '../lib/types.ts';

function eligibilityCheck(overrides: Partial<DeliverableEligibilityCheck>): DeliverableEligibilityCheck {
  return {
    status: 'eligibil',
    score: 80,
    summary: 'Verificare test.',
    checks: [],
    missingElements: [],
    recommendations: [],
    riskFlags: [],
    ...overrides,
  };
}

test('filtreaza livrabilele dupa luna incarcarii', () => {
  assert.equal(isPmDeliverableInMonth({ uploadDate: '2026-08-12T10:00:00.000Z' }, 7, 2026), true);
  assert.equal(isPmDeliverableInMonth({ uploadDate: '2026-07-31T10:00:00.000Z' }, 7, 2026), false);
  assert.equal(isPmDeliverableInMonth({ uploadDate: '', activityDate: '2026-08-04' }, 7, 2026), true);
  assert.equal(isPmDeliverableInMonth({ uploadDate: 'data-invalida' }, 7, 2026), false);
});

test('deriveaza statusul PM al livrabilului din titlu si eligibilitate', () => {
  assert.equal(getPmDeliverableStatus({ uploadDate: '2026-08-12', titleMatch: true }), 'approved');
  assert.equal(getPmDeliverableStatus({ uploadDate: '2026-08-12', titleMatch: false }), 'clarifications');
  assert.equal(getPmDeliverableStatus({ uploadDate: '2026-08-12', titleCheckStatus: 'matched' }), 'approved');
  assert.equal(getPmDeliverableStatus({ uploadDate: '2026-08-12', titleCheckStatus: 'mismatch' }), 'clarifications');
  assert.equal(getPmDeliverableStatus({ uploadDate: '2026-08-12' }), 'draft');
});

test('prioritizeaza statusul de deblocare PM peste verificarea titlului', () => {
  assert.equal(getPmDeliverableStatus({
    uploadDate: '2026-08-12',
    titleMatch: true,
    eligibilityCheck: eligibilityCheck({
      status: 'neeligibil',
      pmUnlockRequested: true,
    }),
  }), 'ineligible');

  assert.equal(getPmDeliverableStatus({
    uploadDate: '2026-08-12',
    titleMatch: false,
    eligibilityCheck: eligibilityCheck({
      status: 'neeligibil',
      pmUnlockRequested: true,
      pmUnlockApproved: true,
    }),
  }), 'pm_unlocked');

  assert.equal(getPmDeliverableStatus({
    uploadDate: '2026-08-12',
    titleMatch: false,
    eligibilityCheck: eligibilityCheck({
      status: 'eligibil',
      pmUnlockRequested: true,
      pmUnlockResolvedByCorrection: true,
    }),
  }), 'auto_resolved');
});
