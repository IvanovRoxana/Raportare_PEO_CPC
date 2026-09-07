import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('calendarul expertului afiseaza CO chiar cand alocarea PEO este zero', () => {
  const source = readFileSync('components/expert/multi-select-calendar.tsx', 'utf8');

  assert.match(source, /const leaveActivity = dateActivities\.find/);
  assert.match(source, /activity\.dayType === 'CO'/);
  assert.match(source, /return 0;/);
  assert.match(source, /\{leaveActivity && \(/);
  assert.match(source, /\{leaveActivity\.dayType === 'Altele' \? 'Absenta' : leaveActivity\.dayType\}/);
  assert.match(source, /\{leaveActivity \? `\$\{totalHours\}h PEO` : `\$\{totalHours\}h pontate`\}/);
});

test('exportul rapid din dashboardul expertului primeste alocarile financiare de concediu', () => {
  const source = readFileSync('app/expert/page.tsx', 'utf8');
  const exportStart = source.indexOf('const exportPontaj = async');
  const exportEnd = source.indexOf('const canOpenPmDashboard');
  const exportSource = source.slice(exportStart, exportEnd);

  assert.notEqual(exportStart, -1);
  assert.notEqual(exportEnd, -1);
  assert.match(exportSource, /leaveEntries: currentExpertLeaveEntries/);
});

test('CO financiar validat inlocuieste activitatile raportate in calendarele expertului', () => {
  const expertHome = readFileSync('app/expert/page.tsx', 'utf8');
  const peoPage = readFileSync('app/expert/peo/page.tsx', 'utf8');

  for (const source of [expertHome, peoPage]) {
    assert.match(source, /leave\.source === 'FINANCIAL' \|\| leave\.lockedForExpert/);
    assert.match(source, /&& !financialLeaveDates\.has\(activity\.date\)/);
    assert.match(source, /CO - Concediu de odihna/);
    assert.match(source, /`\$\{leave\.type\} Financiar/);
  }
});

test('calendarul PEO arata explicit zilele CO chiar daca PEO este zero', () => {
  const source = readFileSync('app/expert/peo/page.tsx', 'utf8');

  assert.match(source, /const dayLeaveActivities = dayActivities\.filter/);
  assert.match(source, /const hasLeave = dayLeaveActivities\.length > 0/);
  assert.match(source, /const isDayClosed = hasLeave \|\|/);
  assert.match(source, /hasLeave \? 'CO' : `\$\{totalHours\}h \/ \$\{dailyLimit\}h`/);
  assert.match(source, /isLeaveActivity \? activity\.dayType : `\$\{activity\.hours\}h`/);
});
