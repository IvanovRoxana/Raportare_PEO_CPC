import {
  getActivityAutofillRagAllowedCategories,
  getActivityAutofillRagAllowedPositions,
  isActivityAutofillRagEnabled,
  isActivityAutofillRagPaOnly,
} from '../feature-flags.ts';
import { normalizePeoCategory } from '../peo-category.ts';
import { getActivityAutofillDeliverableEvidenceText } from '../activity-autofill.ts';
import type { KnowledgeChunk } from '../types.ts';
import { normalizeRagText } from './chunking.ts';
import { cosineSimilarity, generateEmbedding, getRagEmbeddingModelName, parseEmbedding } from './embeddings.ts';
import { findSaPurposeContext, type SaPurposeRetrievalResult } from './sa-purpose.ts';
import type { RagAuthContext, RagRetrievalRequest, RagRetrievalResult } from './types.ts';

const MAX_QUERY_CHARS = 5000;
const MAX_CHUNKS_TO_SCORE = 900;
const DEFAULT_TOP_K = 8;
const DEFAULT_RETRIEVAL_TIMEOUT_MS = 5500;
const APPROVED_REPORT_SOURCE_TYPE = 'raportare_aprobata_oir';
const REFERENCE_SOURCE_TYPES = ['cerere_finantare', 'manual_beneficiar', 'descriere_activitati', 'fisa_post'];
const SA_PURPOSE_SOURCE_TYPES = ['scop_sa', 'descriere_activitati', 'other'];
const MIN_EXPERT_HISTORY_CHUNKS = 30;

type CandidateBucket = 'expert_history' | 'position_history' | 'same_sa' | 'reference';

interface CandidateChunk {
  chunk: KnowledgeChunk;
  bucket: CandidateBucket;
}

function toNumber(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isPaRagCategory(category?: string) {
  return normalizePeoCategory(category) === 'ap';
}

function normalizeScopeValue(value?: string) {
  return normalizeRagText(value ?? '').toLocaleLowerCase('ro-RO');
}

function getRequestProjectPosition(request: Pick<RagRetrievalRequest, 'expertRole' | 'positionInProject'>) {
  return request.positionInProject?.trim() || request.expertRole?.trim() || '';
}

function getAllowedCategorySet() {
  return new Set(getActivityAutofillRagAllowedCategories().map((category) => normalizePeoCategory(category)).filter(Boolean));
}

function getAllowedPositionSet() {
  return new Set(getActivityAutofillRagAllowedPositions().map(normalizeScopeValue).filter(Boolean));
}

function isExplicitlyAllowedRagScope(request: Pick<RagRetrievalRequest, 'category' | 'expertRole' | 'positionInProject'>) {
  const category = normalizePeoCategory(request.category);
  if (category && getAllowedCategorySet().has(category)) return true;

  const position = normalizeScopeValue(getRequestProjectPosition(request));
  return Boolean(position && getAllowedPositionSet().has(position));
}

export function shouldRunActivityAutofillRag(request: Pick<RagRetrievalRequest, 'category' | 'expertRole' | 'positionInProject'>) {
  if (!isActivityAutofillRagEnabled()) return { ok: false as const, reason: 'rag_disabled' };
  if (isActivityAutofillRagPaOnly() && !isPaRagCategory(request.category) && !isExplicitlyAllowedRagScope(request)) {
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
      getActivityAutofillDeliverableEvidenceText(deliverable),
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const selectedCatalog = request.catalogCandidates.find((candidate) => (
    candidate.saCode === request.saCode && candidate.activityName === request.activityName
  ));

  const catalogText = [
    request.selectedActivityId,
    request.saCode,
    request.activityName,
    request.currentDescription,
    selectedCatalog?.description,
    selectedCatalog?.objectives,
    selectedCatalog?.deliverables,
    selectedCatalog?.indicators,
  ].filter(Boolean).join(' | ');

  return normalizeRagText([
    `Expert: ${request.expertName ?? ''}`,
    `Pozitie in proiect: ${getRequestProjectPosition(request)}`,
    `Rol: ${request.expertRole ?? ''}`,
    `Categorie: ${request.category ?? ''}`,
    `Proiect: ${request.projectCode ?? ''}`,
    `Luna/an: ${request.month ?? ''}/${request.year ?? ''}`,
    'Livrabile:',
    deliverableText,
    'Activitate selectata:',
    catalogText,
  ].join('\n')).slice(0, MAX_QUERY_CHARS);
}

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

function requestOptions(
  options: RagAuthContext,
  deadline: number,
  maxItems: number,
  limit = Math.min(maxItems, 100),
) {
  const remaining = remainingMs(deadline);
  if (remaining <= 250) return null;
  return {
    ...options,
    limit,
    maxItems,
    timeoutMs: Math.max(250, Math.min(2000, remaining)),
  };
}

function activeChunkFilter(category?: string, extra: Record<string, unknown> = {}) {
  return {
    status: { eq: 'active' },
    ...(category ? { category: { eq: category } } : {}),
    ...extra,
  };
}

function getCandidateSaCodes(request: RagRetrievalRequest) {
  return request.saCode?.trim() ? [request.saCode.trim()] : [];
}

function addUniqueCandidates(
  target: CandidateChunk[],
  seen: Set<string>,
  chunks: KnowledgeChunk[],
  bucket: CandidateBucket,
) {
  chunks.forEach((chunk) => {
    if (!chunk.id || seen.has(chunk.id)) return;
    seen.add(chunk.id);
    target.push({ chunk, bucket });
  });
}

function selectDiverseTopChunks(
  candidates: CandidateChunk[],
  queryEmbedding: number[],
  topK: number,
) {
  const scored = candidates
    .slice(0, MAX_CHUNKS_TO_SCORE)
    .map(({ chunk, bucket }) => ({
      chunk,
      bucket,
      score: cosineSimilarity(queryEmbedding, parseEmbedding(chunk.embeddingJson)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const quotas: Record<CandidateBucket, number> = {
    expert_history: Math.max(4, Math.ceil(topK / 2)),
    position_history: Math.max(2, Math.ceil(topK / 3)),
    same_sa: Math.max(2, Math.ceil(topK / 3)),
    reference: 2,
  };
  const used = new Set<string>();
  const selected: typeof scored = [];
  const counts: Record<CandidateBucket, number> = {
    expert_history: 0,
    position_history: 0,
    same_sa: 0,
    reference: 0,
  };

  for (const item of scored) {
    if (selected.length >= topK) break;
    if (counts[item.bucket] >= quotas[item.bucket]) continue;
    selected.push(item);
    used.add(item.chunk.id);
    counts[item.bucket] += 1;
  }

  for (const item of scored) {
    if (selected.length >= topK) break;
    if (used.has(item.chunk.id)) continue;
    selected.push(item);
    used.add(item.chunk.id);
  }

  return selected.map((item, index) => ({
    chunk: item.chunk,
    score: item.score,
    rank: index + 1,
  }));
}

function metadataForChunk(chunk: KnowledgeChunk) {
  if (!chunk.metadataJson) return {};
  try {
    const parsed = JSON.parse(chunk.metadataJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function chunkMatchesProjectPosition(chunk: KnowledgeChunk, position: string) {
  const expected = normalizeScopeValue(position);
  if (!expected) return false;
  const metadata = metadataForChunk(chunk);
  const values = [
    metadata.positionInProject,
    metadata.projectPosition,
    metadata.expertRole,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeScopeValue);
  return values.some((value) => value === expected);
}

function filterChunksByProjectPosition(chunks: KnowledgeChunk[], request: RagRetrievalRequest, requireMatch = false) {
  const position = getRequestProjectPosition(request);
  if (!position) return chunks;
  const matching = chunks.filter((chunk) => chunkMatchesProjectPosition(chunk, position));
  if (matching.length > 0 || requireMatch) return matching;
  return chunks;
}

async function collectRagCandidates(
  request: RagRetrievalRequest,
  options: RagAuthContext,
  deadline: number,
) {
  const category = normalizePeoCategory(request.category) || undefined;
  const candidates: CandidateChunk[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  const store = await import('./store.ts');

  const run = async (
    label: string,
    bucket: CandidateBucket,
    fn: () => Promise<KnowledgeChunk[]>,
  ) => {
    if (remainingMs(deadline) <= 250) {
      warnings.push(`Bugetul de timp RAG s-a incheiat inainte de ${label}.`);
      return;
    }

    try {
      addUniqueCandidates(candidates, seen, await fn(), bucket);
    } catch (error) {
      console.warn(`[activity-autofill-rag] Candidate pool failed: ${label}`, error);
      warnings.push(`Pool RAG indisponibil: ${label}.`);
    }
  };

  if (request.expertId) {
    await run('istoric expert dupa expertId', 'expert_history', async () => {
      const requestConfig = requestOptions(options, deadline, 350);
      if (!requestConfig) return [];
      return store.listKnowledgeChunksByExpertId(
        request.expertId!,
        activeChunkFilter(category, { sourceType: { eq: APPROVED_REPORT_SOURCE_TYPE } }),
        requestConfig,
      );
    });
  }

  if (request.expertName && candidates.filter((item) => item.bucket === 'expert_history').length < MIN_EXPERT_HISTORY_CHUNKS) {
    await run('istoric expert dupa nume', 'expert_history', async () => {
      const requestConfig = requestOptions(options, deadline, 350);
      if (!requestConfig || !category) return [];
      return store.listKnowledgeChunksByCategoryAndSourceType(
        category,
        APPROVED_REPORT_SOURCE_TYPE,
        activeChunkFilter(undefined, { expertName: { eq: request.expertName } }),
        requestConfig,
      );
    });
  }

  if (category && getRequestProjectPosition(request)) {
    await run('istoric dupa pozitia in proiect', 'position_history', async () => {
      const requestConfig = requestOptions(options, deadline, 350);
      if (!requestConfig) return [];
      const chunks = await store.listKnowledgeChunksByCategoryAndSourceType(
        category,
        APPROVED_REPORT_SOURCE_TYPE,
        activeChunkFilter(),
        requestConfig,
      );
      return filterChunksByProjectPosition(chunks, request, true);
    });
  }

  for (const saCode of getCandidateSaCodes(request)) {
    await run(`istoric categorie pentru ${saCode}`, 'same_sa', async () => {
      const requestConfig = requestOptions(options, deadline, 120, 80);
      if (!requestConfig) return [];
      const chunks = await store.listKnowledgeChunksBySaCode(
        saCode,
        activeChunkFilter(category, { sourceType: { eq: APPROVED_REPORT_SOURCE_TYPE } }),
        requestConfig,
      );
      return filterChunksByProjectPosition(chunks, request);
    });
  }

  for (const sourceType of REFERENCE_SOURCE_TYPES) {
    await run(`sursa generala ${sourceType}`, 'reference', async () => {
      const requestConfig = requestOptions(options, deadline, 80, 80);
      if (!requestConfig || !category) return [];
      return store.listKnowledgeChunksByCategoryAndSourceType(
        category,
        sourceType,
        activeChunkFilter(),
        requestConfig,
      );
    });
  }

  return { candidates, warnings };
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

    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_RETRIEVAL_TIMEOUT_MS);
    const { candidates, warnings } = await collectRagCandidates(request, options, deadline);
    const scored = selectDiverseTopChunks(candidates, queryEmbedding, options.topK ?? DEFAULT_TOP_K);

    return {
      enabled: true,
      queryText,
      queryEmbeddingModel: getRagEmbeddingModelName(),
      chunks: scored,
      warnings: [
        ...warnings,
        ...(candidates.length === 0 ? ['Nu exista fragmente RAG indexate pentru contextul selectat.'] : []),
        ...(remainingMs(deadline) <= 250 ? ['RAG a folosit rezultatele gasite in bugetul de timp disponibil.'] : []),
      ],
    };
  } catch (error) {
    console.warn('[activity-autofill-rag] Retrieval failed; continuing without RAG.', error);
    return {
      enabled: true,
      skippedReason: 'retrieval_failed',
      chunks: [],
      warnings: ['Retrieval RAG indisponibil; descrierea asistata a continuat fara context RAG.'],
    };
  }
}

export async function retrieveSaPurposeContext(
  request: Pick<RagRetrievalRequest, 'saCode' | 'category'>,
  options: RagAuthContext = {},
): Promise<SaPurposeRetrievalResult> {
  const saCode = request.saCode?.trim();
  if (!saCode) {
    return { found: false, warnings: ['Codul SA lipseste; scopul oficial nu a putut fi identificat.'] };
  }
  if (!options.authToken) {
    return {
      found: false,
      warnings: ['Scopul oficial al SA nu a putut fi citit fara sesiunea Cognito a utilizatorului.'],
    };
  }

  try {
    const store = await import('./store.ts');
    for (const sourceType of SA_PURPOSE_SOURCE_TYPES) {
      const directChunks = await store.listKnowledgeChunksBySaCode(
        saCode,
        activeChunkFilter(undefined, { sourceType: { eq: sourceType } }),
        { ...options, limit: 100, maxItems: 300 },
      );
      const directContext = findSaPurposeContext(directChunks, saCode);
      if (directContext) return { found: true, context: directContext, warnings: [] };
    }

    const category = normalizePeoCategory(request.category) || undefined;
    for (const sourceType of SA_PURPOSE_SOURCE_TYPES) {
      const scopedChunks = category
        ? await store.listKnowledgeChunksByCategoryAndSourceType(
            category,
            sourceType,
            activeChunkFilter(),
            { ...options, limit: 100, maxItems: 500 },
          )
        : [];
      const scopedContext = findSaPurposeContext(scopedChunks, saCode);
      if (scopedContext) return { found: true, context: scopedContext, warnings: [] };

      const globalChunks = await store.listKnowledgeChunks(
        activeChunkFilter(undefined, { sourceType: { eq: sourceType } }),
        { ...options, limit: 100, maxItems: 500 },
      );
      const context = findSaPurposeContext(globalChunks, saCode);
      if (context) return { found: true, context, warnings: [] };
    }

    return {
      found: false,
      warnings: [`Nu a fost gasita in baza RAG sectiunea oficiala pentru ${saCode}.`],
    };
  } catch (error) {
    console.warn('[activity-autofill-rag] SA purpose retrieval failed.', error);
    return {
      found: false,
      warnings: [`Scopul oficial pentru ${saCode} nu a putut fi citit din baza RAG.`],
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
