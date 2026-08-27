import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReportingPeriod,
  formatReportingPeriodLabel,
  getDefaultReportingPeriods,
  reportingPeriodIncludesMonth,
  resolveDefaultReportingPeriod,
  validateReportingPeriod,
} from '../lib/reporting-periods.ts';

test('calculeaza luna finala si eticheta perioadei de raportare', () => {
  const period = buildReportingPeriod({
    projectCode: '302141',
    code: 'RP 12',
    startMonth: 4,
    startYear: 2026,
    monthCount: 3,
    status: 'published',
  });

  assert.equal(period.endMonth, 6);
  assert.equal(period.endYear, 2026);
  assert.equal(formatReportingPeriodLabel(period), 'RP 12 - Mai 2026 / Iulie 2026');
});

test('identifica perioada publicata care include luna selectata', () => {
  const periods = getDefaultReportingPeriods();
  const selected = resolveDefaultReportingPeriod(periods, 7, 2026);

  assert.equal(selected?.code, 'RP 13');
  assert.ok(selected && reportingPeriodIncludesMonth(selected, 8, 2026));
});

test('blocheaza suprapunerea intre perioade publicate ale aceluiasi proiect', () => {
  const existing = [
    {
      id: 'rp12',
      ...buildReportingPeriod({
        projectCode: '302141',
        code: 'RP 12',
        startMonth: 4,
        startYear: 2026,
        monthCount: 3,
        status: 'published',
      }),
    },
  ];
  const candidate = buildReportingPeriod({
    projectCode: '302141',
    code: 'RP 13',
    startMonth: 6,
    startYear: 2026,
    monthCount: 2,
    status: 'published',
  });

  assert.match(validateReportingPeriod(candidate, existing).join('\n'), /suprapune/);
});

test('permite suprapuneri temporare pentru draft', () => {
  const existing = getDefaultReportingPeriods().filter((period) => period.code === 'RP 12');
  const candidate = buildReportingPeriod({
    projectCode: '302141',
    code: 'RP Draft',
    startMonth: 6,
    startYear: 2026,
    monthCount: 2,
    status: 'draft',
  });

  assert.deepEqual(validateReportingPeriod(candidate, existing), []);
});
