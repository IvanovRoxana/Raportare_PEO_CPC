import outputs from '../../amplify_outputs.json';
import type {
  ActivityAutofillAudit,
  KnowledgeChunk,
  KnowledgeDocument,
} from '../types.ts';
import { getRagEmbeddingModelName, generateEmbeddings, serializeEmbedding } from './embeddings.ts';
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

  const response = await fetch(RAG_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: options.authToken,
    },
    body: JSON.stringify({ query, variables }),
  });

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
  limit?: number,
  options: RagAuthContext,
}) {
  assertCanAccessRagModel(args.modelName, args.options);
  const items: T[] = [];
  let nextToken: string | null | undefined = null;
  const limit = args.limit ?? 1000;

  do {
    const data: Record<string, ModelListResult<T>> = await graphqlRequest<Record<string, ModelListResult<T>>>(
      `AWS list ${args.modelName}`,
      args.query,
      { filter: args.filter, limit, nextToken },
      args.options,
    );
    const result: ModelListResult<T> | undefined = data[args.resultKey];
    items.push(...(result?.data ?? []));
    nextToken = result?.nextToken;
  } while (nextToken);

  return items;
}

const KNOWLEDGE_DOCUMENT_FIELDS = `
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

export async function listKnowledgeChunks(filter?: Record<string, unknown>, options: RagAuthContext = {}) {
  const data = await listModel<any>({
    modelName: 'KnowledgeChunk',
    query: LIST_KNOWLEDGE_CHUNKS_QUERY,
    resultKey: 'listKnowledgeChunks',
    filter,
    options,
  });
  return data.map(mapKnowledgeChunk);
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
  }, options);

  if (!document) {
    throw new Error('AWS create KnowledgeDocument returned no data.');
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
  })), options);

  return { dryRun: false, document, chunks: savedChunks };
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
  for (const input of inputs) {
    const chunk = await createKnowledgeChunk(input, options);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
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
