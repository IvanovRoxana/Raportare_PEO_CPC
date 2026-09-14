import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeliverableEligibilityCheck, DeliverableSlot } from '../lib/deliverable-types.ts';
import { EligibilityAttemptError, getDeclaredTitleEligibilityIssue, getDisplayEligibilityScore, getEligibilityAttemptState, getEligibilityFailureSummary, isReusableEligibilityCheck } from '../lib/deliverable-check-state.ts';

function check(patch: Partial<DeliverableEligibilityCheck> = {}): DeliverableEligibilityCheck {
  return {
    status: 'neconcludent', score: 0, summary: 'Sunt necesare dovezi suplimentare.',
    checks: [], missingElements: [], recommendations: [], riskFlags: [], ...patch,
  };
}

function deliverable(patch: Partial<DeliverableSlot> = {}): DeliverableSlot {
  return {
    id: 'd1', slotType: 'main', uploaded: true, isPhoto: false,
    filename: 'Ghid de lucru pentru experti.pdf', declaredTitle: 'Ghid de lucru pentru experti',
    firstPageText: 'Ghid de lucru pentru experti\nCapitolul 1: participare',
    docTitle: null, docText: null, titleMatch: true, titleConfirmed: true,
    stadiu: 'final', aiCheck: null, isPendingConfirm: false, ...patch,
  };
}

test('legacy Failed to fetch attempts remain retryable and never show a zero assessment score', () => {
  const failed = check({ summary: 'Eroare: Failed to fetch', riskFlags: ['Verificarea API nu a putut fi finalizată.'] });
  assert.equal(getEligibilityAttemptState(failed), 'technical_error');
  assert.equal(isReusableEligibilityCheck(failed), false);
  assert.equal(getDisplayEligibilityScore(failed), null);
});

test('explicit execution state wins over legacy text heuristics', () => {
  const failed = check({ executionStatus: 'failed', summary: 'Serviciu indisponibil' });
  assert.equal(isReusableEligibilityCheck(failed), false);
  assert.equal(getDisplayEligibilityScore(failed), null);
  const completed = check({ executionStatus: 'completed', summary: 'Documentul mentioneaza o eroare tehnica rezolvata.', score: 72 });
  assert.equal(getEligibilityAttemptState(completed), 'result');
  assert.equal(getDisplayEligibilityScore(completed), 72);
});

test('persisted pending attempts allow a new request after reopening the activity', () => {
  const pending = check({ summary: 'Verificarea eligibilitatii a fost pornita.', riskFlags: ['Verificare automata in curs sau indisponibila.'] });
  assert.equal(getEligibilityAttemptState(pending), 'pending');
  assert.equal(isReusableEligibilityCheck(pending), false);
  assert.equal(getDisplayEligibilityScore(pending), null);
});

test('actual negative and substantive inconclusive evaluations retain their scores', () => {
  for (const status of ['neeligibil', 'neconcludent']) {
    const result = check({ status, checks: [{ criterion: 'Continut', status: 'fail', explanation: 'Lipsesc rezultatele activitatii.' }] });
    assert.equal(isReusableEligibilityCheck(result), true);
    assert.equal(getDisplayEligibilityScore(result), 0);
  }
});

test('insufficient text and corrected title gates do not permanently hide retry', () => {
  for (const blocked of [
    check({ summary: 'Textul extras este prea scurt.' }),
    check({ riskFlags: ['Verificarea eligibilitatii este blocata de validarea titlului.'] }),
  ]) {
    assert.equal(getEligibilityAttemptState(blocked), 'blocked');
    assert.equal(isReusableEligibilityCheck(blocked), false);
    assert.equal(getDisplayEligibilityScore(blocked), null);
  }
});

test('a title found on the first page is valid even when it also names the file', () => {
  assert.equal(getDeclaredTitleEligibilityIssue(deliverable()), null);
});

test('administrator title override is respected without extracted text', () => {
  assert.equal(getDeclaredTitleEligibilityIssue(deliverable({ firstPageText: null, titleSource: 'admin_override' })), null);
});

test('filename-derived fallback titles do not block eligibility when text is missing or differs', () => {
  for (const firstPageText of [null, 'Document de lucru pentru intalnirea proiectului']) {
    assert.equal(getDeclaredTitleEligibilityIssue(deliverable({ firstPageText })), null);
  }
});

test('missing text can reach extraction, then title validation uses the extracted first page', () => {
  const missing = deliverable({ filename: 'document.pdf', firstPageText: null, s3Key: 'document.pdf' });
  assert.equal(getDeclaredTitleEligibilityIssue(missing, true), null);
  assert.match(getDeclaredTitleEligibilityIssue(missing) || '', /extrage textul/);
  assert.equal(getDeclaredTitleEligibilityIssue({ ...missing, firstPageText: 'Ghid de lucru pentru experti' }), null);
});

test('a title on a later page cannot satisfy the first-page title gate', () => {
  assert.match(getDeclaredTitleEligibilityIssue(deliverable({
    filename: 'document.pdf',
    firstPageText: 'Document de lucru pentru intalnirea proiectului',
    docText: 'Document de lucru pentru intalnirea proiectului\nPagina 2\nGhid de lucru pentru experti',
  })) || '', /nu se regaseste in prima pagina/);
});

test('technical failure diagnostics identify the failed stage and document', () => {
  const download = getEligibilityFailureSummary(new EligibilityAttemptError('download', 'anexa.pdf: Failed to fetch'), 'evaluation');
  assert.match(download, /descarcarea documentului: anexa.pdf/);
  assert.doesNotMatch(download, /Eroare la evaluarea/);
  assert.match(getEligibilityFailureSummary(new Error('PDF invalid'), 'extraction'), /extragerea textului/);
  const evaluation = getEligibilityFailureSummary(new EligibilityAttemptError('evaluation', 'Serviciul nu a raspuns in 90 de secunde'), 'extraction');
  assert.match(evaluation, /evaluarea eligibilitatii/);
  assert.equal(isReusableEligibilityCheck(check({ summary: evaluation })), false);
});
