import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMenuItems, buildAdminDashboardSnapshot, ruleSeverityLevels } from '../lib/admin-module.ts';
import type { Activity, Expert, ReportStatus } from '../lib/types.ts';

test('meniul admin acopera zonele minim viabile si avansate', () => {
  assert.ok(adminMenuItems.some((item) => item.id === 'users' && item.phase === 'Etapa 1'));
  assert.equal(adminMenuItems.find((item) => item.id === 'users')?.href, '/admin/users');
  assert.ok(adminMenuItems.some((item) => item.id === 'ai' && item.phase === 'Etapa 3'));
  assert.ok(adminMenuItems.some((item) => item.id === 'audit' && item.phase === 'Etapa 2'));
});

test('snapshot admin calculeaza indicatorii de avertizare', () => {
  const experts = [
    { id: 'e1', name: 'Expert complet', role: 'Expert', email: 'e1@test.ro', norma: 8, saCodes: ['SA3.1'], isActive: true },
    { id: 'e2', name: 'Expert fara SA', role: 'Expert', email: 'e2@test.ro', norma: 8, saCodes: [], isActive: true, hasPmAccess: true },
  ] as Expert[];
  const activities = [
    { id: 'a1', expertId: 'e1', date: '2026-05-04', activityType: 'Analiza', title: 'Analiza', hours: 4, saCode: 'SA3.1', status: 'sent', deliverables: [{ id: 'd1', fileName: 'raport.pdf', fileType: 'application/pdf', fileSize: 1 }] },
    { id: 'a2', expertId: 'e2', date: '2026-05-04', activityType: 'Raport', title: 'Raport', hours: 2, status: 'draft' },
  ] as Activity[];
  const reportStatuses = [
    { id: 'r1', expertId: 'e1', month: 4, year: 2026, status: 'draft' },
    { id: 'r2', expertId: 'e2', month: 4, year: 2026, status: 'approved' },
  ] as ReportStatus[];

  const snapshot = buildAdminDashboardSnapshot({
    experts,
    activities,
    reportStatuses,
    activeReportingMonths: ['Mai 2026'],
    activityCatalogCount: 12,
    workingGroupsCount: 3,
  });

  assert.equal(snapshot.totalExperts, 2);
  assert.equal(snapshot.reportedExperts, 2);
  assert.equal(snapshot.incompleteActivities, 1);
  assert.equal(snapshot.missingDeliverables, 1);
  assert.equal(snapshot.draftReports, 1);
  assert.equal(snapshot.validatedReports, 1);
  assert.deepEqual(snapshot.activeReportingMonths, ['Mai 2026']);
  assert.match(snapshot.configurationErrors[0], /Expert fara SA/);
});

test('regulile admin folosesc cele trei niveluri cerute', () => {
  assert.deepEqual(ruleSeverityLevels.map((rule) => rule.level), ['informare', 'avertizare', 'blocare']);
});