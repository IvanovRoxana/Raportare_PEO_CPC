import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exportPageSource = readFileSync(new URL('../app/expert/peo/export/page.tsx', import.meta.url), 'utf8');
const reportGeneratorSource = readFileSync(new URL('../components/expert/report-generator.tsx', import.meta.url), 'utf8');

test('pagina export RA conecteaza exportul Anexa 10 determinist doar prin flag explicit', () => {
  assert.match(exportPageSource, /isAnexa10DeterministicDocxEnabledClient/);
  assert.match(exportPageSource, /const deterministicAnexa10DocxEnabled = isAnexa10DeterministicDocxEnabledClient\(\);/);
  assert.match(exportPageSource, /enableDeterministicAnexa10Docx=\{deterministicAnexa10DocxEnabled\}/);
});

test('pagina export RA paseaza expertul complet catre generatorul Anexa 10', () => {
  assert.match(exportPageSource, /expert=\{selectedExpert as Expert\}/);
  assert.match(reportGeneratorSource, /expert\?: Pick<Expert,/);
  assert.match(reportGeneratorSource, /enableDeterministicAnexa10Docx = false/);
});
