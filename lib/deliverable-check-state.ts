import type { DeliverableEligibilityCheck, DeliverableSlot } from './deliverable-types.ts';
import { getTitleValidationScope, getTitleValidationText, isLikelyFilenameDerivedTitle, validateDeclaredTitleInDocumentText } from './title-suggestion.ts';

export type EligibilityAttemptState = 'pending' | 'technical_error' | 'blocked' | 'result';
export type EligibilityFailurePhase = 'download' | 'extraction' | 'evaluation';

function normalizeCheckText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Recognize persisted attempts from older clients without changing the saved contract.
export function getEligibilityAttemptState(check: DeliverableEligibilityCheck): EligibilityAttemptState {
  if (check.executionStatus === 'not_started') return 'blocked';
  if (check.executionStatus === 'pending') return 'pending';
  if (check.executionStatus === 'failed') return 'technical_error';
  if (check.executionStatus === 'completed') return 'result';
  if (check.status !== 'neconcludent') return 'result';
  const summary = normalizeCheckText(check.summary || '');
  const text = normalizeCheckText([
    check.summary,
    ...(check.checks || []).map((item) => `${item.criterion} ${item.explanation}`),
    ...(check.missingElements || []),
    ...(check.recommendations || []),
    ...(check.riskFlags || []),
  ].filter(Boolean).join(' '));
  if (summary.includes('a fost pornita') || text.includes('verificare automata in curs')) return 'pending';
  if (
    summary.startsWith('eroare:')
    || summary.startsWith('eroare la ')
    || text.includes('verificarea api nu a putut fi finalizata')
    || text.includes('eroare tehnica')
    || text.includes('failed to fetch')
    || text.includes('verificare automata indisponibila')
  ) return 'technical_error';
  if (
    text.includes('blocata de validarea titlului')
    || (text.includes('text') && (text.includes('insuficient') || text.includes('prea scurt') || text.includes('nu a putut citi')))
  ) return 'blocked';
  return 'result';
}

export function isReusableEligibilityCheck(check?: DeliverableEligibilityCheck | null) {
  return Boolean(check && getEligibilityAttemptState(check) === 'result');
}

export function isReusableEligibilityCheckForContext(
  check: DeliverableEligibilityCheck | null | undefined,
  context: {
    saCode?: string;
    activityId?: string;
    activityName?: string;
    deliverableType?: string;
  },
) {
  if (!isReusableEligibilityCheck(check)) return false;

  const normalizedSaCode = normalizeCheckText(String(context.saCode || '').trim());
  const normalizedActivityName = normalizeCheckText(String(context.activityName || '').trim());
  const normalizedDeliverableType = normalizeCheckText(String(context.deliverableType || '').trim());
  if (!normalizedSaCode || !normalizedActivityName || !normalizedDeliverableType) return false;

  return normalizeCheckText(String(check?.checkedSaCode || '').trim()) === normalizedSaCode
    && normalizeCheckText(String(check?.checkedActivityName || '').trim()) === normalizedActivityName
    && normalizeCheckText(String(check?.checkedDeliverableType || '').trim()) === normalizedDeliverableType
    && (!context.activityId || check?.checkedActivityId === context.activityId);
}

export function getDisplayEligibilityScore(check: DeliverableEligibilityCheck): number | null {
  return getEligibilityAttemptState(check) === 'result' ? check.score : null;
}

export function getDeclaredTitleEligibilityIssue(
  deliverable: DeliverableSlot,
  allowDeferredExtraction = false,
) {
  if (!deliverable.uploaded || deliverable.isPhoto || deliverable.titleSource === 'admin_override') return null;
  if (!deliverable.firstPageText?.trim() && allowDeferredExtraction) return null;
  const declaredTitle = (deliverable.declaredTitle || '').trim();
  if (!declaredTitle || isLikelyFilenameDerivedTitle(declaredTitle, deliverable.filename || deliverable.name)) return null;
  const validation = validateDeclaredTitleInDocumentText({
    documentText: getTitleValidationText(deliverable.firstPageText, deliverable.docText),
    declaredTitle,
    titleSource: deliverable.titleSource,
    validationScope: getTitleValidationScope(deliverable.firstPageText, deliverable.docText),
  });
  return validation.titleMatch ? null : validation.titleCheckMessage;
}

export class EligibilityAttemptError extends Error {
  readonly phase: EligibilityFailurePhase;

  constructor(phase: EligibilityFailurePhase, message: string) {
    super(message);
    this.name = 'EligibilityAttemptError';
    this.phase = phase;
  }
}

export function getEligibilityFailureSummary(error: unknown, fallbackPhase: EligibilityFailurePhase) {
  const phase = error instanceof EligibilityAttemptError ? error.phase : fallbackPhase;
  const label = phase === 'download'
    ? 'descarcarea documentului'
    : phase === 'extraction'
      ? 'extragerea textului din document'
      : 'evaluarea eligibilitatii';
  const detail = error instanceof Error ? error.message : 'Eroare necunoscuta';
  return `Eroare la ${label}: ${detail}. Evaluarea nu a fost finalizata; reincearca verificarea.`;
}
