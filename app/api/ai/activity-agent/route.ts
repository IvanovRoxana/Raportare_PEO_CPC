import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { isActivityAgentEnabled } from '@/lib/feature-flags';
import {
  buildControlledFallbackActivityAgentResponse,
  mapActivityAgentResponseToAutofillSuggestion,
  runActivityAgent,
} from '@/lib/agents/activity-agent';
import { activityAgentRequestSchema } from '@/lib/agents/activity-agent-schema';
import {
  validateActivityAutofillSuggestionAgainstCatalog,
  type ActivityAutofillCatalogCandidate,
  type ActivityAutofillRequest,
} from '@/lib/activity-autofill';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);

    if (!isActivityAgentEnabled()) {
      return NextResponse.json(
        {
          error: 'Agentul PEO pentru descrieri este dezactivat; foloseste fluxul vechi.',
          code: 'ACTIVITY_AGENT_DISABLED',
        },
        { status: 503 },
      );
    }

    const body = await req.json();
    const parsed = activityAgentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Cererea pentru Agentul PEO nu este valida.',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    try {
      const agentResponse = await runActivityAgent(parsed.data, { authToken });
      const suggestion = mapActivityAgentResponseToAutofillSuggestion(agentResponse);
      const validationCatalogCandidates: ActivityAutofillCatalogCandidate[] = parsed.data.catalogCandidates
        .map((candidate, index) => ({
          ...candidate,
          id: candidate.id || `agent-candidate-${index}`,
          saCode: candidate.saCode || parsed.data.saCode || agentResponse.proposedSaCode || '',
        }))
        .filter((candidate) => Boolean(candidate.saCode));
      const validationRequest: ActivityAutofillRequest = {
        ...parsed.data,
        saCode: parsed.data.saCode || agentResponse.proposedSaCode || '',
        activityName: parsed.data.activityName || agentResponse.proposedActivityName || '',
        deliverables: parsed.data.deliverables
          .map((deliverable) => ({
            ...deliverable,
            extractedText: deliverable.extractedText || deliverable.documentTitle,
          }))
          .filter((deliverable) => Boolean(deliverable.extractedText)),
        catalogCandidates: validationCatalogCandidates,
      };
      const validation = validateActivityAutofillSuggestionAgainstCatalog(
        suggestion,
        validationCatalogCandidates,
        validationRequest,
      );
      if (!validation.ok) {
        return NextResponse.json(
          {
            error: validation.error,
            modelAuditId: agentResponse.auditId,
            agent: agentResponse,
          },
          { status: 422 },
        );
      }
      return NextResponse.json({
        ...suggestion,
        agent: agentResponse,
      });
    } catch (agentError) {
      console.warn('[activity-agent] Falling back to controlled response.', agentError);
      const message = agentError instanceof Error ? agentError.message : 'Agentul PEO nu a putut finaliza analiza.';
      const fallback = buildControlledFallbackActivityAgentResponse(parsed.data, [
        `Agentul PEO nu a finalizat analiza completa: ${message}`,
      ]);
      return NextResponse.json({
        ...mapActivityAgentResponseToAutofillSuggestion(fallback),
        agent: fallback,
        agentFallback: true,
      });
    }
  } catch (error) {
    console.error('Error running activity agent:', error);
    return aiErrorResponse(error, 'Eroare la rularea Agentului PEO pentru descriere');
  }
}
