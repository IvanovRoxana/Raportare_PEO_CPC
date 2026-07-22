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
  assert.equal(readiness.score, 100);
  assert.equal(readiness.scoreLabel, '100/100');
  assert.equal(readiness.statusLabel, 'Pregatit pentru export');
  assert.equal(readiness.summary, 'Modelul determinist nu a raportat probleme sau avertizari. Scor readiness: 100/100.');
  assert.deepEqual(readiness.checks, {
    datesAndHours: 40,
    deliverables: 25,
    narrative: 20,
    finalValidation: 15,
  });
});

test('permite exportul Anexa 10 cand modelul are doar avertizari', () => {
  const readiness = getAnexa10ExportReadiness({
    problems: [],
    warnings: ['Livrabil fara atasament verificabil.'],
  });

  assert.equal(readiness.canExport, true);
  assert.equal(readiness.severity, 'warning');
  assert.equal(readiness.score, 85);
  assert.equal(readiness.scoreLabel, '85/100');
  assert.equal(readiness.statusLabel, 'Pregatit cu avertizari');
  assert.equal(readiness.summary, 'Exportul poate continua, dar necesita verificare manuala pentru avertizari (1). Scor readiness: 85/100.');
  assert.deepEqual(readiness.checks, {
    datesAndHours: 40,
    deliverables: 15,
    narrative: 15,
    finalValidation: 15,
  });
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
  assert.equal(readiness.score, 25);
  assert.equal(readiness.scoreLabel, '25/100');
  assert.equal(readiness.statusLabel, 'Blocat pentru verificare');
  assert.equal(readiness.summary, 'Exportul este blocat pana la corectarea problemelor de alocare (1). Scor readiness: 25/100.');
  assert.deepEqual(readiness.checks, {
    datesAndHours: 0,
    deliverables: 10,
    narrative: 15,
    finalValidation: 0,
  });
  assert.deepEqual(readiness.blockingMessages, ['Activitatea a1 are mai multe ore alocate decat pontate.']);
  assert.deepEqual(readiness.warningMessages, ['Avertizare secundara.']);
});
