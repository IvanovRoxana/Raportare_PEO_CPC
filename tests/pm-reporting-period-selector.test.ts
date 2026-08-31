import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPmReportingPeriodSelection,
  resolvePmReportingPeriodChange,
} from '../lib/pm-reporting-period-selector.ts';
import type { ReportingPeriod } from '../lib/types.ts';

function period(id: string, code: string, startMonth: number, startYear: number): ReportingPeriod {
  return {
    id,
    projectCode: '302141',
    code,
    startMonth,
    startYear,
    monthCount: 3,
    endMonth: startMonth + 2,
    endYear: startYear,
    status: 'published',
  };
}

describe('pm reporting period selector', () => {
  it('alege RP activ după luna selectată și construiește opțiunile pentru UI', () => {
    const selection = buildPmReportingPeriodSelection({
      reportingPeriods: [
        period('rp12', 'RP 12', 4, 2026),
        period('rp13', 'RP 13', 7, 2026),
      ],
      selectedMonth: 7,
      selectedYear: 2026,
    });

    assert.equal(selection.selectedReportId, 'rp13');
    assert.equal(selection.activeReportingPeriod?.code, 'RP 13');
    assert.deepEqual(selection.options.map((option) => [option.id, option.includesSelectedMonth]), [
      ['rp12', false],
      ['rp13', true],
    ]);
  });

  it('mută luna/anul pe finalul RP când PM selectează o perioadă care nu include luna curentă', () => {
    const periods = [
      period('rp12', 'RP 12', 4, 2026),
      period('rp13', 'RP 13', 7, 2026),
    ];

    const change = resolvePmReportingPeriodChange({
      reportingPeriods: periods,
      periodId: 'rp12',
      selectedMonth: 7,
      selectedYear: 2026,
    });

    assert.deepEqual(change, {
      selectedReportId: 'rp12',
      nextMonth: 6,
      nextYear: 2026,
    });
  });
});
