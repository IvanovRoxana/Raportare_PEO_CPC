import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const monthlyReportExportSource = readFileSync(
  new URL('../components/expert/monthly-report-export.tsx', import.meta.url),
  'utf8',
);

test('exportul lunar continua RA chiar daca un document anterior esueaza', () => {
  assert.match(monthlyReportExportSource, /const failedExports: string\[\] = \[\];/);
  assert.match(monthlyReportExportSource, /const runExport = async \(label: string, action: \(\) => Promise<void> \| void\)/);
  assert.match(monthlyReportExportSource, /failedExports\.push\(`\$\{label\}: \$\{message\}`\);/);
  assert.match(monthlyReportExportSource, /await runExport\('Pontaj final consolidat', \(\) => downloadPontajExcel\('consolidated'\)\);/);
  assert.match(monthlyReportExportSource, /await runExport\('Raport de Activitate', async \(\) => \{/);
  assert.match(monthlyReportExportSource, /Am descarcat documentele generate, dar unele exporturi au esuat:/);
  assert.match(monthlyReportExportSource, /whitespace-pre-line/);
});
