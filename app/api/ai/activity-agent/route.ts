import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { isActivityAgentEnabled } from '@/lib/feature-flags';
import {
  buildControlledFallbackActivityAgentResponse,
  mapActivityAgentResponseToAutofillSuggestion,
  runActivityAgent,
} from '@/lib/agents/activity-agent';
import { activityAgentRequestSchema } from '@/lib/agents/activity-agent-schema';
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
      return NextResponse.json({
        ...mapActivityAgentResponseToAutofillSuggestion(agentResponse),
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
