import outputs from '../../amplify_outputs.json';
import { publishIndexGeneration, onlyPublishedChunks } from './index-generation.ts';
import { backfillRagMetadataPage } from './metadata-backfill.ts';
import { backfillProjectPage, type ProjectBackfillModel } from './project-backfill.ts';
import type {
  ActivityAutofillAudit,
  KnowledgeChunk,
  KnowledgeDocument,
} from '../types.ts';
import { getRagEmbeddingModelName, generateEmbeddings } from './embeddings.ts';
import { hashRagText, normalizeRagText, splitTextIntoRagChunks } from './chunking.ts';
import type {
  ActivityAutofillAuditInput,
  RagAuthContext,
  RagIndexDocumentInput,
  RagIndexDocumentResult,
} from './types.ts';

type ModelListResult<T> = { data?: T[] | null; errors?: unknown; nextToken?: string | null };
type RagModelName = 'KnowledgeDocument' | 'KnowledgeChunk' | 'ActivityAutofillAudit';

const RAG_API_URL = (outputs as any)?.data?.url;

function assertCanAccessRagModel(modelName: RagModelName, options: RagAuthContext = {}) {
  if (!options.authToken) {
    throw new Error(`RAG model ${modelName} requires a Cognito access token for server-side access.`);
  }

  if (!(outputs as any)?.data?.model_introspection?.models?.[modelName]) {
    throw new Error(
      `RAG model ${modelName} is missing from amplify_outputs.json. Regenerate Amplify outputs and redeploy before running RAG imports.`,
    );
  }

  if (!RAG_API_URL) {
    throw new Error('RAG AppSync endpoint is missing from amplify_outputs.json.');
  }
}

async function graphqlRequest<T>(
  action: string,
  query: string,
  variables: Record<string, unknown>,
  options: RagAuthContext,
): Promise<T> {
  if (!options.authToken) {
    throw new Error(`${action} requires a Cognito access token.`);
  }

  const controller = options.timeoutMs && options.timeoutMs > 0 ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetch(RAG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: options.authToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller?.signal,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    throw new Error(`${action} failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }
  return payload.data as T;
}

async function listModel<T>(args: {
  modelName: RagModelName;
  query: string;
  resultKey: string;
  filter?: Record<string, unknown>,
  variables?: Record<string, unknown>,
  limit?: number,
  maxItems?: number,
  options: RagAuthContext,
}) {
  assertCanAccessRagModel(args.modelName, args.options);
  const items: T[] = [];
  let nextToken: string | null | undefined = null;
  const limit = args.limit ?? 1000;
  const maxItems = args.maxItems && args.maxItems > 0 ? args.maxItems : undefined;

  do {
    const data: Record<string, ModelListResult<T>> = await graphqlRequest<Record<string, ModelListResult<T>>>(
      `AWS list ${args.modelName}`,
      args.query,
      { ...(args.variables ?? {}), filter: args.filter, limit, nextToken },
      args.options,
    );
    const result: ModelListResult<T> | undefined = data[args.resultKey];
    items.push(...(result?.data ?? []));
    nextToken = result?.nextToken;
  } while (nextToken && (!maxItems || items.length < maxItems));

  return maxItems ? items.slice(0, maxItems) : items;
}

const KNOWLEDGE_DOCUMENT_FIELDS = `
  roleId documentVersionId extractionVersion extractionComplete processedSections failedSections
  indexGenerationId expectedChunkCount manifestHash publishedGeneration supersededAt
  id
  title
  sourceType
  category
  expertId
  expertName
  expertRole
  projectCode
  month
  year
  saCode
  activityName
  approvalStatus
  originalFileName
  s3Key
  textHash
  extractedTextPreview
  status
  indexedAt
  createdBy
  metadataJson
  createdAt
  updatedAt
`;

const KNOWLEDGE_CHUNK_FIELDS = `
  roleId documentVersionId extractionVersion extractionComplete processedSections failedSections
  indexGenerationId expectedChunkCount manifestHash publishedGeneration supersededAt
  id
  documentId
  chunkIndex
  text
  textHash
  embeddingJson
  embeddingModel
  tokenEstimate
  sourceType
  category
  expertId
  expertName
  projectCode
  month
  year
  saCode
  activityName
  status
  metadataJson
  createdAt
  updatedAt
`;

const ACTIVITY_AUTOFILL_AUDIT_FIELDS = `
  id
  expertId
  expertName
  expertRole
  category
  projectCode
  month
  year
  activityId
  deliverableIds
  suggestedSaCode
  suggestedActivityName
  suggestedDescriptionPreview
  confidence
  modelAuditId
  retrievalJson
  candidateJson
  warningsJson
  applied
  appliedAt
  finalSaCode
  finalActivityName
  finalDescriptionPreview
  createdAt
  updatedAt
`;

const LIST_KNOWLEDGE_CHUNKS_QUERY = `
  query ListKnowledgeChunks($filter: ModelKnowledgeChunkFilterInput, $limit: Int, $nextToken: String) {
    listKnowledgeChunks(filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items {
        ${KNOWLEDGE_CHUNK_FIELDS}
      }
      nextToken
    }
  }
`;

const LIST_KNOWLEDGE_DOCUMENTS_QUERY = `
  query ListKnowledgeDocuments($filter: ModelKnowledgeDocumentFilterInput, $limit: Int, $nextToken: String) {
    listKnowledgeDocuments(filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items { ${KNOWLEDGE_DOCUMENT_FIELDS} }
      nextToken
    }
  }
`;

const LIST_KNOWLEDGE_CHUNKS_BY_EXPERT_ID_QUERY = `
  query ListKnowledgeChunksByExpertId($expertId: ID!, $filter: ModelKnowledgeChunkFilterInput, $limit: Int, $nextToken: String) {
    listKnowledgeChunkByExpertId(expertId: $expertId, filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items {
        ${KNOWLEDGE_CHUNK_FIELDS}
      }
      nextToken
    }
  }
`;

const LIST_KNOWLEDGE_CHUNKS_BY_CATEGORY_AND_SOURCE_TYPE_QUERY = `
  query ListKnowledgeChunksByCategoryAndSourceType($category: String!, $sourceType: ModelStringKeyConditionInput, $filter: ModelKnowledgeChunkFilterInput, $limit: Int, $nextToken: String) {
    listKnowledgeChunkByCategoryAndSourceType(category: $category, sourceType: $sourceType, filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items {
        ${KNOWLEDGE_CHUNK_FIELDS}
      }
      nextToken
    }
  }
`;

const LIST_KNOWLEDGE_CHUNKS_BY_SA_CODE_QUERY = `
  query ListKnowledgeChunksBySaCode($saCode: String!, $filter: ModelKnowledgeChunkFilterInput, $limit: Int, $nextToken: String) {
    listKnowledgeChunkBySaCode(saCode: $saCode, filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items {
        ${KNOWLEDGE_CHUNK_FIELDS}
      }
      nextToken
    }
  }
`;

const CREATE_KNOWLEDGE_DOCUMENT_MUTATION = `
  mutation CreateKnowledgeDocument($input: CreateKnowledgeDocumentInput!) {
    createKnowledgeDocument(input: $input) {
      ${KNOWLEDGE_DOCUMENT_FIELDS}
    }
  }
`;

const CREATE_KNOWLEDGE_CHUNK_MUTATION = `
  mutation CreateKnowledgeChunk($input: CreateKnowledgeChunkInput!) {
    createKnowledgeChunk(input: $input) {
      ${KNOWLEDGE_CHUNK_FIELDS}
    }
  }
`;

const DELETE_KNOWLEDGE_DOCUMENT_MUTATION = `
  mutation DeleteKnowledgeDocument($input: DeleteKnowledgeDocumentInput!) {
    deleteKnowledgeDocument(input: $input) { id }
  }
`;

const DELETE_KNOWLEDGE_CHUNK_MUTATION = `
  mutation DeleteKnowledgeChunk($input: DeleteKnowledgeChunkInput!) {
    deleteKnowledgeChunk(input: $input) { id }
  }
`;

const LIST_ACTIVITY_AUTOFILL_AUDITS_QUERY = `
  query ListActivityAutofillAudits($filter: ModelActivityAutofillAuditFilterInput, $limit: Int, $nextToken: String) {
    listActivityAutofillAudits(filter: $filter, limit: $limit, nextToken: $nextToken) {
      data: items {
        ${ACTIVITY_AUTOFILL_AUDIT_FIELDS}
      }
      nextToken
    }
  }
`;

const CREATE_ACTIVITY_AUTOFILL_AUDIT_MUTATION = `
  mutation CreateActivityAutofillAudit($input: CreateActivityAutofillAuditInput!) {
    createActivityAutofillAudit(input: $input) {
      ${ACTIVITY_AUTOFILL_AUDIT_FIELDS}
    }
  }
`;

const UPDATE_ACTIVITY_AUTOFILL_AUDIT_MUTATION = `
  mutation UpdateActivityAutofillAudit($input: UpdateActivityAutofillAuditInput!) {
    updateActivityAutofillAudit(input: $input) {
      ${ACTIVITY_AUTOFILL_AUDIT_FIELDS}
    }
  }
`;

function mapKnowledgeDocument(item: any): KnowledgeDocument {
  return {
    roleId: item.roleId ?? undefined,
    documentVersionId: item.documentVersionId ?? undefined,
    extractionVersion: item.extractionVersion ?? undefined,
    extractionComplete: item.extractionComplete ?? undefined,
    processedSections: item.processedSections ?? [], failedSections: item.failedSections ?? [],
    indexGenerationId: item.indexGenerationId ?? undefined,
    expectedChunkCount: item.expectedChunkCount ?? undefined,
    manifestHash: item.manifestHash ?? undefined,
    publishedGeneration: item.publishedGeneration ?? undefined,
    supersededAt: item.supersededAt ?? undefined,
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
    roleId: item.roleId ?? undefined,
    documentVersionId: item.documentVersionId ?? undefined,
    extractionVersion: item.extractionVersion ?? undefined,
    extractionComplete: item.extractionComplete ?? undefined,
    processedSections: item.processedSections ?? [], failedSections: item.failedSections ?? [],
    indexGenerationId: item.indexGenerationId ?? undefined,
    expectedChunkCount: item.expectedChunkCount ?? undefined,
    manifestHash: item.manifestHash ?? undefined,
    publishedGeneration: item.publishedGeneration ?? undefined,
    supersededAt: item.supersededAt ?? undefined,
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

async function filterPublishedKnowledgeChunks(chunks: KnowledgeChunk[], options: RagAuthContext) {
  if (!chunks.length) return [];
  const parents: KnowledgeDocument[] = [];
  const ids = [...new Set(chunks.map((chunk) => chunk.documentId))];
  for (let start = 0; start < ids.length; start += 30) {
    parents.push(...await listKnowledgeDocuments({ or: ids.slice(start, start + 30).map((id) => ({ id: { eq: id } })) }, options));
  }
  return onlyPublishedChunks(chunks, parents);
}

export async function listKnowledgeChunks(
  filter?: Record<string, unknown>,
  options: ({ limit?: number; maxItems?: number } & RagAuthContext) = {},
) {
  const data = await listModel<any>({
    modelName: 'KnowledgeChunk',
    query: LIST_KNOWLEDGE_CHUNKS_QUERY,
    resultKey: 'listKnowledgeChunks',
    filter,
    limit: options.limit,
    maxItems: options.maxItems,
    options,
  });
  return filterPublishedKnowledgeChunks(data.map(mapKnowledgeChunk), options);
}

export async function listKnowledgeDocuments(
  filter?: Record<string, unknown>,
  options: ({ limit?: number; maxItems?: number } & RagAuthContext) = {},
) {
  const data = await listModel<any>({
    modelName: 'KnowledgeDocument',
    query: LIST_KNOWLEDGE_DOCUMENTS_QUERY,
    resultKey: 'listKnowledgeDocuments',
    filter,
    limit: options.limit,
    maxItems: options.maxItems,
    options,
  });
  return data.map(mapKnowledgeDocument);
}

export async function listKnowledgeChunksByExpertId(
  expertId: string,
  filter?: Record<string, unknown>,
  options: ({ limit?: number; maxItems?: number } & RagAuthContext) = {},
) {
  const data = await listModel<any>({
    modelName: 'KnowledgeChunk',
    query: LIST_KNOWLEDGE_CHUNKS_BY_EXPERT_ID_QUERY,
    resultKey: 'listKnowledgeChunkByExpertId',
    variables: { expertId },
    filter,
    limit: options.limit,
    maxItems: options.maxItems,
    options,
  });
  return filterPublishedKnowledgeChunks(data.map(mapKnowledgeChunk), options);
}

export async function listKnowledgeChunksByCategoryAndSourceType(
  category: string,
  sourceType: string,
  filter?: Record<string, unknown>,
  options: ({ limit?: number; maxItems?: number } & RagAuthContext) = {},
) {
  const data = await listModel<any>({
    modelName: 'KnowledgeChunk',
    query: LIST_KNOWLEDGE_CHUNKS_BY_CATEGORY_AND_SOURCE_TYPE_QUERY,
    resultKey: 'listKnowledgeChunkByCategoryAndSourceType',
    variables: { category, sourceType: { eq: sourceType } },
    filter,
    limit: options.limit,
    maxItems: options.maxItems,
    options,
  });
  return filterPublishedKnowledgeChunks(data.map(mapKnowledgeChunk), options);
}

export async function listKnowledgeChunksBySaCode(
  saCode: string,
  filter?: Record<string, unknown>,
  options: ({ limit?: number; maxItems?: number } & RagAuthContext) = {},
) {
  const data = await listModel<any>({
    modelName: 'KnowledgeChunk',
    query: LIST_KNOWLEDGE_CHUNKS_BY_SA_CODE_QUERY,
    resultKey: 'listKnowledgeChunkBySaCode',
    variables: { saCode },
    filter,
    limit: options.limit,
    maxItems: options.maxItems,
    options,
  });
  return filterPublishedKnowledgeChunks(data.map(mapKnowledgeChunk), options);
}

export async function indexKnowledgeDocument(
  input: RagIndexDocumentInput,
  options: { dryRun?: boolean } & RagAuthContext = {},
): Promise<RagIndexDocumentResult> {
  const text = normalizeRagText(input.text);
  const chunks = splitTextIntoRagChunks({ text });
  const textHash = hashRagText(text);
  const extractedTextPreview = text.slice(0, 800);
  const embeddingModel = getRagEmbeddingModelName();
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.extractionSource ? { extractionSource: input.extractionSource } : {}),
    ...(input.extractionComplete !== undefined ? { extractionComplete: input.extractionComplete } : {}),
  };

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
        metadataJson: Object.keys(metadata).length ? JSON.stringify(metadata) : undefined,
      })),
    };
  }

  return publishIndexGeneration(input, embeddingModel, {
    getDocument: async (id) => {
      const data = await graphqlRequest<{ getKnowledgeDocument: KnowledgeDocument | null }>('Read index generation',
        `query GetIndexDocument($id: ID!) { getKnowledgeDocument(id: $id) { ${KNOWLEDGE_DOCUMENT_FIELDS} } }`, { id }, options);
      return data.getKnowledgeDocument;
    },
    createDocument: async (document) => {
      await graphqlRequest('Stage index document', CREATE_KNOWLEDGE_DOCUMENT_MUTATION, { input: document }, options);
    },
    listChunks: async (documentId, generationId) => {
      const data = await listModel<any>({ modelName: 'KnowledgeChunk', query: LIST_KNOWLEDGE_CHUNKS_QUERY,
        resultKey: 'listKnowledgeChunks', filter: { documentId: { eq: documentId }, indexGenerationId: { eq: generationId } }, options });
      return data.map(mapKnowledgeChunk);
    },
    putChunk: async (chunk) => {
      try { await createKnowledgeChunk(chunk, options); }
      catch (error) {
        const data = await graphqlRequest<{ getKnowledgeChunk: KnowledgeChunk | null }>('Verify idempotent chunk',
          `query GetIndexChunk($id: ID!) { getKnowledgeChunk(id: $id) { ${KNOWLEDGE_CHUNK_FIELDS} } }`, { id: chunk.id }, options);
        if (!data.getKnowledgeChunk || data.getKnowledgeChunk.textHash !== chunk.textHash) throw error;
      }
    },
    publish: async (document, previousGeneration) => {
      await graphqlRequest('Publish verified index generation',
        `mutation PublishIndex($input: UpdateKnowledgeDocumentInput!, $condition: ModelKnowledgeDocumentConditionInput) {
          updateKnowledgeDocument(input: $input, condition: $condition) { id publishedGeneration }
        }`, { input: document, condition: { and: [{ id: { attributeExists: true } }, previousGeneration
          ? { publishedGeneration: { eq: previousGeneration } }
          : { or: [{ publishedGeneration: { attributeExists: false } }, { publishedGeneration: { attributeType: '_null' } }] }] } }, options);
    },
    embed: (texts) => generateEmbeddings(texts, { runId: `index_${hashRagText(JSON.stringify([textHash, input.projectCode, input.sourceType, input.expertId, input.roleId, input.saCode]))}`, actorId: input.createdBy, projectCode: input.projectCode }),
  });
}

export async function createKnowledgeDocument(input: RagIndexDocumentInput & {
  textHash: string;
  extractedTextPreview: string;
}, options: RagAuthContext = {}) {
  assertCanAccessRagModel('KnowledgeDocument', options);
  const inputPayload = {
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
  };
  const data = await graphqlRequest<{ createKnowledgeDocument?: unknown }>(
    'AWS create KnowledgeDocument',
    CREATE_KNOWLEDGE_DOCUMENT_MUTATION,
    { input: inputPayload },
    options,
  );
  if (!data.createKnowledgeDocument) {
    throw new Error('AWS create KnowledgeDocument returned no data.');
  }
  return mapKnowledgeDocument(data.createKnowledgeDocument);
}

export async function createKnowledgeChunk(
  input: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>,
  options: RagAuthContext = {},
) {
  assertCanAccessRagModel('KnowledgeChunk', options);
  const data = await graphqlRequest<{ createKnowledgeChunk?: unknown }>(
    'AWS create KnowledgeChunk',
    CREATE_KNOWLEDGE_CHUNK_MUTATION,
    { input },
    options,
  );
  if (!data.createKnowledgeChunk) {
    throw new Error('AWS create KnowledgeChunk returned no data.');
  }
  return mapKnowledgeChunk(data.createKnowledgeChunk);
}

export async function createKnowledgeChunks(
  inputs: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>[],
  options: RagAuthContext = {},
) {
  const chunks: KnowledgeChunk[] = [];
  for (let start = 0; start < inputs.length; start += 8) {
    const batch = await Promise.all(inputs.slice(start, start + 8).map((input) => createKnowledgeChunk(input, options)));
    chunks.push(...batch.filter((chunk): chunk is KnowledgeChunk => Boolean(chunk)));
  }
  return chunks;
}

export async function deleteKnowledgeDocument(documentId: string, options: RagAuthContext = {}) {
  assertCanAccessRagModel('KnowledgeDocument', options);
  const chunks = await listKnowledgeChunks({ documentId: { eq: documentId } }, options);
  for (const chunk of chunks) {
    await graphqlRequest(
      'AWS delete KnowledgeChunk',
      DELETE_KNOWLEDGE_CHUNK_MUTATION,
      { input: { id: chunk.id } },
      options,
    );
  }
  const data = await graphqlRequest<{ deleteKnowledgeDocument?: { id?: string } }>(
    'AWS delete KnowledgeDocument',
    DELETE_KNOWLEDGE_DOCUMENT_MUTATION,
    { input: { id: documentId } },
    options,
  );
  return Boolean(data.deleteKnowledgeDocument?.id);
}

export async function backfillMissingRagProject(model: ProjectBackfillModel, nextToken: string | null, options: RagAuthContext) {
  assertCanAccessRagModel(model, options);
  return backfillProjectPage(model, nextToken, (query, variables) =>
    graphqlRequest<Record<string, unknown>>('RAG project backfill', query, variables, options));
}

export async function backfillKnowledgeMetadata(nextToken: string | null, options: RagAuthContext) {
  assertCanAccessRagModel('KnowledgeDocument', options);
  return backfillRagMetadataPage(nextToken, (query, variables) => graphqlRequest<Record<string, unknown>>('RAG metadata migration', query, variables, options));
}

export async function createActivityAutofillAudit(
  input: ActivityAutofillAuditInput,
  options: RagAuthContext = {},
) {
  assertCanAccessRagModel('ActivityAutofillAudit', options);
  const { suggestion: _suggestion, ...payload } = input;
  const data = await graphqlRequest<{ createActivityAutofillAudit?: unknown }>(
    'AWS create ActivityAutofillAudit',
    CREATE_ACTIVITY_AUTOFILL_AUDIT_MUTATION,
    { input: payload },
    options,
  );
  if (!data.createActivityAutofillAudit) {
    throw new Error('AWS create ActivityAutofillAudit returned no data.');
  }
  return mapActivityAutofillAudit(data.createActivityAutofillAudit);
}

export async function markActivityAutofillAuditApplied(input: {
  id?: string;
  modelAuditId?: string;
  finalSaCode?: string;
  finalActivityName?: string;
  finalDescriptionPreview?: string;
}, options: RagAuthContext = {}) {
  let id = input.id;
  if (!id && input.modelAuditId) {
    const matches = await listModel<any>({
      modelName: 'ActivityAutofillAudit',
      query: LIST_ACTIVITY_AUTOFILL_AUDITS_QUERY,
      resultKey: 'listActivityAutofillAudits',
      filter: { modelAuditId: { eq: input.modelAuditId } },
      options,
    });
    id = matches[0]?.id;
  }

  if (!id) return null;

  assertCanAccessRagModel('ActivityAutofillAudit', options);
  const data = await graphqlRequest<{ updateActivityAutofillAudit?: unknown }>(
    'AWS update ActivityAutofillAudit',
    UPDATE_ACTIVITY_AUTOFILL_AUDIT_MUTATION,
    {
      input: {
        id,
        applied: true,
        appliedAt: new Date().toISOString(),
        finalSaCode: input.finalSaCode,
        finalActivityName: input.finalActivityName,
        finalDescriptionPreview: input.finalDescriptionPreview,
      },
    },
    options,
  );
  if (!data.updateActivityAutofillAudit) {
    throw new Error('AWS update ActivityAutofillAudit returned no data.');
  }
  return mapActivityAutofillAudit(data.updateActivityAutofillAudit);
}

export async function listActivityAutofillAudits(filter?: Record<string, unknown>, options: RagAuthContext = {}) {
  const data = await listModel<any>({
    modelName: 'ActivityAutofillAudit',
    query: LIST_ACTIVITY_AUTOFILL_AUDITS_QUERY,
    resultKey: 'listActivityAutofillAudits',
    filter,
    options,
  });
  return data.map(mapActivityAutofillAudit).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
