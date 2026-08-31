import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDashboardDestinationsForRoles, getDashboardPathForRoleSet } from '../lib/dashboard-routing.ts';

import {
  buildPmDashboardSummary,
  canAccessExpertModule,
  canAccessPmDashboard,
  checkCrossAlignment,
  mergeRolesWithExpertProfile,
  resolveDashboardAccess,
} from '../lib/pm-dashboard.ts';
import { buildDashboardComplianceRows } from '../lib/reporting-dashboard.ts';
import { buildPmClarificationThreads } from '../lib/pm-clarification-flow.ts';
import {
  buildCollaborationExpertOptions,
  canAccessExpertId,
  filterActivitiesForScope,
  filterDocumentsForScope,
  filterReportStatusesForScope,
  resolveDataAccessScope,
} from '../lib/access-control.ts';
import type { Activity, AuditLog, DocumentMetadata, Expert, ReportStatus } from '../lib/types.ts';

const experts = JSON.parse(readFileSync(new URL('../data/import/experts.json', import.meta.url), 'utf8')) as Expert[];
const pmDashboardSource = readFileSync(new URL('../app/pm/page.tsx', import.meta.url), 'utf8');
const pmDossierModalSource = readFileSync(new URL('../components/pm/dosar-expert-modal.tsx', import.meta.url), 'utf8');

test('lista de colaborare include toti expertii activi, nu doar expertul curent', () => {
  const current = { id: 'e1', name: 'Expert Curent', role: 'Expert', isActive: true } as Expert;
  const colleague = { id: 'e2', name: 'Alt Expert', role: 'Expert', isActive: true } as Expert;
  const inactive = { id: 'e3', name: 'Expert Inactiv', role: 'Expert', isActive: false } as Expert;
  const options = buildCollaborationExpertOptions([current, inactive, colleague]);

  assert.deepEqual(options.map((expert) => expert.id), ['e2', 'e1']);
});

test('utilizator Expert vede doar Modul Expert', () => {
  assert.deepEqual(resolveDashboardAccess({ roles: ['expert'], projectRole: 'Expert', hasPmAccess: false }), {
    canUseExpert: true,
    canUsePm: false,
    canUseAchizitii: false,
    canUseFinancial: false,
  });
});

test('utilizator PM vede Dashboard PM', () => {
  assert.equal(canAccessPmDashboard({ roles: ['pm'], projectRole: 'PM' }), true);
  assert.equal(canAccessExpertModule({ roles: ['pm'], projectRole: 'PM' }), false);
});

test('utilizator Expert/PM vede Modul Expert si Dashboard PM', () => {
  const access = resolveDashboardAccess({ roles: ['expert'], projectRole: 'Expert/PM', hasPmAccess: true });
  assert.equal(access.canUseExpert, true);
  assert.equal(access.canUsePm, true);
  assert.equal(access.canUseAchizitii, true);
});

test('Simona Khamissi GDPR ramane directionata doar catre Modul Expert', () => {
  const simona = experts.find((expert) => expert.email === 'simona.khamissi@confederatia-concordia.ro');
  assert.ok(simona);
  assert.equal(String(simona.category).toLowerCase(), 'gdpr');
  assert.equal(simona.role, 'Expert');
  assert.equal(simona.hasPmAccess, false);
  assert.deepEqual(simona.cognitoGroups, ['expert']);

  const roles = mergeRolesWithExpertProfile([], simona);
  assert.deepEqual(roles, ['expert']);
  assert.equal(getDashboardPathForRoleSet(roles), '/expert');
  assert.deepEqual(resolveDashboardAccess({ roles, projectRole: simona.role, hasPmAccess: simona.hasPmAccess }), {
    canUseExpert: true,
    canUsePm: false,
    canUseAchizitii: false,
    canUseFinancial: false,
  });
});

test('Ivanov Roxana are acces simultan la Expert, PM si Admin din tabelul de experti', () => {
  const roxana = (experts as Expert[]).find((expert) => expert.email === 'roxana.ivanov@confederatia-concordia.ro');
  assert.ok(roxana);
  assert.equal(roxana.name, 'Ivanov Roxana');
  assert.equal(roxana.role, 'Expert/PM');
  assert.equal(String(roxana.category).toLowerCase(), 'gt');
  assert.equal(roxana.dailyHours, 8);
  assert.deepEqual(roxana.saCodes, ['SA1.1']);
  assert.equal(roxana.hasPmAccess, true);
  assert.deepEqual(roxana.cognitoGroups, ['expert', 'pm', 'admin']);

  const roles = mergeRolesWithExpertProfile(['expert'], roxana);
  assert.deepEqual(roles.sort(), ['admin', 'expert', 'pm']);
  assert.deepEqual(resolveDashboardAccess({ roles, projectRole: roxana.role, hasPmAccess: roxana.hasPmAccess }), {
    canUseExpert: true,
    canUsePm: true,
    canUseAchizitii: true,
    canUseFinancial: true,
  });
});

test('Ivanov Roxana Expert/PM/Admin are acces extins ca admin', () => {
  const roxana = experts.find((expert) => expert.email === 'roxana.ivanov@confederatia-concordia.ro')!;
  const andreea = experts.find((expert) => expert.email === 'andreea.zalomir@confederatia-concordia.ro')!;
  const scope = resolveDataAccessScope({
    user: {
      id: 'cognito-roxana',
      email: 'roxana.ivanov@confederatia-concordia.ro',
      roles: ['expert', 'pm', 'admin'],
    },
    experts: [roxana, andreea],
  });

  assert.equal(scope.accessLevel, 'all');
  assert.equal(scope.canUsePmDashboard, true);
  assert.equal(scope.canAccessAllExperts, true);
  assert.equal(scope.currentExpertId, roxana.id);
  assert.equal(scope.reason, 'admin');
  assert.equal(canAccessExpertId(scope, roxana.id), true);
  assert.equal(canAccessExpertId(scope, andreea.id), true);

  const activities = [
    { id: 'own-a1', expertId: roxana.id, date: '2026-05-04', title: 'Raport GT', activityType: 'Raport', hours: 4 },
    { id: 'other-a1', expertId: andreea.id, date: '2026-05-04', title: 'Raport AP', activityType: 'Raport', hours: 4 },
  ] as Activity[];
  assert.deepEqual(filterActivitiesForScope(activities, scope).map((activity) => activity.id), ['own-a1', 'other-a1']);

  const documents = [
    { id: 'own-doc', uploadedByExpertId: roxana.id, s3Key: 'own', originalFileName: 'own.pdf', mimeType: 'application/pdf', fileSize: 1, uploadDate: '2026-05-04' },
    { id: 'other-doc', uploadedByExpertId: andreea.id, s3Key: 'other', originalFileName: 'other.pdf', mimeType: 'application/pdf', fileSize: 1, uploadDate: '2026-05-04' },
  ] as DocumentMetadata[];
  assert.deepEqual(filterDocumentsForScope(documents, scope).map((document) => document.id), ['own-doc', 'other-doc']);

  const statuses = [
    { id: 'own-status', expertId: roxana.id, month: 4, year: 2026, status: 'sent' },
    { id: 'other-status', expertId: andreea.id, month: 4, year: 2026, status: 'approved' },
  ] as ReportStatus[];
  assert.deepEqual(filterReportStatusesForScope(statuses, scope).map((status) => status.id), ['own-status', 'other-status']);
});

test('PM pur si Admin au acces extins la toate raportarile', () => {
  const pmScope = resolveDataAccessScope({
    user: { id: 'pm-user', email: 'mihaela.grigoras@confederatia-concordia.ro', roles: ['pm'] },
    experts,
  });
  assert.equal(pmScope.accessLevel, 'all');
  assert.equal(pmScope.canAccessAllExperts, true);

  const adminScope = resolveDataAccessScope({
    user: { id: 'admin-user', email: 'admin@example.test', roles: ['admin'] },
    experts: [],
  });
  assert.equal(adminScope.accessLevel, 'all');
  assert.equal(adminScope.canAccessAllExperts, true);
});

test('summary PM calculeaza statusuri, alerte titlu, livrabile comune si cross alignment', () => {
  const testExperts = [
    { id: 'e1', name: 'Expert 1', role: 'Expert', category: 'gt', isActive: true },
    { id: 'e2', name: 'Expert 2', role: 'Expert/PM', category: 'gt', hasPmAccess: true, isActive: true },
  ] as Expert[];
  const activities = [
    { id: 'a1', expertId: 'e1', date: '2026-05-04', title: 'Atelier GT', activityType: 'Eveniment', hours: 4, status: 'sent', pmNotes: 'Clarifica titlul livrabilului.' },
    { id: 'a2', expertId: 'e2', date: '2026-05-04', title: 'Atelier GT', activityType: 'Eveniment', hours: 4 },
  ] as Activity[];

  const summary = buildPmDashboardSummary({
    experts: testExperts,
    activities,
    reportStatuses: [
      { id: 's1', expertId: 'e1', month: 4, year: 2026, status: 'clarifications', pmNotes: 'Clarifica documentul d1.' },
      { id: 's2', expertId: 'e2', month: 4, year: 2026, status: 'approved' },
    ],
    documents: [
      {
        id: 'd1',
        s3Key: 'documents/d1.pdf',
        originalFileName: 'd1.pdf',
        mimeType: 'application/pdf',
        fileSize: 1,
        uploadedByExpertId: 'e1',
        uploadDate: '2026-05-04',
        titleMatch: false,
        titleCheckStatus: 'mismatch',
      },
      {
        id: 'd2',
        s3Key: 'documents/d2.pdf',
        originalFileName: 'd2.pdf',
        mimeType: 'application/pdf',
        fileSize: 1,
        uploadedByExpertId: 'e1',
        uploadDate: '2026-05-04',
        eligibilityCheck: {
          status: 'neeligibil',
          score: 15,
          summary: 'Nu corespunde activitatii selectate.',
          checks: [],
          missingElements: [],
          recommendations: [],
          riskFlags: [],
          pmUnlockRequested: true,
        },
      },
      {
        id: 'd3',
        s3Key: 'documents/d3.pdf',
        originalFileName: 'd3.pdf',
        mimeType: 'application/pdf',
        fileSize: 1,
        uploadedByExpertId: 'e1',
        uploadDate: '2026-05-04',
        eligibilityCheck: {
          status: 'eligibil',
          score: 88,
          summary: 'Corectat de expert si re-verificat AI.',
          checks: [],
          missingElements: [],
          recommendations: [],
          riskFlags: [],
          pmUnlockRequested: true,
          pmUnlockResolvedByCorrection: true,
        },
      },
    ],
    sharedDeliverables: [{ id: 'sh1', documentId: 'd1', sourceExpertId: 'e1', targetExpertId: 'e2', status: 'pending_registration' }],
  });

  assert.equal(summary.totalExperts, 2);
  assert.equal(summary.statusCounts.clarifications, 1);
  assert.equal(summary.statusCounts.approved, 1);
  assert.equal(summary.titleIssues, 1);
  assert.equal(summary.pmUnlockRequests, 1);
  assert.equal(summary.pendingSharedDeliverables, 1);
  assert.equal(summary.crossAlignmentIssues, 1);
  assert.equal(summary.documentAlertsCount, 3);
  assert.equal(summary.openClarificationsCount, 2);
  assert.equal(summary.problemCount, 6);
});

test('aprobarea manuala PM marcheaza livrabilul eligibil si sincronizeaza copia din activitate', () => {
  assert.match(pmDashboardSource, /const canApprovePmUnlockForDocument = \(document: DocumentMetadata\) => \(/);
  assert.match(pmDashboardSource, /dataAccessScope\.canUsePmDashboard/);
  assert.match(pmDashboardSource, /canAccessExpertId\(dataAccessScope, document\.uploadedByExpertId\)/);
  assert.match(pmDashboardSource, /if \(!canApprovePmUnlockForDocument\(document\) \|\| !document\.eligibilityCheck\) return/);
  assert.doesNotMatch(pmDashboardSource, /const approvePmUnlockRequest = async \(document: DocumentMetadata\) => \{\s*if \(!canManagePmReview/);
  assert.match(pmDashboardSource, /status:\s*'eligibil'/);
  assert.match(pmDashboardSource, /aiStatus:\s*'eligible'/);
  assert.match(pmDashboardSource, /const activityWithMatchingDeliverable = monthActivities\.find/);
  assert.match(pmDashboardSource, /const sourceActivity = activityWithMatchingDeliverable/);
  assert.match(pmDashboardSource, /updateDocumentEligibilityCheck\(document\.id, approvedCheck\)/);
  assert.match(pmDashboardSource, /actionType:\s*'pm_deliverable_unlock_approved'/);
  assert.match(pmDashboardSource, /fieldName:\s*`document:\$\{document\.id\}:eligibilityCheck`/);
  assert.match(pmDossierModalSource, /resolveFocusedEligibilityCheck/);
  assert.match(pmDossierModalSource, /Deblocare PM aprobata/);
  assert.doesNotMatch(pmDossierModalSource, /<Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">\s*Livrabil neeligibil\s*<\/Badge>/);
});

test('clarificarile PM pentru documente title_mismatch apar ca fire document', () => {
  const threads = buildPmClarificationThreads({
    expert: { id: 'e1', name: 'Expert 1', role: 'Expert', category: 'gt', isActive: true } as Expert,
    activities: [],
    documents: [{
      id: 'd1',
      s3Key: 'documents/d1.pdf',
      originalFileName: 'd1.pdf',
      mimeType: 'application/pdf',
      fileSize: 1,
      uploadedByExpertId: 'e1',
      uploadDate: '2026-05-04',
      titleMatch: false,
      titleCheckStatus: 'mismatch',
    }] as DocumentMetadata[],
    auditLogs: [{
      id: 'audit-1',
      actionType: 'pm_clarification_requested',
      actorId: 'pm',
      actorName: 'PM',
      actorRole: 'pm',
      affectedExpertId: 'e1',
      fieldName: 'document:d1',
      oldValue: '',
      newValue: 'Te rog clarifica titlul documentului.',
      month: 4,
      year: 2026,
      createdAt: '2026-05-05T10:00:00.000Z',
      source: 'manual',
    }, {
      id: 'audit-2',
      actionType: 'pm_clarification_realerted',
      actorId: 'pm',
      actorName: 'PM',
      actorRole: 'pm',
      affectedExpertId: 'e1',
      fieldName: 'document:d1',
      oldValue: 'requested',
      newValue: 'Te rog clarifica titlul documentului.',
      month: 4,
      year: 2026,
      createdAt: '2026-05-06T12:00:00.000Z',
      source: 'manual',
    }] as AuditLog[],
    month: 4,
    year: 2026,
  });

  assert.equal(threads.length, 1);
  assert.equal(threads[0].targetType, 'document');
  assert.equal(threads[0].targetId, 'd1');
  assert.equal(threads[0].status, 'requested');
  assert.equal(threads[0].pmMessage, 'Te rog clarifica titlul documentului.');
  assert.equal(threads[0].lastRealertedAt, '2026-05-06T12:00:00.000Z');
  assert.equal(threads[0].lastRealertedBy, 'PM');
  assert.equal(threads[0].realertCount, 1);
});

test('randul PM numara activitatile inregistrate cu livrabile lipsa', () => {
  const rows = buildDashboardComplianceRows({
    experts: [{ id: 'e1', name: 'Expert 1', role: 'Expert', category: 'gt', isActive: true, dailyHours: 8 }] as Expert[],
    activities: [
      { id: 'a1', expertId: 'e1', date: '2026-05-04', title: 'Activitate cu livrabil', activityType: 'Raport', hours: 4, deliverables: [{ id: 'd1', fileName: 'raport.pdf', deliverableType: 'Raport' }] },
      { id: 'a2', expertId: 'e1', date: '2026-05-05', title: 'Activitate fara livrabil', activityType: 'Raport', hours: 4, deliverables: [] },
    ] as Activity[],
    auditLogs: [],
    month: 4,
    year: 2026,
  });

  assert.equal(rows[0].activityCount, 2);
  assert.equal(rows[0].missingDeliverableActivityCount, 1);
});

test('checkCrossAlignment detecteaza activitati similare intre experti diferiti', () => {
  const issues = checkCrossAlignment([
    { id: 'a1', expertId: 'e1', date: '2026-05-04', title: 'Raport comun', activityType: 'Analiza' },
    { id: 'a2', expertId: 'e2', date: '2026-05-04', title: 'Raport comun', activityType: 'Analiza' },
    { id: 'a3', expertId: 'e1', date: '2026-05-04', title: 'Raport comun', activityType: 'Analiza' },
  ]);

  assert.equal(issues.length, 2);
  assert.equal(issues[0].firstActivityId, 'a1');
  assert.equal(issues[0].secondActivityId, 'a2');
  assert.equal(issues.some((issue) => issue.firstActivityId === 'a1' && issue.secondActivityId === 'a3'), false);
});



test('Mihaela Grigoras are acces la Dashboard PM si Admin', () => {
  const mihaela = experts.find((expert) => expert.email === 'mihaela.grigoras@confederatia-concordia.ro')!;
  const roles = mergeRolesWithExpertProfile([], mihaela).sort();

  assert.deepEqual(mihaela.cognitoGroups, ['pm', 'admin']);
  assert.deepEqual(roles, ['admin', 'pm']);
  assert.equal(getDashboardPathForRoleSet(roles), '/auth/select-dashboard');
  assert.deepEqual(getDashboardDestinationsForRoles(roles).map((destination) => destination.path), ['/pm', '/achizitii', '/financiar', '/admin']);
});

test('Ivanov Roxana vede selectorul de rol cu Admin inclus', () => {
  const roxana = experts.find((expert) => expert.email === 'roxana.ivanov@confederatia-concordia.ro')!;
  const roles = mergeRolesWithExpertProfile([], roxana).sort();

  assert.deepEqual(roles, ['admin', 'expert', 'pm']);
  assert.equal(getDashboardPathForRoleSet(roles), '/auth/select-dashboard');
  assert.deepEqual(getDashboardDestinationsForRoles(roles).map((destination) => destination.path), ['/expert', '/pm', '/achizitii', '/financiar', '/admin']);
});
