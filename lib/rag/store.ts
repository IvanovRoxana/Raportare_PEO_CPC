import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../../amplify_outputs.json';
import type { Schema } from '../../amplify/data/resource';
import type {
  ActivityAutofillAudit,
  KnowledgeChunk,
  KnowledgeDocument,
} from '../types.ts';
import { getRagEmbeddingModelName, generateEmbeddings, serializeEmbedding } from './embeddings.ts';
import { hashRagText, normalizeRagText, splitTextIntoRagChunks } from './chunking.ts';
import type { ActivityAutofillAuditInput, RagIndexDocumentInput, RagIndexDocumentResult } from './types.ts';

type ModelListResult<T> = { data?: T[] | null; errors?: unknown; nextToken?: string | null };

let configured = false;
let dataClient: ReturnType<typeof generateClient<Schema>> | null = null;

function configureAmplifyForRag() {
  if (!configured) {
    Amplify.configure(outputs, { ssr: true });
    configured = true;
  }
}

function getRagDataClient() {
  configureAmplifyForRag();
  if (!dataClient) {
    dataClient = generateClient<Schema>();
  }
  return dataClient as any;
}

function assertNoErrors(result: { errors?: unknown }, action: string) {
  if (result.errors) {
    throw new Error(`${action} failed: ${JSON.stringify(result.errors)}`);
  }
}

async function listModel<T>(
  model: { list: (args?: { filter?: Record<string, unknown>; limit?: number; nextToken?: string | null }) => Promise<ModelListResult<T>> },
  filter?: Record<string, unknown>,
  limit = 1000,
) {
  const items: T[] = [];
  let nextToken: string | null | undefined = null;

  do {
    const result = await model.list({ filter, limit, nextToken });
    assertNoErrors(result, 'AWS list RAG model');
    items.push(...(result.data ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  return items;
}

function mapKnowledgeDocument(item: any): KnowledgeDocument {
  return {
    id: item.id,
    title: item.title,
    sourceType: item.sourceType,
    category: item.category ?? undefined,
    expertId: item.expertId ?? undefined,
    expertName: item.expertName ?? undefined,
    expertRole: item.expertRole ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: item.month ?? undefined,
    year: item.year ?? undefined,
    saCode: item.saCode ?? undefined,
    activityName: item.activityName ?? undefined,
    approvalStatus: item.approvalStatus ?? undefined,
    originalFileName: item.originalFileName ?? undefined,
    s3Key: item.s3Key ?? undefined,
    textHash: item.textHash ?? undefined,
    extractedTextPreview: item.extractedTextPreview ?? undefined,
    status: item.status ?? undefined,
    indexedAt: item.indexedAt ?? undefined,
    createdBy: item.createdBy ?? undefined,
    metadataJson: item.metadataJson ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapKnowledgeChunk(item: any): KnowledgeChunk {
  return {
    id: item.id,
    documentId: item.documentId,
    chunkIndex: item.chunkIndex,
    text: item.text,
    textHash: item.textHash ?? undefined,
    embeddingJson: item.embeddingJson ?? undefined,
    embeddingModel: item.embeddingModel ?? undefined,
    tokenEstimate: item.tokenEstimate ?? undefined,
    sourceType: item.sourceType ?? undefined,
    category: item.category ?? undefined,
    expertId: item.expertId ?? undefined,
    expertName: item.expertName ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: item.month ?? undefined,
    year: item.year ?? undefined,
    saCode: item.saCode ?? undefined,
    activityName: item.activityName ?? undefined,
    status: item.status ?? undefined,
    metadataJson: item.metadataJson ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapActivityAutofillAudit(item: any): ActivityAutofillAudit {
  return {
    id: item.id,
    expertId: item.expertId ?? undefined,
    expertName: item.expertName ?? undefined,
    expertRole: item.expertRole ?? undefined,
    category: item.category ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: item.month ?? undefined,
    year: item.year ?? undefined,
    activityId: item.activityId ?? undefined,
    deliverableIds: item.deliverableIds ?? [],
    suggestedSaCode: item.suggestedSaCode ?? undefined,
    suggestedActivityName: item.suggestedActivityName ?? undefined,
    suggestedDescriptionPreview: item.suggestedDescriptionPreview ?? undefined,
    confidence: item.confidence ?? undefined,
    modelAuditId: item.modelAuditId ?? undefined,
    retrievalJson: item.retrievalJson ?? undefined,
    candidateJson: item.candidateJson ?? undefined,
    warningsJson: item.warningsJson ?? undefined,
    applied: item.applied ?? false,
    appliedAt: item.appliedAt ?? undefined,
    finalSaCode: item.finalSaCode ?? undefined,
    finalActivityName: item.finalActivityName ?? undefined,
    finalDescriptionPreview: item.finalDescriptionPreview ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

export async function listKnowledgeChunks(filter?: Record<string, unknown>) {
  const model = getRagDataClient().models?.KnowledgeChunk;
  if (!model) return [];
  const data = await listModel<any>(model, filter);
  return data.map(mapKnowledgeChunk);
}

export async function indexKnowledgeDocument(
  input: RagIndexDocumentInput,
  options: { dryRun?: boolean } = {},
): Promise<RagIndexDocumentResult> {
  const text = normalizeRagText(input.text);
  const chunks = splitTextIntoRagChunks({ text });
  const textHash = hashRagText(text);
  const extractedTextPreview = text.slice(0, 800);
  const embeddingModel = getRagEmbeddingModelName();

  if (options.dryRun) {
    return {
      dryRun: true,
      document: null,
      chunks: chunks.map((chunk) => ({
        id: `dry-run-${chunk.chunkIndex}`,
        documentId: 'dry-run',
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        textHash: chunk.textHash,
        embeddingModel,
        tokenEstimate: chunk.tokenEstimate,
        sourceType: input.sourceType,
        category: input.category,
        expertId: input.expertId,
        expertName: input.expertName,
        projectCode: input.projectCode,
        month: input.month,
        year: input.year,
        saCode: input.saCode,
        activityName: input.activityName,
        status: 'active',
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
      })),
    };
  }

  const document = await createKnowledgeDocument({
    ...input,
    textHash,
    extractedTextPreview,
  });

  if (!document) {
    return { dryRun: false, document: null, chunks: [] };
  }

  const embeddings = await generateEmbeddings(chunks.map((chunk) => chunk.text));
  const savedChunks = await createKnowledgeChunks(chunks.map((chunk, index) => ({
    documentId: document.id,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    textHash: chunk.textHash,
    embeddingJson: embeddings[index] ? serializeEmbedding(embeddings[index]) : undefined,
    embeddingModel,
    tokenEstimate: chunk.tokenEstimate,
    sourceType: input.sourceType,
    category: input.category,
    expertId: input.expertId,
    expertName: input.expertName,
    projectCode: input.projectCode,
    month: input.month,
    year: input.year,
    saCode: input.saCode,
    activityName: input.activityName,
    status: 'active',
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
  })));

  return { dryRun: false, document, chunks: savedChunks };
}

export async function createKnowledgeDocument(input: RagIndexDocumentInput & {
  textHash: string;
  extractedTextPreview: string;
}) {
  const model = getRagDataClient().models?.KnowledgeDocument;
  if (!model) return null;
  const result = await model.create({
    title: input.title,
    sourceType: input.sourceType,
    category: input.category,
    expertId: input.expertId,
    expertName: input.expertName,
    expertRole: input.expertRole,
    projectCode: input.projectCode,
    month: input.month,
    year: input.year,
    saCode: input.saCode,
    activityName: input.activityName,
    approvalStatus: input.approvalStatus,
    originalFileName: input.originalFileName,
    s3Key: input.s3Key,
    textHash: input.textHash,
    extractedTextPreview: input.extractedTextPreview,
    status: 'active',
    indexedAt: new Date().toISOString(),
    createdBy: input.createdBy,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
  });
  assertNoErrors(result, 'AWS create KnowledgeDocument');
  return result.data ? mapKnowledgeDocument(result.data) : null;
}

export async function createKnowledgeChunk(input: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>) {
  const model = getRagDataClient().models?.KnowledgeChunk;
  if (!model) return null;
  const result = await model.create(input);
  assertNoErrors(result, 'AWS create KnowledgeChunk');
  return result.data ? mapKnowledgeChunk(result.data) : null;
}

export async function createKnowledgeChunks(inputs: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>[]) {
  const chunks: KnowledgeChunk[] = [];
  for (const input of inputs) {
    const chunk = await createKnowledgeChunk(input);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

export async function createActivityAutofillAudit(input: ActivityAutofillAuditInput) {
  const model = getRagDataClient().models?.ActivityAutofillAudit;
  if (!model) return null;
  const { suggestion: _suggestion, ...payload } = input;
  const result = await model.create(payload);
  assertNoErrors(result, 'AWS create ActivityAutofillAudit');
  return result.data ? mapActivityAutofillAudit(result.data) : null;
}

export async function markActivityAutofillAuditApplied(input: {
  id?: string;
  modelAuditId?: string;
  finalSaCode?: string;
  finalActivityName?: string;
  finalDescriptionPreview?: string;
}) {
  const model = getRagDataClient().models?.ActivityAutofillAudit;
  if (!model) return null;

  let id = input.id;
  if (!id && input.modelAuditId) {
    const matches = await listModel<any>(model, { modelAuditId: { eq: input.modelAuditId } });
    id = matches[0]?.id;
  }

  if (!id) return null;

  const result = await model.update({
    id,
    applied: true,
    appliedAt: new Date().toISOString(),
    finalSaCode: input.finalSaCode,
    finalActivityName: input.finalActivityName,
    finalDescriptionPreview: input.finalDescriptionPreview,
  });
  assertNoErrors(result, 'AWS update ActivityAutofillAudit');
  return result.data ? mapActivityAutofillAudit(result.data) : null;
}

export async function listActivityAutofillAudits(filter?: Record<string, unknown>) {
  const model = getRagDataClient().models?.ActivityAutofillAudit;
  if (!model) return [];
  const data = await listModel<any>(model, filter);
  return data.map(mapActivityAutofillAudit).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
