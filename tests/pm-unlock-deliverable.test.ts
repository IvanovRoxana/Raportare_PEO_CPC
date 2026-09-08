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

test('RAP-39 foloseste activitatea verificata cand documentul nu are sourceActivityId', () => {
  const activities: Activity[] = [{
    id: 'activity-checked',
    expertId: 'expert-1',
    expertName: 'Expert Test',
    title: 'Activitate verificata',
    date: '2026-08-13',
    activityType: 'SA3.5',
    hours: 6,
    description: 'Activitate salvata separat de document.',
    deliverables: [],
  }];

  const context = resolvePmUnlockActivityContext({
    ...document,
    sourceActivityId: undefined,
    activityDate: undefined,
    saCode: undefined,
    eligibilityCheck: {
      ...approvedCheck,
      checkedActivityId: 'activity-checked',
    },
  }, activities);

  assert.equal(context.sourceActivity?.id, 'activity-checked');
  assert.equal(context.sourceDeliverable, undefined);
});

test('RAP-39 foloseste activitatea sugerata cand legatura document-activitate este incompleta', () => {
  const activities: Activity[] = [{
    id: 'activity-suggested',
    expertId: 'expert-1',
    expertName: 'Expert Test',
    title: 'Activitate sugerata',
    date: '2026-08-14',
    activityType: 'SA3.6',
    hours: 4,
    description: 'Activitate detectata de verificarea AI.',
    deliverables: [],
  }];

  const context = resolvePmUnlockActivityContext({
    ...document,
    sourceActivityId: undefined,
    activityDate: undefined,
    saCode: undefined,
    eligibilityCheck: {
      ...approvedCheck,
      suggestedSettings: {
        selectedActivityId: 'activity-suggested',
        confidence: 'high',
        reason: 'Documentul a fost verificat pe aceasta activitate.',
        changes: ['activity'],
      },
    },
  }, activities);

  assert.equal(context.sourceActivity?.id, 'activity-suggested');
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
