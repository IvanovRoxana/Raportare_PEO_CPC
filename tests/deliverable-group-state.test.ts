import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeliverableGroupAssessmentPatches,
  clearDeliverableGroupChecks,
  getRelatedDeliverableAssessmentKey,
  hasDeliverableGroupEvidenceChanged,
  isDeliverableNarrativeBlocked,
  mergeRelatedDeliverableAssessment,
  reconcileDeliverableGroupEvidence,
} from '../lib/deliverable-group-state.ts';
import { createDeliverableSlot, type DeliverableSlot } from '../lib/deliverable-types.ts';
import type { DeliverableEligibilityCheck } from '../lib/types.ts';

function document(id: string, overrides: Partial<DeliverableSlot> = {}): DeliverableSlot {
  return {
    ...createDeliverableSlot('livrabil', id),
    id, filename: `${id}.pdf`, fileHash: `hash-${id}`, uploaded: true, declaredTitle: id,
    type: id === 'primary' ? 'Raport' : 'Analiza', stadiu: 'draft', ...overrides,
  };
}

const result: DeliverableEligibilityCheck = {
  assessmentVersion: 'llm-eligibility-v2', executionStatus: 'completed',
  status: 'neconcludent', score: 0, summary: 'Documentele sunt analizate; sursa oficiala lipseste.',
  checks: [], recommendations: ['Verifica sursa oficiala.'], missingElements: ['Sursa oficiala.'], riskFlags: ['Necesita verificare PM.'],
  checkedActivityId: 'canonical-activity', checkedActivityName: 'Activitate canonica',
  documentSummaries: ['primary', 'secondary'].map((id) => ({
    id, fileHash: `hash-${id}`, summary: `Rezumat verificat ${id}`, evidence: [`Citat real din ${id}`], extractedTextLength: 500,
  })),
};

test('evaluarea de grup produce rezultat pentru fiecare document evaluat cu propriul tip si urmarire PM', () => {
  const primary = document('primary', { eligibilityCheck: { ...result, pmUnlockRequested: true, pmUnlockRequestedBy: 'expert-primary' } });
  const secondary = document('secondary');
  const patches = buildDeliverableGroupAssessmentPatches({
    deliverables: [primary, secondary, document('photo', { isPhoto: true }), document('empty', { uploaded: false })],
    result, checkedAt: '2026-09-10T12:00:00Z', checkedBy: 'Expert', saCode: 'SA3.1', activityTitle: 'Titlu vechi',
  });

  assert.deepEqual(patches.map((update) => update.id), ['primary', 'secondary']);
  assert.equal(patches[0].patch.eligibilityCheck?.checkedDeliverableType, 'Raport');
  assert.equal(patches[1].patch.eligibilityCheck?.checkedDeliverableType, 'Analiza');
  assert.equal(patches[1].patch.eligibilityCheck?.checkedActivityId, 'canonical-activity');
  assert.equal(patches[0].patch.eligibilityCheck?.pmUnlockRequestedBy, 'expert-primary');
  assert.equal(patches[1].patch.eligibilityCheck?.pmUnlockRequested, undefined);
  assert.equal(patches[1].patch.aiStatus, 'review');
  assert.equal(patches[1].patch.aiCheck?.eligible, null);
  assert.equal(isDeliverableNarrativeBlocked({ ...secondary, ...patches[1].patch }), false);
});

test('naratiunea neutra accepta numai analiza finalizata verificata pentru acelasi ID si hash', () => {
  assert.equal(isDeliverableNarrativeBlocked(document('primary', { eligibilityCheck: result })), false);
  assert.equal(isDeliverableNarrativeBlocked(document('secondary', { eligibilityCheck: result })), false);
  assert.equal(isDeliverableNarrativeBlocked(document('other', { eligibilityCheck: result })), true);
  assert.equal(isDeliverableNarrativeBlocked(document('primary', { fileHash: 'replaced', eligibilityCheck: result })), true);
  for (const executionStatus of ['pending', 'failed'] as const) {
    assert.equal(isDeliverableNarrativeBlocked(document('primary', { eligibilityCheck: { ...result, executionStatus } })), true);
    assert.deepEqual(buildDeliverableGroupAssessmentPatches({
      deliverables: [document('primary')], result: { ...result, executionStatus },
      checkedAt: 'now', saCode: 'SA3.1', activityTitle: 'Titlu',
    }), []);
  }
  assert.equal(isDeliverableNarrativeBlocked(document('primary', { eligibilityCheck: { ...result, assessmentVersion: 'legacy' } })), true);
});

test('adaugarea eliminarea sau schimbarea unei dovezi invalideaza verificarile intregului grup', () => {
  const previous = ['primary', 'secondary'].map((id) => document(id, { eligibilityCheck: result, aiStatus: 'review', aiCheck: { eligible: null, reason: 'test', issues: [] } }));
  const variants = [
    [previous[0]],
    [...previous, document('new')],
    [previous[0], { ...previous[1], fileHash: 'changed' }],
    [previous[0], { ...previous[1], declaredTitle: 'Titlu corectat' }],
    [previous[0], { ...previous[1], type: 'Alt tip' }],
    [previous[0], { ...previous[1], stadiu: 'final' }],
  ];
  for (const next of variants) {
    assert.equal(hasDeliverableGroupEvidenceChanged(previous, next), true);
    const cleared = reconcileDeliverableGroupEvidence(previous, next);
    assert.ok(cleared.every((item) => !item.eligibilityCheck && !item.aiCheck && !item.aiStatus));
  }
});

test('extragerea completa si metadatele verificarii nu invalideaza cererea proprie sau dovezile neschimbate', () => {
  const previous = [document('primary', { eligibilityCheck: result })];
  const next = [{
    ...previous[0], docText: 'Text integral extras', firstPageTextHash: 'cover',
    textExtractionScope: 'full_document' as const, aiStatus: 'review', s3Key: 'saved-location',
    eligibilityCheck: { ...result, executionStatus: 'pending' as const },
  }];
  assert.equal(hasDeliverableGroupEvidenceChanged(previous, next), false);
  assert.equal(reconcileDeliverableGroupEvidence(previous, next), next);
  assert.equal(hasDeliverableGroupEvidenceChanged(previous, [...previous, document('photo', { isPhoto: true })]), false);
  assert.equal(clearDeliverableGroupChecks(previous)[0].eligibilityCheck, null);
});

test('rezultatele sesiunii pentru documentele zilelor vecine se aplica doar identitatii curente', () => {
  const sibling = document('secondary', { eligibilityCheck: { ...result, summary: 'Rezultat vechi' } });
  const patches = {
    [getRelatedDeliverableAssessmentKey(sibling)]: { docText: 'Text citit pentru ziua vecina', eligibilityCheck: result },
  };
  const current = mergeRelatedDeliverableAssessment(sibling, patches, true);
  assert.equal(current.eligibilityCheck?.summary, result.summary);
  assert.equal(current.docText, 'Text citit pentru ziua vecina');
  assert.equal(mergeRelatedDeliverableAssessment({ ...sibling, fileHash: 'replacement' }, patches, true).eligibilityCheck, null);
  assert.equal(mergeRelatedDeliverableAssessment({ ...sibling, id: 'another-row' }, patches, true).eligibilityCheck, null);
  assert.equal(mergeRelatedDeliverableAssessment(sibling, {}, true).eligibilityCheck, null);
  assert.equal(sibling.eligibilityCheck?.summary, 'Rezultat vechi');
});
