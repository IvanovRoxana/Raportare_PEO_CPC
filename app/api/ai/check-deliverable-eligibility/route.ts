import { NextResponse } from 'next/server';
import { evaluateEligibility } from '@/lib/eligibility-service';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { EligibilityAssessmentInputError } from '@/lib/eligibility-assessment';
import { EligibilityExecutionError } from '@/lib/eligibility-execution';
import { EligibilityInProgress } from '@/lib/eligibility-run-store';
import { aiErrorResponse } from '@/lib/ai-governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    return NextResponse.json(await evaluateEligibility(req), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EligibilityInProgress) return NextResponse.json({ runId: error.runId, executionStatus: 'pending', code: 'ELIGIBILITY_IN_PROGRESS' }, { status: 409 });
    if (error instanceof EligibilityExecutionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof EligibilityAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof EligibilityAssessmentInputError) return NextResponse.json({ error: error.message, code: 'ELIGIBILITY_INPUT_INCOMPLETE' }, { status: 422 });
    if (error instanceof Error && error.message.startsWith('ELIGIBILITY_BACKEND_NOT_DEPLOYED')) return NextResponse.json({
      error: 'Backend-ul de eligibilitate necesita schema si rolul SSR configurate.', code: 'ELIGIBILITY_BACKEND_NOT_DEPLOYED',
    }, { status: 503 });
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return NextResponse.json({
      error: 'Evaluarea nu s-a finalizat in timpul disponibil. Poti salva ciorna si relua verificarea.', code: 'ELIGIBILITY_TIMEOUT',
    }, { status: 504 });
    return aiErrorResponse(error, 'Evaluarea nu a putut fi finalizata. Reincearca verificarea.');
  }
}
