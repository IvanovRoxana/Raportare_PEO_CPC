import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivityStatus } from '../lib/activity-status.ts';
import { serializeBusinessHubMeta } from '../lib/business-hub-reporting.ts';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test('activity status does not require AI eligibility when deliverable eligibility check is disabled', () => {
  const previousClientFlag = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';

  assert.equal(
    getActivityStatus({
      id: 'a1',
      expertId: 'e1',
      expertName: 'Expert GDPR',
      date: '2026-05-15',
      hours: 6,
      activityType: 'Monitorizare GDPR activitati Grup Tinta',
      title: 'Monitorizare GDPR activitati Grup Tinta',
      description: 'Descriere completa',
      deliverables: [
        {
          id: 'd1',
          activityId: 'a1',
          fileName: 'raport.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 1024,
          uploaded: true,
          titleConfirmed: true,
          stadiu: 'final',
          aiCheck: false,
        },
      ],
    }),
    'complete'
  );

  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClientFlag);
});

test('activity status still requires AI eligibility when deliverable eligibility check is enabled', () => {
  const previousClientFlag = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';

  assert.equal(
    getActivityStatus({
      id: 'a1',
      expertId: 'e1',
      expertName: 'Expert GDPR',
      date: '2026-05-15',
      hours: 6,
      activityType: 'Monitorizare GDPR activitati Grup Tinta',
      title: 'Monitorizare GDPR activitati Grup Tinta',
      description: 'Descriere completa',
      deliverables: [
        {
          id: 'd1',
          activityId: 'a1',
          fileName: 'raport.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 1024,
          uploaded: true,
          titleConfirmed: true,
          stadiu: 'final',
          aiCheck: false,
        },
      ],
    }),
    'title_mismatch'
  );

  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClientFlag);
});

test('event status accepts uploaded MOM/report as the main deliverable', () => {
  assert.equal(
    getActivityStatus({
      id: 'a-event',
      expertId: 'e1',
      expertName: 'Expert AP',
      date: '2026-05-15',
      hours: 4,
      activityType: 'Participare / reprezentare consultare publica sau dezbatere',
      title: 'Participare / reprezentare consultare publica sau dezbatere',
      description: 'Participare la consultare publica.',
      deliverables: [
        {
          id: 'mom',
          activityId: 'a-event',
          fileName: 'mom-eveniment.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          deliverableType: 'event_mom',
          filePath: 'documents/mom-eveniment.pdf',
        },
      ],
    }),
    'complete'
  );
});

test('event status requires proof when the event report was generated in the form', () => {
  assert.equal(
    getActivityStatus({
      id: 'a-event',
      expertId: 'e1',
      expertName: 'Expert AP',
      date: '2026-05-15',
      hours: 4,
      activityType: 'Participare / reprezentare consultare publica sau dezbatere',
      title: 'Participare / reprezentare consultare publica sau dezbatere',
      description: 'Participare la consultare publica.',
      deliverables: [
        {
          id: 'mom',
          activityId: 'a-event',
          fileName: 'mom-eveniment.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          deliverableType: 'event_mom',
          uploaded: true,
          requiresEventProof: true,
        },
      ],
    }),
    'missing'
  );
});

test('event status accepts generated event report when proof is attached', () => {
  assert.equal(
    getActivityStatus({
      id: 'a-event',
      expertId: 'e1',
      expertName: 'Expert AP',
      date: '2026-05-15',
      hours: 4,
      activityType: 'Participare / reprezentare consultare publica sau dezbatere',
      title: 'Participare / reprezentare consultare publica sau dezbatere',
      description: 'Participare la consultare publica.',
      deliverables: [
        {
          id: 'mom',
          activityId: 'a-event',
          fileName: 'Raport_eveniment_2026-05-15.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 1024,
          deliverableType: 'event_mom',
          uploaded: true,
          requiresEventProof: true,
        },
        {
          id: 'proof',
          activityId: 'a-event',
          fileName: 'foto-eveniment.jpg',
          fileType: 'image/jpeg',
          fileSize: 2048,
          deliverableType: 'event_proof',
          uploaded: true,
        },
      ],
    }),
    'complete'
  );
});

test('Business Hub registry activity is complete without individual deliverable', () => {
  assert.equal(
    getActivityStatus({
      id: 'bh-event',
      expertId: 'alexandru-enache',
      expertName: 'Alexandru Enache',
      date: '2026-05-15',
      hours: 8,
      activityType: 'Coordonarea activitatilor Business Hub',
      title: 'Coordonarea activitatilor Business Hub',
      saCode: 'SA3.2',
      businessHubMetaJson: serializeBusinessHubMeta({
        entityName: 'CPBR',
        eventTitle: 'Sedinta de lucru',
        date: '2026-05-15',
        startTime: '10:00',
        endTime: '12:00',
      }),
      deliverables: [],
    }),
    'complete',
  );
});

test('Business Hub registry activity with incomplete metadata still needs monthly evidence', () => {
  assert.equal(
    getActivityStatus({
      id: 'bh-event-incomplete',
      expertId: 'alexandru-enache',
      date: '2026-05-15',
      hours: 8,
      activityType: 'Coordonarea activitatilor Business Hub',
      title: 'Coordonarea activitatilor Business Hub',
      saCode: 'SA3.2',
      businessHubMetaJson: serializeBusinessHubMeta({
        entityName: 'CPBR',
        date: '2026-05-15',
      }),
      deliverables: [],
    }),
    'missing',
  );
});
