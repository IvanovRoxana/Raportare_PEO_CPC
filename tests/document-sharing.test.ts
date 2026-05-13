import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentS3Key,
  buildPendingSharedDeliverableAlerts,
  buildSharedDeliverables,
  findDuplicateCandidates,
  hashFirstPageText,
  isDeliverableIncludedInExpertExport,
  markSharedDeliverableRegistered,
  sha256Hex,
} from '../lib/document-sharing.ts';

test('genereaza cheia S3 centralizata pentru document', () => {
  assert.equal(
    buildDocumentS3Key({
      projectId: '302151',
      documentId: 'doc_123',
      originalFileName: 'Raport final.pdf',
    }),
    'projects/302151/documents/doc_123/Raport_final.pdf',
  );
});

test('calculeaza SHA-256 pentru fisier si hash pentru prima pagina', async () => {
  assert.equal(
    await sha256Hex('document'),
    '43cc23fa52b87b4cc1d02b5b114154151d6adddb17c9fddc06b027fa99e24008',
  );
  assert.equal(
    await hashFirstPageText('Titlu Document\n\nPrima pagina'),
    await hashFirstPageText('titlu document prima pagina'),
  );
});

test('creeaza relatii shared_deliverables pending_registration pentru colaboratori', () => {
  const relations = buildSharedDeliverables({
    documentId: 'doc_1',
    sourceExpertId: 'expert-1',
    targetExpertIds: ['expert-2', 'expert-3', 'expert-2', 'expert-1'],
    projectId: '302151',
    sourceActivityId: 'activity-1',
  });

  assert.equal(relations.length, 2);
  assert.equal(relations[0].status, 'pending_registration');
  assert.deepEqual(relations.map((relation) => relation.targetExpertId), ['expert-2', 'expert-3']);
});

test('documentul comun nu intra in exportul expertului colaborator pana nu este registered', () => {
  const deliverable = {
    documentId: 'doc_1',
    uploadedByExpertId: 'expert-1',
    isCommonDeliverable: true,
  };

  assert.equal(isDeliverableIncludedInExpertExport({
    deliverable,
    expertId: 'expert-2',
    sharedDeliverables: [{
      documentId: 'doc_1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
      targetActivityId: undefined,
    }],
  }), false);

  assert.equal(isDeliverableIncludedInExpertExport({
    deliverable,
    expertId: 'expert-2',
    sharedDeliverables: [{
      documentId: 'doc_1',
      targetExpertId: 'expert-2',
      status: 'registered',
      targetActivityId: 'activity-2',
    }],
  }), true);
});

test('asocierea documentului comun seteaza registered si target_activity_id', () => {
  const relation = markSharedDeliverableRegistered({
    relation: {
      id: 'shared-1',
      documentId: 'doc_1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    },
    targetActivityId: 'activity-2',
  });

  assert.equal(relation.status, 'registered');
  assert.equal(relation.targetActivityId, 'activity-2');
  assert.ok(relation.registeredAt);
});

test('detecteaza document identic prin file_hash si similar prin first_page_text_hash', () => {
  const matches = findDuplicateCandidates([
    {
      id: 'doc_existing',
      s3Key: 'projects/302151/documents/doc_existing/a.pdf',
      originalFileName: 'a.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      fileHash: 'same-file',
      firstPageTextHash: 'same-page',
      uploadedByExpertId: 'expert-1',
      uploadDate: '2026-05-01T00:00:00.000Z',
    },
  ], {
    id: 'doc_new',
    fileHash: 'same-file',
    firstPageTextHash: 'same-page',
    extractedTitleNormalized: 'raport comun',
    contentFingerprint: 'fingerprint',
    fileSize: 100,
    mimeType: 'application/pdf',
  });

  assert.equal(matches.length, 1);
  assert.ok(matches[0].issues.includes('same_file_hash'));
  assert.ok(matches[0].issues.includes('same_first_page_hash'));
});

test('creeaza alerta pentru expertul colaborator cand livrabilul este pending', () => {
  const alerts = buildPendingSharedDeliverableAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    documents: [{
      id: 'doc_1',
      s3Key: 'projects/302151/documents/doc_1/a.pdf',
      originalFileName: 'a.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      uploadedByExpertId: 'expert-1',
      uploadedByExpertName: 'Expert Unu',
      uploadDate: '2026-05-01T00:00:00.000Z',
      saCode: 'SA1.1',
    }],
    sharedDeliverables: [{
      id: 'shared-1',
      documentId: 'doc_1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    }],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].status, 'pending_registration');
  assert.match(alerts[0].message, /Expert Unu/);
});
