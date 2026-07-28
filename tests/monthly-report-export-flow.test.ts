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
  assert.match(monthlyReportExportSource, /await runExport\('Pontaj PEO', \(\) => downloadPontajExcel\('peo'\)\);/);
  assert.match(monthlyReportExportSource, /await runExport\('Raport de Activitate', async \(\) => \{/);
  assert.match(monthlyReportExportSource, /Am descarcat documentele generate, dar unele exporturi au esuat:/);
  assert.match(monthlyReportExportSource, /whitespace-pre-line/);
  assert.doesNotMatch(monthlyReportExportSource, /Pontaj final consolidat/);
  assert.doesNotMatch(monthlyReportExportSource, /OPIS Livrabile/);
});

test('exportul lunar descarca RA ca Anexa 10 DOCX determinist', () => {
  assert.match(monthlyReportExportSource, /buildAnexa10ReportModel/);
  assert.match(monthlyReportExportSource, /buildAnexa10DocxBlob/);
  assert.match(monthlyReportExportSource, /triggerDownload\(blob, buildAnexa10DocxFilename\(model\)\);/);
  assert.match(monthlyReportExportSource, /workBlockBundles: workBlockBundles\.length > 0 \? workBlockBundles : undefined/);
  assert.match(monthlyReportExportSource, /Raport de Activitate \(Anexa 10 \.docx\)/);
  assert.doesNotMatch(monthlyReportExportSource, /\/api\/ai\/generate-report/);
  assert.doesNotMatch(monthlyReportExportSource, /Raport_Activitate_\$\{expert\.name\}.*\.md/);
});
