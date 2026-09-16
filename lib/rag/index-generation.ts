import { hashRagText, normalizeRagText, splitTextIntoRagChunks } from './chunking.ts';
import { canonicalRoleId, appliesToEligibilityScope } from '../eligibility-scope.ts';
import type { KnowledgeChunk, KnowledgeDocument } from '../types.ts';
import type { RagIndexDocumentInput } from './types.ts';

export const RAG_EXTRACTION_VERSION = 'normalized-text-v2';
export type IndexManifest = {
  documentVersionId: string; extractionVersion: string; extractionComplete: boolean;
  indexGenerationId: string; expectedChunkCount: number; manifestHash: string;
  processedSections: string[]; failedSections: string[];
};
export function prepareIndexGeneration(input: RagIndexDocumentInput, embeddingModel: string) {
  const text = normalizeRagText(input.text);
  if (!text) throw new Error('Documentul nu contine text indexabil.');
  const roleId = canonicalRoleId(input);
  if (!input.projectCode?.trim()) throw new Error('Indexarea necesita proiectul explicit.');
  if (!appliesToEligibilityScope({ ...input, roleId }, { ...input, roleId })) throw new Error('Asocierea sursei la proiect/rol/SA este incompleta.');
  const association = [input.projectCode, input.category || '', input.expertId || '', roleId, input.saCode || '', input.sourceType];
  const documentId = `kd_${hashRagText(JSON.stringify([...association, input.metadata?.sourceIdentity || input.originalFileName || input.s3Key || input.title]))}`;
  const textHash = hashRagText(text);
  const documentVersionId = String(input.metadata?.originalFileHash || textHash);
  const extractionVersion = String(input.metadata?.extractionVersion || RAG_EXTRACTION_VERSION);
  const generationId = hashRagText(JSON.stringify([documentId, documentVersionId, textHash, extractionVersion, embeddingModel, input.extractionComplete === true]));
  const chunks = splitTextIntoRagChunks({ text }).map((chunk) => ({ ...chunk, id: `kc_${generationId}_${chunk.chunkIndex}`, documentId }));
  const manifest: IndexManifest = {
    documentVersionId, extractionVersion, extractionComplete: input.extractionComplete === true,
    indexGenerationId: generationId, expectedChunkCount: chunks.length,
    manifestHash: hashRagText(JSON.stringify(chunks.map(({ id, textHash }) => ({ id, textHash })))),
    processedSections: Array.isArray(input.metadata?.processedSections) ? input.metadata.processedSections.map(String) : [],
    failedSections: Array.isArray(input.metadata?.failedSections) ? input.metadata.failedSections.map(String) : [],
  };
  return { documentId, text, roleId, chunks, manifest, embeddingModel };
}

export function verifyIndexGeneration(expected: ReturnType<typeof prepareIndexGeneration>, saved: KnowledgeChunk[]) {
  const { manifest } = expected;
  if (!manifest.extractionComplete || manifest.failedSections.length) throw new Error('Extragerea incompleta nu poate publica o generatie.');
  if (saved.length !== manifest.expectedChunkCount || new Set(saved.map((c) => c.id)).size !== saved.length) throw new Error('Manifest incomplet sau fragmente duplicate.');
  let dimensions = 0;
  for (const chunk of expected.chunks) {
    const actual = saved.find((item) => item.id === chunk.id);
    if (!actual || actual.documentId !== expected.documentId || actual.indexGenerationId !== manifest.indexGenerationId
      || actual.textHash !== chunk.textHash || hashRagText(actual.text) !== chunk.textHash) throw new Error('Identitatea sau hash-ul fragmentului nu corespunde manifestului.');
    const vector: unknown = JSON.parse(actual.embeddingJson || 'null');
    if (!Array.isArray(vector) || !vector.length || vector.some((n) => typeof n !== 'number' || !Number.isFinite(n))
      || !vector.some((n) => n !== 0) || actual.embeddingModel !== expected.embeddingModel) throw new Error('Embedding invalid sau lipsa.');
    if (dimensions && dimensions !== vector.length) throw new Error('Dimensiuni embedding incompatibile.');
    dimensions = vector.length;
  }
}

export function onlyPublishedChunks(chunks: KnowledgeChunk[], documents: KnowledgeDocument[]) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return chunks.filter((chunk) => {
    const parent = byId.get(chunk.documentId);
    return parent?.status === 'active' && chunk.status === 'active'
      && (parent.publishedGeneration ? chunk.indexGenerationId === parent.publishedGeneration : !chunk.indexGenerationId);
  });
}

export type GenerationStore = {
  getDocument(id: string): Promise<KnowledgeDocument | null>;
  createDocument(document: Partial<KnowledgeDocument> & { id: string }): Promise<void>;
  listChunks(documentId: string, generationId: string): Promise<KnowledgeChunk[]>;
  putChunk(chunk: KnowledgeChunk): Promise<void>;
  publish(document: Partial<KnowledgeDocument> & { id: string }, previousGeneration?: string): Promise<void>;
  embed(texts: string[]): Promise<number[][]>;
};

/** Readers never see staged chunks. A compare-and-swap protects the publication pointer. */
export async function publishIndexGeneration(input: RagIndexDocumentInput, embeddingModel: string, store: GenerationStore) {
  const prepared = prepareIndexGeneration(input, embeddingModel);
  const { manifest, documentId, roleId } = prepared;
  let previous = await store.getDocument(documentId);
  const document = {
    id: documentId, title: input.title, sourceType: input.sourceType, projectCode: input.projectCode,
    category: input.category, expertId: input.expertId, expertName: input.expertName, expertRole: input.expertRole,
    roleId, saCode: input.saCode, activityName: input.activityName, s3Key: input.s3Key,
    originalFileName: input.originalFileName, month: input.month, year: input.year, approvalStatus: input.approvalStatus,
    textHash: hashRagText(prepared.text), extractedTextPreview: prepared.text.slice(0, 800), createdBy: input.createdBy,
    ...manifest, metadataJson: JSON.stringify({ ...input.metadata, ...manifest, roleId, expertRole: input.expertRole }),
  };
  if (!previous) {
    try { await store.createDocument({ ...document, status: 'staging' }); }
    catch (error) { previous = await store.getDocument(documentId); if (!previous) throw error; }
  }
  const existing = await store.listChunks(documentId, manifest.indexGenerationId);
  if (previous?.publishedGeneration === manifest.indexGenerationId) {
    verifyIndexGeneration(prepared, existing);
    return { document: previous, chunks: existing, dryRun: false };
  }
  if (!manifest.extractionComplete || manifest.failedSections.length) throw new Error('Extragere partiala: generatia anterioara ramane publicata.');
  const missing = prepared.chunks.filter((chunk) => !existing.some((item) => item.id === chunk.id));
  const embeddings = missing.length ? await store.embed(missing.map((chunk) => chunk.text)) : [];
  if (embeddings.length !== missing.length) throw new Error('Embeddinguri incomplete.');
  for (const [index, chunk] of missing.entries()) {
    await store.putChunk({
      ...chunk, ...manifest, roleId, embeddingJson: JSON.stringify(embeddings[index]), embeddingModel,
      sourceType: input.sourceType, category: input.category, expertId: input.expertId, expertName: input.expertName,
      projectCode: input.projectCode, saCode: input.saCode, activityName: input.activityName,
      month: input.month, year: input.year, status: 'active', metadataJson: document.metadataJson,
    });
  }
  const saved = await store.listChunks(documentId, manifest.indexGenerationId);
  verifyIndexGeneration(prepared, saved);
  const published = { ...document, status: 'active', publishedGeneration: manifest.indexGenerationId, indexedAt: new Date().toISOString() };
  await store.publish(published, previous?.publishedGeneration);
  return { document: published, chunks: saved, dryRun: false };
}
