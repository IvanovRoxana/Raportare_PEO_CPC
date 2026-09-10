import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAutomaticActivityClassification } from '../lib/activity-classification.ts';
import type { ActivityCatalog, DeliverableEligibilityCheck } from '../lib/types.ts';

const catalog: ActivityCatalog[] = [{
  id: 'catalog-current', category: 'com', saCode: 'SA3.1', serviceCategory: 'Comunicare',
  activityNumber: 1, activityName: 'Articol publicat', isActive: true,
}];
const check: DeliverableEligibilityCheck = {
  executionStatus: 'completed', status: 'eligibil', score: 90, summary: 'Articol verificat.',
  checks: [], missingElements: [], recommendations: [], riskFlags: [], checkedSaCode: 'SA3.1',
  checkedActivityId: 'catalog-current',
  classification: {
    activityId: 'catalog-current', activityName: 'Articol publicat', saCode: 'SA3.1',
    confidence: 'high', reason: 'Textul integral sustine activitatea.', autoApply: true,
    requiresSaConfirmation: false, alternatives: [],
  },
};
const context = { check, automatic: true, allowed: true, saCode: 'SA3.1', catalog };

test('selectia automata accepta rezultatul final canonic din catalog pentru SA-ul curent', () => {
  assert.equal(resolveAutomaticActivityClassification(context)?.id, 'catalog-current');
});

test('o alegere manuala sau un flux special blocheaza raspunsul automat aflat in zbor', () => {
  assert.equal(resolveAutomaticActivityClassification({ ...context, automatic: false }), null);
  assert.equal(resolveAutomaticActivityClassification({ ...context, allowed: false }), null);
});

test('rezultatele unei subactivitati anterioare si propunerile de schimbare SA nu se aplica automat', () => {
  assert.equal(resolveAutomaticActivityClassification({ ...context, saCode: 'SA3.2' }), null);
  assert.equal(resolveAutomaticActivityClassification({ ...context, check: { ...check, checkedSaCode: 'SA3.2' } }), null);
  assert.equal(resolveAutomaticActivityClassification({
    ...context, check: { ...check, classification: { ...check.classification!, requiresSaConfirmation: true } },
  }), null);
});

test('incertitudinea esecul si activitatile inactive ori absente pastreaza selectia expertului', () => {
  for (const executionStatus of ['pending', 'failed'] as const) {
    assert.equal(resolveAutomaticActivityClassification({ ...context, check: { ...check, executionStatus } }), null);
  }
  assert.equal(resolveAutomaticActivityClassification({
    ...context, check: { ...check, classification: { ...check.classification!, confidence: 'medium' } },
  }), null);
  assert.equal(resolveAutomaticActivityClassification({ ...context, catalog: [] }), null);
  assert.equal(resolveAutomaticActivityClassification({ ...context, catalog: [{ ...catalog[0], isActive: false }] }), null);
});
