import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { authorizeEligibilityExpert, normalizeEligibilityExperts, EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityStore } from '@/lib/eligibility-server-store';
import { peoUsersAsExperts } from '@/lib/peo-users';
import { createEligibilityDraft, completeEligibilityDraft, getEligibilityDraftUrl, reviseEligibilityDraft, type EligibilityDraft } from '@/lib/eligibility-draft';
import { assertAllowedAiRequest } from '@/lib/ai-governance';
import type { Expert } from '@/lib/types';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['create', 'complete', 'download', 'revise']), expertId: z.string().min(1).optional(),
  documentId: z.string().optional(), saCode: z.string().optional(), fileName: z.string().max(240).optional(),
  fileSize: z.number().optional(), declaredTitle: z.string().max(1000).optional(), deliverableType: z.string().max(200).optional() }).strict();
export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const actor = await authenticateEligibilityRequest(req);
    const body = schema.parse(await req.json());
    const experts = normalizeEligibilityExperts(await eligibilityStore.list<Expert>('Expert'), peoUsersAsExperts());
    const stored = body.action === 'download' && body.documentId?.startsWith('draft_')
      ? await eligibilityStore.get<EligibilityDraft>('EligibilityRuntime', body.documentId) : null;
    let expert: Expert;
    try { expert = authorizeEligibilityExpert(actor, experts, body.expertId || stored?.expertId || '').expert; }
    catch (error) {
      if (body.action !== 'download' || !stored) throw error;
      for (const candidate of experts) {
        try {
          const allowed = authorizeEligibilityExpert(actor, experts, candidate.id).expert;
          const url = await getEligibilityDraftUrl(stored.id, allowed);
          return NextResponse.json(url, { headers: { 'Cache-Control': 'no-store' } });
        } catch { /* Try only contexts this actor can access; no metadata is returned on denial. */ }
      }
      throw error;
    }
    const result = body.action === 'create' ? await createEligibilityDraft(expert, actor.id, {
      fileName: body.fileName || '', fileSize: body.fileSize || 0, declaredTitle: body.declaredTitle || '',
      deliverableType: body.deliverableType || '', saCode: body.saCode || '',
    }) : body.action === 'revise' ? await reviseEligibilityDraft(body.documentId || '', expert, { declaredTitle: body.declaredTitle || '', deliverableType: body.deliverableType || '', saCode: body.saCode || '' })
      : body.action === 'complete' ? await completeEligibilityDraft(body.documentId || '', expert)
      : await getEligibilityDraftUrl(body.documentId || '', expert);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EligibilityAccessError ? error.message : 'Documentul nu a putut fi pregatit. Reincearca incarcarea.', code: 'ELIGIBILITY_DOCUMENT_ERROR' },
      { status: error instanceof EligibilityAccessError ? error.status : error instanceof z.ZodError ? 422 : 503 });
  }
}
