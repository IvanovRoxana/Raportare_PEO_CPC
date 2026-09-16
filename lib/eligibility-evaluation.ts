import { createHash } from 'node:crypto';
import { criterionApplies, executeEligibilityRules, type CriterionFinding, type ExecutableRuleset, type RuleEvidence } from './eligibility-rules.ts';

export const ELIGIBILITY_MODEL_CONFIGURATION = { maxOutputTokens: 6000, maxRetries: 0 } as const;

export function applicableCriteriaSnapshot(rules: ExecutableRuleset | null, context: Pick<RuleEvidence, 'projectCode' | 'roleId' | 'category' | 'saCode' | 'at'>) {
  return (rules?.criteria || []).map((rule) => ({ criterionId: rule.criterionId, applicable: criterionApplies(rule, context) }))
    .sort((a, b) => a.criterionId.localeCompare(b.criterionId));
}

export function stableEvaluationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableEvaluationJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableEvaluationJson(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function evaluationHash(value: unknown) { return createHash('sha256').update(stableEvaluationJson(value)).digest('hex'); }
export function buildEvaluationKey(snapshot: Record<string, unknown>) { return evaluationHash(snapshot); }
export function buildEvidencePlan(rules: ExecutableRuleset | null, evidence: RuleEvidence) {
  return {
    criteria: (rules?.criteria || []).map((rule) => ({
      ...rule, applicable: criterionApplies(rule, evidence),
      sourceAvailable: evidence.sources.some((source) => source.documentId === rule.provenance.documentId && source.chunkId === rule.provenance.anchor
        && source.documentVersionId === rule.provenance.sourceVersion),
    })),
    documentIds: evidence.documents.map((doc) => doc.id), analysisComplete: evidence.documents.every((doc) => doc.analysisComplete),
    sourceIds: evidence.sources.map((source) => source.chunkId),
  };
}
export function finalizeAuthoritativeCriteria(rules: ExecutableRuleset | null, evidence: RuleEvidence, proposedStatus: string) {
  const findings: CriterionFinding[] = rules ? executeEligibilityRules(rules.criteria, evidence) : [{
    criterionId: 'ruleset-availability', status: 'unknown', explanation: 'Nu exista un registru executabil publicat pentru aceasta perioada.', evidenceIds: [],
  }];
  const mandatoryIds = new Set(rules?.criteria.filter((rule) => rule.mandatory).map((rule) => rule.criterionId));
  const unknown = !rules || !findings.some((f) => f.status !== 'not_applicable') || findings.some((f) => mandatoryIds.has(f.criterionId) && f.status === 'unknown');
  const failed = findings.some((f) => f.status === 'fail');
  const warning = findings.some((f) => f.status === 'warning' || f.status === 'unknown');
  const status = unknown ? 'neconcludent' : failed ? 'neeligibil'
    : proposedStatus === 'neconcludent' || proposedStatus === 'neeligibil' ? proposedStatus
      : warning ? 'eligibil_cu_observatii' : proposedStatus;
  return { criterionFindings: findings, status };
}

export function validatePmDecision(input: { decision: string; reason: string; replacementSaCode?: string; replacementActivityId?: string }, allowedSaCodes: string[]) {
  if (!['confirm', 'reject', 'request_clarification', 'approve_exception', 'reclassify'].includes(input.decision)) throw new Error('Decizie PM necunoscuta.');
  if (input.reason.trim().length < 12) throw new Error('Decizia PM necesita o justificare explicita.');
  if (input.decision === 'reclassify' && (!input.replacementSaCode || !allowedSaCodes.includes(input.replacementSaCode) || !input.replacementActivityId)) {
    throw new Error('Reincadrarea necesita o SA permisa si o activitate valida.');
  }
}
