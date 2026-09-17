import { z } from 'zod';
import { canonicalRoleId, normalizeEligibilityScope } from './eligibility-scope.ts';
import { normalizePeoCategory } from './peo-category.ts';
import type { AiEligibilityRuleset } from './types.ts';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/);
const timestamp = z.string().datetime({ offset: true });
const applicability = z.object({
  projectCode: z.string().min(1), roleIds: z.array(id).default([]),
  categories: z.array(z.string().min(1)).default([]), saCodes: z.array(z.string().min(1)).default([]),
  activityIds: z.array(id).optional(), deliverableTypes: z.array(z.string().min(1)).optional(),
}).strict();
const base = {
  criterionId: id, version: z.number().int().positive(), statement: z.string().min(12).max(4000),
  applicability, mandatory: z.boolean(), missingEvidencePolicy: z.enum(['unknown', 'warning', 'fail']),
  provenance: z.object({ documentId: id, anchor: z.string().min(1), sourceVersion: z.string().min(1) }).strict(),
  validFrom: timestamp, validTo: timestamp.optional(), approvedBy: z.string().min(1),
};
const coverage = z.enum(['project', 'subactivity', 'job_description']);
export const executableCriterionSchema = z.discriminatedUnion('operator', [
  z.object({ ...base, operator: z.literal('semantic_evidence'), parameters: z.object({
    coverage, requiredTerms: z.array(z.string().min(3)).min(1).max(20),
  }).strict() }).strict(),
  z.object({ ...base, operator: z.literal('semantic_evidence_v3'), parameters: z.object({
    coverage, requiredTerms: z.array(z.string().min(3)).max(20), literalTermsRequired: z.boolean(),
  }).strict() }).strict(),
  z.object({ ...base, operator: z.literal('text_contains_all'), parameters: z.object({ terms: z.array(z.string().min(2)).min(1).max(30) }).strict() }).strict(),
  z.object({ ...base, operator: z.literal('field_equals'), parameters: z.object({ field: z.enum(['saCode', 'category', 'roleId', 'projectCode']), value: z.string().min(1) }).strict() }).strict(),
  z.object({ ...base, operator: z.literal('minimum_documents'), parameters: z.object({ count: z.number().int().min(1).max(8) }).strict() }).strict(),
]);
export const executableRulesetSchema = z.object({
  schemaVersion: z.enum(['eligibility-rules-v2', 'eligibility-rules-v3']), projectCode: z.string().min(1),
  validFrom: timestamp, validTo: timestamp.optional(),
  criteria: z.array(executableCriterionSchema).min(1).max(40),
  unresolvedConflicts: z.array(z.string()).max(0).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.schemaVersion === 'eligibility-rules-v2' && value.criteria.some((rule) => rule.operator === 'semantic_evidence_v3'
    || rule.applicability.activityIds || rule.applicability.deliverableTypes)) ctx.addIssue({ code: 'custom', message: 'Noile politici necesita eligibility-rules-v3.' });
  const ids = new Set<string>();
  const start = Date.parse(value.validFrom), end = value.validTo ? Date.parse(value.validTo) : Infinity;
  if (end <= start) ctx.addIssue({ code: 'custom', message: 'Perioada ruleset-ului este invalida.' });
  value.criteria.forEach((rule, index) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', path: ['criteria', index], message });
    if (ids.has(rule.criterionId)) error('Criteriu duplicat.');
    ids.add(rule.criterionId);
    if (rule.applicability.projectCode !== value.projectCode) error('Proiectul criteriului difera de proiectul ruleset-ului.');
    if (Date.parse(rule.validFrom) < start || Date.parse(rule.validFrom) >= end || (rule.validTo && Date.parse(rule.validTo) > end)
      || (rule.validTo && Date.parse(rule.validTo) <= Date.parse(rule.validFrom))) error('Perioada criteriului este invalida.');
    if (!(rule.operator in ELIGIBILITY_OPERATOR_HANDLERS)) error('Operator fara handler executabil.');
    if (rule.operator === 'field_equals') {
      const intersects = (a: string[], b: string[]) => !a.length || !b.length || a.some((item) => b.includes(item));
      const conflict = value.criteria.slice(0, index).some((previous) => previous.operator === 'field_equals'
        && previous.parameters.field === rule.parameters.field && previous.parameters.value !== rule.parameters.value
        && intersects(previous.applicability.roleIds.map((roleId) => canonicalRoleId({ roleId })), rule.applicability.roleIds.map((roleId) => canonicalRoleId({ roleId })))
        && intersects(previous.applicability.categories.map(normalizePeoCategory), rule.applicability.categories.map(normalizePeoCategory))
        && intersects(previous.applicability.saCodes.map(normalizeEligibilityScope), rule.applicability.saCodes.map(normalizeEligibilityScope))
        && intersects(previous.applicability.activityIds || [], rule.applicability.activityIds || [])
        && intersects(previous.applicability.deliverableTypes || [], rule.applicability.deliverableTypes || [])
        && Date.parse(previous.validFrom) < (rule.validTo ? Date.parse(rule.validTo) : Infinity)
        && Date.parse(rule.validFrom) < (previous.validTo ? Date.parse(previous.validTo) : Infinity));
      if (conflict) error('Reguli contradictorii pentru acelasi camp si context.');
    }
  });
});

export type ExecutableCriterion = z.infer<typeof executableCriterionSchema>;
export type ExecutableRuleset = z.infer<typeof executableRulesetSchema>;
export type CriterionStatus = 'pass' | 'warning' | 'fail' | 'unknown' | 'not_applicable';
export type CriterionFinding = {
  criterionId: string; status: CriterionStatus; explanation: string; evidenceIds: string[];
  provenance?: { documentId: string; anchor: string; sourceVersion: string };
  sourceQuotes?: Array<{ chunkId: string; quote: string }>;
  documentQuotes?: Array<{ documentId: string; quote: string }>;
};
export const criterionAiFindingSchema = z.object({
  criterionId: id, status: z.enum(['pass', 'warning', 'fail', 'unknown', 'not_applicable']), explanation: z.string(),
  sourceQuotes: z.array(z.object({ chunkId: z.string(), quote: z.string() })),
  documentQuotes: z.array(z.object({ documentId: z.string(), quote: z.string() })),
}).strict();
export type CriterionAiFinding = z.infer<typeof criterionAiFindingSchema>;
export type RuleEvidence = {
  projectCode: string; roleId: string; category: string; saCode: string; at: string;
  activityId?: string; deliverableTypes?: string[];
  documents: Array<{ id: string; extractedText: string; analysisComplete: boolean; consultedTexts?: string[] }>;
  sources: Array<{ documentId: string; chunkId: string; coverage: string; text: string; extractionComplete?: boolean; documentVersionId?: string }>;
  aiFindings: CriterionAiFinding[];
};

export function parseExecutableRuleset(raw: unknown) {
  return executableRulesetSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

export function criterionApplies(rule: ExecutableCriterion, context: Pick<RuleEvidence, 'projectCode' | 'roleId' | 'category' | 'saCode' | 'at' | 'activityId' | 'deliverableTypes'>) {
  const a = rule.applicability;
  return a.projectCode === context.projectCode && Date.parse(context.at) >= Date.parse(rule.validFrom)
    && (!rule.validTo || Date.parse(context.at) < Date.parse(rule.validTo))
    && (!a.roleIds.length || a.roleIds.some((roleId) => canonicalRoleId({ roleId }) === context.roleId))
    && (!a.categories.length || a.categories.some((category) => normalizePeoCategory(category) === normalizePeoCategory(context.category)))
    && (!a.saCodes.length || a.saCodes.some((sa) => normalizeEligibilityScope(sa) === normalizeEligibilityScope(context.saCode)))
    && (!a.activityIds?.length || Boolean(context.activityId && a.activityIds.includes(context.activityId)))
    && (!a.deliverableTypes?.length || Boolean(context.deliverableTypes?.some((type) => a.deliverableTypes!.includes(type))));
}

type Handler = (rule: ExecutableCriterion, evidence: RuleEvidence) => Omit<CriterionFinding, 'criterionId'>;
const finding = (status: CriterionStatus, explanation: string, evidenceIds: string[] = []) => ({ status, explanation, evidenceIds });
const contains = (text: string, quote: string) => quote.trim().length >= 12 && normalizeEligibilityScope(text).includes(normalizeEligibilityScope(quote));
export const ELIGIBILITY_OPERATOR_HANDLERS: Record<ExecutableCriterion['operator'], Handler> = {
  semantic_evidence(rule, evidence) {
    if (rule.operator !== 'semantic_evidence' && rule.operator !== 'semantic_evidence_v3') throw new Error('Handler incompatibil.');
    const answers = evidence.aiFindings.filter((item) => item.criterionId === rule.criterionId);
    if (answers.length !== 1) return finding('unknown', 'Lipseste o constatare unica pentru criteriu.');
    const answer = answers[0];
    const validSources = answer.sourceQuotes.filter((quote) => evidence.sources.some((source) =>
      source.chunkId === quote.chunkId && source.documentId === rule.provenance.documentId
      && source.coverage === rule.parameters.coverage && source.documentVersionId === rule.provenance.sourceVersion
      && source.chunkId === rule.provenance.anchor && source.extractionComplete === true && contains(source.text, quote.quote)));
    const validDocuments = answer.documentQuotes.filter((quote) => evidence.documents.some((document) => document.id === quote.documentId
      && (document.consultedTexts || [document.extractedText]).some((text) => contains(text, quote.quote))));
    const relevant = rule.operator === 'semantic_evidence_v3' && !rule.parameters.literalTermsRequired || rule.parameters.requiredTerms.every((term) =>
      normalizeEligibilityScope(validSources.map((item) => item.quote).join(' ')).includes(normalizeEligibilityScope(term))
      && normalizeEligibilityScope(validDocuments.map((item) => item.quote).join(' ')).includes(normalizeEligibilityScope(term)));
    if (!validSources.length || !validDocuments.length || validSources.length !== answer.sourceQuotes.length
      || validDocuments.length !== answer.documentQuotes.length || !relevant || answer.explanation.trim().length < 20) {
      return finding(rule.missingEvidencePolicy, 'Dovezile nu confirma sursa, ancora, versiunea si relevanta pentru acest criteriu.');
    }
    if (answer.status === 'not_applicable') return finding('unknown', 'Aplicabilitatea este stabilita de server.');
    return { ...finding(answer.status, answer.explanation, validSources.map((item) => item.chunkId)),
      sourceQuotes: validSources, documentQuotes: validDocuments };
  },
  semantic_evidence_v3(rule, evidence) { return ELIGIBILITY_OPERATOR_HANDLERS.semantic_evidence(rule, evidence); },
  text_contains_all(rule, evidence) {
    if (rule.operator !== 'text_contains_all') throw new Error('Handler incompatibil.');
    const text = normalizeEligibilityScope(evidence.documents.map((item) => item.extractedText).join('\n'));
    const missing = rule.parameters.terms.filter((term) => !text.includes(normalizeEligibilityScope(term)));
    return missing.length ? finding(evidence.documents.every((item) => item.analysisComplete) ? rule.missingEvidencePolicy : 'unknown', `Elemente nedovedite: ${missing.join(', ')}`)
      : finding('pass', 'Toate elementele textuale cerute sunt prezente.', evidence.documents.map((item) => item.id));
  },
  field_equals(rule, evidence) {
    if (rule.operator !== 'field_equals') throw new Error('Handler incompatibil.');
    return normalizeEligibilityScope(evidence[rule.parameters.field]) === normalizeEligibilityScope(rule.parameters.value)
      ? finding('pass', 'Valoarea contextului verificat corespunde regulii.') : finding('fail', 'Valoarea contextului verificat nu corespunde regulii.');
  },
  minimum_documents(rule, evidence) {
    if (rule.operator !== 'minimum_documents') throw new Error('Handler incompatibil.');
    return evidence.documents.length >= rule.parameters.count ? finding('pass', 'Numarul minim de documente este indeplinit.') : finding(rule.missingEvidencePolicy, 'Numar insuficient de documente.');
  },
};

export function executeEligibilityRules(rules: ExecutableCriterion[], evidence: RuleEvidence): CriterionFinding[] {
  return rules.map((rule) => {
    if (!criterionApplies(rule, evidence)) return { criterionId: rule.criterionId, provenance: rule.provenance, ...finding('not_applicable', 'Criteriul nu se aplica acestui context/perioade.') };
    const source = evidence.sources.find((item) => item.documentId === rule.provenance.documentId && item.chunkId === rule.provenance.anchor
      && item.documentVersionId === rule.provenance.sourceVersion && item.extractionComplete === true);
    if (!source) return { criterionId: rule.criterionId, provenance: rule.provenance, ...finding('unknown', 'Sursa normativa publicata pentru criteriu nu poate fi confirmata.') };
    let result = ELIGIBILITY_OPERATOR_HANDLERS[rule.operator](rule, evidence);
    if (result.status === 'fail' && rule.operator.startsWith('semantic_evidence') && evidence.documents.some((doc) => !doc.analysisComplete)) {
      result = finding('unknown', 'Analiza incompleta nu permite confirmarea unei lipse documentare.');
    }
    if (result.status === 'pass' && rule.mandatory && evidence.documents.some((doc) => !doc.analysisComplete)) {
      result = finding('unknown', 'Documentul nu a fost analizat integral; criteriul obligatoriu necesita clarificare.');
    }
    return { criterionId: rule.criterionId, provenance: rule.provenance, ...result };
  });
}

/** Historic published snapshots remain selectable; drafts and future publications never apply. */
export function selectTemporalRuleset(rows: AiEligibilityRuleset[], projectCode: string, at: string, knownAt = at) {
  const instant = Date.parse(at);
  if (!Number.isFinite(instant)) throw new Error('Data evaluarii este invalida.');
  const candidates = rows.filter((row) => ['active', 'archived'].includes(row.status) && row.publishedAt
    && Date.parse(row.publishedAt) <= Date.parse(knownAt)).flatMap((row) => {
    const rules = parseExecutableRuleset(row.rulesJson);
    return rules.projectCode === projectCode && Date.parse(rules.validFrom) <= instant
      && (!rules.validTo || Date.parse(rules.validTo) > instant) ? [{ row, rules }] : [];
  }).sort((a, b) => b.row.version - a.row.version);
  if (candidates.length > 1 && candidates[0].row.version === candidates[1].row.version) throw new Error('Versiuni de reguli in conflict.');
  return candidates[0] || null;
}
