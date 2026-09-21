import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as usage from '../lib/ai-usage.ts';
import { getEligibilityModelName, getActivityAgentModelName, DEFAULT_OPENAI_MODEL } from '../lib/openai.ts';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/ai-governance.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports: Record<string, unknown> = {};
new Function('require', 'exports', js)((id: string) => id === './ai-usage.ts' ? usage
  : id === '@/lib/openai' ? { isOpenAIConfigurationError: () => false } : require(id), exports);
const cost = exports.estimateCostUsd as (model: unknown, usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => number;

test('eligibility defaults to Sol independently of the general model and preserves explicit overrides', () => {
  const previous = process.env.OPENAI_ELIGIBILITY_MODEL;
  try {
    delete process.env.OPENAI_ELIGIBILITY_MODEL;
    assert.equal(getEligibilityModelName(), 'gpt-5.6-sol');
    assert.equal(getActivityAgentModelName(), process.env.OPENAI_ACTIVITY_AGENT_MODEL?.trim() || DEFAULT_OPENAI_MODEL);
    process.env.OPENAI_ELIGIBILITY_MODEL = ' gpt-4o-mini ';
    assert.equal(getEligibilityModelName(), 'gpt-4o-mini');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_ELIGIBILITY_MODEL;
    else process.env.OPENAI_ELIGIBILITY_MODEL = previous;
  }
});

test('Sol budgets use its actual standard rates despite legacy mini price overrides', () => {
  const names = ['AI_MODEL_INPUT_COST_PER_1M_USD', 'AI_MODEL_OUTPUT_COST_PER_1M_USD'];
  const previous = names.map(name => process.env[name]);
  try {
    process.env[names[0]] = '0.15'; process.env[names[1]] = '0.60';
    assert.equal(cost('gpt-5.6-sol', { inputTokens: 100000, outputTokens: 5000, totalTokens: 105000 }), 0.5);
    assert.equal(cost({ modelId: 'gpt-5.6' }, { inputTokens: 300000, outputTokens: 10000, totalTokens: 310000 }), 2.6999999999999997);
    assert.equal(cost('gpt-4o-mini', { inputTokens: 100000, outputTokens: 5000, totalTokens: 105000 }), 0.018);
  } finally {
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
});
