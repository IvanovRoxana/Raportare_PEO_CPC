import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import {
  activityAutofillRequestSchema,
  activityAutofillSuggestionSchema,
  buildActivityAutofillPrompt,
  normalizeActivityAutofillRequest,
  validateActivityAutofillSuggestionAgainstCatalog,
} from '@/lib/activity-autofill';

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

    const { system, prompt } = buildActivityAutofillPrompt(request);
    const result = await governedGenerateText({
      endpoint: '/api/ai/suggest-activity-from-deliverables',
      operation: 'suggest-activity-from-deliverables',
      request,
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

    return NextResponse.json({
      ...suggestion.data,
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error suggesting activity from deliverables:', error);
    return aiErrorResponse(error, 'Eroare la autocompletarea activitatii din livrabile');
  }
}
