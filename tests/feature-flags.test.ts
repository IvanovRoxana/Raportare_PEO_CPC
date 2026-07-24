import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActivityAutofillEmbeddingModel,
  isAnexa10DeterministicDocxEnabledClient,
  isActivityAgentEnabled,
  isActivityAgentEnabledClient,
  isActivityAutofillRagAuditEnabled,
  isActivityAutofillRagEnabled,
  isActivityAutofillRagPaOnly,
  isDeliverableEligibilityCheckEnabled,
  isDeliverableEligibilityCheckEnabledClient,
  isReportingWorkBlocksEnabledClient,
} from '../lib/feature-flags.ts';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test('deliverable eligibility check is disabled by default', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  delete process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  delete process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  assert.equal(isDeliverableEligibilityCheckEnabled(), false);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), false);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});

test('deliverable eligibility check only enables on explicit true flags', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  assert.equal(isDeliverableEligibilityCheckEnabled(), false);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), false);

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';
  assert.equal(isDeliverableEligibilityCheckEnabled(), true);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), true);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});

test('server eligibility endpoint can be enabled from the public build flag', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';

  assert.equal(isDeliverableEligibilityCheckEnabled(), true);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), true);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});

test('activity autofill RAG flags are safe by default', () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  const previousPaOnly = process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  const previousAudit = process.env.ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED;
  const previousEmbedding = process.env.OPENAI_EMBEDDING_MODEL;

  delete process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  delete process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  delete process.env.ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED;
  delete process.env.OPENAI_EMBEDDING_MODEL;

  assert.equal(isActivityAutofillRagEnabled(), false);
  assert.equal(isActivityAutofillRagPaOnly(), true);
  assert.equal(isActivityAutofillRagAuditEnabled(), true);
  assert.equal(getActivityAutofillEmbeddingModel(), 'text-embedding-3-small');

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_PA_ONLY', previousPaOnly);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED', previousAudit);
  restoreEnv('OPENAI_EMBEDDING_MODEL', previousEmbedding);
});

test('reporting work blocks UI is disabled by default and enables only on explicit public flag', () => {
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS;

  delete process.env.NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS;
  assert.equal(isReportingWorkBlocksEnabledClient(), false);

  process.env.NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS = 'false';
  assert.equal(isReportingWorkBlocksEnabledClient(), false);

  process.env.NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS = 'true';
  assert.equal(isReportingWorkBlocksEnabledClient(), true);

  restoreEnv('NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS', previousClient);
});

test('deterministic Anexa 10 DOCX export is disabled by default and enables only on explicit public flag', () => {
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX;

  delete process.env.NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX;
  assert.equal(isAnexa10DeterministicDocxEnabledClient(), false);

  process.env.NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX = 'false';
  assert.equal(isAnexa10DeterministicDocxEnabledClient(), false);

  process.env.NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX = 'true';
  assert.equal(isAnexa10DeterministicDocxEnabledClient(), true);

  restoreEnv('NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX', previousClient);
});

test('activity autofill RAG enables only on explicit true', () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  const previousPaOnly = process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  const previousAudit = process.env.ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED;

  process.env.ACTIVITY_AUTOFILL_RAG_ENABLED = 'false';
  process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY = 'false';
  process.env.ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED = 'false';

  assert.equal(isActivityAutofillRagEnabled(), false);
  assert.equal(isActivityAutofillRagPaOnly(), false);
  assert.equal(isActivityAutofillRagAuditEnabled(), false);

  process.env.ACTIVITY_AUTOFILL_RAG_ENABLED = 'true';
  assert.equal(isActivityAutofillRagEnabled(), true);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_PA_ONLY', previousPaOnly);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED', previousAudit);
});

test('activity agent flags are disabled by default and enable only on explicit true', () => {
  const previousServer = process.env.ACTIVITY_AGENT_ENABLED;
  const previousClient = process.env.NEXT_PUBLIC_ACTIVITY_AGENT_ENABLED;

  delete process.env.ACTIVITY_AGENT_ENABLED;
  delete process.env.NEXT_PUBLIC_ACTIVITY_AGENT_ENABLED;
  assert.equal(isActivityAgentEnabled(), false);
  assert.equal(isActivityAgentEnabledClient(), false);

  process.env.ACTIVITY_AGENT_ENABLED = 'false';
  process.env.NEXT_PUBLIC_ACTIVITY_AGENT_ENABLED = 'false';
  assert.equal(isActivityAgentEnabled(), false);
  assert.equal(isActivityAgentEnabledClient(), false);

  process.env.ACTIVITY_AGENT_ENABLED = 'true';
  process.env.NEXT_PUBLIC_ACTIVITY_AGENT_ENABLED = 'true';
  assert.equal(isActivityAgentEnabled(), true);
  assert.equal(isActivityAgentEnabledClient(), true);

  restoreEnv('ACTIVITY_AGENT_ENABLED', previousServer);
  restoreEnv('NEXT_PUBLIC_ACTIVITY_AGENT_ENABLED', previousClient);
});
