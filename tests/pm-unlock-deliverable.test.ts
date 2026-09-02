import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPmUnlockedDeliverableFromDocument,
  resolvePmUnlockActivityContext,
} from '../lib/pm-unlock-deliverable.ts';
import type { Activity, DeliverableEligibilityCheck, DocumentMetadata } from '../lib/types.ts';

const approvedCheck: DeliverableEligibilityCheck = {
  status: 'eligibil',
  score: 100,
  summary: 'Aprobat manual de PM.',
  checks: [],
  missingElements: [],
  recommendations: [],
  riskFlags: [],
  pmUnlockRequested: true,
  pmUnlockApproved: true,
};

const document: DocumentMetadata = {
  id: 'doc-unlock-1',
  s3Key: 'documents/doc-unlock-1.pdf',
  originalFileName: 'Livrabil PM.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  uploadedByExpertId: 'expert-1',
  uploadedByExpertName: 'Expert Test',
  uploadDate: '2026-08-12T10:00:00.000Z',
  sourceActivityId: 'activity-1',
  activityDate: '2026-08-12',
  saCode: 'SA3.4',
  deliverableType: 'Raport',
  eligibilityCheck: approvedCheck,
};

test('RAP-39 gaseste activitatea sursa chiar daca livrabilul nu este atasat in formular', () => {
  const activities: Activity[] = [{
    id: 'activity-1',
    expertId: 'expert-1',
    expertName: 'Expert Test',
    title: 'Activitate test',
    date: '2026-08-12',
    activityType: 'SA3.4',
    hours: 8,
    description: 'Activitate cu document metadata separat.',
    deliverables: [],
  }];

  const context = resolvePmUnlockActivityContext(document, activities);

  assert.equal(context.sourceActivity?.id, 'activity-1');
  assert.equal(context.sourceDeliverable, undefined);
});

test('RAP-39 construieste livrabil aprobat pentru activitatea sursa', () => {
  const activity = {
    id: 'activity-1',
    expertId: 'expert-1',
    expertName: 'Expert Test',
    title: 'Activitate test',
    date: '2026-08-12',
    activityType: 'SA3.4',
    projectCode: '302141',
  };

  const deliverable = buildPmUnlockedDeliverableFromDocument(document, activity, approvedCheck);

  assert.equal(deliverable.documentId, document.id);
  assert.equal(deliverable.sourceActivityId, 'activity-1');
  assert.equal(deliverable.uploaded, true);
  assert.equal(deliverable.titleConfirmed, true);
  assert.equal(deliverable.aiStatus, 'eligible');
  assert.equal(deliverable.eligibilityCheck?.pmUnlockApproved, true);
});

test('RAP-39 pastreaza potrivirea existenta cand livrabilul este deja atasat', () => {
  const activities: Activity[] = [{
    id: 'activity-1',
    expertId: 'expert-1',
    expertName: 'Expert Test',
    title: 'Activitate test',
    date: '2026-08-12',
    activityType: 'SA3.4',
    hours: 8,
    description: 'Activitate cu livrabil atasat.',
    deliverables: [{
      id: 'deliverable-1',
      documentId: document.id,
      fileName: document.originalFileName,
      fileType: document.mimeType,
      fileSize: document.fileSize,
    }],
  }];

  const context = resolvePmUnlockActivityContext(document, activities);

  assert.equal(context.sourceActivity?.id, 'activity-1');
  assert.equal(context.sourceDeliverable?.id, 'deliverable-1');
});
