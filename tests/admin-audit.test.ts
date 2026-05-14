import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLog, prepareManualMonthlyNormUpdate } from '../lib/audit-trail.ts';
import type { Expert } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert',
  email: 'expert@test.ro',
  norma: 8,
  normType: 'manual_adjusted',
};

test('interventia administratorului cere rol admin', () => {
  assert.throws(
    () =>
      createAuditLog({
        actionType: 'manual_monthly_norm_updated',
        actorId: 'pm-1',
        actorRole: 'pm',
        affectedExpertId: expert.id,
        justification: 'Justificare suficient de clara',
      }),
    /doar administratorului/,
  );
});

test('interventia administratorului cere justificare', () => {
  assert.throws(
    () =>
      createAuditLog({
        actionType: 'manual_monthly_norm_updated',
        actorId: 'admin-1',
        actorRole: 'admin',
        affectedExpertId: expert.id,
        justification: 'scurt',
      }),
    /Justificarea este obligatorie/,
  );
});

test('exceptia de zi nelucratoare permite rol PM cu justificare si audit', () => {
  const audit = createAuditLog({
    actionType: 'non_working_day_overridden',
    actorId: 'pm-1',
    actorRole: 'pm',
    affectedExpertId: expert.id,
    affectedExpertName: expert.name,
    month: 5,
    year: 2026,
    fieldName: 'activity',
    newValue: { date: '2026-06-01', hours: 4 },
    justification: 'Activitate exceptionala aprobata de PM pentru zi nelucratoare.',
  });

  assert.equal(audit.actionType, 'non_working_day_overridden');
  assert.equal(audit.actorRole, 'pm');
  assert.match(audit.justification ?? '', /zi nelucratoare/);
});

test('actualizarea normei manuale produce patch si audit trail', () => {
  const result = prepareManualMonthlyNormUpdate({
    expert,
    month: 0,
    year: 2026,
    newMonthlyNorm: 120,
    actorId: 'admin-1',
    actorName: 'Administrator',
    actorRole: 'admin',
    justification: 'Corectie contractuala aprobata pentru luna selectata.',
  });

  assert.equal(result.expertPatch.manualMonthlyNorm, 120);
  assert.equal(result.expertPatch.normType, 'manual_adjusted');
  assert.equal(result.audit.actionType, 'manual_monthly_norm_updated');
  assert.equal(result.audit.oldValue, '');
  assert.equal(result.audit.newValue, '120');
});
