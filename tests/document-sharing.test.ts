import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentS3Key,
  getDocumentAuditTitle,
  buildIgnoredSharedActivityAlerts,
  buildPendingSharedActivityAlerts,
  buildPendingSharedDeliverableAlerts,
  buildReturnedSharedActivityAlerts,
  buildSharedActivitySuggestions,
  buildSharedDeliverables,
  filterPendingSharedDeliverablesNotCoveredByActivity,
  filterSharedRelationsForMonths,
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

test('titlul auditabil foloseste titlul confirmat inaintea numelui de fisier', () => {
  assert.equal(
    getDocumentAuditTitle({
      declaredTitle: 'Titlu confirmat pentru audit',
      suggestedTitle: 'Titlu detectat automat',
      originalFileName: 'fisier-upload.pdf',
    }),
    'Titlu confirmat pentru audit',
  );

  assert.equal(
    getDocumentAuditTitle({
      suggestedTitle: 'Titlu detectat automat',
      originalFileName: 'fisier-upload.pdf',
    }),
    'Titlu detectat automat',
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

test('detecteaza document existent dupa titlul confirmat normalizat', () => {
  const matches = findDuplicateCandidates([
    {
      id: 'doc_previous_month',
      s3Key: 'projects/302151/documents/doc_previous_month/raport.pdf',
      originalFileName: 'raport.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      extractedTitleNormalized: 'raport comun dialog social',
      uploadedByExpertId: 'expert-1',
      uploadDate: '2026-05-10T00:00:00.000Z',
      activityDate: '2026-05-10',
    },
  ], {
    id: 'doc_current',
    extractedTitleNormalized: 'raport comun dialog social',
    fileSize: 110,
    mimeType: 'application/pdf',
  });

  assert.equal(matches.length, 1);
  assert.ok(matches[0].issues.includes('similar_extracted_title'));
  assert.ok(matches[0].issues.includes('possible_common_unmarked'));
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

test('livrabilul comun acoperit de sugestie de activitate nu apare ca alerta separata', () => {
  const sharedDeliverables = [
    {
      id: 'shared-activity-1',
      documentId: 'activity:activity-1',
      sourceActivityId: 'activity-1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    },
    {
      id: 'shared-doc-1',
      documentId: 'doc_1',
      sourceActivityId: 'activity-1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    },
    {
      id: 'shared-doc-2',
      documentId: 'doc_2',
      sourceActivityId: 'activity-2',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    },
  ];

  const uncovered = filterPendingSharedDeliverablesNotCoveredByActivity({
    expertId: 'expert-2',
    sharedDeliverables,
  });

  assert.deepEqual(uncovered.map((relation) => relation.id), ['shared-doc-2']);

  const alerts = buildPendingSharedDeliverableAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    documents: [
      {
        id: 'doc_1',
        s3Key: 'projects/302151/documents/doc_1/a.pdf',
        originalFileName: 'a.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        uploadedByExpertId: 'expert-1',
        uploadDate: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'doc_2',
        s3Key: 'projects/302151/documents/doc_2/b.pdf',
        originalFileName: 'b.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        uploadedByExpertId: 'expert-1',
        uploadDate: '2026-05-01T00:00:00.000Z',
      },
    ],
    sharedDeliverables,
  });

  assert.deepEqual(alerts.map((alert) => alert.documentId), ['doc_2']);
});


test('creeaza si afiseaza sugestii de activitate comuna separate de livrabile', () => {
  const relations = buildSharedActivitySuggestions({
    sourceActivityId: 'activity-1',
    sourceExpertId: 'expert-1',
    targetExpertIds: ['expert-2', 'expert-2', 'expert-1'],
    projectId: '302151',
    sourceActivity: {
      expertName: 'Expert Unu',
      date: '2026-05-12',
      hours: 4,
      activityType: 'Atelier comun',
      title: 'Atelier comun',
      description: 'Discutie comuna pe livrabil.',
      activitySummary: 'Sumar scurt pentru colaborator.',
      location: 'Sala 2',
      dayType: 'lucratoare',
      saCode: 'SA1.1',
      projectCode: '302151',
      eventDurationHours: 2,
      eventExtendedDescription: 'Detalii extinse pentru evenimentul comun.',
    },
  });

  assert.equal(relations.length, 1);
  assert.equal(relations[0].documentId, 'activity:activity-1');
  assert.equal(relations[0].status, 'pending_registration');
  assert.ok(relations[0].notifiedAt);
  assert.equal(relations[0].sourceExpertName, 'Expert Unu');
  assert.equal(relations[0].sourceActivityDate, '2026-05-12');
  assert.equal(relations[0].sourceActivityTitle, 'Atelier comun');
  assert.equal(relations[0].sourceActivityDescription, 'Sumar scurt pentru colaborator.');
  assert.equal(relations[0].sourceActivityLocation, 'Sala 2');
  assert.equal(relations[0].sourceActivityDayType, 'lucratoare');
  assert.equal(relations[0].sourceActivityProjectCode, '302151');

  const pendingAlerts = buildPendingSharedActivityAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    experts: [{ id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 }],
    sharedDeliverables: relations,
  });

  assert.equal(pendingAlerts.length, 1);
  assert.match(pendingAlerts[0].message, /Expert Unu/);
  assert.equal(pendingAlerts[0].sourceActivityDescription, 'Sumar scurt pentru colaborator.');
  assert.equal(pendingAlerts[0].sourceActivityLocation, 'Sala 2');
  assert.equal(pendingAlerts[0].sourceActivityDayType, 'lucratoare');
  assert.equal(pendingAlerts[0].sourceActivityProjectCode, '302151');
  assert.equal(pendingAlerts[0].sourceActivityEventDurationHours, 2);
  assert.equal(pendingAlerts[0].sourceActivityEventExtendedDescription, 'Detalii extinse pentru evenimentul comun.');
});

test('completeaza alertele de activitate comuna din activitatea sursa cand snapshotul lipseste', () => {
  const pendingAlerts = buildPendingSharedActivityAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    experts: [{ id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 }],
    sharedDeliverables: [{
      id: 'shared-activity-legacy',
      documentId: 'activity:activity-1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'pending_registration',
    }],
    sourceActivities: [{
      id: 'activity-1',
      expertId: 'expert-1',
      expertName: 'Expert Unu',
      date: '2026-05-12',
      hours: 4,
      activityType: 'Atelier comun',
      title: 'Atelier comun',
      description: 'Discutie comuna pe livrabil.',
      activitySummary: 'Sumar scurt pentru colaborator.',
      location: 'Sala 2',
      dayType: 'lucratoare',
      saCode: 'SA1.1',
      projectCode: '302151',
      status: 'draft',
    }],
  });

  assert.equal(pendingAlerts.length, 1);
  assert.equal(pendingAlerts[0].sourceActivityId, 'activity-1');
  assert.equal(pendingAlerts[0].sourceActivityTitle, 'Atelier comun');
  assert.equal(pendingAlerts[0].sourceActivityDate, '2026-05-12');
  assert.equal(pendingAlerts[0].sourceActivityHours, 4);
  assert.equal(pendingAlerts[0].sourceActivityDescription, 'Sumar scurt pentru colaborator.');
  assert.equal(pendingAlerts[0].sourceActivityLocation, 'Sala 2');
  assert.equal(pendingAlerts[0].sourceActivitySaCode, 'SA1.1');
  assert.equal(pendingAlerts[0].sourceActivityProjectCode, '302151');
});

test('filtreaza sugestiile comune dupa lunile explicit permise', () => {
  const sharedDeliverables = [
    {
      id: 'current',
      documentId: 'activity:current',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-07-12',
      status: 'pending_registration',
    },
    {
      id: 'previous',
      documentId: 'activity:previous',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-06-20',
      status: 'pending_registration',
    },
    {
      id: 'next',
      documentId: 'activity:next',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-08-19',
      status: 'pending_registration',
    },
  ];

  assert.deepEqual(
    filterSharedRelationsForMonths({
      sharedDeliverables,
      allowedMonths: [{ month: 6, year: 2026 }],
    }).map((relation) => relation.id),
    ['current'],
  );

  assert.deepEqual(
    filterSharedRelationsForMonths({
      sharedDeliverables,
      allowedMonths: [
        { month: 6, year: 2026 },
        { month: 5, year: 2026 },
      ],
    }).map((relation) => relation.id),
    ['current', 'previous'],
  );
});

test('dashboardul afiseaza sugestii de activitate doar pentru luna selectata', () => {
  const sharedDeliverables = [
    {
      id: 'june-pending',
      documentId: 'activity:june-pending',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-06-08',
      status: 'pending_registration' as const,
    },
    {
      id: 'july-pending',
      documentId: 'activity:july-pending',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-07-12',
      status: 'pending_registration' as const,
    },
    {
      id: 'june-ignored',
      documentId: 'activity:june-ignored',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-06-10',
      status: 'ignored_by_target' as const,
    },
    {
      id: 'july-ignored',
      documentId: 'activity:july-ignored',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      sourceActivityDate: '2026-07-14',
      status: 'ignored_by_target' as const,
    },
  ];
  const julySuggestions = filterSharedRelationsForMonths({
    sharedDeliverables,
    allowedMonths: [{ month: 6, year: 2026 }],
  });
  const expert = { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 };
  const sourceExpert = { id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 };

  assert.deepEqual(
    buildPendingSharedActivityAlerts({
      expert,
      experts: [sourceExpert],
      sharedDeliverables: julySuggestions,
    }).map((alert) => alert.relationId),
    ['july-pending'],
  );
  assert.deepEqual(
    buildIgnoredSharedActivityAlerts({
      expert,
      experts: [sourceExpert],
      sharedDeliverables: julySuggestions,
    }).map((alert) => alert.relationId),
    ['july-ignored'],
  );
  assert.deepEqual(
    buildReturnedSharedActivityAlerts({
      expert: sourceExpert,
      experts: [expert],
      sharedDeliverables: julySuggestions,
    }).map((alert) => alert.relationId),
    ['july-ignored'],
  );
});

test('activitatea comuna ignorata apare in istoricul targetului, nu in alertele active', () => {
  const sharedDeliverables = [{
    id: 'shared-activity-1',
    documentId: 'activity:activity-1',
    sourceExpertId: 'expert-1',
    targetExpertId: 'expert-2',
    sourceActivityTitle: 'Atelier comun',
    status: 'ignored_by_target',
  }];

  const pendingAlerts = buildPendingSharedActivityAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    experts: [{ id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 }],
    sharedDeliverables,
  });
  const ignoredAlerts = buildIgnoredSharedActivityAlerts({
    expert: { id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 },
    experts: [{ id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 }],
    sharedDeliverables,
  });

  assert.equal(pendingAlerts.length, 0);
  assert.equal(ignoredAlerts.length, 1);
  assert.equal(ignoredAlerts[0].sourceActivityTitle, 'Atelier comun');
});

test('returneaza avertizarea la expertul initial cand activitatea comuna este ignorata', () => {
  const returnedAlerts = buildReturnedSharedActivityAlerts({
    expert: { id: 'expert-1', name: 'Expert Unu', role: 'Expert', norma: 8 },
    experts: [{ id: 'expert-2', name: 'Expert Doi', role: 'Expert', norma: 8 }],
    sharedDeliverables: [{
      id: 'shared-activity-1',
      documentId: 'activity:activity-1',
      sourceExpertId: 'expert-1',
      targetExpertId: 'expert-2',
      status: 'ignored_by_target',
    }],
  });

  assert.equal(returnedAlerts.length, 1);
  assert.match(returnedAlerts[0].message, /Expert Doi/);
});
