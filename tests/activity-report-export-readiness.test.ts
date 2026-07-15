import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnexa10ExportReadiness } from '../lib/activity-report/export-readiness.ts';

test('permite exportul Anexa 10 cand modelul are doar avertizari', () => {
  const readiness = getAnexa10ExportReadiness({
    problems: [],
    warnings: ['Livrabil fara atasament verificabil.'],
  });

  assert.equal(readiness.canExport, true);
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
  assert.deepEqual(readiness.blockingMessages, ['Activitatea a1 are mai multe ore alocate decat pontate.']);
  assert.deepEqual(readiness.warningMessages, ['Avertizare secundara.']);
});
