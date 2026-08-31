import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPmReportGroups } from '../lib/pm-report-groups.ts';
import type { Expert, ReportStatus } from '../lib/types.ts';

const expert: Expert = {
  id: 'e1',
  name: 'Expert Test',
  role: 'Expert',
  norma: 8,
};

function status(id: string, value: ReportStatus['status']): ReportStatus {
  return {
    id,
    expertId: id,
    month: 7,
    year: 2026,
    status: value,
  };
}

function row(id: string, value: ReportStatus['status'], issuesCount = 0) {
  return {
    expert: { ...expert, id, name: id },
    status: status(id, value),
    totalHours: 100,
    totalDeliverables: 2,
    issuesCount,
    utilizationPercent: 100,
  };
}

describe('buildPmReportGroups', () => {
  it('grupează raportările PM după status și neconformități', () => {
    const groups = buildPmReportGroups([
      row('approved-clean', 'approved', 0),
      row('approved-with-issues', 'approved', 2),
      row('sent', 'sent', 0),
      row('in-review', 'in_review', 1),
      row('clarifications', 'clarifications', 1),
      row('rejected', 'rejected', 0),
      row('draft', 'draft', 0),
    ]);

    const counts = Object.fromEntries(groups.map((group) => [group.id, group.rows.length]));

    assert.equal(counts.verified_clean, 1);
    assert.equal(counts.verified_with_observations, 1);
    assert.equal(counts.waiting_review, 2);
    assert.equal(counts.open_clarifications, 1);
    assert.equal(counts.rejected, 1);
  });

  it('afișează o singură dată fiecare raportare non-draft', () => {
    const rows = [
      row('approved-clean', 'approved', 0),
      row('approved-with-issues', 'approved', 2),
      row('sent', 'sent', 0),
      row('in-review', 'in_review', 1),
      row('clarifications', 'clarifications', 1),
      row('rejected', 'rejected', 0),
      row('draft', 'draft', 0),
    ];

    const groupedIds = buildPmReportGroups(rows)
      .flatMap((group) => group.rows)
      .map((groupedRow) => groupedRow.status.id)
      .sort();

    assert.deepEqual(groupedIds, [
      'approved-clean',
      'approved-with-issues',
      'clarifications',
      'in-review',
      'rejected',
      'sent',
    ]);
  });
});
