import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPmDeliverableActionModel,
  buildPmDeliverableActionModelForClarification,
  buildPmDeliverablesViewModel,
  buildPmDocumentClarificationState,
} from '../lib/pm-deliverables-view.ts';
import type { DocumentMetadata, Expert, PmClarificationThread, SupportTicket } from '../lib/types.ts';

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

  it('exclude clarificările rezolvate din filtrul activ de clarificări', () => {
    const resolved = document('clarification', 'e1', { titleMatch: false, titleCheckStatus: 'mismatch' });
    const model = buildPmDeliverablesViewModel({
      experts,
      documents: [resolved],
      filter: 'clarifications',
      documentClarificationStates: new Map([
        [resolved.id, { id: 'resolved', label: 'Rezolvată' }],
      ]),
    });

    assert.equal(model.filteredDocuments.length, 0);
    assert.equal(model.filters.find((item) => item.id === 'clarifications')?.count, 0);
    assert.equal(model.filters.find((item) => item.id === 'all')?.count, 1);
  });
});

describe('buildPmDeliverableActionModel', () => {
  it('expune acțiuni PM pentru livrabile neeligibile', () => {
    const model = buildPmDeliverableActionModel('ineligible');

    assert.equal(model.primary.id, 'open_dossier');
    assert.equal(model.primary.issueType, 'pm_unlock_requests');
    assert.deepEqual(model.secondary.map((action) => action.id), [
      'request_clarification',
      'approve_pm_unlock',
      'open_file',
    ]);
  });

  it('expune marcarea neeligibilă pentru statusuri care pot fi revizuite manual', () => {
    for (const status of ['approved', 'sent', 'draft'] as const) {
      const model = buildPmDeliverableActionModel(status);

      assert.equal(model.primary.id, 'open_file');
      assert.deepEqual(model.secondary.map((action) => action.id), ['mark_ineligible']);
    }
  });

  it('păstrează dosarul ca acțiune principală pentru clarificări și auto-rezolvate', () => {
    const clarification = buildPmDeliverableActionModel('clarifications');
    const autoResolved = buildPmDeliverableActionModel('auto_resolved');

    assert.equal(clarification.primary.id, 'open_dossier');
    assert.deepEqual(clarification.secondary.map((action) => action.id), ['request_clarification', 'mark_ineligible', 'open_file']);
    assert.equal(autoResolved.primary.id, 'open_dossier');
    assert.equal(autoResolved.primary.issueType, 'eligibility_ai_review');
    assert.deepEqual(autoResolved.secondary.map((action) => action.id), ['view_ai_review', 'open_file']);
  });

  it('nu afișează marcarea neeligibilă pentru cazuri deja decise prin PM', () => {
    for (const status of ['ineligible', 'pm_unlocked', 'auto_resolved'] as const) {
      const model = buildPmDeliverableActionModel(status);

      assert.equal(model.secondary.some((action) => action.id === 'mark_ineligible'), false);
    }
  });
});

describe('buildPmDocumentClarificationState', () => {
  const baseThread: PmClarificationThread = {
    id: 'thread-1',
    targetType: 'document',
    targetId: 'doc-1',
    expertId: 'e1',
    month: 7,
    year: 2026,
    status: 'requested',
    pmMessage: 'Clarifică documentul.',
    requestedAt: '2026-08-10T10:00:00.000Z',
  };

  it('marchează clarificarea cerută și re-alertată', () => {
    const requested = buildPmDocumentClarificationState({
      document: document('doc-1', 'e1'),
      thread: baseThread,
    });
    const realerted = buildPmDocumentClarificationState({
      document: document('doc-1', 'e1'),
      thread: { ...baseThread, realertCount: 1, lastRealertedAt: '2026-08-11T10:00:00.000Z' },
    });

    assert.equal(requested.id, 'requested');
    assert.equal(realerted.id, 'realerted');
  });

  it('marchează răspunsul expertului când documentul a fost actualizat după cerere', () => {
    const state = buildPmDocumentClarificationState({
      document: document('doc-1', 'e1', { updatedAt: '2026-08-12T10:00:00.000Z' }),
      thread: baseThread,
    });

    assert.equal(state.id, 'answered');
  });

  it('marchează cazul gata de verificat când documentul actualizat pare conform', () => {
    const state = buildPmDocumentClarificationState({
      document: document('doc-1', 'e1', {
        titleMatch: true,
        updatedAt: '2026-08-12T10:00:00.000Z',
      }),
      thread: baseThread,
    });

    assert.equal(state.id, 'ready_to_resolve');
  });

  it('marchează ca rezolvat un ticket închis', () => {
    const ticket: SupportTicket = {
      id: 'ticket-1',
      title: 'Clarificare',
      description: 'Clarificare PM',
      type: 'question',
      module: 'pm',
      severity: 'important',
      status: 'resolved',
      relatedDocumentId: 'doc-1',
      selectedMonth: 7,
      selectedYear: 2026,
    };

    const state = buildPmDocumentClarificationState({
      document: document('doc-1', 'e1'),
      thread: baseThread,
      ticket,
    });

    assert.equal(state.id, 'resolved');
  });
});

describe('buildPmDeliverableActionModelForClarification', () => {
  it('face re-alertarea acțiunea principală pentru clarificările deja cerute', () => {
    const model = buildPmDeliverableActionModelForClarification({
      id: 'requested',
      label: 'Clarificare cerută',
    });

    assert.equal(model.primary.id, 'realert_clarification');
    assert.deepEqual(model.secondary.map((action) => action.id), ['open_dossier', 'open_file']);
  });

  it('permite marcarea ca rezolvată după răspunsul expertului', () => {
    const model = buildPmDeliverableActionModelForClarification({
      id: 'ready_to_resolve',
      label: 'Gata de verificat',
    });

    assert.equal(model.primary.id, 'open_dossier');
    assert.equal(model.secondary.some((action) => action.id === 'resolve_clarification'), true);
  });
});
