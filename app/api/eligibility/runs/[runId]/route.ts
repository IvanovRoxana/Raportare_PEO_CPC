import { NextResponse } from 'next/server';
import { readAuthorizedEligibilityRun } from '@/lib/eligibility-run-read';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityStore } from '@/lib/eligibility-server-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const { run, current } = await readAuthorizedEligibilityRun(req, runId);
    const decisions = run.status === 'completed' ? await eligibilityStore.list('PmEligibilityDecision', { field: 'runId', value: runId }) : [];
    const expired = !run.asyncJob && run.status === 'pending' && Date.now() - Date.parse(run.createdAt) > 180_000;
    return NextResponse.json({ runId, executionStatus: expired ? 'failed' : run.status,
      errorCode: expired ? 'ELIGIBILITY_EXECUTION_INTERRUPTED' : run.errorCode,
      diagnostic: run.status === 'failed' ? run.executionJson?.failure : undefined,
      stage: run.stage, updatedAt: run.updatedAt || run.createdAt, result: run.resultJson, current, decisions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EligibilityAccessError ? error.message : 'Evaluarea nu poate fi verificata acum.' }, { status: error instanceof EligibilityAccessError ? error.status : 503 });
  }
}
