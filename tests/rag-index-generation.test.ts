import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIndexGeneration, publishIndexGeneration, onlyPublishedChunks, buildIndexPublicationCondition, type GenerationStore } from '../lib/rag/index-generation.ts';
import { buildSchema, graphqlSync } from 'graphql';
import type { KnowledgeChunk, KnowledgeDocument } from '../lib/types.ts';
const input = { title: 'Norme', originalFileName: 'norme.txt', sourceType: 'cerere_finantare', projectCode: '302141', text: 'Text pentru o regula de proiect. '.repeat(100), extractionComplete: true };
function memoryStore() {
  const docs = new Map<string, KnowledgeDocument>(), chunks = new Map<string, KnowledgeChunk>();
  const store: GenerationStore = {
    getDocument: async (id) => docs.get(id) || null,
    createDocument: async (doc) => { if (docs.has(doc.id)) throw new Error('conflict'); docs.set(doc.id, doc as KnowledgeDocument); },
    listChunks: async (id, gen) => [...chunks.values()].filter((chunk) => chunk.documentId === id && chunk.indexGenerationId === gen),
    putChunk: async (chunk) => { chunks.set(chunk.id, chunk); },
    publish: async (doc, expected) => { if (docs.get(doc.id)?.publishedGeneration !== expected) throw new Error('concurrent publication'); docs.set(doc.id, doc as KnowledgeDocument); },
    embed: async (texts) => texts.map(() => [1, 0.5]),
  };
  return { store, docs, chunks };
}
test('generation metadata is identical on document/chunks, retry is idempotent, previous generations remain', async () => {
  const { store, docs, chunks } = memoryStore();
  const first = await publishIndexGeneration(input, 'embedding-model', store);
  const retry = await publishIndexGeneration(input, 'embedding-model', store);
  assert.equal(first.document.publishedGeneration, retry.document.publishedGeneration);
  assert.equal(chunks.size, first.chunks.length);
  const next = await publishIndexGeneration({ ...input, text: `${input.text} Regula noua.` }, 'embedding-model', store);
  assert.equal(docs.size, 1); assert.notEqual(first.document.publishedGeneration, next.document.publishedGeneration);
  assert.equal(chunks.size, first.chunks.length + next.chunks.length);
  assert.deepEqual(onlyPublishedChunks([...chunks.values()], [...docs.values()]).map((chunk) => chunk.id), next.chunks.map((chunk) => chunk.id));
  for (const chunk of next.chunks) {
    assert.equal(chunk.projectCode, next.document.projectCode); assert.equal(chunk.roleId, next.document.roleId);
    assert.equal(chunk.manifestHash, next.document.manifestHash); assert.equal(chunk.documentVersionId, next.document.documentVersionId);
  }
  const restored = await publishIndexGeneration(input, 'embedding-model', store);
  assert.equal(restored.document.publishedGeneration, first.document.publishedGeneration);
  assert.equal(chunks.size, first.chunks.length + next.chunks.length);
  assert.deepEqual(onlyPublishedChunks([...chunks.values()], [...docs.values()]).map((chunk) => chunk.id), first.chunks.map((chunk) => chunk.id));
});
test('partial extraction, failed embeddings and missing chunks never replace a valid generation', async () => {
  const { store, docs } = memoryStore();
  const first = await publishIndexGeneration(input, 'embedding-model', store);
  await assert.rejects(publishIndexGeneration({ ...input, extractionComplete: false }, 'embedding-model', store));
  await assert.rejects(publishIndexGeneration({ ...input, text: `${input.text} Changed` }, 'embedding-model', { ...store, embed: async () => [] }));
  await assert.rejects(publishIndexGeneration({ ...input, text: `${input.text} Changed again` }, 'embedding-model', { ...store, putChunk: async () => {} }));
  assert.equal(docs.get(first.document.id)?.publishedGeneration, first.document.publishedGeneration);
});
test('concurrent workers cannot overwrite another committed publication', async () => {
  const { store } = memoryStore();
  await publishIndexGeneration(input, 'embedding-model', store);
  let publishOther = true;
  const racing: GenerationStore = { ...store, publish: async (doc, previous) => {
    if (publishOther) { publishOther = false; await publishIndexGeneration({ ...input, text: `${input.text} Other worker` }, 'embedding-model', store); }
    await store.publish(doc, previous);
  } };
  await assert.rejects(publishIndexGeneration({ ...input, text: `${input.text} Losing worker` }, 'embedding-model', racing), /concurrent/);
});
test('content identity is distinct from project, role and SA associations', () => {
  const base = prepareIndexGeneration(input, 'embedding-model');
  for (const change of [{ projectCode: 'other' }, { saCode: 'SA3.4' }, { expertRole: 'Coordonator regional' }]) {
    const variant = prepareIndexGeneration({ ...input, ...change }, 'embedding-model');
    assert.equal(base.manifest.documentVersionId, variant.manifest.documentVersionId);
    assert.notEqual(base.documentId, variant.documentId);
  }
});
test('a vector produced by a different model cannot satisfy a generation manifest', async () => {
  const { store, docs } = memoryStore();
  await assert.rejects(publishIndexGeneration(input, 'embedding-model', { ...store,
    putChunk: (chunk) => store.putChunk({ ...chunk, embeddingModel: 'wrong-model' }),
  }), /Embedding invalid/);
  assert.equal([...docs.values()].some((document) => document.publishedGeneration), false);
});

test('publication conditions satisfy the deployed AppSync input and reject deleted, foreign and concurrently published records', () => {
  // Minimal extract of the actual staging SDL: ModelKnowledgeDocumentConditionInput has no id field.
  const schema = buildSchema(`enum ModelAttributeTypes { _null string }
    input ModelStringInput { eq: String attributeExists: Boolean attributeType: ModelAttributeTypes }
    input ModelKnowledgeDocumentConditionInput { projectCode: ModelStringInput publishedGeneration: ModelStringInput and: [ModelKnowledgeDocumentConditionInput] or: [ModelKnowledgeDocumentConditionInput] }
    type Query { accepts(condition: ModelKnowledgeDocumentConditionInput): Boolean! }`);
  const source = 'query Test($condition: ModelKnowledgeDocumentConditionInput) { accepts(condition: $condition) }';
  type Condition = { and?: Condition[]; or?: Condition[]; projectCode?: { eq: string }; publishedGeneration?: { eq?: string; attributeExists?: boolean; attributeType?: string } };
  const matches = (condition: Condition, record: { projectCode?: string; publishedGeneration?: string | null }): boolean => {
    if (condition.and) return condition.and.every(child => matches(child, record));
    if (condition.or) return condition.or.some(child => matches(child, record));
    if (condition.projectCode) return record.projectCode === condition.projectCode.eq;
    const generation = condition.publishedGeneration!;
    if (generation.eq !== undefined) return record.publishedGeneration === generation.eq;
    return generation.attributeExists === false ? record.publishedGeneration === undefined : record.publishedGeneration === null;
  };
  for (const previous of [undefined, 'previous']) {
    const condition = buildIndexPublicationCondition('302141', previous);
    for (const [record, expected] of [
      [{ projectCode: '302141', publishedGeneration: previous }, true],
      [{}, false], [{ projectCode: 'other', publishedGeneration: previous }, false],
      [{ projectCode: '302141', publishedGeneration: 'another-worker' }, false],
    ] as const) {
      const result = graphqlSync({ schema, source, variableValues: { condition }, rootValue: { accepts: () => matches(condition, record) } });
      assert.equal(result.errors, undefined); assert.equal(result.data?.accepts, expected);
    }
  }
  assert.ok(graphqlSync({ schema, source, variableValues: { condition: { id: { attributeExists: true } } } }).errors?.length);
});
