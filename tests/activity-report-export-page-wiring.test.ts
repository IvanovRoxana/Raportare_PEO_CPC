import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exportPageSource = readFileSync(new URL('../app/expert/peo/export/page.tsx', import.meta.url), 'utf8');
const reportGeneratorSource = readFileSync(new URL('../components/expert/report-generator.tsx', import.meta.url), 'utf8');
const monthlyReportExportSource = readFileSync(new URL('../components/expert/monthly-report-export.tsx', import.meta.url), 'utf8');
const pmDossierModalSource = readFileSync(new URL('../components/pm/dosar-expert-modal.tsx', import.meta.url), 'utf8');

test('pagina export RA conecteaza exportul Anexa 10 determinist doar prin flag explicit', () => {
  assert.match(exportPageSource, /isAnexa10DeterministicDocxEnabledClient/);
  assert.match(exportPageSource, /const deterministicAnexa10DocxEnabled = isAnexa10DeterministicDocxEnabledClient\(\);/);
  assert.match(exportPageSource, /enableDeterministicAnexa10Docx=\{deterministicAnexa10DocxEnabled\}/);
});

test('pagina export RA paseaza expertul complet catre generatorul Anexa 10', () => {
  assert.match(exportPageSource, /const selectedExpertFinancialNorm = useMemo<Expert>\(\(\) => \(\{/);
  assert.match(exportPageSource, /\.\.\.\(selectedExpert as Expert\)/);
  assert.match(exportPageSource, /expert=\{selectedExpertFinancialNorm\}/);
  assert.match(reportGeneratorSource, /expert\?: Pick<Expert,/);
  assert.match(reportGeneratorSource, /enableDeterministicAnexa10Docx = false/);
});

test('pagina export RA blocheaza fallback-ul Anexa 10 cat timp work block-urile persistate se incarca', () => {
  assert.match(exportPageSource, /const isLoadingDeterministicWorkBlocks = reportingWorkBlocksEnabled/);
  assert.match(exportPageSource, /isLoadingPersistedWorkBlockBundles \|\| isRefreshingPersistedWorkBlockBundles/);
  assert.match(exportPageSource, /isLoadingDeterministicWorkBlocks=\{isLoadingDeterministicWorkBlocks\}/);
  assert.match(reportGeneratorSource, /isLoadingDeterministicWorkBlocks = false/);
  assert.match(reportGeneratorSource, /if \(isLoadingDeterministicWorkBlocks\) return null;/);
  assert.match(reportGeneratorSource, /\|\| isLoadingDeterministicWorkBlocks/);
});

test('toate exporturile Anexa 10 folosesc gate-ul comun inainte de DOCX', () => {
  assert.match(reportGeneratorSource, /getAnexa10ExportGate/);
  assert.match(reportGeneratorSource, /requirePassedPreflight: true/);
  assert.match(reportGeneratorSource, /assertCanExportAnexa10Docx\(deterministicAnexa10Model/);
  assert.match(monthlyReportExportSource, /assertCanExportAnexa10Docx\(model/);
  assert.match(pmDossierModalSource, /assertCanExportAnexa10Docx\(model/);
  assert.match(pmDossierModalSource, /useReportingWorkBlockBundles\(expert\?\.id \?\? null, month, year\)/);
  assert.match(pmDossierModalSource, /workBlockBundles: persistedRaWorkBlockBundles\.length > 0 \? persistedRaWorkBlockBundles : undefined/);
});
