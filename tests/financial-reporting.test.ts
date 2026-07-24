import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialReportingSummary } from '../lib/financial-reporting.ts';
import type { Activity, Expert } from '../lib/types.ts';

test('centralizeaza in dashboard financiar orele pontate de expert in raportare PEO', () => {
  const experts = [
    {
      id: 'expert-1',
      name: 'Expert Test',
      role: 'Expert PEO',
      category: 'ap',
      dailyHours: 8,
      norma: 8,
      positionInProject: 'Expert PEO',
      projectCode: '302141',
    },
  ] as Expert[];
  const activities = [
    {
      id: 'activity-1',
      expertId: 'expert-1',
      expertName: 'Expert Test',
      date: '2026-06-03',
      hours: 6,
      activityType: 'A4.1',
      title: 'Activitate raportata de expert',
      status: 'sent',
    },
  ] as Activity[];

  const summary = buildFinancialReportingSummary({
    experts,
    activities,
    concurrentProjects: [],
    concurrentEntries: [],
    leaveEntries: [],
    normContracts: [],
    month: 5,
    year: 2026,
    referencePeople: [],
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].name, 'Expert Test');
  assert.equal(summary.rows[0].peoWorked, 6);
  assert.equal(summary.rows[0].totalWorked, 6);
  assert.equal(summary.totalPeoWorked, 6);
});
