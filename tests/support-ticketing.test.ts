import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLinearIssueDraft,
  buildPmDocumentClarificationSupportTicket,
  buildSupportTicketLinearLabels,
  buildSupportTicketLinearPriority,
  buildSupportTicketTitle,
  findActiveDocumentSupportTicket,
  inferSupportTicketModuleFromPath,
  isClosedSupportTicket,
} from '../lib/support-ticketing.ts';
import type { DocumentMetadata, Expert, SupportTicket, SupportTicketCreateInput } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert',
  email: 'expert@test.ro',
  norma: 8,
  projectCode: '302141',
};

const document: DocumentMetadata = {
  id: 'doc-1',
  s3Key: 'deliverables/id/doc.pdf',
  originalFileName: 'strategie-comunicare.pdf',
  mimeType: 'application/pdf',
  fileSize: 1234,
  uploadedByExpertId: expert.id,
  uploadedByExpertName: expert.name,
  uploadDate: '2026-08-20T10:00:00.000Z',
  projectId: '302141',
  sourceActivityId: 'activity-1',
  declaredTitle: 'Strategie comunicare Learning Hub',
  titleCheckMessage: 'Denumire diferita fata de grupul de livrabile comune.',
};

describe('support ticketing rules', () => {
  it('deduce modulul tichetului din ruta curenta', () => {
    assert.equal(inferSupportTicketModuleFromPath('/pm'), 'pm');
    assert.equal(inferSupportTicketModuleFromPath('/financiar/pontaje'), 'financial');
    assert.equal(inferSupportTicketModuleFromPath('/expert/peo#livrabile'), 'deliverables');
    assert.equal(inferSupportTicketModuleFromPath('/expert/peo'), 'expert');
  });

  it('calculeaza etichete si prioritate Linear fara duplicate', () => {
    const labels = buildSupportTicketLinearLabels({
      module: 'pm',
      type: 'access_issue',
      severity: 'blocking',
      affectsMonthlyReporting: true,
    });

    assert.deepEqual(labels, ['PL uat', 'PL needs-retest', 'PL pm', 'PL security-gdpr', 'PL blocker-live']);
    assert.equal(new Set(labels).size, labels.length);
    assert.equal(buildSupportTicketLinearPriority('blocking', 'bug'), 'urgent');
    assert.equal(buildSupportTicketLinearPriority('minor', 'export_issue'), 'high');
    assert.equal(buildSupportTicketTitle({ module: 'pm', type: 'question', prefix: '[PM]' }), '[PM][PM] Intrebare');
  });

  it('construieste tichet PM contextual pentru clarificari pe documente', () => {
    const ticket = buildPmDocumentClarificationSupportTicket({
      document,
      expert,
      note: 'Folositi denumirea oficiala aprobata.',
      month: 7,
      year: 2026,
      actorId: 'pm-1',
      actorName: 'PM Test',
      actorRole: 'pm',
      appVersion: 'commit-123',
      environment: 'staging',
    });

    assert.equal(ticket.status, 'confirmed');
    assert.equal(ticket.module, 'pm');
    assert.equal(ticket.type, 'question');
    assert.equal(ticket.selectedExpertId, expert.id);
    assert.equal(ticket.relatedDocumentId, document.id);
    assert.equal(ticket.relatedActivityId, document.sourceActivityId);
    assert.equal(ticket.selectedMonth, 7);
    assert.equal(ticket.selectedYear, 2026);
    assert.equal(ticket.affectsMonthlyReporting, true);
    assert.match(ticket.description, /Folositi denumirea oficiala/);
    assert.ok(ticket.linearLabels?.includes('PL pm'));
    assert.equal(ticket.linearPriority, 'medium');
  });

  it('ridica severitatea pentru documentele cu deblocare PM activa', () => {
    const ticket = buildPmDocumentClarificationSupportTicket({
      document: {
        ...document,
        eligibilityCheck: {
          status: 'necesita_revizie',
          score: 0.4,
          summary: 'Documentul necesita decizie PM.',
          checks: [],
          missingElements: [],
          recommendations: [],
          riskFlags: [],
          pmUnlockRequestedAt: '2026-08-20T10:00:00.000Z',
        },
      },
      note: 'Verificati eligibilitatea.',
      month: 7,
      year: 2026,
    });

    assert.equal(ticket.type, 'blocker');
    assert.equal(ticket.severity, 'blocking');
    assert.equal(ticket.linearPriority, 'urgent');
    assert.ok(ticket.linearLabels?.includes('PL blocker-live'));
  });

  it('genereaza draft Linear din datele tichetului intern', () => {
    const ticket: SupportTicketCreateInput = {
      title: '[UAT][PM] Bug',
      description: 'Butonul Alerteaza nu lasa urma in registru.',
      type: 'bug',
      module: 'pm',
      severity: 'important',
      status: 'new',
      currentPath: '/pm',
      selectedMonth: 7,
      selectedYear: 2026,
      selectedExpertId: 'expert-1',
      relatedDocumentId: 'doc-1',
      linearLabels: ['PL uat', 'PL pm'],
      linearPriority: 'medium',
    };

    const draft = buildLinearIssueDraft(ticket);

    assert.equal(draft.title, ticket.title);
    assert.deepEqual(draft.labels, ['PL uat', 'PL pm']);
    assert.equal(draft.priority, 'medium');
    assert.match(draft.description, /Path: \/pm/);
    assert.match(draft.description, /Luna raportare: 8\/2026/);
    assert.match(draft.description, /Document: doc-1/);
  });

  it('gaseste tichetul activ pentru acelasi document si ignora tichetele inchise', () => {
    const tickets: SupportTicket[] = [
      {
        id: 'closed',
        title: 'Closed',
        description: 'Closed ticket',
        type: 'question',
        module: 'pm',
        severity: 'important',
        status: 'resolved',
        relatedDocumentId: 'doc-1',
        selectedMonth: 7,
        selectedYear: 2026,
      },
      {
        id: 'active',
        title: 'Active',
        description: 'Active ticket',
        type: 'question',
        module: 'pm',
        severity: 'important',
        status: 'confirmed',
        relatedDocumentId: 'doc-1',
        selectedMonth: 7,
        selectedYear: 2026,
      },
    ];

    assert.equal(isClosedSupportTicket(tickets[0]), true);
    assert.equal(findActiveDocumentSupportTicket(tickets, {
      module: 'pm',
      relatedDocumentId: 'doc-1',
      selectedMonth: 7,
      selectedYear: 2026,
    })?.id, 'active');
    assert.equal(findActiveDocumentSupportTicket(tickets, {
      module: 'pm',
      relatedDocumentId: 'doc-1',
      selectedMonth: 8,
      selectedYear: 2026,
    }), undefined);
  });
});
