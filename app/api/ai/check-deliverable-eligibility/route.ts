import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { submitEligibility } from '@/lib/eligibility-submission';
import { EligibilityInProgress } from '@/lib/eligibility-run-store';
import { AiGovernanceError, aiErrorResponse } from '@/lib/ai-governance';
import { isOpenAIConfigurationError } from '@/lib/openai';
import { diagnoseEvaluationError, type EvaluationDiagnosticContext } from '@/lib/eligibility-evaluation-diagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const context: EvaluationDiagnosticContext = { stage: 'request', requestId: randomUUID() };
  try {
    const run = await submitEligibility(req, context);
    return NextResponse.json({ runId: run.runId, executionStatus: run.status, stage: run.stage }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EligibilityInProgress) return NextResponse.json({ runId: error.runId, executionStatus: 'pending', code: 'ELIGIBILITY_IN_PROGRESS' }, { status: 409 });
    const diagnostic = context.failure || diagnoseEvaluationError(error, context);
    if (error instanceof AiGovernanceError || isOpenAIConfigurationError(error)) {
      const governed = aiErrorResponse(error, diagnostic.error);
      const body = await governed.json();
      return NextResponse.json({ ...body, diagnostic: { ...diagnostic, error: body.error, code: body.code, status: governed.status } },
        { status: governed.status, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: diagnostic.error, code: diagnostic.code, diagnostic },
      { status: diagnostic.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
