import test from 'node:test';
import assert from 'node:assert/strict';
import { EligibilityCoverage, mergeEvidenceIntervals } from '../lib/eligibility-coverage.ts';
import { EligibilityExecutionBudget, resolveEligibilityPeriod, eligibilityExecutionLimits, abortableEligibilityRead } from '../lib/eligibility-execution.ts';
import { createEligibilityTools } from '../lib/agents/eligibility-tools.ts';
import { aggregateGenerationUsage } from '../lib/ai-usage.ts';
import type { EligibilityContextResult } from '../lib/rag/eligibility-context.ts';
import type { KnowledgeChunk, Deliverable } from '../lib/types.ts';
import { eligibilityActivityManifest } from '../lib/eligibility-binding.ts';
import { parseExecutableRuleset, executeEligibilityRules, criterionApplies, type RuleEvidence } from '../lib/eligibility-rules.ts';
import { buildEvidencePlan, eligibilityResultPresentation } from '../lib/eligibility-evaluation.ts';

test('overlapping reads count once, unseen gaps stay incomplete, extraction failure cannot be hidden', () => {
  assert.deepEqual(mergeEvidenceIntervals([{ start: 4, end: 12 }, { start: 0, end: 6 }, { start: 20, end: 30 }], 25), [{ start: 0, end: 12 }, { start: 20, end: 25 }]);
  const ledger = new EligibilityCoverage([{ id: 'd', version: 'v1', text: 'x'.repeat(40_000), extractionComplete: true },
    { id: 'partial', version: 'v2', text: 'abc', extractionComplete: false }]);
  ledger.read('d', 0, 18_000); ledger.read('d', 17_000, 30_000);
  assert.equal(ledger.snapshot()[0].consultedChars, 30_000);
  assert.equal(ledger.snapshot()[0].analysisComplete, false);
  ledger.read('d', 30_000, 40_000);
  assert.equal(ledger.snapshot()[0].analysisComplete, true);
  ledger.read('partial', 0, 3);
  assert.equal(ledger.snapshot()[1].analysisComplete, false);
  assert.throws(() => ledger.read('foreign', 0, 1), /FORBIDDEN/);
  assert.throws(() => ledger.read('d', -1, 2), /INVALID/);
});

test('real tool reads reach evidence past initial context and reauthorize cached requests', async () => {
  const text = 'x'.repeat(20_000) + 'Dovada contributiei individuale verificabile.';
  const ledger = new EligibilityCoverage([{ id: 'd', version: 'hash1', text, extractionComplete: true }]);
  ledger.read('d', 0, 18_000);
  const context: EligibilityContextResult = { promptContext: '', sources: [], coverage: { project: false, subactivity: false, job_description: false }, missingRequiredSources: [], warnings: [] };
  let authorized = true; let authCalls = 0;
  const tools = createEligibilityTools({ coverage: ledger, context, budget: new EligibilityExecutionBudget(eligibilityExecutionLimits()), chunks: [], candidates: [], trace: [],
    authorize: async () => { authCalls++; if (!authorized) throw new Error('access revoked'); } });
  const call = { toolCallId: 'test', messages: [] };
  const args = { documentId: 'd', start: 18_000, end: text.length };
  const before = await tools.listRelatedDeliverables.execute!({}, call);
  assert.ok('documents' in before); assert.equal(before.documents[0].analysisComplete, false);
  const result = await tools.readDeliverable.execute!(args, call);
  assert.ok('status' in result); assert.equal(result.status, 'success');
  assert.ok('text' in result && result.text.includes('contributiei'));
  assert.equal(ledger.snapshot()[0].analysisComplete, true);
  const after = await tools.listRelatedDeliverables.execute!({}, call);
  assert.ok('documents' in after); assert.equal(after.documents[0].analysisComplete, true);
  authorized = false;
  await assert.rejects(async () => tools.readDeliverable.execute!(args, call), /access revoked/);
  assert.equal(authCalls, 4);
});

test('search discovers new published chunks; wrong versions cannot enter normative evidence', async () => {
  const context: EligibilityContextResult = { promptContext: '', sources: [], coverage: { project: true, subactivity: true, job_description: true }, missingRequiredSources: [], warnings: [] };
  const chunk = { id: 'anchor', documentId: 'official', documentVersionId: 'v1', sourceType: 'fisa_post',
    extractionComplete: true, text: 'Cerintele de redactare pentru consultare.', status: 'active' } as KnowledgeChunk;
  const tools = createEligibilityTools({ coverage: new EligibilityCoverage([]), context, budget: new EligibilityExecutionBudget(eligibilityExecutionLimits()),
    chunks: [chunk], candidates: [], trace: [], authorize: async () => {} });
  const call = { toolCallId: 'test', messages: [] };
  const results = await tools.searchProjectEvidence.execute!({ query: 'consultare' }, call);
  assert.ok('results' in results); assert.equal(results.results[0].chunkId, 'anchor');
  assert.equal(context.sources.length, 0);
  const wrong = await tools.readReferenceDocument.execute!({ chunkId: 'anchor', version: 'v2' }, call);
  assert.ok('status' in wrong); assert.equal(wrong.status, 'version_unavailable');
  assert.equal(context.sources.length, 0);
  await tools.readReferenceDocument.execute!({ chunkId: 'anchor', version: 'v1' }, call);
  assert.equal(context.sources[0].text, chunk.text);
  assert.equal(context.coverage.job_description, true);
  assert.equal(context.missingRequiredSources.includes('job_description'), false);
});

test('cumulative budgets stop additional tools/model calls including finalization', () => {
  const budget = new EligibilityExecutionBudget({ modelCalls: 2, toolCalls: 1, totalTokens: 100, timeoutMs: 1000, costUsd: 1 });
  budget.tool(); assert.throws(() => budget.tool(), /Limita/);
  budget.model(40, 0.2); budget.record(40, 0.2);
  budget.model(40, 0.2); budget.record(40, 0.2);
  assert.throws(() => budget.model(1, 0), /Bugetul/);
  const costs = new EligibilityExecutionBudget({ modelCalls: 5, toolCalls: 3, totalTokens: 100, timeoutMs: 1000, costUsd: 1 });
  costs.record(10, 0.9); assert.throws(() => costs.model(10, 0.2), /Bugetul/);
});

test('invalid model read arguments return authorized bounds without inventing coverage or repeating opaque errors', async () => {
  const coverage = new EligibilityCoverage([{ id: 'doc', text: 'Original', version: 'v1', extractionComplete: true }]);
  let authCalls = 0;
  const tools = createEligibilityTools({ coverage, budget: new EligibilityExecutionBudget(eligibilityExecutionLimits()),
    context: { promptContext: '', sources: [], missingRequiredSources: [], warnings: [], coverage: { project: false, subactivity: false, job_description: false } },
    chunks: [], candidates: [], trace: [], authorize: async () => { authCalls++; } });
  const call = { toolCallId: 'test', messages: [] };
  const missing = await tools.readDeliverable.execute!({ documentId: 'invented', start: 0, end: 5 }, call);
  assert.deepEqual(missing, { status: 'unavailable', documentIds: ['doc'] });
  for (const [start, end] of [[8, 12], [3, 3], [4, 2], [0, 18001]]) {
    const result = await tools.readDeliverable.execute!({ documentId: 'doc', start, end }, call);
    assert.ok('status' in result && result.status === 'invalid_range');
    assert.ok('totalChars' in result && result.totalChars === 8);
  }
  assert.equal(coverage.snapshot()[0].consultedChars, 0);
  assert.equal(authCalls, 5);
});

test('time policy preserves deployed default and explicitly validates historical activity dates', () => {
  const now = '2026-09-17T12:00:00.000Z';
  assert.equal(resolveEligibilityPeriod({ activityDates: ['2025-02-01'] }, now).rulesEffectiveAt, now);
  assert.equal(resolveEligibilityPeriod({ activityDates: ['2025-02-01'], month: 1, year: 2025 }, now, 'activity_date').rulesEffectiveAt, '2025-02-01T12:00:00.000Z');
  assert.throws(() => resolveEligibilityPeriod({}, now, 'activity_date'), /Selecteaza/);
  assert.throws(() => resolveEligibilityPeriod({ activityDates: ['2025-02-30'] }, now), /valide/);
  assert.throws(() => resolveEligibilityPeriod({ activityDates: ['2025-02-01'], month: 3 }, now), /perioadei/);
});

test('eligibility accepts the zero-based reporting calendar month for every month, including April', () => {
  const now = '2026-09-17T12:00:00.000Z';
  for (let month = 0; month < 12; month++) {
    const date = `2026-${String(month + 1).padStart(2, '0')}-15`;
    for (const policy of ['evaluation_time', 'activity_date']) {
      const period = resolveEligibilityPeriod({ activityDates: [date, date], month, year: 2026 }, now, policy);
      assert.deepEqual(period.activityDates, [date]);
      assert.equal(period.rulesEffectiveAt, policy === 'activity_date' ? `${date}T12:00:00.000Z` : now);
    }
  }
  assert.deepEqual(resolveEligibilityPeriod({ activityDates: ['2026-04-01', '2026-04-30'], month: '3', year: '2026' }, now).activityDates,
    ['2026-04-01', '2026-04-30']);
});

test('eligibility rejects actual period mismatches, including January, and identifies conflicting dates', () => {
  const now = '2026-09-17T12:00:00.000Z';
  for (const input of [
    { activityDates: ['2026-02-01'], month: 0, year: 2026 },
    { activityDates: ['2026-04-30', '2026-05-01'], month: 3, year: 2026 },
    { activityDates: ['2025-12-31'], month: 11, year: 2026 },
  ]) {
    assert.throws(() => resolveEligibilityPeriod(input, now), (error: Error & { code?: string }) => {
      assert.equal(error.code, 'ELIGIBILITY_PERIOD_INVALID');
      assert.ok(error.message.includes(input.activityDates.at(-1)!));
      assert.match(error.message, /Corecteaza zilele selectate/);
      return true;
    });
  }
  for (const month of [-1, 12, 3.5, '', 'aprilie', false, []]) {
    assert.throws(() => resolveEligibilityPeriod({ month, year: 2026 }, now), /Luna sau anul/);
  }
  for (const year of [0, -1, 2026.5, '', 'invalid', false]) {
    assert.throws(() => resolveEligibilityPeriod({ month: 0, year }, now), /Luna sau anul/);
  }
});

test('an expired authorization read stops the tool before late data can be consumed', async () => {
  const controller = new AbortController();
  let finishRead!: (value: string) => void;
  let consumed = false;
  const waiting = abortableEligibilityRead(controller.signal, () => new Promise<string>((resolve) => { finishRead = resolve; }))
    .then(() => { consumed = true; });
  await Promise.resolve();
  const timeout = new DOMException('Deadline reached', 'TimeoutError');
  controller.abort(timeout);
  await assert.rejects(waiting, (error) => error === timeout);
  finishRead('late document');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(consumed, false);
  await assert.rejects(abortableEligibilityRead(controller.signal, async () => { assert.fail('Expired read must not start'); }), (error) => error === timeout);
  assert.equal(await abortableEligibilityRead(new AbortController().signal, async () => 'ready'), 'ready');
  await assert.rejects(abortableEligibilityRead(new AbortController().signal, async () => { throw new Error('access revoked'); }), /access revoked/);
});

test('SDK aggregate usage is used once, including all calls rather than the last call only', () => {
  assert.deepEqual(aggregateGenerationUsage({ usage: { inputTokens: 10, outputTokens: 3 }, totalUsage: { inputTokens: 110, outputTokens: 33, totalTokens: 143 } }),
    { inputTokens: 110, outputTokens: 33, totalTokens: 143 });
  assert.deepEqual(aggregateGenerationUsage({ usage: { inputTokens: 10, outputTokens: 3 } }), { inputTokens: 10, outputTokens: 3, totalTokens: 13 });
});

test('saved activity manifests invalidate metadata edits, replacements and additional documents', () => {
  const docs = [{ id: 'a', documentId: 'draft_a', fileHash: 'hash', deliverableType: 'Raport', declaredTitle: 'Titlu' },
    { id: 'b', documentId: 'draft_b', fileHash: 'other' }] as Deliverable[];
  const original = eligibilityActivityManifest(docs);
  assert.equal(original, eligibilityActivityManifest([...docs].reverse()));
  for (const patch of [{ declaredTitle: 'Modificat' }, { deliverableType: 'Anexa' }, { fileHash: 'replaced' }, { documentId: 'draft_other' }]) {
    assert.notEqual(original, eligibilityActivityManifest([{ ...docs[0], ...patch }, docs[1]]));
  }
  assert.notEqual(original, eligibilityActivityManifest([...docs, { id: 'new' } as Deliverable]));
});

const semanticRules = () => parseExecutableRuleset({ schemaVersion: 'eligibility-rules-v3', projectCode: 'project', validFrom: '2025-01-01T00:00:00Z',
  criteria: [{ criterionId: 'contribution', version: 1, statement: 'Documentul trebuie sa demonstreze contributia individuala.',
    applicability: { projectCode: 'project', activityIds: ['activity'], deliverableTypes: ['Raport'] }, mandatory: true,
    missingEvidencePolicy: 'unknown', provenance: { documentId: 'source', anchor: 'anchor', sourceVersion: 'v1' },
    validFrom: '2025-01-01T00:00:00Z', approvedBy: 'pm', operator: 'semantic_evidence_v3',
    parameters: { coverage: 'job_description', requiredTerms: [], literalTermsRequired: false } }] });
const semanticEvidence = (): RuleEvidence => ({ projectCode: 'project', roleId: 'expert', category: 'COM', saCode: 'SA1.1', at: '2026-09-17T00:00:00Z',
  activityId: 'activity', deliverableTypes: ['Raport'],
  documents: [{ id: 'd', extractedText: 'Expertul a elaborat analiza atasata.', consultedTexts: ['Expertul a elaborat analiza atasata.'], analysisComplete: true }],
  sources: [{ documentId: 'source', chunkId: 'anchor', documentVersionId: 'v1', coverage: 'job_description', extractionComplete: true,
    text: 'Expertul realizeaza analize documentare.' }],
  aiFindings: [{ criterionId: 'contribution', status: 'pass', explanation: 'Raportul arata contributia concreta a expertului.',
    sourceQuotes: [{ chunkId: 'anchor', quote: 'Expertul realizeaza analize documentare.' }],
    documentQuotes: [{ documentId: 'd', quote: 'Expertul a elaborat analiza atasata.' }] }],
});

test('v3 semantic evidence accepts paraphrases with verified quotes and scopes activity and deliverable type', () => {
  const rules = semanticRules(); const evidence = semanticEvidence();
  assert.equal(executeEligibilityRules(rules.criteria, evidence)[0].status, 'pass');
  assert.equal(criterionApplies(rules.criteria[0], { ...evidence, activityId: 'other' }), false);
  assert.equal(criterionApplies(rules.criteria[0], { ...evidence, deliverableTypes: ['Anexa'] }), false);
  assert.throws(() => parseExecutableRuleset({ ...rules, schemaVersion: 'eligibility-rules-v2' }), /v3/);
});

test('invented, unconsulted and wrong-version quotes cannot support a criterion', () => {
  const rules = semanticRules(); const evidence = semanticEvidence();
  evidence.aiFindings[0].documentQuotes.push({ documentId: 'd', quote: 'Un citat complet inventat de model.' });
  assert.equal(executeEligibilityRules(rules.criteria, evidence)[0].status, 'unknown');
  const unseen = semanticEvidence(); unseen.documents[0].consultedTexts = ['Un alt interval al documentului.'];
  assert.equal(executeEligibilityRules(rules.criteria, unseen)[0].status, 'unknown');
  const changed = semanticEvidence(); changed.sources[0].documentVersionId = 'v2';
  assert.equal(executeEligibilityRules(rules.criteria, changed)[0].status, 'unknown');
  assert.equal(buildEvidencePlan(rules, changed).criteria[0].sourceAvailable, false);
});

test('incomplete extraction or reading cannot produce eligibility or a semantic failure', () => {
  const rules = semanticRules(); const evidence = semanticEvidence();
  evidence.documents[0].analysisComplete = false;
  assert.equal(executeEligibilityRules(rules.criteria, evidence)[0].status, 'unknown');
  evidence.aiFindings[0].status = 'fail';
  assert.equal(executeEligibilityRules(rules.criteria, evidence)[0].status, 'unknown');
  evidence.sources[0].extractionComplete = false;
  assert.equal(buildEvidencePlan(rules, evidence).criteria[0].sourceAvailable, false);
});

test('unknown provider usage stops additional billing and cumulative usage includes both phases', () => {
  const budget = new EligibilityExecutionBudget(eligibilityExecutionLimits());
  budget.record(12, 0.1, 10, 2); budget.record(25, 0.2, 20, 5);
  assert.equal(budget.snapshot().inputTokens, 30); assert.equal(budget.snapshot().outputTokens, 7);
  assert.equal(budget.snapshot().totalTokens, 37);
  budget.record(0, 0);
  assert.equal(budget.snapshot().usageComplete, false);
  assert.throws(() => budget.model(1, 0), /Bugetul/);
});

test('final summary, checks and recommendations follow validated findings after verdict changes', () => {
  const result = eligibilityResultPresentation({ status: 'neconcludent', criterionFindings: [{ criterionId: 'source', status: 'unknown', explanation: 'Sursa nu este confirmata.', evidenceIds: [] }] }, false);
  assert.match(result.summary, /^Rezultat documentar: neconcludent/);
  assert.equal(result.justification, result.summary);
  assert.equal(result.checks[0].status, 'unknown');
  assert.match(result.summary, /nu este completa/);
  assert.match(result.missingElements[0], /Sursa nu este confirmata/);
});
