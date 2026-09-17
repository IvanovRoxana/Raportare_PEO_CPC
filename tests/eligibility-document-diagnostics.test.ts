import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import * as diagnostics from '../lib/eligibility-document-diagnostics.ts';
import * as authorization from '../lib/eligibility-authorization.ts';
import { diagnoseDocumentError, EligibilityDocumentRequestError, formatDocumentFailure, documentStages } from '../lib/eligibility-document-diagnostics.ts';
import { getEligibilityFailureSummary, getEligibilityAttemptState, getDisplayEligibilityScore } from '../lib/deliverable-check-state.ts';

test('document failures distinguish infrastructure, credentials, missing originals and timeouts', () => {
  const cases = [
    [new Error('ELIGIBILITY_BACKEND_NOT_DEPLOYED:EligibilityRuntime'), 'BACKEND_NOT_CONFIGURED', 503],
    [{ name: 'AccessDeniedException' }, 'STORAGE_ACCESS_DENIED', 503],
    [{ name: 'CredentialsProviderError' }, 'SERVER_CREDENTIALS', 503],
    [{ name: 'ResourceNotFoundException' }, 'STORAGE_NOT_FOUND', 503],
    [{ name: 'NoSuchKey' }, 'ORIGINAL_NOT_FOUND', 404],
    [{ name: 'AbortError' }, 'DOCUMENT_TIMEOUT', 504],
    [{ code: 'ETIMEDOUT' }, 'DOCUMENT_TIMEOUT', 504],
    [{ code: 'ECONNRESET' }, 'STORAGE_CONNECTION', 503],
    [{ name: 'ThrottlingException' }, 'STORAGE_BUSY', 429],
    [{ name: 'TransactionCanceledException' }, 'DOCUMENT_CONFLICT', 409],
    [new Error('ELIGIBILITY_ORIGINAL_HASH_MISMATCH'), 'ORIGINAL_CHANGED', 409],
    [new Error('ELIGIBILITY_DOCUMENT_BUCKET_MISMATCH'), 'STORAGE_MISMATCH', 503],
  ] as const;
  for (const [error, code, status] of cases) {
    const result = diagnoseDocumentError(error, 'original');
    assert.equal(result.code, code);
    assert.equal(result.status, status);
    assert.ok(result.action);
  }
});

test('parser diagnostics are used only at the extraction stage', () => {
  assert.equal(diagnoseDocumentError({ name: 'PasswordException' }, 'extraction').code, 'DOCUMENT_PASSWORD');
  assert.equal(diagnoseDocumentError({ name: 'InvalidPDFException' }, 'extraction').code, 'DOCUMENT_FORMAT_INVALID');
  assert.equal(diagnoseDocumentError({ code: 'ERR_ENCODING_INVALID_ENCODED_DATA' }, 'extraction').code, 'DOCUMENT_ENCODING');
  assert.equal(diagnoseDocumentError({ name: 'SyntaxError' }, 'extraction_cache').code, 'DOCUMENT_ERROR');
  assert.equal(diagnoseDocumentError({ name: 'PasswordException' }, 'registration').code, 'DOCUMENT_ERROR');
});

test('unknown failures stay unknown and provider secrets are never reflected', () => {
  for (const error of [null, 'secret', new Error('secret https://storage/private?signature=secret'),
    { name: 'AccessDenied', message: 'arn:private-resource token=secret' }]) {
    const result = diagnoseDocumentError(error, 'registration');
    assert.doesNotMatch(JSON.stringify(result), /secret|arn:|signature|https:/);
  }
  assert.match(diagnoseDocumentError(new Error('unknown'), 'extraction').error, /cauza exacta nu a putut fi identificata/);
});

test('all preparation stages survive the UI extraction fallback and retain a support reference', () => {
  for (const stage of Object.keys(documentStages) as (keyof typeof documentStages)[]) {
    const failure = diagnoseDocumentError({ name: 'AccessDenied' }, stage);
    const error = new EligibilityDocumentRequestError(`anexa.pdf: ${failure.error}`, {
      stage, code: failure.code, action: failure.action, requestId: 'test-reference',
    });
    const summary = getEligibilityFailureSummary(error, 'extraction');
    assert.equal(summary, formatDocumentFailure(error));
    assert.ok(summary.startsWith(`Eroare la ${documentStages[stage]}:`));
    assert.match(summary, /anexa.pdf/);
    assert.match(summary, /STORAGE_ACCESS_DENIED; referinta: test-reference/);
    const check = { status: 'neconcludent', score: 0, summary, checks: [], missingElements: [], recommendations: [], riskFlags: [] };
    assert.equal(getEligibilityAttemptState(check), 'technical_error');
    assert.equal(getDisplayEligibilityScore(check), null);
  }
});

// Run the actual route/client against injected service boundaries, without AWS or a browser session.
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

test('API storage failure reaches the displayed summary with its stage and matching log reference', async () => {
  const logs: unknown[][] = [];
  const route = loadModule('../app/api/eligibility/documents/route.ts', {
    'next/server': { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
    'node:crypto': { randomUUID: () => 'request-test-123' },
    zod: { z },
    '@/lib/eligibility-resolver': { authenticateEligibilityRequest: async () => ({ id: 'actor' }) },
    '@/lib/eligibility-authorization': { ...authorization, normalizeEligibilityExperts: () => [], authorizeEligibilityExpert: () => ({ expert: { id: 'expert' } }) },
    '@/lib/eligibility-server-store': { eligibilityStore: { list: async () => [] } },
    '@/lib/peo-users': { peoUsersAsExperts: () => [] },
    '@/lib/eligibility-draft': { completeEligibilityDraft: async (_id: string, _expert: unknown, context: { stage: string }) => {
      context.stage = 'extraction_save';
      throw Object.assign(new Error('private bucket URL and credentials'), { name: 'AccessDenied', $metadata: { requestId: 'aws-request-123', httpStatusCode: 403 } });
    } },
    '@/lib/ai-governance': { assertAllowedAiRequest: () => {}, AiGovernanceError: class extends Error {} },
    '@/lib/eligibility-document-diagnostics': diagnostics,
  }, { console: { error: (...args: unknown[]) => logs.push(args) } });
  const response = await route.POST(new Request('https://app.test/api/eligibility/documents', {
    method: 'POST', body: JSON.stringify({ action: 'complete', expertId: 'expert', documentId: 'draft_test' }),
  })) as Response;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const payload = await response.json();
  assert.equal(payload.diagnostic.stage, 'extraction_save');
  assert.equal(payload.diagnostic.requestId, 'request-test-123');
  assert.doesNotMatch(JSON.stringify({ payload, logs }), /private bucket URL|credentials/);
  assert.match(JSON.stringify(logs), /aws-request-123/);
  const client = loadModule('../lib/eligibility-client.ts', {
    'aws-amplify/auth': { fetchAuthSession: async () => ({ tokens: { accessToken: 'test-token' } }) },
    './eligibility-document-diagnostics': diagnostics,
  }, { fetch: async () => Response.json(payload, { status: response.status }) });
  await assert.rejects(() => client.eligibilityRequest('/api/eligibility/documents', {}), (error: unknown) => {
    assert.ok(error instanceof EligibilityDocumentRequestError);
    const summary = getEligibilityFailureSummary(error, 'extraction');
    assert.match(summary, /Eroare la salvarea textului extras/);
    assert.match(summary, /STORAGE_ACCESS_DENIED; referinta: request-test-123/);
    assert.doesNotMatch(summary, /Eroare la extragerea/);
    return true;
  });
});

test('a proxy HTML error preserves HTTP status instead of showing a JSON parser failure', async () => {
  const client = loadModule('../lib/eligibility-client.ts', {
    'aws-amplify/auth': { fetchAuthSession: async () => ({ tokens: { accessToken: 'test-token' } }) },
    './eligibility-document-diagnostics': diagnostics,
  }, { fetch: async () => new Response('<html>Gateway timeout</html>', { status: 504 }) });
  await assert.rejects(() => client.eligibilityRequest('/api/eligibility/documents', {}), (error: unknown) => {
    assert.ok(error instanceof EligibilityDocumentRequestError);
    assert.equal(error.diagnostic.code, 'DOCUMENT_HTTP_504');
    assert.match(error.message, /HTTP 504/);
    return true;
  });
});
