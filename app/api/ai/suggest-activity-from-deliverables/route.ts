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
import { retrieveActivityAutofillContext } from '@/lib/rag/retrieval';
import { createActivityAutofillAudit } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const retrieval = await retrieveActivityAutofillContext(ragRequest);
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

    if (isActivityAutofillRagAuditEnabled()) {
      try {
        await createActivityAutofillAudit(buildActivityAutofillAuditPayload({
          request: ragRequest,
          suggestion: suggestion.data,
          modelAuditId: result.auditId,
          ragContext,
        }));
      } catch (auditError) {
        console.warn('[activity-autofill-rag] Audit save failed; returning suggestion anyway.', auditError);
      }
    }

    return NextResponse.json({
      recommended: suggestion.data.recommended,
      confidence: suggestion.data.confidence,
      fieldInstructions: {
        saCode: '',
        activityName: '',
        description: '',
      },
      evidence: [],
      warnings: [],
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error suggesting activity from deliverables:', error);
    return aiErrorResponse(error, 'Eroare la autocompletarea activitatii din livrabile');
  }
}
