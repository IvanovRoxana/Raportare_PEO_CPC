import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEligibilitySuggestedSettings } from '../lib/deliverable-eligibility.ts';

const activityCatalogCandidates = [
  {
    id: 'cat-1',
    saCode: 'SA3.4',
    activityName: 'Elaborare materiale suport eveniment',
    description: 'Materiale de prezentare si suport pentru evenimente.',
  },
  {
    id: 'cat-2',
    saCode: 'SA3.4',
    activityName: 'Intalnire cu reprezentanti membri',
    description: 'Intalniri si consultari cu reprezentanti ai membrilor.',
  },
];

const deliverableOptions = [
  'Material prezentare / suport eveniment',
  'Minute intalnire / MOM',
];

test('accepta sugestii de activitate si tip livrabil cand exista in listele permise', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-2',
      saCode: 'SA3.4',
      activityName: 'Intalnire cu reprezentanti membri',
      deliverableType: 'Minute intalnire / MOM',
      confidence: 'high',
      reason: 'Documentul este o minuta de intalnire, nu un material de prezentare.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.deepEqual(suggestion?.changes, ['activity', 'deliverableType']);
  assert.equal(suggestion?.selectedActivityId, 'cat-2');
  assert.equal(suggestion?.deliverableType, 'Minute intalnire / MOM');
});

test('elimina sugestiile care inventeaza activitati sau tipuri de livrabil', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-x',
      saCode: 'SA9.9',
      activityName: 'Activitate inventata',
      deliverableType: 'Tip inventat',
      confidence: 'medium',
      reason: 'Propunere invalida.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.equal(suggestion, undefined);
});

test('nu pastreaza sugestii identice cu setarile curente', () => {
  const suggestion = validateEligibilitySuggestedSettings({
    suggestedSettings: {
      selectedActivityId: 'cat-1',
      saCode: 'SA3.4',
      activityName: 'Elaborare materiale suport eveniment',
      deliverableType: 'Material prezentare / suport eveniment',
      confidence: 'low',
      reason: 'Nu schimba nimic.',
      changes: ['activity', 'deliverableType'],
    },
    activityCatalogCandidates,
    deliverableOptions,
    currentSaCode: 'SA3.4',
    currentActivityName: 'Elaborare materiale suport eveniment',
    currentDeliverableType: 'Material prezentare / suport eveniment',
  });

  assert.equal(suggestion, undefined);
});
