import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPmTitleIssues } from '../lib/pm-title-issues.ts';
import type { DocumentMetadata } from '../lib/types.ts';

function document(id: string, overrides: Partial<DocumentMetadata>): DocumentMetadata {
  return {
    id,
    s3Key: `documents/${id}.pdf`,
    originalFileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1,
    uploadedByExpertId: `expert-${id}`,
    uploadDate: '2026-08-12',
    titleMatch: false,
    titleCheckStatus: 'mismatch',
    ...overrides,
  };
}

test('grupeaza denumirile diferite dupa duplicatul comun', () => {
  const groups = groupPmTitleIssues([
    document('d1', {
      originalFileName: 'newsletter-iulie.pdf',
      declaredTitle: 'Newsletter lunar proiect',
      uploadedByExpertName: 'Alexandra',
      possibleDuplicateOfDocumentId: 'common-doc',
      saCode: 'SA3.4',
    }),
    document('d2', {
      originalFileName: 'Newsletter Iulie 2026.pdf',
      declaredTitle: 'Newsletter lunar proiect',
      uploadedByExpertName: 'Nida',
      possibleDuplicateOfDocumentId: 'common-doc',
      saCode: 'SA3.4',
    }),
    document('d3', {
      originalFileName: 'raport-separat.pdf',
      declaredTitle: 'Raport separat',
      uploadedByExpertName: 'Radu',
      sourceActivityId: 'activity-1',
    }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].documents.length, 2);
  assert.deepEqual(groups[0].expertNames, ['Alexandra', 'Nida']);
  assert.deepEqual(groups[0].saCodes, ['SA3.4']);
});

test('grupeaza dupa activitate cand nu exista duplicat comun', () => {
  const groups = groupPmTitleIssues([
    document('d1', { sourceActivityId: 'activity-1', declaredTitle: 'Raport metodologie' }),
    document('d2', { sourceActivityId: 'activity-1', declaredTitle: 'Raport metodologie selectie' }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'activity:activity-1');
  assert.equal(groups[0].documents.length, 2);
});
