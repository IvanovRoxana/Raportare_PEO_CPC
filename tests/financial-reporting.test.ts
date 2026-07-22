import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFinancialReportingSummary } from '../lib/financial-reporting.ts';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Roxana Ivanov',
  role: 'Expert recrutare si selectie grup tinta',
  positionInProject: 'Expert recrutare si selectie grup tinta',
  jobDescriptionText: 'Expert resurse umane',
  norma: 8,
  oreZi: 8,
};

test('dashboardul Pontaje are exact cele 12 coloane solicitate', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const pontajeMarkup = source.slice(source.indexOf("mode === 'timesheets' ? ("), source.indexOf(') : (', source.indexOf("mode === 'timesheets' ? (")));
  const headers = [...pontajeMarkup.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers, [
    'SALARIAT',
    'POZITIA DE BAZA (CONCORDIA)',
    'ORE LUCRATE CONCORDIA',
    'ORE CO CONCORDIA',
    'FUNCTIA IN PEO',
    'ORE LUCRATE PEO',
    'ORE CO PEO',
    'FUNCTIA IN GOODWORKS4ALL',
    'ORE LUCRATE GOODWORKS4ALL',
    'TOTAL ORE LUCRATE',
    'TOTAL ORE CO',
    'TOTAL ORE LUNA',
  ]);
});

test('modulul financiar calculeaza orele exclusiv din raportare si separa CO/CM', () => {
  const activities: Activity[] = [
    { id: 'a1', expertId: expert.id, date: '2026-06-02', hours: 8, activityType: 'A', title: 'Activitate', status: 'approved' },
    { id: 'a2', expertId: expert.id, date: '2026-06-03', hours: 8, activityType: 'A', title: 'CO', dayType: 'CO', status: 'approved' },
    { id: 'a3', expertId: expert.id, date: '2026-06-04', hours: 4, activityType: 'A', title: 'CM', dayType: 'CM', status: 'draft' },
  ];
  const summary = buildFinancialReportingSummary({
    experts: [expert], activities, month: 6, year: 2026,
    referencePeople: [{ name: 'Roxana Ivanov', basePosition: '-', peoPosition: expert.role, peoNorm: '8 h/zi', cimNorm: '8 h/zi', concordiaWorked: 0, concordiaLeave: 0, peoWorked: 8, peoLeave: 12, goodworksPosition: '-', goodworksWorked: 0 }],
  });
  assert.equal(summary.rows[0].peoWorked, 8);
  assert.equal(summary.rows[0].peoLeave, 8);
  assert.equal(summary.rows[0].medicalLeave, 4);
  assert.equal(summary.rows[0].draftHours, 4);
  assert.equal(summary.rows[0].conflicts.length, 0);
});

test('auditul evidentiaza persoanele lipsa si diferentele de norma fara a inlocui aplicatia', () => {
  const summary = buildFinancialReportingSummary({
    experts: [expert], activities: [], month: 6, year: 2026,
    referencePeople: [
      { name: 'Roxana Ivanov', basePosition: '-', peoPosition: expert.role, peoNorm: '4 h/zi', cimNorm: '8 h/zi', concordiaWorked: 0, concordiaLeave: 0, peoWorked: 0, peoLeave: 0, goodworksPosition: '-', goodworksWorked: 0 },
      { name: 'Expert Lipsa', basePosition: '-', peoPosition: 'Expert', peoNorm: '8 h/zi', cimNorm: '8 h/zi', concordiaWorked: 0, concordiaLeave: 0, peoWorked: 0, peoLeave: 0, goodworksPosition: '-', goodworksWorked: 0 },
    ],
  });
  const roxana = summary.rows.find((row) => row.name === 'Roxana Ivanov');
  assert.equal(roxana?.appNorm, '8 h/zi');
  assert.ok(roxana?.conflicts.some((conflict) => conflict.code === 'daily_norm_mismatch'));
  assert.equal(summary.missingExperts, 1);
});

test('proiectele concurente sunt separate intre Concordia si GOODWORKS4ALL', () => {
  const projects: ConcurrentProject[] = [
    { id: 'c1', expertId: expert.id, projectName: 'Concordia', expertProjectRole: 'Expert resurse umane', dailyHours: 8, startDate: '2026-01-01', isActive: true },
    { id: 'g1', expertId: expert.id, projectName: 'GOODWORKS4ALL', expertProjectRole: 'Expert ocupare', dailyHours: 4, startDate: '2026-01-01', isActive: true },
  ];
  const entries: ConcurrentProjectTimesheetEntry[] = [
    { id: 'e1', concurrentProjectId: 'c1', expertId: expert.id, date: '2026-07-02', month: 7, year: 2026, hours: 6, dayType: 'lucratoare', status: 'verified', source: 'import' },
    { id: 'e2', concurrentProjectId: 'g1', expertId: expert.id, date: '2026-07-03', month: 7, year: 2026, hours: 4, dayType: 'lucratoare', status: 'verified', source: 'import' },
  ];
  const summary = buildFinancialReportingSummary({ experts: [expert], activities: [], concurrentProjects: projects, concurrentEntries: entries, month: 7, year: 2026, referencePeople: [] });
  assert.equal(summary.rows[0].concordiaWorked, 6);
  assert.equal(summary.rows[0].goodworksWorked, 4);
  assert.equal(summary.rows[0].totalWorked, 10);
  assert.equal(summary.rows[0].basePosition, 'Expert resurse umane');
  assert.equal(summary.rows[0].peoFunction, expert.positionInProject);
  assert.equal(summary.rows[0].goodworksFunction, 'Expert ocupare');
  assert.equal(summary.rows[0].totalLeave, 0);
  assert.equal(summary.rows[0].totalMonth, 10);
});
