import {
  isActivityAutofillRagEnabled,
  isActivityAutofillRagPaOnly,
} from '../feature-flags.ts';
import { normalizePeoCategory } from '../peo-category.ts';
import { normalizeRagText } from './chunking.ts';
import { cosineSimilarity, generateEmbedding, getRagEmbeddingModelName, parseEmbedding } from './embeddings.ts';
import type { RagAuthContext, RagRetrievalRequest, RagRetrievalResult } from './types.ts';

const MAX_QUERY_CHARS = 5000;
const MAX_CANDIDATES_FOR_QUERY = 12;
const MAX_CHUNKS_TO_SCORE = 2000;
const DEFAULT_TOP_K = 8;

function toNumber(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isPaRagCategory(category?: string) {
  return normalizePeoCategory(category) === 'ap';
}

export function shouldRunActivityAutofillRag(request: Pick<RagRetrievalRequest, 'category'>) {
  if (!isActivityAutofillRagEnabled()) return { ok: false as const, reason: 'rag_disabled' };
  if (isActivityAutofillRagPaOnly() && !isPaRagCategory(request.category)) {
    return { ok: false as const, reason: 'not_pa_category' };
  }
  return { ok: true as const };
}

export function buildActivityAutofillRagQuery(request: RagRetrievalRequest) {
  const deliverableText = request.deliverables
    .map((deliverable) => [
      deliverable.documentTitle,
      deliverable.deliverableType,
      deliverable.eligibilitySummary,
      deliverable.extractedText,
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const catalogText = request.catalogCandidates
    .slice(0, MAX_CANDIDATES_FOR_QUERY)
    .map((candidate) => [
      candidate.saCode,
      candidate.activityName,
      candidate.description,
      candidate.objectives,
      candidate.deliverables,
      candidate.indicators,
    ].filter(Boolean).join(' | '))
    .join('\n');

  return normalizeRagText([
    `Expert: ${request.expertName ?? ''}`,
    `Rol: ${request.expertRole ?? ''}`,
    `Categorie: ${request.category ?? ''}`,
    `Proiect: ${request.projectCode ?? ''}`,
    `Luna/an: ${request.month ?? ''}/${request.year ?? ''}`,
    'Livrabile:',
    deliverableText,
    'Catalog candidat:',
    catalogText,
  ].join('\n')).slice(0, MAX_QUERY_CHARS);
}

export async function retrieveActivityAutofillContext(
  request: RagRetrievalRequest,
  options: { topK?: number } & RagAuthContext = {},
): Promise<RagRetrievalResult> {
  const guard = shouldRunActivityAutofillRag(request);
  if (!guard.ok) {
    return { enabled: false, skippedReason: guard.reason, chunks: [], warnings: [] };
  }

  try {
    const queryText = buildActivityAutofillRagQuery(request);
    if (!queryText) {
      return { enabled: true, skippedReason: 'empty_query', chunks: [], warnings: [] };
    }

    const queryEmbedding = await generateEmbedding(queryText);
    if (queryEmbedding.length === 0) {
      return { enabled: true, skippedReason: 'empty_embedding', chunks: [], warnings: ['Nu s-a putut genera embedding pentru query.'] };
    }

    const category = normalizePeoCategory(request.category) || undefined;
    const { listKnowledgeChunks } = await import('./store.ts');
    const chunks = await listKnowledgeChunks({
      status: { eq: 'active' },
      ...(category ? { category: { eq: category } } : {}),
    }, options);

    const scored = chunks
      .slice(0, MAX_CHUNKS_TO_SCORE)
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, parseEmbedding(chunk.embeddingJson)),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK ?? DEFAULT_TOP_K)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return {
      enabled: true,
      queryText,
      queryEmbeddingModel: getRagEmbeddingModelName(),
      chunks: scored,
      warnings: chunks.length === 0 ? ['Nu exista fragmente RAG indexate pentru categoria PA.'] : [],
    };
  } catch (error) {
    console.warn('[activity-autofill-rag] Retrieval failed; continuing without RAG.', error);
    return {
      enabled: true,
      skippedReason: 'retrieval_failed',
      chunks: [],
      warnings: ['Retrieval RAG indisponibil; autocompletarea a continuat fara context RAG.'],
    };
  }
}

export function buildActivityAutofillAuditBase(request: RagRetrievalRequest) {
  return {
    expertId: request.expertId,
    expertName: request.expertName,
    expertRole: request.expertRole,
    category: normalizePeoCategory(request.category) || request.category,
    projectCode: request.projectCode,
    month: toNumber(request.month),
    year: toNumber(request.year),
    deliverableIds: request.deliverables.map((deliverable) => deliverable.id).filter((id): id is string => Boolean(id)),
  };
}
