import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../components/expert/monthly-evidence-panel.tsx', import.meta.url),
  'utf8',
);

test('aplicarea dovezilor COM trimite update minim pentru livrabile', () => {
  assert.match(panelSource, /await onUpdateActivity\(activity\.id, \{\s*deliverables: \[\.\.\.existing, deliverable\],\s*\}\)/);
  assert.doesNotMatch(panelSource, /await onUpdateActivity\(activity\.id, \{\s*\.\.\.activity,/);
});

test('aplicarea dovezilor COM ramane toleranta la esecuri partiale', () => {
  assert.match(panelSource, /catch \(error\) \{\s*failedCount \+= 1;/);
  assert.match(panelSource, /failureMessages\.add\(getApplyErrorMessage\(error\)\)/);
  assert.match(panelSource, /if \(draftApplied && !draftFailed\)/);
  assert.match(panelSource, /ConditionalCheckFailedException\|nu mai exista\|lista este invechita/);
});
