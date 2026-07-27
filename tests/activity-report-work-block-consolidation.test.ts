import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeterministicWorkBlockConsolidation,
  buildWorkBlockConsolidationPrompt,
  type WorkBlockConsolidationRequest,
} from '../lib/activity-report/work-block-consolidation.ts';
import { buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import type { Activity } from '../lib/types.ts';
import type { ReportingWorkBlockBundle } from '../lib/activity-report/work-blocks.ts';

const request: WorkBlockConsolidationRequest = {
  workBlock: {
    id: 'wb-1',
    title: 'Centralizare documente GT',
    saCode: 'SA1.1',
    reportingFlowType: 'deliverable',
  },
  activities: [
    {
      id: 'a-1',
      date: '2026-07-01',
      hours: 8,
      title: 'Centralizare documente',
      description: 'Am centralizat documentele justificative pentru entitatile GT.',
    },
    {
      id: 'a-2',
      date: '2026-07-02',
      hours: 8,
      title: 'Centralizare documente',
      description: 'Am centralizat documentele justificative pentru entitatile GT.',
    },
  ],
};

test('consolidarea determinista deduplica descrierile identice inainte de summary', () => {
  const result = buildDeterministicWorkBlockConsolidation(request);

  assert.equal(
    occurrences(result.cleanedActivitySummary, 'Am centralizat documentele justificative pentru entitatile GT.'),
    1,
  );
  assert.equal(
    occurrences(result.generatedTableSummary, 'Am centralizat documentele justificative pentru entitatile GT.'),
    1,
  );
  assert.match(result.generatedNarrative, /in 2 zile din luna raportata/);
  assert.equal(result.aiConsolidationStatus, 'deterministic_fallback');
  assert.ok(result.generationInputsHash.length > 0);
});

test('consolidarea determinista prefera activity summary fata de descrierea lunga', () => {
  const result = buildDeterministicWorkBlockConsolidation({
    ...request,
    activities: request.activities.map((activity) => ({
      ...activity,
      summary: 'Am consolidat documentele GT pentru verificarea raportarii.',
      description: `${activity.description} Detaliu lung care nu trebuie duplicat cand rezumatul scurt exista.`,
    })),
  });

  assert.equal(
    occurrences(result.generatedTableSummary, 'Am consolidat documentele GT pentru verificarea raportarii.'),
    1,
  );
  assert.equal(result.generatedTableSummary.includes('Detaliu lung'), false);
});

test('modelul Anexa 10 foloseste textul curatat inaintea descrierilor brute repetate', () => {
  const activities: Activity[] = [
    { id: 'a-1', expertId: 'e-1', date: '2026-07-01', hours: 8, title: 'Zi 1', description: 'Text brut repetat.' } as Activity,
    { id: 'a-2', expertId: 'e-1', date: '2026-07-02', hours: 8, title: 'Zi 2', description: 'Text brut repetat.' } as Activity,
  ];
  const bundle: ReportingWorkBlockBundle = {
    workBlock: {
      id: 'wb-1',
      expertId: 'e-1',
      projectCode: '302141',
      month: 6,
      year: 2026,
      title: 'Centralizare',
      saCode: 'SA1.1',
      reportingFlowType: 'deliverable',
      status: 'ready',
      cleanedActivitySummary: 'Text consolidat unic.',
    },
    activityLinks: [
      { id: 'l-1', workBlockId: 'wb-1', activityId: 'a-1', allocatedHours: 8, activityDate: '2026-07-01' },
      { id: 'l-2', workBlockId: 'wb-1', activityId: 'a-2', allocatedHours: 8, activityDate: '2026-07-02' },
    ],
    deliverableLinks: [],
  };

  const model = buildAnexa10ReportModel({
    expert: { id: 'e-1', name: 'Expert Test', role: 'Expert' },
    activities,
    month: 6,
    year: 2026,
    workBlockBundles: [bundle],
  });

  assert.equal(model.tableRows[0].performedActivity, 'Text consolidat unic.');
  assert.equal(model.saSections[0].items[0].body, 'Text consolidat unic.');
});

test('promptul cere explicit JSON si deduplicare inainte de summary', () => {
  const prompt = buildWorkBlockConsolidationPrompt(request);

  assert.match(prompt, /Nu repeta aceeasi descriere/);
  assert.match(prompt, /campul summary/);
  assert.match(prompt, /generatedTableSummary/);
  assert.match(prompt, /generatedNarrative/);
});

function occurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}
