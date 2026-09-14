import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildFinancialHrValidationRows,
  summarizeFinancialHrValidation,
} from '../lib/financial-hr-validation.ts';
import type { Expert, ExpertNormContract } from '../lib/types.ts';

const referencePerson = {
  name: 'Ivanov Roxana',
  basePosition: 'Specialist Concordia',
  peoPosition: 'Expert PEO',
  peoNorm: '6 h/zi',
  cimNorm: '8 h/zi',
  concordiaWorked: 0,
  concordiaLeave: 0,
  peoWorked: 0,
  peoLeave: 0,
  goodworksPosition: 'Project Officer',
  goodworksWorked: 0,
};

const expert: Expert = {
  id: 'expert-roxana',
  name: 'Roxana Ivanov',
  role: 'Expert PEO',
  positionInProject: 'Expert PEO',
  basePositionConcordia: 'Specialist Concordia',
  goodworksPosition: 'Project Officer',
  norma: 8,
  oreZi: 8,
  dailyHours: 8,
};

const contract: ExpertNormContract = {
  id: 'contract-1',
  expertId: expert.id,
  validFrom: '2026-06-01',
  peoNormUnit: 'HOURS_PER_DAY',
  peoNormValue: 6,
  peoDailyCap: 6,
  cimNormUnit: 'HOURS_PER_DAY',
  cimNormValue: 8,
  cimDailyCap: 8,
  leaveHoursPerDay: 8,
  status: 'ACTIVE',
  justification: 'test',
};

test('validatorul HR gaseste salariatul din Excel inclusiv cand numele are ordinea inversata', () => {
  const rows = buildFinancialHrValidationRows({
    experts: [expert],
    normContracts: [contract],
    referencePeople: [referencePerson],
    month: 5,
    year: 2026,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].expertId, expert.id);
  assert.equal(rows[0].status, 'ok');
  assert.equal(summarizeFinancialHrValidation(rows).ok, 1);
});

test('validatorul HR semnaleaza diferentele de pozitie, functie PEO, norma PEO, Goodworks si norma CIM', () => {
  const rows = buildFinancialHrValidationRows({
    experts: [{
      ...expert,
      basePositionConcordia: 'Pozitie veche',
      positionInProject: 'Functie veche',
      goodworksPosition: 'Goodworks vechi',
    }],
    normContracts: [{ ...contract, peoNormValue: 4, peoDailyCap: 4, cimNormValue: 6, cimDailyCap: 6 }],
    referencePeople: [referencePerson],
    month: 5,
    year: 2026,
  });

  const row = rows[0];
  assert.equal(row.basePosition.status, 'different');
  assert.equal(row.peoFunction.status, 'different');
  assert.equal(row.peoNorm.status, 'different');
  assert.equal(row.goodworksFunction.status, 'different');
  assert.equal(row.cimNorm.status, 'different');
  assert.equal(row.status, 'needs_review');
});

test('salariatii din Excel fara profil sunt marcati necorelat', () => {
  const rows = buildFinancialHrValidationRows({
    experts: [],
    referencePeople: [referencePerson],
    month: 5,
    year: 2026,
  });

  assert.equal(rows[0].status, 'unlinked');
  assert.equal(rows[0].basePosition.status, 'unlinked');
  assert.equal(rows[0].peoNorm.status, 'unlinked');
  assert.equal(summarizeFinancialHrValidation(rows).unlinked, 1);
});

test('Pontaje trimite la Salariati unde profilul si normele se deschid in dialog', () => {
  const pontaje = readFileSync('components/financial/financial-reporting-dashboard.tsx', 'utf8');
  const salariati = readFileSync('components/financial/financial-employees-dashboard.tsx', 'utf8');

  assert.match(pontaje, /\/financiar\/salariati\?expertId=/);
  assert.doesNotMatch(pontaje, /id="norma-editor"/);
  assert.match(salariati, /const expertId = searchParams\.get\('expertId'\)/);
  assert.match(salariati, /if \(row && row\.id !== selectedRowId\) selectRow\(row\)/);
  const dialog = salariati.slice(salariati.indexOf('<Dialog open='), salariati.indexOf('</Dialog>'));
  assert.match(dialog, /open=\{Boolean\(employeeForm && monthlySettingsForm\)\}/);
  assert.match(dialog, /Profil salariat/);
  assert.match(dialog, /placeholder="Norma PEO"/);
  assert.match(dialog, /placeholder="Norma CIM"/);
});

test('Concedii ramane separat de pagina Salariati', () => {
  const nav = readFileSync('components/layout/dashboard-shell.tsx', 'utf8');
  assert.match(nav, /href: '\/financiar\/salariati'/);
  assert.match(nav, /href: '\/financiar\/concedii'/);
});

test('pagina Salariati expune actiunea de adaugare manuala sus in header', () => {
  const source = readFileSync('components/financial/financial-employees-dashboard.tsx', 'utf8');
  const header = source.slice(source.indexOf('actions={('), source.indexOf('<div className="grid gap-4'));
  assert.match(header, /<Button onClick=\{addEmployee\}>/);
  assert.match(header, /Adauga salariat/);
  assert.match(source, /const addEmployee = \(\) =>/);
  const addEmployee = source.slice(source.indexOf('const addEmployee = () =>'), source.indexOf('useEffect(() => {', source.indexOf('const addEmployee = () =>')));
  assert.match(addEmployee, /setEmployeeForm\(/);
  assert.match(addEmployee, /setMonthlySettingsForm\(/);
  assert.match(source, /<DialogTitle>\{employeeForm\?\.expertId \? 'Editeaza salariat' : 'Adauga salariat'\}<\/DialogTitle>/);
});

test('editorul de norme expune doar norma PEO si norma CIM, nu plafoane tehnice sau reguli CO', () => {
  const source = readFileSync('components/financial/financial-employees-dashboard.tsx', 'utf8');

  assert.match(source, /placeholder="Norma PEO"/);
  assert.match(source, /placeholder="Norma CIM"/);
  assert.doesNotMatch(source, /placeholder="Plafon PEO\/zi"/);
  assert.doesNotMatch(source, /placeholder="Plafon CIM\/zi"/);
  assert.doesNotMatch(source, /placeholder="Ore CO\/zi"/);
  assert.match(source, /peoDailyCap:\s*cimDailyCap/);
  assert.match(source, /leaveHoursPerDay:\s*cimDailyCap/);
});
