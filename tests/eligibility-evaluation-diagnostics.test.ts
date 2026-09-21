import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as diagnostics from '../lib/eligibility-evaluation-diagnostics.ts';
import { diagnoseEvaluationError, safeEvaluationErrorMetadata, EligibilityEvaluationRequestError, evaluationFailureFromResponse, type EvaluationDiagnosticContext } from '../lib/eligibility-evaluation-diagnostics.ts';
import { EligibilityExecutionError } from '../lib/eligibility-execution.ts';
import { EligibilityAccessError } from '../lib/eligibility-authorization.ts';
import { EligibilityAssessmentInputError } from '../lib/eligibility-assessment.ts';
import { getEligibilityFailureSummary } from '../lib/deliverable-check-state.ts';
import * as coverage from '../lib/eligibility-coverage.ts';
import * as execution from '../lib/eligibility-execution.ts';
import * as evaluation from '../lib/eligibility-evaluation.ts';
import * as rules from '../lib/eligibility-rules.ts';
import * as assessment from '../lib/eligibility-assessment.ts';
import * as jobInput from '../lib/eligibility-job-input.ts';
import * as deliverable from '../lib/deliverable-eligibility.ts';

const context: EvaluationDiagnosticContext = { stage: 'model', requestId: 'request-test', runId: 'elg_test' };
const apiError = (statusCode?: number, code?: string) => Object.assign(new Error('private provider response'), {
  name: 'AI_APICallError', statusCode, data: { error: { code } }, requestBodyValues: { prompt: 'private document' },
  responseHeaders: { 'x-request-id': 'req-provider', authorization: 'private-token' },
});

test('evaluation distinguishes quota from rate limiting, model access, request/schema errors and transport failures', () => {
  const cases = [
    [apiError(429, 'insufficient_quota'), 'AI_QUOTA_EXHAUSTED', 429],
    [apiError(429, 'rate_limit_exceeded'), 'AI_RATE_LIMIT', 429],
    [apiError(401), 'AI_AUTHENTICATION_FAILED', 503],
    [apiError(404, 'model_not_found'), 'AI_MODEL_ACCESS_DENIED', 503],
    [apiError(400, 'context_length_exceeded'), 'AI_CONTEXT_TOO_LARGE', 422],
    [apiError(400, 'invalid_json_schema'), 'AI_RESPONSE_SCHEMA_INVALID', 500],
    [apiError(400), 'AI_REQUEST_REJECTED', 502],
    [apiError(503), 'AI_UNAVAILABLE', 502],
    [apiError(), 'AI_CONNECTION_FAILED', 503],
    [Object.assign(apiError(), { cause: { code: 'ECONNRESET' } }), 'AI_CONNECTION_FAILED', 503],
    [{ name: 'AI_NoObjectGeneratedError' }, 'AI_RESULT_INVALID', 502],
    [{ name: 'AccessDeniedException' }, 'STORAGE_ACCESS_DENIED', 503],
    [{ name: 'ValidationException' }, 'EVALUATION_DATABASE_REJECTED', 503],
    [{ name: 'AbortError' }, 'ELIGIBILITY_TIMEOUT', 504],
    [new Error('ELIGIBILITY_BACKEND_NOT_DEPLOYED:EligibilityRuntime'), 'ELIGIBILITY_BACKEND_NOT_DEPLOYED', 503],
  ] as const;
  for (const [error, code, status] of cases) {
    const failure = diagnoseEvaluationError(error, context);
    assert.equal(failure.code, code);
    assert.equal(failure.status, status);
    assert.equal(failure.requestId, context.requestId);
    assert.equal(failure.runId, context.runId);
  }
});

test('existing access, input and execution errors keep actionable messages and status', () => {
  for (const [error, status] of [
    [new EligibilityExecutionError('ELIGIBILITY_SHARED_BUDGET', 'Bugetul proiectului este atins.', 429), 429],
    [new EligibilityAccessError('Sesiunea a expirat.', 401), 401],
    [new EligibilityAssessmentInputError('Nu exista text lizibil.'), 422],
  ] as const) {
    const failure = diagnoseEvaluationError(error, context);
    assert.equal(failure.error, error.message);
    assert.equal(failure.status, status);
  }
  const catalog = diagnoseEvaluationError(new Error('Sesiunea Cognito nu permite citirea catalogului. Autentifica-te din nou.'), { stage: 'catalog' });
  assert.equal(catalog.code, 'ELIGIBILITY_CATALOG_AUTH');
  assert.equal(catalog.status, 401);
  assert.equal(diagnoseEvaluationError({ name: 'ZodError' }, { stage: 'rules' }).code, 'EVALUATION_DATA_INVALID');
});

test('nested and cyclic failures are bounded and do not expose provider text, document content or credentials', () => {
  const error = Object.assign(new Error('private outer'), { cause: apiError(429, 'insufficient_quota') });
  assert.equal(diagnoseEvaluationError(error, context).code, 'AI_QUOTA_EXHAUSTED');
  const serialized = JSON.stringify({ failure: diagnoseEvaluationError(error, context), metadata: safeEvaluationErrorMetadata(error) });
  assert.doesNotMatch(serialized, /private|prompt|authorization/);
  assert.match(serialized, /req-provider/);
  error.cause = error as typeof error.cause;
  assert.equal(diagnoseEvaluationError(error, context).code, 'ELIGIBILITY_EXECUTION_FAILED');
  assert.equal(safeEvaluationErrorMetadata(error).length, 1);
});

function loadModule(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  new Function('require', 'exports', ...Object.keys(globals), js)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports, ...Object.values(globals));
  return exports;
}

class EligibilityInProgress extends Error {
  runId = 'elg_pending';
}
class AiGovernanceError extends Error {}

test('first accepted request returns 202 and a runId without waiting for AI', async () => {
  const route = loadModule('../app/api/ai/check-deliverable-eligibility/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, 'node:crypto': { randomUUID: () => 'request-test' },
    '@/lib/eligibility-submission': { submitEligibility: async () => ({ runId: 'elg_test', status: 'pending', stage: 'queued' }) },
    '@/lib/eligibility-run-store': { EligibilityInProgress }, '@/lib/ai-governance': { AiGovernanceError },
    '@/lib/openai': { isOpenAIConfigurationError: () => false }, '@/lib/eligibility-evaluation-diagnostics': diagnostics,
  });
  const response = await route.POST(new Request('https://app.test')) as Response;
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { runId: 'elg_test', executionStatus: 'pending', stage: 'queued' });
});

test('evaluation route exposes pre-AI storage stage and correlation ID through the UI formatter', async () => {
  const route = loadModule('../app/api/ai/check-deliverable-eligibility/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    'node:crypto': { randomUUID: () => 'request-test' },
    '@/lib/eligibility-submission': { submitEligibility: async (_req: Request, diagnostic: EvaluationDiagnosticContext) => {
      diagnostic.stage = 'registration';
      throw Object.assign(new Error('private table ARN'), { name: 'AccessDeniedException' });
    } },
    '@/lib/eligibility-run-store': { EligibilityInProgress },
    '@/lib/ai-governance': { AiGovernanceError },
    '@/lib/openai': { isOpenAIConfigurationError: () => false },
    '@/lib/eligibility-evaluation-diagnostics': diagnostics,
  });
  const response = await route.POST(new Request('https://app.test')) as Response;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const payload = await response.json();
  const failure = evaluationFailureFromResponse(payload.diagnostic);
  assert.ok(failure);
  assert.doesNotMatch(JSON.stringify(payload), /private/);
  const summary = getEligibilityFailureSummary(new EligibilityEvaluationRequestError(failure), 'evaluation');
  assert.match(summary, /Eroare la inregistrarea evaluarii/);
  assert.match(summary, /STORAGE_ACCESS_DENIED; referinta: request-test/);
  assert.equal(summary.split('Evaluarea nu a fost finalizata.').length, 2);
});

test('pending executions retain their polling contract instead of turning into errors', async () => {
  const route = loadModule('../app/api/ai/check-deliverable-eligibility/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    'node:crypto': { randomUUID: () => 'request-test' },
    '@/lib/eligibility-submission': { submitEligibility: async () => { throw new EligibilityInProgress(); } },
    '@/lib/eligibility-run-store': { EligibilityInProgress },
    '@/lib/ai-governance': { AiGovernanceError },
    '@/lib/openai': { isOpenAIConfigurationError: () => false },
    '@/lib/eligibility-evaluation-diagnostics': diagnostics,
  });
  const response = await route.POST(new Request('https://app.test')) as Response;
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { runId: 'elg_pending', executionStatus: 'pending', code: 'ELIGIBILITY_IN_PROGRESS' });
});

test('authorized polling returns the persisted diagnostic and respects legacy runs', async () => {
  const failure = diagnoseEvaluationError(apiError(429, 'insufficient_quota'), context);
  for (const storedFailure of [failure, undefined]) {
    const route = loadModule('../app/api/eligibility/runs/[runId]/route.ts', {
      'next/server': { NextResponse: { json: Response.json } },
      '@/lib/eligibility-run-read': { readAuthorizedEligibilityRun: async () => ({
        run: { status: 'failed', errorCode: storedFailure?.code || 'ELIGIBILITY_EXECUTION_FAILED', executionJson: { failure: storedFailure } }, current: false,
      }) },
      '@/lib/eligibility-authorization': { EligibilityAccessError },
      '@/lib/eligibility-server-store': { eligibilityStore: { list: async () => [] } },
    });
    const response = await route.GET(new Request('https://app.test'), { params: Promise.resolve({ runId: 'elg_test' }) }) as Response;
    const payload = await response.json();
    assert.equal(payload.executionStatus, 'failed');
    assert.deepEqual(payload.diagnostic, storedFailure);
  }
});

test('malformed diagnostics are rejected so older server responses can use their existing fallback', () => {
  for (const value of [undefined, null, {}, { stage: '__proto__' }, { ...diagnoseEvaluationError(apiError(), context), action: null }]) {
    assert.equal(evaluationFailureFromResponse(value), null);
  }
});

test('real service identifies failures before the AI call and persists later failures for polling', async () => {
  for (const failedStage of ['context', 'rules', 'registration', 'model'] as const) {
    const records: unknown[][] = [];
    const logs: unknown[][] = [];
    let agentCalls = 0;
    const resolverOptions: Array<{ loadReferenceChunks?: boolean }> = [];
    const failure = failedStage === 'model' ? apiError(429, 'insufficient_quota') : new Error('private failure');
    const at = (stage: string) => { if (stage === failedStage) throw failure; };
    const referenceContext = { sources: [], promptContext: '', missingRequiredSources: [], warnings: [], coverage: { project: false, subactivity: false, job_description: false } };
    const candidates = [{ id: 'activity', category: 'cr', saCode: 'SA3.4', activityName: 'Activitate test', isActive: true }];
    const service = loadModule('../lib/eligibility-service.ts', {
      'server-only': {}, './eligibility-job-input': jobInput, './eligibility-coverage': coverage, './eligibility-execution': execution,
      './eligibility-runtime-store': { reserveEligibilityBudget: async () => async () => {}, releaseEvaluation: async () => {} },
      './agents/eligibility-agent': { runEligibilityAgent: async (options: { authorize: () => Promise<void> }) => {
        agentCalls++;
        await options.authorize();
        await options.authorize();
        at('model');
      } },
      './agents/eligibility-tools': { refreshEligibilitySourceCoverage: () => {} },
      '@/lib/eligibility-server-store': { eligibilityStore: { list: async () => candidates } },
      '@/lib/eligibility-run-read': { verifyEligibilityRunSnapshot: async () => ({ current: true }) },
      '@/lib/eligibility-resolver': { resolveEligibilityContext: async (_req: Request, options: { loadReferenceChunks?: boolean }) => {
        resolverOptions.push(options);
        at('context');
        return { expert: { id: 'expert', projectCode: 'project', category: 'cr', saCodes: ['SA3.4'] }, actor: { id: 'actor' }, roleId: 'cr', parents: [], chunks: [],
          documents: [{ id: 'draft_test', docText: 'private document '.repeat(10), fileHash: 'hash', fileName: 'test.docx', extractionComplete: true }] };
      } },
      '@/lib/eligibility-authorization': { EligibilityAccessError },
      '@/lib/eligibility-evaluation': evaluation, '@/lib/eligibility-rules': rules,
      '@/lib/eligibility-run-store': {
        EligibilityInProgress, findReusableEligibilityRun: async () => null,
        startEligibilityRun: async (input: Record<string, unknown>) => { at('registration'); return { ...input, runId: 'elg_test', id: 'elg_test', status: 'pending' }; },
        failEligibilityRun: async (...args: unknown[]) => { records.push(args); },
      },
      './eligibility-evaluation-diagnostics': diagnostics,
      '@/lib/ai-governance': { assertAllowedAiRequest: () => {} },
      '@/lib/openai': { getEligibilityModelName: () => 'test-model' },
      '@/lib/deliverable-eligibility': deliverable,
      '@/lib/feature-flags': { isDeliverableEligibilityCheckEnabled: () => true },
      '@/lib/ai-eligibility-ruleset-runtime': { getActiveAiEligibilityRuleset: async () => { at('rules'); return null; } },
      '@/lib/rag/cognito-auth': { getCognitoAccessTokenFromRequest: () => 'test-token' },
      '@/lib/rag/eligibility-context': { retrieveEligibilityContext: async () => referenceContext, includeExpertProfileJobDescription: (value: unknown) => value },
      '@/lib/eligibility-catalog-runtime': { loadEligibilityCatalog: async () => ({ candidates, source: 'backend', warnings: [] }) },
      '@/lib/eligibility-catalog': { scopeEligibilityCatalog: (value: unknown) => value },
      '@/lib/eligibility-assessment': assessment,
    }, { console: { error: (...args: unknown[]) => logs.push(args) } });
    const diagnostic: EvaluationDiagnosticContext = { stage: 'request', requestId: 'request-test' };
    await assert.rejects(service.evaluateEligibility(new Request('https://app.test', {
      method: 'POST', body: JSON.stringify({ expertId: 'expert', currentSaCode: 'SA3.4', primaryDeliverableId: 'client-id',
        deliverables: [{ id: 'client-id', serverDocumentId: 'draft_test' }] }),
    }), diagnostic), (error) => error === failure);
    assert.equal(diagnostic.stage, failedStage);
    assert.equal(diagnostic.failure?.stage, failedStage);
    assert.equal(agentCalls, failedStage === 'model' ? 1 : 0);
    assert.deepEqual(resolverOptions.map((options) => options.loadReferenceChunks), failedStage === 'model' ? [undefined, false, false] : [undefined]);
    assert.equal(records.length, failedStage === 'model' ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(logs), /private|test-token/);
    if (failedStage === 'model') {
      assert.equal(diagnostic.failure?.code, 'AI_QUOTA_EXHAUSTED');
      assert.deepEqual((records[0][2] as { failure: unknown }).failure, diagnostic.failure);
      assert.equal(diagnostic.failure?.runId, 'elg_test');
    }
  }
});
