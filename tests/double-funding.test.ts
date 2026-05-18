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

import {
  buildConsolidatedTimesheet,
  getConcurrentProjectMonthlyTotal,
} from '../lib/concurrent-projects.ts';
import type { ConcurrentProjectTimesheetEntry } from '../lib/types.ts';

test('calculeaza total consolidat, total proiect paralel si total pe WP din intrari zilnice', () => {
  const activities = [
    { id: 'a1', expertId: 'roxana', date: '2026-05-12', hours: 6, activityType: 'GT', title: 'PEO' },
  ] as Activity[];
  const project = {
    id: 'gw', expertId: 'roxana', projectName: 'GOODWORKS4ALL', projectCode: 'P6-GW4ALL', dailyHours: 4, startDate: '2026-05-01', endDate: '2026-05-31', isActive: true,
  } as ConcurrentProject;
  const entries = [
    { id: 'e1', concurrentProjectId: 'gw', expertId: 'roxana', date: '2026-05-12', month: 4, year: 2026, wp: 'WP1', hours: 2, taskName: 'Task', relevantDeliverable: 'D1', dayType: 'lucratoare', source: 'expert_manual', status: 'draft' },
    { id: 'e2', concurrentProjectId: 'gw', expertId: 'roxana', date: '2026-05-13', month: 4, year: 2026, wp: 'WP2', hours: 4, taskName: 'Task', relevantDeliverable: 'D2', dayType: 'lucratoare', source: 'expert_manual', status: 'draft' },
  ] as ConcurrentProjectTimesheetEntry[];

  const total = getConcurrentProjectMonthlyTotal({ project, entries, month: 4, year: 2026 });
  assert.equal(total.totalHours, 6);
  assert.equal(total.totalByWp.WP1, 2);
  assert.equal(total.totalByWp.WP2, 4);

  const consolidated = buildConsolidatedTimesheet({ activities, concurrentProjects: [project], entries, month: 4, year: 2026 });
  assert.equal(consolidated.find((row) => row.date === '2026-05-12')?.totalHours, 8);
});

test('foloseste intrarile zilnice in dublă finanțare si detecteaza depasire peste 8h', () => {
  const activities = [
    { id: 'a1', expertId: 'roxana', date: '2026-05-12', hours: 6, activityType: 'GT', title: 'PEO' },
  ] as Activity[];
  const projects = [
    { id: 'gw', expertId: 'roxana', projectName: 'GOODWORKS4ALL', dailyHours: 1, startDate: '2026-05-01', endDate: '2026-05-31', isActive: true },
  ] as ConcurrentProject[];
  const entries = [
    { id: 'e1', concurrentProjectId: 'gw', expertId: 'roxana', date: '2026-05-12', month: 4, year: 2026, wp: 'WP1', hours: 4, taskName: 'Task', relevantDeliverable: 'D1', dayType: 'lucratoare', source: 'expert_manual', status: 'draft' },
  ] as ConcurrentProjectTimesheetEntry[];

  const rows = buildDoubleFundingRiskRows({ experts, activities, concurrentProjects: projects, concurrentTimesheetEntries: entries, month: 4, year: 2026 });
  assert.equal(rows[0].concurrentEstimatedHours, 4);
  assert.equal(rows[0].maxDailyCombinedHours, 10);
  assert.equal(rows[0].exceededDays, 1);
  assert.equal(rows[0].status, 'high_risk');
});

test('detecteaza conflict CO/CM cu ore lucrate in alt proiect', () => {
  const activities = [
    { id: 'a1', expertId: 'roxana', date: '2026-05-11', hours: 2, activityType: 'GT', title: 'PEO' },
  ] as Activity[];
  const project = { id: 'gw', expertId: 'roxana', projectName: 'GOODWORKS4ALL', dailyHours: 0, startDate: '2026-05-01', endDate: '2026-05-31', isActive: true } as ConcurrentProject;
  const entries = [
    { id: 'e1', concurrentProjectId: 'gw', expertId: 'roxana', date: '2026-05-11', month: 4, year: 2026, wp: '', hours: 0, taskName: 'CO', relevantDeliverable: '', dayType: 'CO', source: 'pm_manual', status: 'draft' },
  ] as ConcurrentProjectTimesheetEntry[];

  const consolidated = buildConsolidatedTimesheet({ activities, concurrentProjects: [project], entries, month: 4, year: 2026 });
  assert.equal(consolidated.find((row) => row.date === '2026-05-11')?.status, 'conflict CO-CM');
});

test('fallback dailyHours ramane activ daca nu exista intrari zilnice', () => {
  const project = { id: 'gw', expertId: 'roxana', projectName: 'GOODWORKS4ALL', dailyHours: 2, startDate: '2026-05-01', endDate: '2026-05-31', isActive: true } as ConcurrentProject;
  const total = getConcurrentProjectMonthlyTotal({ project, entries: [], month: 4, year: 2026 });
  assert.equal(total.hasDailyEntries, false);
  assert.equal(total.isIncomplete, true);
  assert.equal(total.totalHours > 0, true);
});

test('filtrarea proiectelor paralele dupa expert si restrictia de acces self', async () => {
  const { filterConcurrentProjectsForScope } = await import('../lib/access-control.ts');
  const projects = [
    { id: 'own', expertId: 'roxana', projectName: 'A', dailyHours: 1, startDate: '2026-05-01', isActive: true },
    { id: 'other', expertId: 'alt', projectName: 'B', dailyHours: 1, startDate: '2026-05-01', isActive: true },
  ] as ConcurrentProject[];
  const filtered = filterConcurrentProjectsForScope(projects, { accessLevel: 'self', canUsePmDashboard: false, canAccessAllExperts: false, currentExpertId: 'roxana', reason: 'expert_self' });
  assert.deepEqual(filtered.map((project) => project.id), ['own']);
});
