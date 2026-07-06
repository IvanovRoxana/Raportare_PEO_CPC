import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExistingDeliverableSourceContext,
  buildExistingDeliverableSourceSuggestions,
} from '../lib/existing-deliverable-context.ts';
import type { DeliverableSlot } from '../lib/deliverable-types.ts';
import type { Activity, ActivityCatalog } from '../lib/types.ts';

const catalog: ActivityCatalog[] = [{
  id: 'cat-sa34-newsletter',
  category: 'ap',
  saCode: 'SA3.4',
  serviceCategory: 'Comunicare',
  activityNumber: 4,
  activityName: 'Elaborare newsletter',
  description: 'Descriere standard newsletter.',
}];

const sourceActivity: Activity = {
  id: 'activity-source',
  date: '2026-06-10',
  expertId: 'expert-1',
  expertName: 'Expert Sursa',
  hours: 6,
  activityType: 'Elaborare newsletter',
  title: 'Elaborare newsletter',
  saCode: 'SA3.4',
  catalogActivityId: 'cat-sa34-newsletter',
  description: 'Descriere raportata anterior.',
};

function buildSlot(patch: Partial<DeliverableSlot> = {}): DeliverableSlot {
  return {
    id: 'slot-1',
    slotType: 'livrabil',
    name: 'newsletter.pdf',
    filename: 'newsletter.pdf',
    uploaded: true,
    isPhoto: false,
    docTitle: 'Concordia Members Newsletter',
    docText: 'Text extras din newsletter.',
    declaredTitle: 'Concordia Members Newsletter',
    titleMatch: true,
    titleConfirmed: true,
    stadiu: '',
    aiCheck: null,
    sourceActivityId: 'activity-source',
    uploadedByExpertName: 'Expert Sursa',
    eligibilityCheck: {
      status: 'eligibil',
      score: 92,
      summary: 'Verificare anterioara eligibila.',
      checks: [],
      missingElements: [],
      recommendations: [],
      riskFlags: [],
    },
    ...patch,
    isPendingConfirm: patch.isPendingConfirm ?? false,
  };
}

test('contextul livrabilului existent preia raportarea sursa si infera stadiul final din eligibilitate', () => {
  const context = buildExistingDeliverableSourceContext({
    deliverable: buildSlot({ deliverableType: 'Informare / newsletter' }),
    activities: [sourceActivity],
    catalog,
  });

  assert.ok(context);
  assert.equal(context.sourceExpertName, 'Expert Sursa');
  assert.equal(context.sourceActivityDate, '2026-06-10');
  assert.equal(context.sourceSaCode, 'SA3.4');
  assert.equal(context.sourceActivityName, 'Elaborare newsletter');
  assert.equal(context.selectedActivityId, 'cat-sa34-newsletter');
  assert.equal(context.deliverableType, 'Informare / newsletter');
  assert.equal(context.stadiu, 'final');
  assert.equal(context.hasExtractedText, true);
  assert.equal(context.eligibilityCheck?.score, 92);
});

test('sugestiile apar doar cand setarile curente difera de raportarea sursa', () => {
  const context = buildExistingDeliverableSourceContext({
    deliverable: buildSlot({ deliverableType: 'Informare / newsletter', stadiu: 'final' }),
    activities: [sourceActivity],
    catalog,
  });
  assert.ok(context);

  const suggestions = buildExistingDeliverableSourceSuggestions({
    context,
    currentSaCode: 'SA3.2',
    currentActivityName: 'Alta activitate',
    currentDeliverable: {
      deliverableType: 'Raport',
      stadiu: 'draft',
    },
  });

  assert.deepEqual(suggestions.map((suggestion) => suggestion.action), [
    'activity',
    'deliverableType',
    'stadiu',
  ]);
});

test('nu propune modificari cand formularul are deja setarile sursa', () => {
  const context = buildExistingDeliverableSourceContext({
    deliverable: buildSlot({ deliverableType: 'Informare / newsletter', stadiu: 'final' }),
    activities: [sourceActivity],
    catalog,
  });
  assert.ok(context);

  const suggestions = buildExistingDeliverableSourceSuggestions({
    context,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare newsletter',
    currentDeliverable: {
      deliverableType: 'Informare / newsletter',
      stadiu: 'final',
    },
  });

  assert.equal(suggestions.length, 0);
});
