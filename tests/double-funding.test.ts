import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsv,
  buildDoubleFundingRiskRows,
  buildDoubleFundingSummary,
  buildPmExportRows,
  dateRangesOverlap,
} from '../lib/double-funding.ts';
import type { Activity, ConcurrentProject, Expert } from '../lib/types.ts';

const experts = [
  {
    id: 'roxana',
    name: 'Ivanov Roxana',
    role: 'Expert/PM',
    category: 'gt',
    norma: 8,
    dailyHours: 8,
    hasPmAccess: true,
    projectCode: '302141',
  },
] as Expert[];

test('detecteaza suprapunere intre proiect concurent si luna selectata', () => {
  assert.equal(
    dateRangesOverlap('2026-05-01', '2026-05-31', new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T00:00:00Z')),
    true
  );
  assert.equal(
    dateRangesOverlap('2026-06-01', '2026-06-30', new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T00:00:00Z')),
    false
  );
});

test('marcheaza risc ridicat cand orele PEO plus proiect concurent depasesc 8 ore pe zi', () => {
  const activities = [
    { id: 'a1', expertId: 'roxana', expertName: 'Ivanov Roxana', date: '2026-05-04', hours: 6, activityType: 'GT', title: 'Recrutare GT' },
  ] as Activity[];
  const projects = [
    {
      id: 'cp1',
      expertId: 'roxana',
      projectName: 'Alt proiect european',
      projectCode: 'ALT-UE',
      fundingSource: 'UE',
      dailyHours: 4,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      isActive: true,
    },
  ] as ConcurrentProject[];

  const rows = buildDoubleFundingRiskRows({ experts, activities, concurrentProjects: projects, month: 4, year: 2026 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'high_risk');
  assert.equal(rows[0].maxDailyCombinedHours, 10);
  assert.match(rows[0].reasons.join(' '), /8 ore\/zi/);
});

test('summary si export PM final includ riscurile de proiecte concurente', () => {
  const activities = [
    { id: 'a1', expertId: 'roxana', date: '2026-05-04', hours: 6, activityType: 'GT', title: 'Recrutare GT' },
  ] as Activity[];
  const projects = [
    {
      id: 'cp1',
      expertId: 'roxana',
      projectName: 'Alt proiect',
      dailyHours: 4,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      isActive: true,
    },
  ] as ConcurrentProject[];
  const riskRows = buildDoubleFundingRiskRows({ experts, activities, concurrentProjects: projects, month: 4, year: 2026 });
  const summary = buildDoubleFundingSummary(riskRows);
  const exportRows = buildPmExportRows({
    experts,
    activities,
    concurrentRiskRows: riskRows,
    reportStatuses: [{ id: 'rs1', expertId: 'roxana', month: 4, year: 2026, status: 'sent' }],
    month: 4,
    year: 2026,
  });
  const csv = buildCsv(exportRows);

  assert.equal(summary.highRisk, 1);
  assert.equal(exportRows[0].highRiskConcurrentProjects, 1);
  assert.match(csv, /Ivanov Roxana/);
  assert.match(csv, /sent/);
});
