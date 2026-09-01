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
