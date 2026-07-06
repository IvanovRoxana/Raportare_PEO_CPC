import type { ActivityAutofillSuggestion } from '../activity-autofill.ts';
import { normalizeRagText } from './chunking.ts';
import type { CompactRagContext, RagRetrievalRequest, RagRetrievalResult } from './types.ts';

const MAX_PROMPT_CHUNKS = 6;
const MAX_CHUNK_PROMPT_CHARS = 900;
const MAX_PREVIEW_CHARS = 500;

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}

function preview(value?: string | null, maxChars = MAX_PREVIEW_CHARS) {
  return normalizeRagText(value).slice(0, maxChars);
}

export function buildCompactActivityAutofillRagContext(result: RagRetrievalResult): CompactRagContext | undefined {
  if (!result.enabled || result.chunks.length === 0) return undefined;

  const promptItems = result.chunks.slice(0, MAX_PROMPT_CHUNKS).map(({ chunk, score, rank }) => ({
    rank,
    score: Number(score.toFixed(4)),
    sourceType: chunk.sourceType,
    expertName: chunk.expertName,
    month: chunk.month,
    year: chunk.year,
    saCode: chunk.saCode,
    activityName: chunk.activityName,
    text: preview(chunk.text, MAX_CHUNK_PROMPT_CHARS),
  }));

  const auditItems = result.chunks.map(({ chunk, score, rank }) => ({
    rank,
    score: Number(score.toFixed(4)),
    chunkId: chunk.id,
    documentId: chunk.documentId,
    sourceType: chunk.sourceType,
    category: chunk.category,
    expertName: chunk.expertName,
    projectCode: chunk.projectCode,
    month: chunk.month,
    year: chunk.year,
    saCode: chunk.saCode,
    activityName: chunk.activityName,
    textPreview: preview(chunk.text),
    metadataJson: chunk.metadataJson,
  }));

  return {
    promptContext: JSON.stringify(promptItems, null, 2),
    retrievalJson: safeJson({
      embeddingModel: result.queryEmbeddingModel,
      skippedReason: result.skippedReason,
      chunks: auditItems,
    }),
    candidateJson: safeJson(promptItems),
    warnings: result.warnings,
  };
}

export function buildActivityAutofillAuditPayload(input: {
  request: RagRetrievalRequest;
  suggestion: ActivityAutofillSuggestion;
  modelAuditId?: string;
  ragContext?: CompactRagContext;
}) {
  const firstCategory = input.request.category
    || input.request.catalogCandidates.find((candidate) => candidate.category)?.category;

  return {
    expertId: input.request.expertId,
    expertName: input.request.expertName,
    expertRole: input.request.expertRole,
    category: firstCategory,
    projectCode: input.request.projectCode,
    month: typeof input.request.month === 'string' ? Number(input.request.month) : input.request.month,
    year: typeof input.request.year === 'string' ? Number(input.request.year) : input.request.year,
    deliverableIds: input.request.deliverables.map((deliverable) => deliverable.id).filter((id): id is string => Boolean(id)),
    activityId: input.request.selectedActivityId,
    suggestedSaCode: input.request.saCode,
    suggestedActivityName: input.request.activityName,
    suggestedDescriptionPreview: preview(input.suggestion.description),
    confidence: input.suggestion.confidence,
    modelAuditId: input.modelAuditId,
    retrievalJson: input.ragContext?.retrievalJson,
    candidateJson: input.ragContext?.candidateJson,
    warningsJson: safeJson([
      ...(input.ragContext?.warnings ?? []),
      ...(input.suggestion.warnings ?? []),
    ]),
    applied: false,
    suggestion: input.suggestion,
  };
}
