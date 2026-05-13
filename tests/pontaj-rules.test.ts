import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMonthlyNormInfo,
  normalizeNormType,
  validateActivitiesBeforeCreate,
} from '../lib/pontaj-rules.ts';
import type { Expert } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert',
  email: 'expert@test.ro',
  category: 'ap',
  norma: 4,
  normType: 'normă calculată din zile lucrătoare × ore/zi',
};

test('calculează norma lunară din zile lucrătoare înmulțite cu ore/zi', () => {
  const norm = calculateMonthlyNormInfo(expert, 0, 2026);

  assert.equal(norm.normType, 'calculated');
  assert.equal(norm.workingDays, 20);
  assert.equal(norm.monthlyNorm, 80);
});

test('recunoaște normă ajustată manual de administrator', () => {
  const norm = calculateMonthlyNormInfo(
    { ...expert, normType: 'normă ajustată manual de administrator', manualMonthlyNorm: 55 },
    0,
    2026,
  );

  assert.equal(normalizeNormType('normă ajustată manual de administrator'), 'manual_adjusted');
  assert.equal(norm.monthlyNorm, 55);
  assert.equal(norm.source, 'manual');
});

test('nu permite depășirea limitei cumulate de 8 ore pe zi', () => {
  const result = validateActivitiesBeforeCreate({
    expert,
    month: 0,
    year: 2026,
    existingActivities: [{ expertId: expert.id, date: '2026-01-05', hours: 6 }],
    newActivities: [{ expertId: expert.id, date: '2026-01-05', hours: 3 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DAILY_LIMIT_EXCEEDED');
});

test('nu creează activitate dacă norma lunară ar fi depășită', () => {
  const existingActivities = Array.from({ length: 19 }, (_, index) => ({
    expertId: expert.id,
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    hours: 4,
  }));

  const result = validateActivitiesBeforeCreate({
    expert,
    month: 0,
    year: 2026,
    existingActivities,
    newActivities: [{ expertId: expert.id, date: '2026-01-30', hours: 5 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MONTHLY_NORM_EXCEEDED');
  assert.equal(result.monthlyTotalBefore, 76);
  assert.equal(result.remainingMonthlyHours, 4);
});

test('permite activitate care ajunge exact la norma lunară', () => {
  const existingActivities = Array.from({ length: 19 }, (_, index) => ({
    expertId: expert.id,
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    hours: 4,
  }));

  const result = validateActivitiesBeforeCreate({
    expert,
    month: 0,
    year: 2026,
    existingActivities,
    newActivities: [{ expertId: expert.id, date: '2026-01-30', hours: 4 }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.monthlyTotalAfter, 80);
  assert.equal(result.remainingMonthlyHours, 0);
});

test('aplică norma pe proiect când este configurată', () => {
  const result = validateActivitiesBeforeCreate({
    expert: { ...expert, normType: 'normă per proiect', projectMonthlyNorm: 10 },
    month: 0,
    year: 2026,
    existingActivities: [{ expertId: expert.id, date: '2026-01-05', hours: 8 }],
    newActivities: [{ expertId: expert.id, date: '2026-01-06', hours: 3 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROJECT_NORM_EXCEEDED');
});
