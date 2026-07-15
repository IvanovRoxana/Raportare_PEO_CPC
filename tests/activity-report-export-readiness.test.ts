import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnexa10ExportReadiness } from '../lib/activity-report/export-readiness.ts';

test('marcheaza exportul Anexa 10 pregatit cand nu exista probleme sau avertizari', () => {
  const readiness = getAnexa10ExportReadiness({
    problems: [],
    warnings: [],
  });

  assert.equal(readiness.canExport, true);
  assert.equal(readiness.severity, 'ready');
  assert.equal(readiness.statusLabel, 'Pregatit pentru export');
  assert.equal(readiness.summary, 'Modelul determinist nu a raportat probleme sau avertizari.');
});

test('permite exportul Anexa 10 cand modelul are doar avertizari', () => {
  const readiness = getAnexa10ExportReadiness({
    problems: [],
    warnings: ['Livrabil fara atasament verificabil.'],
  });

  assert.equal(readiness.canExport, true);
  assert.equal(readiness.severity, 'warning');
  assert.equal(readiness.statusLabel, 'Pregatit cu avertizari');
  assert.equal(readiness.summary, 'Exportul poate continua, dar necesita verificare manuala pentru avertizari (1).');
  assert.deepEqual(readiness.blockingMessages, []);
  assert.deepEqual(readiness.warningMessages, ['Livrabil fara atasament verificabil.']);
});

test('blocheaza exportul Anexa 10 cand modelul are probleme de alocare', () => {
  const readiness = getAnexa10ExportReadiness({
    problems: [
      {
        code: 'over_allocated_activity',
        message: 'Activitatea a1 are mai multe ore alocate decat pontate.',
        activityId: 'a1',
      },
    ],
    warnings: ['Avertizare secundara.'],
  });

  assert.equal(readiness.canExport, false);
  assert.equal(readiness.severity, 'blocked');
  assert.equal(readiness.statusLabel, 'Blocat pentru verificare');
  assert.equal(readiness.summary, 'Exportul este blocat pana la corectarea problemelor de alocare (1).');
  assert.deepEqual(readiness.blockingMessages, ['Activitatea a1 are mai multe ore alocate decat pontate.']);
  assert.deepEqual(readiness.warningMessages, ['Avertizare secundara.']);
});
