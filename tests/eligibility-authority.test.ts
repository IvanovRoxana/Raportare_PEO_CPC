import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { peoUsersAsExperts } from '../lib/peo-users.ts';
import { mergeExpertLists } from '../lib/expert-merge.ts';
import { authorizeEligibilityExpert, authorizeEligibilityDocument, normalizeEligibilityExperts } from '../lib/eligibility-authorization.ts';
import { appliesToEligibilityScope, canonicalRoleId } from '../lib/eligibility-scope.ts';
import { buildEvaluationKey, finalizeAuthoritativeCriteria, validatePmDecision, applicableCriteriaSnapshot } from '../lib/eligibility-evaluation.ts';
import { parseExecutableRuleset, executeEligibilityRules, selectTemporalRuleset, type RuleEvidence } from '../lib/eligibility-rules.ts';
import type { Expert } from '../lib/types.ts';

const expert = { id: 'e1', email: 'expert@example.test', name: 'Expert', role: 'expert', positionInProject: 'Coordonator regional',
  projectCode: '302141', category: 'cr', saCodes: ['SA3.4'], isActive: true } as Expert;
const actor = { id: 'cognito-sub', email: expert.email, roles: ['expert'] };
const scope = { projectCode: '302141', expertId: 'e1', roleId: 'coordonator-regional', category: 'cr', saCode: 'SA3.4' };
const rule = { criterionId: 'consultare', version: 1, statement: 'Documentul demonstreaza consultarea membrilor.',
  applicability: { projectCode: '302141', roleIds: [], categories: [], saCodes: [] }, mandatory: true,
  missingEvidencePolicy: 'unknown', provenance: { documentId: 'source', anchor: 'chunk', sourceVersion: 'v1' },
  validFrom: '2026-01-01T00:00:00Z', approvedBy: 'pm', operator: 'semantic_evidence', parameters: { coverage: 'project', requiredTerms: ['consultarea'] } };
const json = { schemaVersion: 'eligibility-rules-v2', projectCode: '302141', validFrom: '2026-01-01T00:00:00Z', criteria: [rule] };
const evidence: RuleEvidence = { ...scope, at: '2026-09-16T00:00:00Z',
  documents: [{ id: 'd1', extractedText: 'Documentul demonstreaza consultarea membrilor.', analysisComplete: true }],
  sources: [{ documentId: 'source', chunkId: 'chunk', coverage: 'project', text: 'Proiectul cere consultarea membrilor.', extractionComplete: true, documentVersionId: 'v1' }],
  aiFindings: [{ criterionId: 'consultare', status: 'pass', explanation: 'Ambele citate confirma consultarea membrilor in acest proiect.',
    sourceQuotes: [{ chunkId: 'chunk', quote: 'Proiectul cere consultarea membrilor.' }],
    documentQuotes: [{ documentId: 'd1', quote: 'Documentul demonstreaza consultarea membrilor.' }] }],
};

test('verified Expert is self scoped and cannot select another expert/project or mutable display name', () => {
  assert.equal(authorizeEligibilityExpert(actor, [expert], 'e1', '302141').expert.id, 'e1');
  assert.throws(() => authorizeEligibilityExpert(actor, [expert, { ...expert, id: 'e2', email: 'other@test' }], 'e2'));
  assert.throws(() => authorizeEligibilityExpert(actor, [expert], 'e1', 'foreign'));
  assert.throws(() => authorizeEligibilityExpert({ id: 'other', roles: ['expert'] }, [expert], 'e1'));
  assert.throws(() => authorizeEligibilityDocument({ expertId: 'e1', projectCode: 'foreign' }, expert));
  assert.throws(() => authorizeEligibilityDocument({ expertId: 'e2', projectCode: '302141' }, expert));
});
test('imported backend experts use the same canonical identity as the dashboard', () => {
  const imported = { ...expert, id: 'expert_imported', email: ' EXPERT@example.test ', projectCode: undefined };
  const profiles = normalizeEligibilityExperts([imported], [expert]);
  assert.equal(authorizeEligibilityExpert(actor, profiles, expert.id, '302141').expert.id, expert.id);
  assert.equal(profiles[0].projectCode, '302141');
  assert.throws(() => authorizeEligibilityExpert({ id: 'another-user', email: 'other@test', roles: ['expert'] }, profiles, expert.id));
  assert.throws(() => authorizeEligibilityExpert(actor, profiles, expert.id, 'other-project'));
});
test('all imported profiles authorize their own dashboard ID and deny other expert accounts', () => {
  const imported = JSON.parse(readFileSync(new URL('../data/import/experts.json', import.meta.url), 'utf8')) as Expert[];
  const references = peoUsersAsExperts();
  const profiles = normalizeEligibilityExperts(imported, references);
  const dashboardProfiles = mergeExpertLists(imported, references).filter((profile) => profile.isActive !== false);
  assert.ok(dashboardProfiles.length > 1);
  for (const profile of dashboardProfiles) {
    assert.ok(profile.email, `Missing identity for ${profile.id}`);
    const session = { id: `session-${profile.id}`, email: profile.email, roles: ['expert'] };
    const resolved = authorizeEligibilityExpert(session, profiles, profile.id, profile.projectCode);
    assert.equal(resolved.expert.id, profile.id);
    assert.equal(resolved.expert.projectCode, profile.projectCode);
    assert.ok(resolved.roleId);
    for (const other of dashboardProfiles.filter((candidate) => candidate.id !== profile.id)) {
      assert.throws(() => authorizeEligibilityExpert(session, profiles, other.id, other.projectCode),
        `${profile.id} must not access ${other.id}`);
    }
  }
});
test('all trusted reference profiles remain accessible to their verified account without a backend row', () => {
  const references = peoUsersAsExperts();
  const profiles = normalizeEligibilityExperts([], references);
  assert.equal(profiles.length, references.length);
  for (const reference of references) {
    const session = { id: `cognito-${reference.id}`, email: reference.email, roles: ['expert'] };
    const resolved = authorizeEligibilityExpert(session, profiles, reference.id, reference.projectCode);
    assert.equal(resolved.expert.id, reference.id);
    assert.deepEqual(resolved.expert.saCodes, reference.saCodes);
    for (const other of references.filter((item) => item.id !== reference.id)) {
      assert.throws(() => authorizeEligibilityExpert(session, profiles, other.id));
    }
    assert.throws(() => authorizeEligibilityExpert({ ...session, email: undefined }, profiles, reference.id));
    assert.throws(() => authorizeEligibilityExpert({ ...session, roles: [] }, profiles, reference.id));
    assert.throws(() => authorizeEligibilityExpert(session, profiles, reference.id, 'foreign'));
    assert.throws(() => authorizeEligibilityExpert(session, profiles, 'unknown-expert'));
  }
});
test('reference normalization preserves backend restrictions and does not revive disabled profiles', () => {
  const inactive = normalizeEligibilityExperts([{ ...expert, id: 'imported', isActive: false }], [expert]);
  assert.equal(inactive.length, 1);
  assert.throws(() => authorizeEligibilityExpert(actor, inactive, expert.id));
  const changed = normalizeEligibilityExperts([{ ...expert, id: 'imported', projectCode: 'other-project', saCodes: ['SA1.1'], positionInProject: 'Updated role' }], [expert]);
  assert.equal(changed[0].projectCode, 'other-project');
  assert.deepEqual(changed[0].saCodes, ['SA1.1']);
  assert.equal(changed[0].positionInProject, 'Updated role');
  assert.throws(() => authorizeEligibilityExpert(actor, changed, expert.id, '302141'));
  const unrelated = { ...expert, id: 'unrelated', email: 'other@test' };
  const profiles = normalizeEligibilityExperts([unrelated], [expert]);
  assert.equal(profiles.find((item) => item.email === unrelated.email)?.id, 'unrelated');
});
test('reference timestamps do not change the normalized expert snapshot between requests', () => {
  const imported = { ...expert, id: 'imported' };
  for (const backend of [[], [imported]]) {
    const first = normalizeEligibilityExperts(backend, [{ ...expert, createdAt: '2026-09-16T10:00:00Z', updatedAt: '2026-09-16T10:00:00Z' }]);
    const second = normalizeEligibilityExperts(backend, [{ ...expert, createdAt: '2026-09-16T10:01:00Z', updatedAt: '2026-09-16T10:01:00Z' }]);
    assert.equal(buildEvaluationKey({ experts: first }), buildEvaluationKey({ experts: second }));
  }
});
test('role templates without expertId require canonical role and project', () => {
  assert.equal(canonicalRoleId({ positionInProject: 'Coordonator centru regional' }), scope.roleId);
  assert.equal(appliesToEligibilityScope({ sourceType: 'fisa_post', projectCode: '302141', roleId: scope.roleId }, scope), true);
  assert.equal(appliesToEligibilityScope({ sourceType: 'fisa_post', projectCode: '302141', roleId: 'other' }, scope), false);
  assert.equal(appliesToEligibilityScope({ sourceType: 'fisa_post', roleId: scope.roleId }, scope), false);
  assert.equal(appliesToEligibilityScope({ sourceType: 'livrabil_istoric', projectCode: 'other' }, scope), false);
});
test('strict registry rejects duplicates, unknown fields/operators, missing provenance and invalid periods', () => {
  for (const bad of [ { ...json, surprise: true }, { ...json, criteria: [rule, rule] },
    { ...json, criteria: [{ ...rule, operator: 'eval' }] }, { ...json, criteria: [{ ...rule, parameters: { coverage: 'project', requiredTerms: ['consultarea'], script: 'evil' } }] },
    { ...json, criteria: [{ ...rule, provenance: { ...rule.provenance, anchor: '' } }] },
    { ...json, validTo: '2025-01-01T00:00:00Z' }, { ...json, unresolvedConflicts: ['conflict'] } ]) {
    assert.throws(() => parseExecutableRuleset(bad));
  }
});
test('exactly one finding per criterion; real irrelevant quotes, duplicate findings, missing evidence and partial sections cannot pass', () => {
  const rules = parseExecutableRuleset(json);
  assert.equal(executeEligibilityRules(rules.criteria, evidence)[0].status, 'pass');
  assert.deepEqual(executeEligibilityRules(rules.criteria, evidence)[0].sourceQuotes, evidence.aiFindings[0].sourceQuotes);
  assert.deepEqual(executeEligibilityRules(rules.criteria, evidence)[0].documentQuotes, evidence.aiFindings[0].documentQuotes);
  assert.deepEqual(executeEligibilityRules(rules.criteria, evidence)[0].provenance, rule.provenance);
  for (const invalid of [ { ...evidence, aiFindings: [] }, { ...evidence, aiFindings: [...evidence.aiFindings, ...evidence.aiFindings] },
    { ...evidence, sources: evidence.sources.map((source) => ({ ...source, documentVersionId: 'v2' })) },
    { ...evidence, documents: evidence.documents.map((doc) => ({ ...doc, analysisComplete: false })) },
    { ...evidence, sources: evidence.sources.map((source) => ({ ...source, text: 'Proiectul are o durata de 36 de luni.' })),
      aiFindings: evidence.aiFindings.map((finding) => ({ ...finding, sourceQuotes: [{ chunkId: 'chunk', quote: 'Proiectul are o durata de 36 de luni.' }] })) } ]) {
    const findings = executeEligibilityRules(rules.criteria, invalid);
    assert.equal(findings.length, 1); assert.equal(findings[0].status, 'unknown');
  }
  assert.equal(executeEligibilityRules(rules.criteria, { ...evidence, projectCode: 'other' })[0].status, 'not_applicable');
  assert.equal(finalizeAuthoritativeCriteria(null, evidence, 'eligibil').status, 'neconcludent');
});
test('registry rejects overlapping contradictory field requirements and criteria outside the ruleset interval', () => {
  const field = { ...rule, operator: 'field_equals', parameters: { field: 'saCode', value: 'SA3.4' } };
  assert.throws(() => parseExecutableRuleset({ ...json, criteria: [field, { ...field, criterionId: 'other', parameters: { field: 'saCode', value: 'SA3.5' } }] }));
  assert.throws(() => parseExecutableRuleset({ ...json, validTo: '2026-06-01T00:00:00Z',
    criteria: [{ ...rule, validFrom: '2026-07-01T00:00:00Z' }] }));
  assert.doesNotThrow(() => parseExecutableRuleset({ ...json, criteria: [
    { ...field, applicability: { ...field.applicability, saCodes: ['SA3.4'] } },
    { ...field, criterionId: 'other', applicability: { ...field.applicability, saCodes: ['SA3.5'] }, parameters: { field: 'saCode', value: 'SA3.5' } },
  ] }));
});
test('versions apply temporally and future publication is never retroactive', () => {
  const rows = [1, 2].map((version) => ({ id: `r${version}`, title: 'Rules', status: 'active', version, rulesJson: json,
    publishedAt: version === 1 ? '2026-01-01T00:00:00Z' : '2026-10-01T00:00:00Z' }));
  assert.equal(selectTemporalRuleset(rows, '302141', '2026-09-16T00:00:00Z')?.row.id, 'r1');
  assert.equal(selectTemporalRuleset(rows, 'other', '2026-09-16T00:00:00Z'), null);
  assert.throws(() => selectTemporalRuleset([rows[0], { ...rows[0], id: 'duplicate' }], '302141', '2026-09-16T00:00:00Z'));
});
test('a criterion entering or leaving its validity period invalidates reuse even within the same published version', () => {
  const rules = parseExecutableRuleset({ ...json, criteria: [{ ...rule, validFrom: '2026-09-01T00:00:00Z', validTo: '2026-10-01T00:00:00Z' }] });
  const before = applicableCriteriaSnapshot(rules, { ...evidence, at: '2026-08-31T23:59:59Z' });
  const during = applicableCriteriaSnapshot(rules, evidence);
  const after = applicableCriteriaSnapshot(rules, { ...evidence, at: '2026-10-01T00:00:00Z' });
  assert.equal(before[0].applicable, false); assert.equal(during[0].applicable, true); assert.equal(after[0].applicable, false);
  assert.notEqual(buildEvaluationKey({ rules, applicableCriteria: before }), buildEvaluationKey({ rules, applicableCriteria: during }));
  assert.notEqual(buildEvaluationKey({ rules, applicableCriteria: during }), buildEvaluationKey({ rules, applicableCriteria: after }));
});
test('evaluation key is stable across object order and changes for every dependency', () => {
  const original = { documents: ['h1'], expert: 'e1', project: 'p1', sa: 'SA3.4', catalog: 'c1', rules: 'r1', generation: 'g1', evaluator: 'v1', model: 'model1' };
  const key = buildEvaluationKey(original);
  assert.equal(key, buildEvaluationKey(Object.fromEntries(Object.entries(original).reverse())));
  for (const field of Object.keys(original)) assert.notEqual(key, buildEvaluationKey({ ...original, [field]: 'changed' }));
});
test('PM decisions need justification and an allowed reclassification', () => {
  assert.throws(() => validatePmDecision({ decision: 'confirm', reason: '' }, ['SA3.4']));
  assert.throws(() => validatePmDecision({ decision: 'reclassify', reason: 'Corectie justificata.', replacementSaCode: 'SA3.5', replacementActivityId: 'a' }, ['SA3.4']));
  assert.doesNotThrow(() => validatePmDecision({ decision: 'approve_exception', reason: 'Exceptie aprobata si justificata.' }, ['SA3.4']));
});
