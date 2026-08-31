import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPmDeliverablesViewModel } from '../lib/pm-deliverables-view.ts';
import type { DocumentMetadata, Expert } from '../lib/types.ts';

const experts: Expert[] = [
  { id: 'e1', name: 'Expert 1', role: 'Expert', norma: 8 },
  { id: 'e2', name: 'Expert 2', role: 'Expert', norma: 4 },
];

function document(id: string, uploadedByExpertId: string, overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    id,
    s3Key: `${id}.pdf`,
    originalFileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1,
    uploadedByExpertId,
    uploadDate: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildPmDeliverablesViewModel', () => {
  it('calculează filtrele și grupează registrul de livrabile pe expert', () => {
    const model = buildPmDeliverablesViewModel({
      experts,
      documents: [
        document('approved', 'e1', { titleMatch: true }),
        document('clarification', 'e1', { titleMatch: false, titleCheckStatus: 'mismatch' }),
        document('sent', 'e2', { titleCheckStatus: 'pending' }),
      ],
      filter: 'all',
    });

    assert.equal(model.filteredDocuments.length, 3);
    assert.deepEqual(model.groups.map((group) => [group.expert.id, group.documents.length]), [['e1', 2], ['e2', 1]]);
    assert.equal(model.filters.find((filter) => filter.id === 'approved')?.count, 1);
    assert.equal(model.filters.find((filter) => filter.id === 'clarifications')?.count, 1);
    assert.equal(model.filters.find((filter) => filter.id === 'sent')?.count, 1);
  });

  it('filtrează registrul după statusul oficial PM al livrabilului', () => {
    const model = buildPmDeliverablesViewModel({
      experts,
      documents: [
        document('approved', 'e1', { titleMatch: true }),
        document('clarification', 'e1', { titleMatch: false, titleCheckStatus: 'mismatch' }),
        document('sent', 'e2', { titleCheckStatus: 'pending' }),
      ],
      filter: 'clarifications',
    });

    assert.deepEqual(model.filteredDocuments.map((item) => item.id), ['clarification']);
    assert.deepEqual(model.groups.map((group) => group.expert.id), ['e1']);
  });
});
