import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPmUnlockEligibilityStatus,
  isActivePmUnlockRequest,
  isAutoResolvedPmUnlockRequest,
  mergeEligibilityCheckWithPmUnlockTracking,
} from '../lib/pm-unlock-status.ts';

test('deriveaza blocaj PM activ doar pentru neeligibil cu request neaprobat', () => {
  assert.equal(getPmUnlockEligibilityStatus({
    status: 'neeligibil',
    pmUnlockRequested: true,
  }), 'active_blocked');
  assert.equal(isActivePmUnlockRequest({
    status: 'neeligibil',
    pmUnlockRequested: true,
    pmUnlockApproved: true,
  }), false);
});

test('marcheaza auto-rezolvat cand re-verificarea AI devine eligibila si pastreaza trackingul', () => {
  const merged = mergeEligibilityCheckWithPmUnlockTracking({
    status: 'neeligibil',
    summary: 'Initial documentul nu era eligibil.',
    pmUnlockRequested: true,
    pmUnlockRequestedAt: '2026-08-10T10:00:00.000Z',
    pmUnlockRequestedBy: 'Andreea Cojocaru',
    pmUnlockReason: 'Cerere PM din formular.',
  }, {
    status: 'eligibil',
    score: 92,
    summary: 'Livrabil corectat.',
  }, '2026-08-11T09:00:00.000Z');

  assert.equal(merged.pmUnlockRequested, true);
  assert.equal(merged.pmUnlockResolvedByCorrection, true);
  assert.equal(merged.pmUnlockResolvedAt, '2026-08-11T09:00:00.000Z');
  assert.equal(merged.pmUnlockOriginalStatus, 'neeligibil');
  assert.equal(merged.pmUnlockOriginalSummary, 'Initial documentul nu era eligibil.');
  assert.equal(isAutoResolvedPmUnlockRequest(merged), true);
  assert.equal(isActivePmUnlockRequest(merged), false);
});

test('pastreaza cererea activa daca noua verificare ramane neeligibila', () => {
  const merged = mergeEligibilityCheckWithPmUnlockTracking({
    status: 'neeligibil',
    summary: 'Initial documentul nu era eligibil.',
    pmUnlockRequested: true,
  }, {
    status: 'neeligibil',
    score: 20,
    summary: 'Ramane neeligibil.',
  }, '2026-08-11T09:00:00.000Z');

  assert.equal(merged.pmUnlockResolvedByCorrection, false);
  assert.equal(merged.pmUnlockResolvedAt, undefined);
  assert.equal(isActivePmUnlockRequest(merged), true);
});
