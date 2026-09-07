import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aggregateLeaveAllocationsByDate, calculateLeaveAllocationForDay } from '../lib/financial-leave-allocation.ts';
import { buildFinancialLeaveGridAllocations, getPeoLeaveDates } from '../lib/financial-leave-grid.ts';
import { applyFinancialReferenceNorms } from '../lib/financial-norm-contracts.ts';
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

test('formularul Adauga CO Financiar afiseaza titluri vizibile pentru campuri', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');

  assert.match(source, />Expert</);
  assert.match(source, />Data CO</);
  assert.match(source, />Repartizare</);
  assert.match(source, />Ore CO total</);
  assert.match(source, />Ore CO PEO</);
  assert.match(source, />Ore CO CPC</);
  assert.match(source, />Justificare</);
});

test('RAP-59 elimina actiunile de test din meniul Concedii financiar', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');

  assert.doesNotMatch(source, /Pregateste CO automat/);
  assert.doesNotMatch(source, /Pregateste CO manual/);
  assert.doesNotMatch(source, /Valideaza primul draft/);
  assert.doesNotMatch(source, /Gestioneaza norme/);
});

test('rata orara este camp persistent pe Expert si mapata prin AWS store', () => {
  const schema = readFileSync('amplify/data/resource.ts', 'utf8');
  const types = readFileSync('lib/types.ts', 'utf8');
  const store = readFileSync('lib/aws-store.ts', 'utf8');

  assert.match(schema, /Expert:\s*a\s*\.\s*model\(\{[\s\S]*hourlyRate:\s*a\.float\(\)/);
  assert.match(types, /export interface Expert[\s\S]*hourlyRate\?: number/);
  assert.match(store, /hourlyRate:\s*expert\.hourlyRate/);
  assert.match(store, /hourlyRate:\s*item\.hourlyRate \?\? undefined/);
});

test('salvarea CO financiar pastreaza CIM din coloana financiara, nu il deduce din PEO si CPC', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  assert.doesNotMatch(source, /const cimDailyCap = peoNorm \+ cpcDailyCap/);
  assert.match(source, /const cimDailyCap = Math\.max\(0, parseDailyHoursLabel\(row\.cimNorm\)/);
});

test('salvarea din grila CO financiar valideaza direct randurile salvate', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const saveGridStart = source.indexOf('const saveLeaveGridRow = async');
  const saveGridEnd = source.indexOf('const saveFinancialLeave = async');
  const saveGridSource = source.slice(saveGridStart, saveGridEnd);

  assert.notEqual(saveGridStart, -1);
  assert.notEqual(saveGridEnd, -1);
  assert.match(saveGridSource, /status:\s*'VALIDATED'/);
  assert.doesNotMatch(saveGridSource, /status:\s*'DRAFT'/);
});

test('grila CO financiar pastreaza drafturile editate la refresh si navigare in sesiune', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const hydrateStart = source.indexOf('setLeaveGridDrafts((current) => {');
  const hydrateEnd = source.indexOf('const leaveGridTotals = useMemo');
  const hydrateSource = source.slice(hydrateStart, hydrateEnd);

  assert.notEqual(hydrateStart, -1);
  assert.notEqual(hydrateEnd, -1);
  assert.match(source, /dirtyLeaveGridRows/);
  assert.match(source, /window\.sessionStorage\.setItem\(leaveGridDraftStorageKey/);
  assert.match(source, /readStoredLeaveGridDrafts\(leaveGridDraftStorageKey\)/);
  assert.match(hydrateSource, /if \(dirtyLeaveGridRows\.has\(key\) && current\[key\]\) continue;/);
});

test('grila CO financiar curata starea draft dupa salvarea reala in backend', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const saveGridStart = source.indexOf('const saveLeaveGridRow = async');
  const saveGridEnd = source.indexOf('const saveFinancialLeave = async');
  const saveGridSource = source.slice(saveGridStart, saveGridEnd);

  assert.notEqual(saveGridStart, -1);
  assert.notEqual(saveGridEnd, -1);
  assert.match(saveGridSource, /next\.delete\(key\)/);
  assert.doesNotMatch(saveGridSource, /setDirtyLeaveGridRows\(\(current\) => new Set\(current\)\.add\(key\)\)/);
});

test('grila CO financiar nu sterge orele manuale cand norma CPC este zero', () => {
  const source = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const updateDraftStart = source.indexOf('const updateLeaveGridDraft = ');
  const updateDraftEnd = source.indexOf('const updateLeaveGridPeriod = ');
  const updateDraftSource = source.slice(updateDraftStart, updateDraftEnd);

  assert.notEqual(updateDraftStart, -1);
  assert.notEqual(updateDraftEnd, -1);
  assert.match(updateDraftSource, /const nextCpcNorm = numericCell\(next\.cpcNorm\);/);
  assert.match(updateDraftSource, /if \(nextCpcNorm > 0\) \{/);
  assert.doesNotMatch(updateDraftSource, /next\.cpcHours = formatNumericCell\(numericCell\(next\.cpcNorm\) \* numericCell\(next\.cpcDays\)\)/);
});

test('grila CO financiar foloseste perioada ca selectie PEO si pastreaza zilele CIM pentru CPC', () => {
  const allocations = buildFinancialLeaveGridAllocations({
    existingLeaveDates: [
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
    ],
    peoDates: ['2026-08-17', '2026-08-18'],
    peoHours: 16,
    cpcHours: 72,
    peoDays: 2,
    cpcDays: 9,
  });

  assert.equal(allocations.length, 9);
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.peoHours, 0), 16);
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.cpcHours, 0), 72);
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.totalHours, 0), 72);
  assert.deepEqual(
    allocations.filter((allocation) => allocation.peoHours > 0).map((allocation) => allocation.date),
    ['2026-08-17', '2026-08-18'],
  );
});

test('grila CO financiar extinde zilele CPC din perioada PEO cand pontajul CO nu este incarcat in rand', () => {
  const allocations = buildFinancialLeaveGridAllocations({
    existingLeaveDates: [],
    peoDates: ['2026-08-17', '2026-08-18'],
    peoHours: 16,
    cpcHours: 72,
    peoDays: 2,
    cpcDays: 9,
  });

  assert.equal(allocations.length, 9);
  assert.deepEqual(
    allocations.map((allocation) => allocation.date),
    [
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
    ],
  );
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.peoHours, 0), 16);
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.cpcHours, 0), 72);
});

test('perioada initiala din grila CO financiar afiseaza doar zilele cu CO PEO', () => {
  const leaves: LeaveEntry[] = [
    { id: 'leave-peo', expertId: expert.id, date: '2026-08-17', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 8, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-cpc', expertId: expert.id, date: '2026-08-19', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
  ];

  assert.deepEqual(getPeoLeaveDates(leaves), ['2026-08-17']);
});

test('RAP-50 centralizeaza interpretarea CO intr-o functie domain comuna', () => {
  const financialReporting = readFileSync('lib/financial-reporting.ts', 'utf8');
  const pontajExport = readFileSync('lib/pontaj-excel-export.ts', 'utf8');
  const timeCapacity = readFileSync('lib/time-capacity.ts', 'utf8');

  assert.match(financialReporting, /calculateLeaveAllocationForDay\(leave,\s*\{\s*peoScope:\s*isPeoExpert\s*\}\)/);
  assert.match(pontajExport, /aggregateLeaveAllocationsByDate\(leaveEntries,\s*\{\s*month,\s*year,\s*exportableOnly:\s*true\s*\}\)/);
  assert.match(timeCapacity, /calculateLeaveAllocationForDay\(leave\)/);
});

test('calculateLeaveAllocationForDay pastreaza split-ul financiar si muta non-PEO integral pe Concordia', () => {
  const leave: LeaveEntry = {
    id: 'leave-domain',
    expertId: expert.id,
    date: '2026-08-17',
    month: 7,
    year: 2026,
    type: 'CO',
    totalHours: 8,
    peoHours: 6,
    cpcHours: 2,
    source: 'FINANCIAL',
    status: 'VALIDATED',
    lockedForExpert: true,
    automaticSplit: false,
  };

  assert.deepEqual(calculateLeaveAllocationForDay(leave, { month: 7, year: 2026 }), {
    date: '2026-08-17',
    type: 'CO',
    peoHours: 6,
    cpcHours: 2,
    totalHours: 8,
    source: 'FINANCIAL',
    status: 'VALIDATED',
    lockedForExpert: true,
    automaticSplit: false,
  });
  assert.deepEqual(calculateLeaveAllocationForDay(leave, { peoScope: false })?.peoHours, 0);
  assert.deepEqual(calculateLeaveAllocationForDay(leave, { peoScope: false })?.cpcHours, 8);
});

test('aggregateLeaveAllocationsByDate foloseste doar CO financiar sau validat pentru export', () => {
  const allocations = aggregateLeaveAllocationsByDate([
    { id: 'financial', expertId: expert.id, date: '2026-08-17', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 6, cpcHours: 2, source: 'FINANCIAL', status: 'DRAFT', lockedForExpert: true },
    { id: 'validated', expertId: expert.id, date: '2026-08-17', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 2, cpcHours: 6, source: 'EXPERT', status: 'VALIDATED', lockedForExpert: false },
    { id: 'draft', expertId: expert.id, date: '2026-08-18', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 8, cpcHours: 0, source: 'EXPERT', status: 'DRAFT', lockedForExpert: false },
  ], { month: 7, year: 2026, exportableOnly: true });
  const allocation = allocations.get('2026-08-17');

  assert.equal(allocations.has('2026-08-18'), false);
  assert.equal(allocation?.peoHours, 8);
  assert.equal(allocation?.cpcHours, 8);
  assert.equal(allocation?.totalHours, 16);
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
  assert.deepEqual(summary.rows[0].coLeaveDates, ['2026-06-03']);
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

test('normele financiare din Excel raman active de la o luna la alta', () => {
  const contracts = applyFinancialReferenceNorms(
    expert,
    [],
    7,
    2026,
    [
      { name: 'Roxana Ivanov', peoNorm: '6 h/zi', cimNorm: '8 h/zi' },
    ],
  );

  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].id, `financial-reference:${expert.id}`);
  assert.equal(contracts[0].validFrom, '2026-07-01');
  assert.equal(contracts[0].validTo, undefined);
  assert.equal(contracts[0].peoNormValue, 6);
  assert.equal(contracts[0].cimNormValue, 8);
});

test('contractele salvate in aplicatie au prioritate peste reperul Excel', () => {
  const appContract: ExpertNormContract = {
    id: 'manual-contract',
    expertId: expert.id,
    validFrom: '2026-07-01',
    peoNormUnit: 'HOURS_PER_DAY',
    peoNormValue: 4,
    peoDailyCap: 4,
    cimNormUnit: 'HOURS_PER_DAY',
    cimNormValue: 8,
    cimDailyCap: 8,
    leaveHoursPerDay: 8,
    status: 'ACTIVE',
    justification: 'Actualizare din aplicatie',
    createdBy: 'financial-session',
  };

  const contracts = applyFinancialReferenceNorms(
    expert,
    [appContract],
    7,
    2026,
    [
      { name: 'Roxana Ivanov', peoNorm: '6 h/zi', cimNorm: '8 h/zi' },
    ],
  );

  assert.deepEqual(contracts, [appContract]);
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
  assert.equal(summary.rows[0].basePosition, '-');
  assert.equal(summary.rows[0].peoFunction, expert.positionInProject);
  assert.equal(summary.rows[0].goodworksFunction, 'Expert ocupare');
  assert.equal(summary.rows[0].totalLeave, 8);
  assert.equal(summary.rows[0].totalMonth, 168);
});

test('timesheetBucket clasifica explicit proiectele concurente in PEO/PIDS si in afara PEO/PIDS', () => {
  const projects: ConcurrentProject[] = [
    { id: 'pids', expertId: expert.id, projectName: 'Program educatie', projectCode: 'PIDS-1', timesheetBucket: 'peo_pids', expertProjectRole: 'Expert PIDS', dailyHours: 2, startDate: '2026-07-01', isActive: true },
    { id: 'outside', expertId: expert.id, projectName: 'Proiect extern', projectCode: 'EXT-1', timesheetBucket: 'outside_peo_pids', expertProjectRole: 'Expert extern', dailyHours: 3, startDate: '2026-07-01', isActive: true },
  ];
  const entries: ConcurrentProjectTimesheetEntry[] = [
    { id: 'pids-entry', concurrentProjectId: 'pids', expertId: expert.id, date: '2026-07-02', month: 6, year: 2026, hours: 2, dayType: 'lucratoare', status: 'verified', source: 'import' },
    { id: 'outside-entry', concurrentProjectId: 'outside', expertId: expert.id, date: '2026-07-03', month: 6, year: 2026, hours: 3, dayType: 'lucratoare', status: 'verified', source: 'import' },
  ];

  const summary = buildFinancialReportingSummary({
    experts: [expert],
    activities: [],
    concurrentProjects: projects,
    concurrentEntries: entries,
    month: 6,
    year: 2026,
    referencePeople: [],
  });

  assert.equal(summary.rows[0].goodworksWorked, 2);
  assert.equal(summary.rows[0].concordiaWorked, 182);
  assert.equal(summary.rows[0].goodworksFunction, 'Expert PIDS');
});

test('pontajele financiare afiseaza CO validat financiar peste orele raportate de expert', () => {
  const nida: Expert = {
    id: 'nida',
    name: 'Nida Halit',
    role: 'Expert informare si comunicare',
    positionInProject: 'Expert informare si comunicare',
    jobDescriptionText: 'Expert informare si comunicare',
    norma: 8,
    oreZi: 8,
  };
  const activities: Activity[] = [
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-10',
    '2026-08-11',
    '2026-08-12',
    '2026-08-13',
    '2026-08-14',
    '2026-08-17',
  ].map((date, index) => ({
    id: `activity-${index}`,
    expertId: nida.id,
    expertName: nida.name,
    date,
    hours: 8,
    activityType: 'Raportare',
    title: 'Activitate PEO',
    description: 'Activitate raportata inainte de validarea financiara',
    dayType: 'lucratoare',
    status: 'sent',
    projectCode: 'PEO',
  }));
  const leaveEntries: LeaveEntry[] = [
    { id: 'leave-17', expertId: nida.id, date: '2026-08-17', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 8, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-18', expertId: nida.id, date: '2026-08-18', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 8, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-19', expertId: nida.id, date: '2026-08-19', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-20', expertId: nida.id, date: '2026-08-20', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-21', expertId: nida.id, date: '2026-08-21', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-24', expertId: nida.id, date: '2026-08-24', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-25', expertId: nida.id, date: '2026-08-25', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-26', expertId: nida.id, date: '2026-08-26', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
    { id: 'leave-27', expertId: nida.id, date: '2026-08-27', month: 7, year: 2026, type: 'CO', totalHours: 8, peoHours: 0, cpcHours: 8, source: 'FINANCIAL', status: 'VALIDATED', lockedForExpert: true },
  ];

  const summary = buildFinancialReportingSummary({
    experts: [nida],
    activities,
    leaveEntries,
    month: 7,
    year: 2026,
    referencePeople: [],
  });

  assert.equal(summary.rows[0].peoWorked, 80);
  assert.equal(summary.rows[0].peoLeave, 16);
  assert.equal(summary.rows[0].concordiaWorked, 0);
  assert.equal(summary.rows[0].concordiaLeave, 72);
  assert.equal(summary.rows[0].totalWorked, 80);
  assert.equal(summary.rows[0].totalLeave, 88);
  assert.equal(summary.rows[0].totalMonth, 168);
});

test('pentru angajatii fara PEO concediul financiar intra integral la Concordia', () => {
  const nonPeoExpert: Expert = {
    id: 'expert-non-peo',
    name: 'Expert Non PEO',
    role: 'Responsabil administrativ',
    jobDescriptionText: 'Responsabil administrativ',
    norma: 8,
    oreZi: 8,
  };
  const leaveEntries: LeaveEntry[] = [{
    id: 'leave-non-peo',
    expertId: nonPeoExpert.id,
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

  const summary = buildFinancialReportingSummary({
    experts: [nonPeoExpert],
    activities: [],
    concurrentProjects: [],
    concurrentEntries: [],
    leaveEntries,
    month: 7,
    year: 2026,
    referencePeople: [],
  });

  assert.equal(summary.rows[0].peoWorked, 0);
  assert.equal(summary.rows[0].peoLeave, 0);
  assert.equal(summary.rows[0].medicalLeave, 0);
  assert.equal(summary.rows[0].concordiaLeave, 8);
  assert.equal(summary.rows[0].concordiaWorked, 160);
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

test('centralizatorul nu afiseaza pozitiile si functiile Excel ca date din aplicatie', () => {
  const summary = buildFinancialReportingSummary({
    experts: [{ ...expert, basePositionConcordia: undefined, positionInProject: undefined, goodworksPosition: undefined }],
    activities: [],
    concurrentProjects: [],
    concurrentEntries: [],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Roxana Ivanov',
      basePosition: 'Pozitie doar in Excel',
      peoPosition: 'Functie PEO doar in Excel',
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: 'Goodworks doar in Excel',
      goodworksWorked: 0,
    }],
  });

  assert.equal(summary.rows[0].basePosition, '-');
  assert.equal(summary.rows[0].peoFunction, expert.role);
  assert.equal(summary.rows[0].goodworksFunction, '-');
  assert.ok(summary.rows[0].conflicts.some((conflict) => conflict.code === 'role_mismatch'));
});

test('RAP-57 Pontaje marcheaza diferentele HR fara comparatie vizuala cu Salariati', () => {
  const summary = buildFinancialReportingSummary({
    experts: [{
      ...expert,
      basePositionConcordia: 'Pozitie aplicatie',
      positionInProject: 'Functie PEO aplicatie',
      goodworksPosition: 'Goodworks aplicatie',
    }],
    activities: [],
    concurrentProjects: [],
    concurrentEntries: [],
    normContracts: [{
      id: 'norm-rap-57',
      expertId: expert.id,
      validFrom: '2026-06-01',
      peoNormUnit: 'HOURS_PER_DAY',
      peoNormValue: 6,
      peoDailyCap: 6,
      cimNormUnit: 'HOURS_PER_DAY',
      cimNormValue: 6,
      cimDailyCap: 6,
      leaveHoursPerDay: 6,
      status: 'ACTIVE',
      justification: 'Test RAP-57',
    }],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Roxana Ivanov',
      basePosition: 'Pozitie Excel',
      peoPosition: 'Functie PEO Excel',
      peoNorm: '8 h/zi',
      cimNorm: '8 h/zi',
      concordiaWorked: 0,
      concordiaLeave: 0,
      peoWorked: 0,
      peoLeave: 0,
      goodworksPosition: 'Goodworks Excel',
      goodworksWorked: 0,
    }],
  });

  const conflictCodes = new Set(summary.rows[0].conflicts.map((conflict) => conflict.code));
  assert.ok(conflictCodes.has('base_position_mismatch'));
  assert.ok(conflictCodes.has('role_mismatch'));
  assert.ok(conflictCodes.has('goodworks_role_mismatch'));
  assert.ok(conflictCodes.has('daily_norm_mismatch'));
  assert.ok(conflictCodes.has('cim_norm_mismatch'));
});

test('pozitia de baza Concordia nu se completeaza din campurile administrative', () => {
  const summary = buildFinancialReportingSummary({
    experts: [{ ...expert, basePositionConcordia: undefined, jobDescriptionText: 'Pozitie din Admin' }],
    activities: [],
    concurrentProjects: [
      { id: 'c1', expertId: expert.id, projectName: 'Concordia', expertProjectRole: 'Rol proiect Concordia', dailyHours: 8, startDate: '2026-01-01', isActive: true },
    ],
    concurrentEntries: [],
    month: 5,
    year: 2026,
    referencePeople: [{
      name: 'Roxana Ivanov',
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

  assert.equal(summary.rows[0].basePosition, '-');
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
