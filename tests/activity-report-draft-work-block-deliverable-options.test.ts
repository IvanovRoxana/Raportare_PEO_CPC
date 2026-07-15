import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDraftWorkBlockDeliverableOptions,
  getUnassociatedDeliverableCount,
} from '../lib/activity-report/draft-work-block-deliverable-options.ts';
import { prepareDraftWorkBlockBundle } from '../lib/activity-report/draft-work-blocks.ts';
import type { Activity } from '../lib/types.ts';

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    expertId: 'expert-1',
    date: '2026-06-02',
    hours: 2,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    projectCode: '302141',
    ...overrides,
  };
}

test('construieste optiuni de livrabile si le deduplica dupa id', () => {
  const sharedDeliverable = {
    id: 'd1',
    fileName: 'analiza.docx',
    fileType: 'docx',
    fileSize: 10,
    declaredTitle: 'Analiza acte normative',
  };

  const options = buildDraftWorkBlockDeliverableOptions({
    activities: [
      activity({ id: 'a1', deliverables: [sharedDeliverable] }),
      activity({ id: 'a2', date: '2026-06-03', deliverables: [sharedDeliverable] }),
    ],
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].deliverableId, 'd1');
  assert.equal(options[0].title, 'Analiza acte normative');
  assert.equal(options[0].activityId, 'a2');
});

test('marcheaza livrabilele deja asociate unui work block existent', () => {
  const activities = [
    activity({
      id: 'a1',
      deliverables: [{ id: 'd1', fileName: 'analiza.docx', fileType: 'docx', fileSize: 10 }],
    }),
    activity({
      id: 'a2',
      date: '2026-06-03',
      deliverables: [{ id: 'd2', fileName: 'agenda.docx', fileType: 'docx', fileSize: 10 }],
    }),
  ];
  const existingBundle = prepareDraftWorkBlockBundle({
    id: 'wb-1',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
    deliverableIds: ['d1'],
  }, activities).bundle;

  const options = buildDraftWorkBlockDeliverableOptions({
    activities,
    existingBundles: existingBundle ? [existingBundle] : [],
  });

  assert.equal(options.find((option) => option.deliverableId === 'd1')?.isAlreadyAssociated, true);
  assert.deepEqual(options.find((option) => option.deliverableId === 'd1')?.associatedWorkBlockIds, ['wb-1']);
  assert.equal(options.find((option) => option.deliverableId === 'd2')?.isAlreadyAssociated, false);
  assert.equal(getUnassociatedDeliverableCount(options), 1);
});

test('exclude work block-ul curent cand editeaza asocierea livrabilului', () => {
  const activities = [
    activity({
      id: 'a1',
      deliverables: [{ id: 'd1', fileName: 'analiza.docx', fileType: 'docx', fileSize: 10 }],
    }),
  ];
  const existingBundle = prepareDraftWorkBlockBundle({
    id: 'wb-edit',
    expertId: 'expert-1',
    projectCode: '302141',
    month: 5,
    year: 2026,
    title: 'Analiza',
    saCode: 'SA3.4',
    reportingFlowType: 'deliverable',
    activityIds: ['a1'],
    deliverableIds: ['d1'],
  }, activities).bundle;

  const [option] = buildDraftWorkBlockDeliverableOptions({
    activities,
    existingBundles: existingBundle ? [existingBundle] : [],
    editingWorkBlockId: 'wb-edit',
  });

  assert.equal(option.isAlreadyAssociated, false);
  assert.deepEqual(option.associatedWorkBlockIds, []);
});

test('foloseste identificatori fallback pentru livrabile legacy fara id', () => {
  const options = buildDraftWorkBlockDeliverableOptions({
    activities: [
      activity({
        id: 'a1',
        deliverables: [{
          id: '',
          documentId: 'doc-1',
          fileName: 'legacy.docx',
          originalFileName: 'Legacy.docx',
          fileType: 'docx',
          fileSize: 10,
        }],
      }),
    ],
  });

  assert.equal(options[0].deliverableId, 'doc-1');
  assert.equal(options[0].title, 'Legacy.docx');
  assert.equal(options[0].saCode, 'SA3.4');
});
