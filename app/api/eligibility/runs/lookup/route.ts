import { NextResponse } from 'next/server';
import { authenticateEligibilityRequest, resolveEligibilityContext } from '@/lib/eligibility-resolver';
import { eligibilityStore } from '@/lib/eligibility-server-store';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityRequestKey, parseEligibilityJobInput } from '@/lib/eligibility-job-input';
import type { EligibilityRun } from '@/lib/eligibility-run-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  try {
    const actor = await authenticateEligibilityRequest(req);
    const raw = await req.text();
    if (raw.length > 2_000_000) return NextResponse.json({ error: 'Cerere prea mare.' }, { status: 413 });
    const input = parseEligibilityJobInput(JSON.parse(raw));
    const resolved = await resolveEligibilityContext(req, { expertId: input.expertId, projectCode: input.projectCode,
      saCode: input.currentSaCode, documentIds: input.deliverables.map((d) => d.serverDocumentId), metadataOnly: true, loadReferenceChunks: false }, actor);
    input.projectCode = resolved.expert.projectCode;
    const link = await eligibilityStore.get<{ runId: string }>('EligibilityRuntime', `request:${eligibilityRequestKey(actor.id, input)}`);
    const run = link && await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', link.runId);
    return NextResponse.json({ runId: run?.actorId === actor.id ? run.runId : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: 'Evaluarea nu poate fi recuperata acum.' }, { status: error instanceof EligibilityAccessError ? error.status : 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
