import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReportCorrectionStatusUpdate,
  buildReportReopenStatusUpdate,
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

test('recunoaste doar clarificarile cu acces expert ca raportari redeschise', () => {
  assert.equal(isReportOpenForCorrection({ status: 'clarifications', expertAccessApproved: true }), true);
  assert.equal(isReportOpenForCorrection({ status: 'clarifications', expertAccessApproved: false }), false);
  assert.equal(isReportOpenForCorrection({ status: 'approved', expertAccessApproved: true }), false);
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
