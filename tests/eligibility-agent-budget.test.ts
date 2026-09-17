import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { EligibilityExecutionBudget, eligibilityExecutionLimits } from '../lib/eligibility-execution.ts';
import * as execution from '../lib/eligibility-execution.ts';
import { EligibilityCoverage } from '../lib/eligibility-coverage.ts';
import { EligibilityAccessError } from '../lib/eligibility-authorization.ts';
import * as usage from '../lib/ai-usage.ts';
import * as tools from '../lib/agents/eligibility-tools.ts';
import type { EligibilityAssessmentInput } from '../lib/eligibility-assessment.ts';

type StepOptions = { prepareStep: (input: { messages: unknown[] }) => unknown;
  onStepFinish: (input: { usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void;
  tools: ReturnType<typeof tools.createEligibilityTools> };
function agent(generate: (options: StepOptions) => Promise<{ output: unknown }>) {
  const source = readFileSync(new URL('../lib/agents/eligibility-agent.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const dependencies: Record<string, unknown> = {
    'server-only': {}, ai: { Output: { object: () => ({}) }, stepCountIs: () => () => false },
    '../ai-governance.ts': { governedGenerateText: generate, estimateCostUsd: (_model: string, value: { totalTokens: number }) => value.totalTokens / 1_000_000 },
    '../ai-usage.ts': usage, '../openai.ts': { openaiModel: () => 'test', getEligibilityModelName: () => 'test' },
    '../eligibility-assessment.ts': { buildEligibilityAssessmentPrompt: () => ({ system: 'Reguli', prompt: 'Date' }),
      eligibilityAssessmentResponseSchema: { parse: (value: unknown) => value } },
    './eligibility-tools.ts': tools,
    '../eligibility-execution.ts': execution,
  };
  const exports = {};
  new Function('require', 'exports', js)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports as typeof import('../lib/agents/eligibility-agent.ts');
}
function options(budget: EligibilityExecutionBudget, authorize = async () => {}) {
  return { budget, authorize, runId: 'test', actorId: 'actor', signal: new AbortController().signal,
    input: { candidates: [] } as unknown as EligibilityAssessmentInput,
    context: { promptContext: '', sources: [], missingRequiredSources: [], warnings: [], coverage: { project: false, subactivity: false, job_description: false } },
    coverage: new EligibilityCoverage([{ id: 'doc', text: 'Continut', version: 'v1', extractionComplete: true }]), chunks: [], trace: [] };
}

test('the next step fits the existing token budget instead of charging each character as a token', async () => {
  const budget = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  budget.modelCalls = 2;
  budget.record(38033, 0.00582015, 37777, 256);
  const messages = [{ role: 'user', content: 'Document si context '.repeat(4400) }];
  assert.ok(budget.totalTokens + JSON.stringify(messages).length + 12000 > budget.limits.totalTokens);
  const api = agent(async (step) => { step.prepareStep({ messages }); return { output: { complete: true } }; });
  await api.runEligibilityAgent(options(budget));
  assert.equal(budget.modelCalls, 3);
  assert.ok(budget.totalTokens + budget.lastModelEstimate!.tokens < 120000);
  assert.equal(budget.limits.totalTokens, 120000);
  assert.ok(api.estimateEligibilityInputTokens([{ text: 'ș'.repeat(5000) }], '') > api.estimateEligibilityInputTokens([{ text: 's'.repeat(5000) }], ''));
});

test('a real token overflow is stopped before another model call and records the attempted estimate', async () => {
  const budget = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  budget.record(115000, 0.01);
  const api = agent(async (step) => { step.prepareStep({ messages: [{ role: 'user', content: 'Date' }] }); return { output: {} }; });
  await assert.rejects(api.runEligibilityAgent(options(budget)), /115000 consumate.*plafon 120000/);
  assert.equal(budget.modelCalls, 0);
  assert.ok(budget.snapshot().lastModelEstimate!.tokens > 5000);
});

test('failed authorization surfaces its original cause before the SDK can ask the model to retry', async () => {
  const budget = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  const denied = new EligibilityAccessError('Acces revocat.');
  const api = agent(async (step) => {
    step.prepareStep({ messages: [] });
    // Model SDKs turn tool exceptions into tool results; the next step must still stop.
    await assert.rejects(async () => step.tools.listRelatedDeliverables.execute!({}, { toolCallId: 'test', messages: [] }), (error) => error === denied);
    step.prepareStep({ messages: [] });
    assert.fail('No second model call after denied authorization');
  });
  const input = options(budget, async () => { throw denied; });
  await assert.rejects(api.runEligibilityAgent(input), (error) => error === denied);
  assert.equal(budget.modelCalls, 1);
  assert.deepEqual(input.trace.map((entry: tools.EligibilityToolTrace) => ({ phase: entry.phase, code: entry.errorCode })),
    [{ phase: 'authorization', code: 'ELIGIBILITY_ACCESS_DENIED' }]);
});

test('budget messages identify call limits, missing usage and cost independently', () => {
  const exhaustedCalls = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  exhaustedCalls.modelCalls = 5;
  assert.throws(() => exhaustedCalls.model(1, 0), /apeluri AI.*5\/5/);
  const missingUsage = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  missingUsage.record(0, 0);
  assert.throws(() => missingUsage.model(1, 0), /nu a fost raportat complet/);
  const costs = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  costs.record(10, 0.95);
  assert.throws(() => costs.model(1, 0.1), /Limita de cost.*plafon 1 USD/);
});

test('the model deadline returns promptly even when the provider ignores cancellation, without accepting late output or usage', async () => {
  const budget = new EligibilityExecutionBudget(eligibilityExecutionLimits({}));
  const controller = new AbortController();
  let finishProvider!: (value: { output: unknown }) => void;
  let providerStep!: StepOptions;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const api = agent(async (step) => {
    providerStep = step;
    step.prepareStep({ messages: [] });
    markStarted();
    return new Promise((resolve) => { finishProvider = resolve; });
  });
  const runOptions = { ...options(budget), signal: controller.signal };
  const pending = api.runEligibilityAgent(runOptions);
  await started;
  const timeout = new DOMException('Deadline reached', 'TimeoutError');
  controller.abort(timeout);
  await assert.rejects(pending, (error) => error === timeout);
  assert.equal(budget.usageComplete, false);
  providerStep.onStepFinish({ usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } });
  finishProvider({ output: { complete: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(budget.totalTokens, 0);
  assert.equal(budget.usageComplete, false);
  assert.throws(() => providerStep.prepareStep({ messages: [] }), (error) => error === timeout);
  await assert.rejects(async () => providerStep.tools.readDeliverable.execute!({ documentId: 'doc', start: 0, end: 3 },
    { toolCallId: 'late', messages: [] }), (error) => error === timeout);
  assert.equal(runOptions.coverage.snapshot()[0].consultedChars, 0);
});
