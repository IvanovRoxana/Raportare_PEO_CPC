import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as authorization from '../lib/eligibility-authorization.ts';
import * as scope from '../lib/eligibility-scope.ts';
import * as references from '../lib/eligibility-reference-chunks.ts';
import * as evaluation from '../lib/eligibility-evaluation.ts';
import * as execution from '../lib/eligibility-execution.ts';
import type { Expert, Deliverable, KnowledgeDocument } from '../lib/types.ts';
import type { EligibilityRun } from '../lib/eligibility-run-store.ts';

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', js)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports as T;
}

function fixture() {
  const expert = { id: 'expert', name: 'Expert', email: 'expert@example.test', projectCode: 'project', category: 'cr',
    positionInProject: 'coordonator regional', saCodes: ['SA3.4'], isActive: true } as Expert;
  const document = { id: 'document', expertId: expert.id, projectCode: expert.projectCode, activityId: 'activity',
    fileHash: 'original-hash', docText: 'Original verificat', declaredTitle: 'Raport', deliverableType: 'Raport' } as Deliverable;
  const parent = { id: 'source', projectCode: expert.projectCode, status: 'active', sourceType: 'cerere_finantare',
    documentVersionId: 'v1', publishedGeneration: 'g1', textHash: 'source-hash', expectedChunkCount: 1 } as KnowledgeDocument;
  const calls: string[] = [];
  const backend = {
    list: async (model: string) => {
      calls.push(model);
      if (model === 'Expert') return [expert];
      if (model === 'KnowledgeDocument') return [parent];
      if (model === 'KnowledgeChunk') return [{ id: 'chunk', documentId: parent.id, projectCode: expert.projectCode, text: 'Dovada', status: 'active', indexGenerationId: parent.publishedGeneration }];
      if (model === 'ActivityCatalog') return [];
      assert.fail(`Unexpected list: ${model}`);
    },
    get: async (model: string) => {
      calls.push(model);
      if (model === 'Deliverable') return { ...document };
      if (model === 'Activity') return { expertId: expert.id };
      assert.fail(`Unexpected get: ${model}`);
    },
  };
  const resolver = load<typeof import('../lib/eligibility-resolver.ts')>('../lib/eligibility-resolver.ts', {
    'server-only': {}, 'aws-jwt-verify': { CognitoJwtVerifier: { create: () => ({}) } },
    './eligibility-environment.ts': {}, './rag/cognito-auth.ts': {},
    './eligibility-authorization.ts': authorization, './peo-users.ts': { peoUsersAsExperts: () => [] },
    './eligibility-server-store.ts': { eligibilityStore: backend }, './eligibility-scope.ts': scope,
    './eligibility-reference-chunks.ts': references,
    './rag/reporting-examples.ts': { REPORTING_EXAMPLE_SOURCE_TYPE: 'exemplu_raportare' },
    './eligibility-originals.ts': { readEligibilityOriginal: async (doc: Deliverable) => { calls.push('original'); return doc; } },
    './eligibility-draft.ts': {},
  });
  const request = new Request('https://app.test');
  const actor = { id: 'admin', roles: ['admin'] };
  const input = { expertId: expert.id, projectCode: expert.projectCode, saCode: 'SA3.4', documentIds: [document.id] };
  return { expert, document, parent, calls, backend, resolver, request, actor, input };
}

test('revalidation rereads authorization, originals and source versions without reloading the reference corpus', async () => {
  const f = fixture();
  const initial = await f.resolver.resolveEligibilityContext(f.request, f.input, f.actor);
  assert.equal(initial.chunks.length, 1);
  f.calls.length = 0;
  f.parent.publishedGeneration = 'g2';
  f.document.fileHash = 'replacement';
  const current = await f.resolver.resolveEligibilityContext(f.request, { ...f.input, loadReferenceChunks: false }, f.actor);
  assert.deepEqual(f.calls, ['Expert', 'Deliverable', 'Activity', 'original', 'KnowledgeDocument']);
  assert.equal(current.parents[0].publishedGeneration, 'g2');
  assert.equal(current.documents[0].fileHash, 'replacement');
  assert.deepEqual(current.chunks, []);
  f.document.expertId = 'someone-else';
  await assert.rejects(f.resolver.resolveEligibilityContext(f.request, { ...f.input, loadReferenceChunks: false }, f.actor), /nu apartine/);
  f.expert.isActive = false;
  await assert.rejects(f.resolver.resolveEligibilityContext(f.request, { ...f.input, loadReferenceChunks: false }, f.actor), /nu este accesibil/);
});

test('snapshot verification detects changed sources and originals without reading chunks', async () => {
  const f = fixture();
  const resolved = await f.resolver.resolveEligibilityContext(f.request, f.input, f.actor);
  const reader = load<typeof import('../lib/eligibility-run-read.ts')>('../lib/eligibility-run-read.ts', {
    'server-only': {}, './eligibility-server-store.ts': { eligibilityStore: f.backend },
    './eligibility-resolver.ts': f.resolver, './eligibility-authorization.ts': authorization,
    './eligibility-evaluation.ts': evaluation, './eligibility-rules.ts': { parseExecutableRuleset: () => null },
    './ai-eligibility-ruleset-runtime.ts': { getActiveAiEligibilityRuleset: async () => null },
    './openai.ts': { getEligibilityModelName: () => 'test' }, './eligibility-execution.ts': execution,
    './eligibility-assessment.ts': { ELIGIBILITY_ASSESSMENT_VERSION: 'test' },
    './eligibility-catalog.ts': { scopeEligibilityCatalog: () => [] }, './eligibility-binding.ts': {},
  });
  const run = { expertId: f.expert.id, projectCode: f.expert.projectCode, saCode: 'SA3.4', inputSnapshot: {
    documents: [{ id: f.document.id, hash: evaluation.evaluationHash(f.document.docText), fileHash: f.document.fileHash,
      documentTitle: f.document.declaredTitle, deliverableType: f.document.deliverableType }],
    expert: evaluation.evaluationHash(resolved.expert), scopedCatalogHash: evaluation.evaluationHash([]), rules: evaluation.evaluationHash(null),
    applicableCriteria: [], configuration: evaluation.ELIGIBILITY_MODEL_CONFIGURATION, model: 'test', evaluatorVersion: 'test',
    sources: [{ id: f.parent.id, version: f.parent.documentVersionId, generation: f.parent.publishedGeneration, hash: f.parent.textHash }],
  } } as unknown as EligibilityRun;
  f.calls.length = 0;
  assert.equal((await reader.verifyEligibilityRunSnapshot(f.request, run, f.actor)).current, true);
  f.parent.publishedGeneration = 'g2';
  assert.equal((await reader.verifyEligibilityRunSnapshot(f.request, run, f.actor)).current, false);
  f.parent.publishedGeneration = 'g1';
  f.document.docText = 'Original modificat';
  assert.equal((await reader.verifyEligibilityRunSnapshot(f.request, run, f.actor)).current, false);
  assert.ok(!f.calls.includes('KnowledgeChunk'));
});


test('metadata reauthorization checks ownership and versions without downloading originals', async () => {
  const f = fixture();
  const current = await f.resolver.resolveEligibilityContext(f.request, { ...f.input, metadataOnly: true, loadReferenceChunks: false }, f.actor);
  assert.equal(current.documents[0].fileHash, f.document.fileHash);
  assert.ok(!f.calls.includes('original'));
  assert.ok(!f.calls.includes('KnowledgeChunk'));
  f.document.expertId = 'someone-else';
  await assert.rejects(f.resolver.resolveEligibilityContext(f.request, { ...f.input, metadataOnly: true, loadReferenceChunks: false }, f.actor));
});
