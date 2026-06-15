import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivityStatus } from '../lib/activity-status.ts';

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

test('event status accepts MOM as the main deliverable when event proof exists', () => {
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

test('event status still requires event proof even when MOM exists', () => {
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
        },
      ],
    }),
    'missing'
  );
});
