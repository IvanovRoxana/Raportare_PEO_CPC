import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPmDashboardSummary,
  canAccessExpertModule,
  canAccessPmDashboard,
  checkCrossAlignment,
  mergeRolesWithExpertProfile,
  resolveDashboardAccess,
} from '../lib/pm-dashboard.ts';
import type { Activity, Expert } from '../lib/types.ts';

const experts = JSON.parse(readFileSync(new URL('../data/import/experts.json', import.meta.url), 'utf8')) as Expert[];

test('utilizator Expert vede doar Modul Expert', () => {
  assert.deepEqual(resolveDashboardAccess({ roles: ['expert'], projectRole: 'Expert', hasPmAccess: false }), {
    canUseExpert: true,
    canUsePm: false,
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
});

test('Ivanov Roxana are acces simultan la Expert si PM din tabelul de experti', () => {
  const roxana = (experts as Expert[]).find((expert) => expert.email === 'roxana.ivanov@confederatia-concordia.ro');
  assert.ok(roxana);
  assert.equal(roxana.name, 'Ivanov Roxana');
  assert.equal(roxana.role, 'Expert/PM');
  assert.equal(roxana.category.toLowerCase(), 'gt');
  assert.equal(roxana.dailyHours, 8);
  assert.deepEqual(roxana.saCodes, ['SA1.1']);
  assert.equal(roxana.hasPmAccess, true);

  const roles = mergeRolesWithExpertProfile(['expert'], roxana);
  assert.deepEqual(roles.sort(), ['expert', 'pm']);
  assert.deepEqual(resolveDashboardAccess({ roles, projectRole: roxana.role, hasPmAccess: roxana.hasPmAccess }), {
    canUseExpert: true,
    canUsePm: true,
  });
});

test('summary PM calculeaza statusuri, alerte titlu, livrabile comune si cross alignment', () => {
  const testExperts = [
    { id: 'e1', name: 'Expert 1', role: 'Expert', category: 'gt', isActive: true },
    { id: 'e2', name: 'Expert 2', role: 'Expert/PM', category: 'gt', hasPmAccess: true, isActive: true },
  ] as Expert[];
  const activities = [
    { id: 'a1', expertId: 'e1', date: '2026-05-04', title: 'Atelier GT', activityType: 'Eveniment', hours: 4 },
    { id: 'a2', expertId: 'e2', date: '2026-05-04', title: 'Atelier GT', activityType: 'Eveniment', hours: 4 },
  ] as Activity[];

  const summary = buildPmDashboardSummary({
    experts: testExperts,
    activities,
    reportStatuses: [{ id: 's1', expertId: 'e2', month: 4, year: 2026, status: 'approved' }],
    documents: [{ id: 'd1', titleMatch: false, titleCheckStatus: 'mismatch' }],
    sharedDeliverables: [{ id: 'sh1', documentId: 'd1', sourceExpertId: 'e1', targetExpertId: 'e2', status: 'pending_registration' }],
  });

  assert.equal(summary.totalExperts, 2);
  assert.equal(summary.statusCounts.draft, 1);
  assert.equal(summary.statusCounts.approved, 1);
  assert.equal(summary.titleIssues, 1);
  assert.equal(summary.pendingSharedDeliverables, 1);
  assert.equal(summary.crossAlignmentIssues, 1);
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
