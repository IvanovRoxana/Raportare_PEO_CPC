import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadEligibilityReferenceChunks } from '../lib/eligibility-reference-chunks.ts';
import { diagnoseEvaluationError } from '../lib/eligibility-evaluation-diagnostics.ts';
import type { KnowledgeChunk, KnowledgeDocument } from '../lib/types.ts';

const target = { projectCode: 'project', expertId: 'expert', category: 'cr', saCode: 'SA3.4' };
const parent = (id: string, patch: Partial<KnowledgeDocument> = {}) => ({
  id, projectCode: 'project', sourceType: 'metodologie', status: 'active', ...patch,
} as KnowledgeDocument);
const chunk = (id: string, documentId: string, patch: Partial<KnowledgeChunk> = {}) => ({
  id, documentId, projectCode: 'project', status: 'active', text: 'Dovada', ...patch,
} as KnowledgeChunk);

test('only authorized active reference documents are queried, with no global chunk read', async () => {
  const calls: string[] = [];
  const result = await loadEligibilityReferenceChunks([
    parent('allowed'), parent('allowed'), parent('foreign', { projectCode: 'other' }),
    parent('another-expert', { expertId: 'someone-else' }), parent('inactive', { status: 'inactive' }),
    parent('other-sa', { saCode: 'SA1.1' }), parent('wrong-category', { category: 'ap' }),
  ], target, async (id) => {
    calls.push(id);
    return [chunk('valid', id), chunk('foreign-result', 'other-document'), chunk('wrong-project', id, { projectCode: 'other' }),
      chunk('inactive-chunk', id, { status: 'inactive' })];
  });
  assert.deepEqual(calls, ['allowed']);
  assert.deepEqual(result.map((item) => item.id), ['valid']);
  assert.deepEqual(await loadEligibilityReferenceChunks([], target, async () => { assert.fail('No query expected'); }), []);
});

test('published generation is selected and incomplete index propagation cannot produce partial evidence', async () => {
  const published = parent('doc', { publishedGeneration: 'current', expectedChunkCount: 2 });
  const current = [chunk('a', 'doc', { indexGenerationId: 'current' }), chunk('b', 'doc', { indexGenerationId: 'current' })];
  const result = await loadEligibilityReferenceChunks([published], target, async () => [
    ...current, chunk('old', 'doc', { indexGenerationId: 'old' }), chunk('staging', 'doc', { indexGenerationId: 'next', status: 'staging' }),
  ]);
  assert.deepEqual(result, current);
  for (const incomplete of [[current[0]], [current[0], current[0]], []]) {
    await assert.rejects(loadEligibilityReferenceChunks([published], target, async () => incomplete),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ELIGIBILITY_REFERENCE_INDEX_INCOMPLETE');
  }
});

test('reference requests are bounded and a database failure is propagated without partial results', async () => {
  let active = 0;
  let peak = 0;
  const parents = Array.from({ length: 11 }, (_, i) => parent(`doc-${i}`));
  const result = await loadEligibilityReferenceChunks(parents, target, async (id) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return [chunk(`chunk-${id}`, id)];
  });
  assert.equal(result.length, 11);
  assert.equal(peak, 4);
  const denied = Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
  await assert.rejects(loadEligibilityReferenceChunks(parents, target, async () => { throw denied; }), (error) => error === denied);
});

class Command {
  input: Record<string, unknown>;
  constructor(input: Record<string, unknown>) { this.input = input; }
}
class QueryCommand extends Command {}
class ScanCommand extends Command {}
const storeSource = readFileSync(new URL('../lib/eligibility-server-store.ts', import.meta.url), 'utf8');
const compiledStore = ts.transpileModule(storeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function store(send: (command: Command) => Promise<unknown>) {
  const exports = {} as { eligibilityStore: { list: (model: string, filter?: { field: string; value: string }) => Promise<unknown[]> } };
  const dependencies: Record<string, unknown> = {
    'server-only': {}, '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': { QueryCommand, ScanCommand, DynamoDBDocumentClient: { from: () => ({ send }) } },
    './eligibility-environment.ts': { eligibilityRegion: 'test', eligibilityTables: () => ({ KnowledgeChunk: 'chunks', Expert: 'experts', EligibilityRuntime: 'runtime' }) },
  };
  new Function('require', 'exports', compiledStore)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.eligibilityStore;
}

test('document chunk reads use the deployed documentId index and follow all query pages', async () => {
  const calls: Command[] = [];
  const backend = store(async (command) => {
    calls.push(command);
    return calls.length === 1 ? { Items: [{ id: 'first' }], LastEvaluatedKey: { id: 'cursor' } } : { Items: [{ id: 'second' }] };
  });
  assert.deepEqual(await backend.list('KnowledgeChunk', { field: 'documentId', value: 'doc' }), [{ id: 'first' }, { id: 'second' }]);
  assert.ok(calls.every((command) => command instanceof QueryCommand));
  assert.equal(calls[0].input.IndexName, 'knowledgeChunksByDocumentId');
  assert.deepEqual(calls[0].input.ExpressionAttributeValues, { ':documentId': 'doc' });
  assert.equal(calls[0].input.ConsistentRead, undefined);
  assert.deepEqual(calls[1].input.ExclusiveStartKey, { id: 'cursor' });
});

test('other store reads retain strongly consistent scans and pagination never silently truncates', async () => {
  const calls: Command[] = [];
  const backend = store(async (command) => { calls.push(command); return { Items: [] }; });
  await backend.list('Expert');
  assert.ok(calls[0] instanceof ScanCommand);
  assert.equal(calls[0].input.ConsistentRead, true);
  let pages = 0;
  const paged = store(async () => { pages++; return { Items: [], LastEvaluatedKey: { id: String(pages) } }; });
  await assert.rejects(paged.list('KnowledgeChunk', { field: 'documentId', value: 'doc' }), /ELIGIBILITY_INCOMPLETE_BACKEND_READ/);
  assert.equal(pages, 100);
  const diagnostic = diagnoseEvaluationError(new Error('ELIGIBILITY_INCOMPLETE_BACKEND_READ'), { stage: 'context' });
  assert.equal(diagnostic.code, 'ELIGIBILITY_INCOMPLETE_BACKEND_READ');
  assert.match(diagnostic.error, /limita de paginare/);
});
