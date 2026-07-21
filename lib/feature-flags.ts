export const DELIVERABLE_ELIGIBILITY_DISABLED_STATUS = 'disabled';

export const DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE =
  'Verificarea eligibilitatii livrabilelor este suspendata temporar pana la configurarea API keys.';

export const DELIVERABLE_ELIGIBILITY_UI_MESSAGE =
  'Verificarea automata a eligibilitatii livrabilelor este temporar indisponibila pana la finalizarea configurarii API keys si validarea regulilor de verificare. Eligibilitatea se verifica manual de catre PM.';

export function isDeliverableEligibilityCheckEnabled() {
  return (
    process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK === 'true'
  );
}

export function isDeliverableEligibilityCheckEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK === 'true';
}

export function isReportingWorkBlocksEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS === 'true';
}

export function isFinancialTimesheetsEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_FINANCIAL_TIMESHEETS === 'true';
}

export function isFinancialLeaveEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_FINANCIAL_LEAVE === 'true';
}

export function isAnexa10DeterministicDocxEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX === 'true';
}

export function isActivityAutofillRagEnabled() {
  return process.env.ACTIVITY_AUTOFILL_RAG_ENABLED === 'true';
}

export function isActivityAutofillRagPaOnly() {
  return process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY !== 'false';
}

export function isActivityAutofillRagAuditEnabled() {
  return process.env.ACTIVITY_AUTOFILL_RAG_AUDIT_ENABLED !== 'false';
}

export function getActivityAutofillEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
}
