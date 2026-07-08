import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanLogHoursOnDate,
  calculateMonthlyNormHours,
  getNonWorkingDayInfo,
} from '../lib/non-working-days.ts';
import {
  buildSelectedHoursForDates,
  calculateMonthlyNormInfo,
  isValidPontajHours,
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

const testMonth = 1; // Februarie 2026 are 20 zile lucrătoare și nu include sărbători legale configurate.
const testYear = 2026;
const firstNineteenWorkingDays = [
  '2026-02-02',
  '2026-02-03',
  '2026-02-04',
  '2026-02-05',
  '2026-02-06',
  '2026-02-09',
  '2026-02-10',
  '2026-02-11',
  '2026-02-12',
  '2026-02-13',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-23',
  '2026-02-24',
  '2026-02-25',
  '2026-02-26',
];

test('calculează norma lunară din zile lucrătoare înmulțite cu ore/zi', () => {
  const norm = calculateMonthlyNormInfo(expert, testMonth, testYear);

  assert.equal(norm.normType, 'calculated');
  assert.equal(norm.workingDays, 20);
  assert.equal(norm.monthlyNorm, 80);
});

test('recunoaște normă ajustată manual de administrator', () => {
  const norm = calculateMonthlyNormInfo(
    { ...expert, normType: 'normă ajustată manual de administrator', manualMonthlyNorm: 55 },
    testMonth,
    testYear,
  );

  assert.equal(normalizeNormType('normă ajustată manual de administrator'), 'manual_adjusted');
  assert.equal(norm.monthlyNorm, 55);
  assert.equal(norm.source, 'manual');
});

test('blochează norma ajustată manual până când administratorul setează valoarea', () => {
  const norm = calculateMonthlyNormInfo(
    { ...expert, normType: 'normă ajustată manual de administrator', manualMonthlyNorm: undefined },
    testMonth,
    testYear,
  );

  assert.equal(norm.monthlyNorm, 0);
  assert.equal(norm.source, 'manual');
});

test('nu permite depășirea limitei cumulate de 8 ore pe zi', () => {
  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities: [{ expertId: expert.id, date: '2026-02-02', hours: 6 }],
    newActivities: [{ expertId: expert.id, date: '2026-02-02', hours: 3 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DAILY_LIMIT_EXCEEDED');
});

test('blocheaza activitati duplicate pe aceeasi zi pentru acelasi expert', () => {
  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities: [{
      id: 'activity-existing',
      expertId: expert.id,
      date: '2026-02-02',
      hours: 4,
      projectCode: 'PEO',
      saCode: 'COM',
      title: 'Social Media Management',
      description: 'Monitorizare si publicare postari social media.',
    }],
    newActivities: [{
      id: 'activity-new',
      expertId: expert.id,
      date: '2026-02-02',
      hours: 4,
      projectCode: 'PEO',
      saCode: 'COM',
      title: 'Social Media Management',
      description: 'Monitorizare si publicare postari social media.',
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_ACTIVITY');
});

test('blocheaza duplicatele create in acelasi batch multi-day', () => {
  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities: [],
    newActivities: [
      {
        id: 'activity-new-1',
        expertId: expert.id,
        date: '2026-02-03',
        hours: 2,
        projectCode: 'PEO',
        saCode: 'COM',
        title: 'Content digital si vizual SoMe',
        description: 'Pregatire si verificare continut pentru social media.',
      },
      {
        id: 'activity-new-2',
        expertId: expert.id,
        date: '2026-02-03',
        hours: 2,
        projectCode: 'PEO',
        saCode: 'COM',
        title: 'Content digital si vizual SoMe',
        description: 'Pregatire si verificare continut pentru social media.',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_ACTIVITY');
});

test('accepta doar ore intregi intre 1 si 8 pentru pontaj nou', () => {
  assert.equal(isValidPontajHours(1), true);
  assert.equal(isValidPontajHours(8), true);
  assert.equal(isValidPontajHours(0.5), false);
  assert.equal(isValidPontajHours(1.5), false);
  assert.equal(isValidPontajHours(9), false);

  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities: [],
    newActivities: [{ expertId: expert.id, date: '2026-02-02', hours: 1.5 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_HOURS');
});

test('pastreaza orele selectate cand lista de rubrici/date se resincronizeaza', () => {
  const selected = buildSelectedHoursForDates(
    ['2026-02-03', '2026-02-02'],
    { '2026-02-02': '3', '2026-02-03': '5' },
    4,
  );

  assert.deepEqual(selected, {
    '2026-02-02': '3',
    '2026-02-03': '5',
  });

  assert.deepEqual(buildSelectedHoursForDates(['2026-02-02', '2026-02-04'], selected, 4), {
    '2026-02-02': '3',
    '2026-02-04': '4',
  });
});

test('expertul nu poate ponta sambata sau duminica', () => {
  const saturday = validateActivitiesBeforeCreate({
    expert,
    month: 0,
    year: 2026,
    existingActivities: [],
    newActivities: [{ expertId: expert.id, date: '2026-01-03', hours: 4 }],
  });

  const sunday = validateActivitiesBeforeCreate({
    expert,
    month: 0,
    year: 2026,
    existingActivities: [],
    newActivities: [{ expertId: expert.id, date: '2026-01-04', hours: 4 }],
  });

  assert.equal(saturday.ok, false);
  assert.equal(saturday.code, 'NON_WORKING_DAY');
  assert.equal(sunday.ok, false);
  assert.equal(sunday.code, 'NON_WORKING_DAY');
});

test('expertul nu poate ponta de 1 iunie 2026', () => {
  const result = validateActivitiesBeforeCreate({
    expert,
    month: 5,
    year: 2026,
    existingActivities: [],
    newActivities: [{ expertId: expert.id, date: '2026-06-01', hours: 4 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NON_WORKING_DAY');
  assert.match(result.message ?? '', /Ziua Copilului/);
});

test('nu creează activitate dacă norma lunară ar fi depășită', () => {
  const existingActivities = firstNineteenWorkingDays.map((date) => ({
    expertId: expert.id,
    date,
    hours: 4,
  }));

  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities,
    newActivities: [{ expertId: expert.id, date: '2026-02-27', hours: 5 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MONTHLY_NORM_EXCEEDED');
  assert.equal(result.monthlyTotalBefore, 76);
  assert.equal(result.remainingMonthlyHours, 4);
});

test('permite activitate care ajunge exact la norma lunară', () => {
  const existingActivities = firstNineteenWorkingDays.map((date) => ({
    expertId: expert.id,
    date,
    hours: 4,
  }));

  const result = validateActivitiesBeforeCreate({
    expert,
    month: testMonth,
    year: testYear,
    existingActivities,
    newActivities: [{ expertId: expert.id, date: '2026-02-27', hours: 4 }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.monthlyTotalAfter, 80);
  assert.equal(result.remainingMonthlyHours, 0);
});

test('aplică norma pe proiect când este configurată', () => {
  const result = validateActivitiesBeforeCreate({
    expert: { ...expert, normType: 'normă per proiect', projectMonthlyNorm: 10 },
    month: testMonth,
    year: testYear,
    existingActivities: [{ expertId: expert.id, date: '2026-02-02', hours: 8 }],
    newActivities: [{ expertId: expert.id, date: '2026-02-03', hours: 3 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROJECT_NORM_EXCEEDED');
});

test('2026-06-01 are doua motive, dar norma scade o singura zi', () => {
  const info = getNonWorkingDayInfo('2026-06-01');
  const norm = calculateMonthlyNormHours({ month: 5, year: 2026, dailyHours: 8 });

  assert.deepEqual(info.holidayNames, ['Ziua Copilului', 'A doua zi de Rusalii']);
  assert.equal(norm.workingDays, 21);
  assert.equal(norm.normHours, 168);
  assert.equal(norm.nonWorkingDays.filter((day) => day.date === '2026-06-01').length, 1);
});

test('PM/Admin poate introduce exceptie in zi nelucratoare doar cu justificare', () => {
  assert.throws(
    () => assertCanLogHoursOnDate('2026-06-01', { actorRole: 'pm', force: true, justification: 'scurt' }),
    /Justificarea este obligatorie/,
  );

  assert.throws(
    () =>
      assertCanLogHoursOnDate('2026-06-01', {
        actorRole: 'expert',
        force: true,
        justification: 'Interventie aprobata pentru activitate exceptionala.',
      }),
    /doar pentru PM sau Admin/,
  );

  assert.doesNotThrow(() =>
    assertCanLogHoursOnDate('2026-06-01', {
      actorRole: 'pm',
      force: true,
      justification: 'Interventie aprobata pentru activitate exceptionala.',
    }),
  );
});

test('calcul norma iunie 2026 exclude weekendurile si 1 iunie o singura data', () => {
  const norm = calculateMonthlyNormHours({ month: 5, year: 2026, dailyHours: 8 });

  assert.equal(norm.workingDays, 21);
  assert.equal(norm.normHours, 168);
});

test('calcul norma aprilie 2026 exclude Vinerea Mare si Pastele fara dublare de weekend', () => {
  const norm = calculateMonthlyNormHours({ month: 3, year: 2026, dailyHours: 8 });
  const easterSunday = getNonWorkingDayInfo('2026-04-12');

  assert.equal(norm.workingDays, 20);
  assert.equal(norm.normHours, 160);
  assert.ok(norm.nonWorkingDays.some((day) => day.date === '2026-04-10'));
  assert.ok(norm.nonWorkingDays.some((day) => day.date === '2026-04-13'));
  assert.equal(easterSunday.isWeekend, true);
  assert.deepEqual(easterSunday.holidayNames, ['Pastele Ortodox']);
  assert.equal(norm.nonWorkingDays.filter((day) => day.date === '2026-04-12').length, 1);
});
