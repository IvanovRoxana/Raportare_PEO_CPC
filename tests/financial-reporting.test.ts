import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFinancialReportingSummary } from '../lib/financial-reporting.ts';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, LeaveEntry } from '../lib/types.ts';

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
  const expectedHeaders = [
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
  ];
  const headers = [...source.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]);
  const sequenceStart = headers.findIndex((header, index) =>
    expectedHeaders.every((expectedHeader, offset) => headers[index + offset] === expectedHeader),
  );
  assert.notEqual(sequenceStart, -1);
});

test('modulul financiar preia CO doar din modulul CO manual', () => {
  const activities: Activity[] = [
    { id: 'a1', expertId: expert.id, date: '2026-06-02', hours: 8, activityType: 'A', title: 'Activitate', status: 'approved' },
    { id: 'a2', expertId: expert.id, date: '2026-06-03', hours: 8, activityType: 'A', title: 'CO', dayType: 'CO', status: 'approved' },
    { id: 'a3', expertId: expert.id, date: '2026-06-04', hours: 4, activityType: 'A', title: 'CM', dayType: 'CM', status: 'draft' },
  ];
  const leaveEntries: LeaveEntry[] = [
    {
      id: 'leave-1',
      expertId: expert.id,
      date: '2026-06-03',
      month: 5,
      year: 2026,
      type: 'CO',
      totalHours: 8,
      peoHours: 6,
      cpcHours: 2,
      source: 'FINANCIAL',
      status: 'VALIDATED',
      lockedForExpert: true,
    },
    {
      id: 'leave-2',
      expertId: expert.id,
      date: '2026-06-04',
      month: 5,
      year: 2026,
      type: 'CM',
      totalHours: 4,
      peoHours: 4,
      cpcHours: 0,
      source: 'FINANCIAL',
      status: 'VALIDATED',
      lockedForExpert: true,
    },
  ];
  const summary = buildFinancialReportingSummary({
    experts: [expert], activities, leaveEntries, month: 5, year: 2026,
    referencePeople: [],
  });
  assert.equal(summary.rows[0].peoWorked, 8);
  assert.equal(summary.rows[0].peoLeave, 6);
  assert.equal(summary.rows[0].medicalLeave, 4);
  assert.equal(summary.rows[0].concordiaLeave, 2);
  assert.equal(summary.rows[0].draftHours, 4);
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

test('orele CPC lucrate se calculeaza din norma CIM minus PEO, GOODWORKS si CO manual', () => {
  const projects: ConcurrentProject[] = [
    { id: 'c1', expertId: expert.id, projectName: 'Concordia', expertProjectRole: 'Expert resurse umane', dailyHours: 8, startDate: '2026-01-01', isActive: true },
    { id: 'g1', expertId: expert.id, projectName: 'GOODWORKS4ALL', expertProjectRole: 'Expert ocupare', dailyHours: 4, startDate: '2026-01-01', isActive: true },
  ];
  const entries: ConcurrentProjectTimesheetEntry[] = [
    { id: 'e1', concurrentProjectId: 'c1', expertId: expert.id, date: '2026-07-02', month: 7, year: 2026, hours: 6, dayType: 'lucratoare', status: 'verified', source: 'import' },
    { id: 'e2', concurrentProjectId: 'g1', expertId: expert.id, date: '2026-07-03', month: 7, year: 2026, hours: 4, dayType: 'lucratoare', status: 'verified', source: 'import' },
  ];
  const leaveEntries: LeaveEntry[] = [{
    id: 'leave-1',
    expertId: expert.id,
    date: '2026-08-04',
    month: 7,
    year: 2026,
    type: 'CO',
    totalHours: 8,
    peoHours: 6,
    cpcHours: 2,
    source: 'FINANCIAL',
    status: 'VALIDATED',
    lockedForExpert: true,
  }];
  const summary = buildFinancialReportingSummary({ experts: [expert], activities: [], concurrentProjects: projects, concurrentEntries: entries, leaveEntries, month: 7, year: 2026, referencePeople: [] });
  assert.equal(summary.rows[0].concordiaWorked, 156);
  assert.equal(summary.rows[0].goodworksWorked, 4);
  assert.equal(summary.rows[0].totalWorked, 160);
  assert.equal(summary.rows[0].basePosition, 'Expert resurse umane');
  assert.equal(summary.rows[0].peoFunction, expert.positionInProject);
  assert.equal(summary.rows[0].goodworksFunction, 'Expert ocupare');
  assert.equal(summary.rows[0].totalLeave, 8);
  assert.equal(summary.rows[0].totalMonth, 168);
});

test('centralizatorul preia functiile din Excelul de referinta cand exista', () => {
  const summary = buildFinancialReportingSummary({
    experts: [expert],
    activities: [],
    concurrentProjects: [
      { id: 'c1', expertId: expert.id, projectName: 'Concordia', expertProjectRole: 'Rol vechi Concordia', dailyHours: 8, startDate: '2026-01-01', isActive: true },
      { id: 'g1', expertId: expert.id, projectName: 'GOODWORKS4ALL', expertProjectRole: 'Rol vechi Goodworks', dailyHours: 4, startDate: '2026-01-01', isActive: true },
    ],
    concurrentEntries: [],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Roxana Ivanov',
      basePosition: 'Pozitie corecta Concordia',
      peoPosition: 'Functie corecta PEO',
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: 'Functie corecta GOODWORKS4ALL',
      goodworksWorked: 0,
    }],
  });

  assert.equal(summary.rows[0].basePosition, 'Pozitie corecta Concordia');
  assert.equal(summary.rows[0].peoFunction, 'Functie corecta PEO');
  assert.equal(summary.rows[0].goodworksFunction, 'Functie corecta GOODWORKS4ALL');
});

test('centralizeaza in dashboard financiar orele pontate de expert in raportare PEO', () => {
  const experts = [
    {
      id: 'expert-formular-1',
      name: 'Expert Test Formular',
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
      id: 'activity-formular-1',
      expertId: 'expert-formular-1',
      expertName: 'Expert Test Formular',
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
  assert.equal(summary.rows[0].name, 'Expert Test Formular');
  assert.equal(summary.rows[0].peoWorked, 6);
  assert.equal(summary.rows[0].totalWorked, 168);
  assert.equal(summary.totalPeoWorked, 6);
});
