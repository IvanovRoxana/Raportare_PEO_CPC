import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assertAllowedAiRequest } from '@/lib/ai-governance';
import { readAuthorizedEligibilityRun } from '@/lib/eligibility-run-read';
import { validatePmDecision } from '@/lib/eligibility-evaluation';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityStore, immutablePut } from '@/lib/eligibility-server-store';
import { POST as evaluate } from '@/app/api/ai/check-deliverable-eligibility/route';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const { run, resolved, current } = await readAuthorizedEligibilityRun(req, String(body.runId));
    if (!resolved.actor.roles.some((role) => ['pm', 'admin'].includes(role))) throw new EligibilityAccessError('Decizia necesita PM/Admin.');
    validatePmDecision(body, resolved.expert.saCodes || []);
    if (!current && body.decision !== 'request_clarification' && body.decision !== 'reclassify') throw new EligibilityAccessError('Evaluarea este expirata sau consultativa. Reia verificarea.', 409);
    if (body.decision === 'reclassify') {
      const candidate = await eligibilityStore.get<{ saCode: string; category?: string; isActive?: boolean }>('ActivityCatalog', body.replacementActivityId);
      if (!candidate || candidate.isActive === false || candidate.saCode !== body.replacementSaCode || candidate.category !== resolved.expert.category) throw new Error('Activitatea propusa nu este valida pentru expert.');
    }
    const decision = { id: `pm_${randomUUID()}`, runId: run.runId, evaluationKey: run.evaluationKey, expertId: run.expertId,
      projectCode: run.projectCode, actorId: resolved.actor.id, decision: body.decision, reason: body.reason.trim(),
      replacementSaCode: body.replacementSaCode, replacementActivityId: body.replacementActivityId };
    await eligibilityStore.transact([immutablePut('PmEligibilityDecision', decision)]);
    if (body.decision === 'reclassify') {
      const response = await evaluate(new Request(new URL('/api/ai/check-deliverable-eligibility', req.url), {
        method: 'POST', headers: req.headers, body: JSON.stringify({ expertId: run.expertId, projectCode: run.projectCode,
          currentSaCode: body.replacementSaCode, selectedActivityId: body.replacementActivityId, classificationMode: 'manual',
          deliverables: resolved.documents.filter(Boolean).map((doc) => ({ id: doc!.id, extractedText: doc!.docText, fileName: doc!.fileName })) }),
      }));
      const evaluation = await response.json();
      return NextResponse.json({ decision, evaluation: response.ok ? evaluation : null, evaluationError: response.ok ? null : evaluation.error });
    }
    return NextResponse.json({ decision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Decizia nu a putut fi inregistrata.' }, { status: error instanceof EligibilityAccessError ? error.status : 422 });
  }
}
