import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import { isActivityAutofillRagAuditEnabled } from '@/lib/feature-flags';
import {
  activityAutofillRequestSchema,
  activityAutofillSuggestionSchema,
  buildActivityAutofillPrompt,
  normalizeActivityAutofillRequest,
  validateActivityAutofillSuggestionAgainstCatalog,
} from '@/lib/activity-autofill';
import { buildActivityAutofillAuditPayload, buildCompactActivityAutofillRagContext } from '@/lib/rag/activity-autofill-rag';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { retrieveActivityAutofillContext } from '@/lib/rag/retrieval';
import { createActivityAutofillAudit } from '@/lib/rag/store';
import type { RagRetrievalResult } from '@/lib/rag/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uniqueMessages(messages: string[]) {
  return Array.from(new Set(messages.map((message) => message.trim()).filter(Boolean)));
}

function buildRagResponse(retrieval: RagRetrievalResult, authToken: string) {
  const authWarnings = retrieval.enabled && !authToken
    ? ['RAG intern nu a putut fi citit fara sesiunea Cognito a utilizatorului; autocompletarea a continuat fara context RAG.']
    : [];

  return {
    enabled: retrieval.enabled,
    used: retrieval.enabled && retrieval.chunks.length > 0,
    skippedReason: retrieval.skippedReason,
    chunks: retrieval.chunks.length,
    warnings: uniqueMessages([...authWarnings, ...retrieval.warnings]),
    sources: retrieval.chunks.slice(0, 6).map(({ chunk, score, rank }) => ({
      rank,
      score: Number(score.toFixed(4)),
      sourceType: chunk.sourceType,
      expertName: chunk.expertName,
      month: chunk.month,
      year: chunk.year,
      saCode: chunk.saCode,
      activityName: chunk.activityName,
    })),
  };
}

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);

    const body = await req.json();
    const parsed = activityAutofillRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Cererea de autocompletare nu contine livrabile si catalog valide.',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const request = normalizeActivityAutofillRequest(parsed.data);
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    if (request.deliverables.length === 0) {
      return NextResponse.json(
        { error: 'Nu exista text extras din livrabile pentru autocompletare.' },
        { status: 400 },
      );
    }

    const ragRequest = {
      ...request,
      category: request.category || request.catalogCandidates.find((candidate) => candidate.category)?.category,
    };
    const retrieval = await retrieveActivityAutofillContext(ragRequest, { authToken });
    const ragContext = buildCompactActivityAutofillRagContext(retrieval);
    const promptRequest = ragContext
      ? normalizeActivityAutofillRequest({
          ...request,
          category: ragRequest.category,
          internalRagContext: ragContext,
        })
      : request;

    const { system, prompt } = buildActivityAutofillPrompt(promptRequest);
    const result = await governedGenerateText({
      endpoint: '/api/ai/suggest-activity-from-deliverables',
      operation: 'suggest-activity-from-deliverables',
      request: {
        ...request,
        rag: {
          enabled: retrieval.enabled,
          skippedReason: retrieval.skippedReason,
          chunks: retrieval.chunks.length,
          warnings: retrieval.warnings,
        },
      },
      actorName: request.expertName,
      projectCode: request.projectCode,
      month: request.month,
      year: request.year,
      model: openaiModel(),
      system,
      prompt,
      output: Output.object({ schema: activityAutofillSuggestionSchema }),
    });

    const suggestion = validateActivityAutofillSuggestionAgainstCatalog(
      result.output,
      request.catalogCandidates,
    );

    if (!suggestion.ok) {
      return NextResponse.json(
        {
          error: suggestion.error,
          modelAuditId: result.auditId,
        },
        { status: 422 },
      );
    }

    if (isActivityAutofillRagAuditEnabled() && authToken) {
      try {
        await createActivityAutofillAudit(buildActivityAutofillAuditPayload({
          request: ragRequest,
          suggestion: suggestion.data,
          modelAuditId: result.auditId,
          ragContext,
        }), { authToken });
      } catch (auditError) {
        console.warn('[activity-autofill-rag] Audit save failed; returning suggestion anyway.', auditError);
      }
    }

    return NextResponse.json({
      recommended: suggestion.data.recommended,
      confidence: suggestion.data.confidence,
      fieldInstructions: suggestion.data.fieldInstructions,
      evidence: suggestion.data.evidence,
      warnings: uniqueMessages([...suggestion.data.warnings, ...retrieval.warnings]),
      rag: buildRagResponse(retrieval, authToken),
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error suggesting activity from deliverables:', error);
    return aiErrorResponse(error, 'Eroare la autocompletarea activitatii din livrabile');
  }
}
