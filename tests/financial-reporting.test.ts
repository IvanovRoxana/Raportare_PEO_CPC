import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFinancialReportingSummary } from '../lib/financial-reporting.ts';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, ExpertNormContract, LeaveEntry } from '../lib/types.ts';

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

test('dashboardul Financiar include utilizatorii PEO fallback pentru editarea CO', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  assert.match(source, /useExperts\(\)/);
  assert.doesNotMatch(source, /useExperts\(\{\s*includeFallback:\s*false\s*\}\)/);
});

test('coloana perioada CO foloseste calendar pentru selectia zilelor', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  assert.match(source, /function FinancialLeavePeriodPicker/);
  assert.match(source, /<PopoverTrigger asChild>/);
  assert.match(source, /updateLeaveGridPeriod\(row, dates\)/);
});

test('salvarea CO financiar pastreaza CIM din coloana financiara, nu il deduce din PEO si CPC', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  assert.doesNotMatch(source, /const cimDailyCap = peoNorm \+ cpcDailyCap/);
  assert.match(source, /const cimDailyCap = Math\.max\(0, parseDailyHoursLabel\(row\.cimNorm\)/);
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

test('randul financiar expune normele din Excel cand nu exista contract activ', () => {
  const summary = buildFinancialReportingSummary({
    experts: [{ ...expert, norma: 7, oreZi: 7, dailyHours: 7 }],
    activities: [],
    month: 6,
    year: 2026,
    normContracts: [],
    referencePeople: [
      { name: 'Roxana Ivanov', basePosition: '-', peoPosition: expert.role, peoNorm: '6 h/zi', cimNorm: '8 h/zi', concordiaWorked: 0, concordiaLeave: 0, peoWorked: 0, peoLeave: 0, goodworksPosition: '-', goodworksWorked: 0 },
    ],
  });

  assert.equal(summary.rows[0].peoNorm, '6 h/zi');
  assert.equal(summary.rows[0].cimNorm, '8 h/zi');
});

test('norma financiara corecteaza contractul persistent gresit care ar limita CIM la PEO', () => {
  const radu = {
    id: 'radu-ianos',
    name: 'Radu Ianos',
    role: 'Expert',
    norma: 6,
    oreZi: 6,
    dailyHours: 6,
  } as Expert;
  const badContract: ExpertNormContract = {
    id: 'bad-contract',
    expertId: radu.id,
    validFrom: '2026-07-01',
    peoNormUnit: 'HOURS_PER_DAY',
    peoNormValue: 6,
    peoDailyCap: 6,
    cimNormUnit: 'HOURS_PER_DAY',
    cimNormValue: 6,
    cimDailyCap: 6,
    leaveHoursPerDay: 6,
    status: 'ACTIVE',
    justification: 'contract persistent gresit',
  };
  const summary = buildFinancialReportingSummary({
    experts: [radu],
    activities: [{ id: 'a1', expertId: radu.id, date: '2026-07-07', hours: 8, activityType: 'SA3.4', title: 'Activitate', status: 'draft' }],
    month: 6,
    year: 2026,
    normContracts: [badContract],
  });

  const row = summary.rows.find((item) => item.expertId === radu.id);
  assert.equal(row?.peoNorm, '6 h/zi');
  assert.equal(row?.cimNorm, '8 h/zi');
  assert.equal(row?.conflicts.some((conflict) => conflict.message.includes('peste norma CIM de 6')), false);
});

test('leaga automat persoanele financiare de expertii PEO cand numele are ordinea inversata', () => {
  const summary = buildFinancialReportingSummary({
    experts: [expert],
    activities: [],
    month: 6,
    year: 2026,
    referencePeople: [{
      name: 'Ivanov Roxana',
      basePosition: '-',
      peoPosition: expert.role,
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: '-',
      goodworksWorked: 0,
    }],
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].expertId, expert.id);
  assert.equal(summary.rows[0].name, 'Roxana Ivanov');
  assert.equal(summary.missingExperts, 0);
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

test('centralizatorul prefera functiile corectate in aplicatie fata de Excelul de referinta', () => {
  const summary = buildFinancialReportingSummary({
    experts: [{
      ...expert,
      basePositionConcordia: 'Pozitie aplicatie Concordia',
      positionInProject: 'Functie aplicatie PEO',
      goodworksPosition: 'Functie aplicatie GOODWORKS4ALL',
    }],
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

  assert.equal(summary.rows[0].basePosition, 'Pozitie aplicatie Concordia');
  assert.equal(summary.rows[0].peoFunction, 'Functie aplicatie PEO');
  assert.equal(summary.rows[0].goodworksFunction, 'Functie aplicatie GOODWORKS4ALL');
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

test('mappingul confirmat leaga randul financiar de expert chiar daca numele difera', () => {
  const renamedExpert: Expert = {
    id: 'expert-alias',
    name: 'Alexandra Ioana Colceru',
    role: 'Expert comunicare',
    positionInProject: 'Expert comunicare',
    norma: 8,
    oreZi: 8,
  };
  const summary = buildFinancialReportingSummary({
    experts: [renamedExpert],
    activities: [{ id: 'a-alias', expertId: renamedExpert.id, expertName: renamedExpert.name, date: '2026-06-03', hours: 5, activityType: 'A', title: 'Activitate', status: 'sent' }],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Alexandra Colceru',
      basePosition: '-',
      peoPosition: 'Expert comunicare',
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: '-',
      goodworksWorked: 0,
    }],
    financialPersonLinks: [{
      id: 'link-1',
      financialPersonName: 'Alexandra Colceru',
      financialPersonKey: 'alexandra colceru',
      expertId: renamedExpert.id,
      status: 'confirmed',
      confidence: 0.9,
      source: 'manual',
    }],
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].expertId, renamedExpert.id);
  assert.equal(summary.rows[0].name, renamedExpert.name);
  assert.equal(summary.rows[0].peoWorked, 5);
  assert.equal(summary.missingExperts, 0);
});

test('potrivirile automate foarte sigure leaga randul financiar de expert', () => {
  const suggestedExpert: Expert = {
    id: 'expert-suggested',
    name: 'Andrei Adelina',
    role: 'Expert',
    norma: 8,
    oreZi: 8,
  };
  const summary = buildFinancialReportingSummary({
    experts: [suggestedExpert],
    activities: [],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Adelina Andrei',
      basePosition: '-',
      peoPosition: 'Expert',
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: '-',
      goodworksWorked: 0,
    }],
    financialPersonLinks: [{
      id: 'link-suggested',
      financialPersonName: 'Adelina Andrei',
      financialPersonKey: 'adelina andrei',
      expertId: suggestedExpert.id,
      status: 'suggested',
      confidence: 0.96,
      source: 'automatic',
    }],
  });

  const financialRow = summary.rows.find((row) => row.name === 'Andrei Adelina');
  assert.equal(financialRow?.expertId, suggestedExpert.id);
  assert.equal(financialRow?.conflicts.some((conflict) => conflict.code === 'missing_expert'), false);
  assert.deepEqual(financialRow?.matchSuggestions, []);
});
