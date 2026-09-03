import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReportCorrectionStatusUpdate,
  buildReportReopenStatusUpdate,
  buildReportSubmissionStatusUpdate,
  canSubmitReportToPm,
  getReportSubmissionMode,
  isReportOpenForCorrection,
} from '../lib/report-correction-flow.ts';
import type { ReportStatus } from '../lib/types.ts';

test('redeschide o raportare aprobata pentru corectii expert', () => {
  const approved: ReportStatus = {
    id: 'status-1',
    expertId: 'expert-1',
    month: 6,
    year: 2026,
    status: 'approved',
    sentDate: '2026-07-31T10:00:00.000Z',
    approvalDate: '2026-08-01T10:00:00.000Z',
    expertAccessApproved: false,
    pmNotes: 'Aprobat initial.',
  };

  const update = buildReportCorrectionStatusUpdate({
    currentStatus: approved,
    expertId: approved.expertId,
    month: approved.month,
    year: approved.year,
    note: 'Corecteaza livrabilul atasat.',
  });

  assert.equal(update.status, 'clarifications');
  assert.equal(update.approvalDate, undefined);
  assert.equal(update.expertAccessApproved, true);
  assert.equal(update.sentDate, approved.sentDate);
  assert.equal(update.pmNotes, 'Corecteaza livrabilul atasat.');
  assert.ok(update.expertAccessApprovedAt);
});

test('recunoaste automat clarificarile ca raportari redeschise pentru expert', () => {
  assert.equal(isReportOpenForCorrection({ status: 'clarifications', expertAccessApproved: true }), true);
  assert.equal(isReportOpenForCorrection({ status: 'clarifications', expertAccessApproved: false }), true);
  assert.equal(isReportOpenForCorrection({ status: 'approved', expertAccessApproved: true }), false);
});

test('separa trimiterea initiala de retrimiterea dupa corectii PM', () => {
  assert.equal(getReportSubmissionMode(undefined), 'initial_submit');
  assert.equal(getReportSubmissionMode({ status: 'draft', expertAccessApproved: false }), 'initial_submit');
  assert.equal(getReportSubmissionMode({ status: 'rejected', expertAccessApproved: false }), 'initial_submit');
  assert.equal(getReportSubmissionMode({ status: 'clarifications', expertAccessApproved: true }), 'resubmit_after_correction');
  assert.equal(getReportSubmissionMode({ status: 'clarifications', expertAccessApproved: false }), 'resubmit_after_correction');
  assert.equal(getReportSubmissionMode({ status: 'sent', expertAccessApproved: false }), null);
  assert.equal(getReportSubmissionMode({ status: 'in_review', expertAccessApproved: false }), null);
  assert.equal(getReportSubmissionMode({ status: 'approved', expertAccessApproved: true }), null);
});

test('retrimiterea dupa corectii inchide accesul expertului si lasa clarificarile automat retrimisibile', () => {
  const status: ReportStatus = {
    id: 'status-3',
    expertId: 'expert-3',
    month: 7,
    year: 2026,
    status: 'clarifications',
    sentDate: '2026-08-27T10:00:00.000Z',
    expertAccessApproved: true,
    expertAccessApprovedAt: '2026-08-28T10:00:00.000Z',
    pmNotes: 'Corecteaza luna si retrimite.',
  };

  const update = buildReportSubmissionStatusUpdate({
    currentStatus: status,
    expertId: status.expertId,
    month: status.month,
    year: status.year,
  });

  assert.equal(update.status, 'sent');
  assert.equal(update.approvalDate, undefined);
  assert.equal(update.expertAccessApproved, false);
  assert.equal(update.expertAccessApprovedAt, undefined);
  assert.equal(update.pmNotes, status.pmNotes);
  assert.equal(canSubmitReportToPm({ status: 'clarifications', expertAccessApproved: false }), true);

  const legacyClarificationUpdate = buildReportSubmissionStatusUpdate({
    currentStatus: { ...status, expertAccessApproved: false, expertAccessApprovedAt: undefined },
    expertId: status.expertId,
    month: status.month,
    year: status.year,
  });
  assert.equal(legacyClarificationUpdate.status, 'sent');
  assert.equal(legacyClarificationUpdate.expertAccessApproved, false);
  assert.equal(legacyClarificationUpdate.expertAccessApprovedAt, undefined);
});

test('marcheaza o raportare aprobata ca redeschisa pentru verificare PM', () => {
  const approved: ReportStatus = {
    id: 'status-2',
    expertId: 'expert-2',
    month: 7,
    year: 2026,
    status: 'approved',
    sentDate: '2026-08-27T10:00:00.000Z',
    approvalDate: '2026-08-28T10:00:00.000Z',
    expertAccessApproved: false,
    pmNotes: 'Aprobat initial.',
  };

  const update = buildReportReopenStatusUpdate({
    currentStatus: approved,
    expertId: approved.expertId,
    month: approved.month,
    year: approved.year,
    note: approved.pmNotes,
  });

  assert.equal(update.status, 'in_review');
  assert.equal(update.approvalDate, undefined);
  assert.equal(update.sentDate, approved.sentDate);
  assert.equal(update.expertAccessApproved, false);
  assert.equal(update.pmNotes, 'Aprobat initial.');
});
