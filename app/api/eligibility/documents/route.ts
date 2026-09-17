import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { authorizeEligibilityExpert, normalizeEligibilityExperts, EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityStore } from '@/lib/eligibility-server-store';
import { peoUsersAsExperts } from '@/lib/peo-users';
import { createEligibilityDraft, completeEligibilityDraft, getEligibilityDraftUrl, reviseEligibilityDraft, type EligibilityDraft } from '@/lib/eligibility-draft';
import { assertAllowedAiRequest, AiGovernanceError, aiErrorResponse } from '@/lib/ai-governance';
import { diagnoseDocumentError, type DocumentDiagnosticContext } from '@/lib/eligibility-document-diagnostics';
import type { Expert } from '@/lib/types';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['create', 'complete', 'download', 'revise']), expertId: z.string().min(1).optional(),
  documentId: z.string().optional(), saCode: z.string().optional(), fileName: z.string().max(240).optional(),
  fileSize: z.number().optional(), declaredTitle: z.string().max(1000).optional(), deliverableType: z.string().max(200).optional() }).strict();
export async function POST(req: Request) {
  const requestId = randomUUID();
  const context: DocumentDiagnosticContext = { stage: 'request' };
  try {
    assertAllowedAiRequest(req);
    context.stage = 'authentication';
    const actor = await authenticateEligibilityRequest(req);
    context.stage = 'request';
    const body = schema.parse(await req.json());
    context.stage = 'experts';
    const experts = normalizeEligibilityExperts(await eligibilityStore.list<Expert>('Expert'), peoUsersAsExperts());
    context.stage = 'authorization';
    const stored = body.action === 'download' && body.documentId?.startsWith('draft_')
      ? await eligibilityStore.get<EligibilityDraft>('EligibilityRuntime', body.documentId) : null;
    let expert: Expert;
    try { expert = authorizeEligibilityExpert(actor, experts, body.expertId || stored?.expertId || '').expert; }
    catch (error) {
      if (body.action !== 'download' || !stored) throw error;
      for (const candidate of experts) {
        try {
          const allowed = authorizeEligibilityExpert(actor, experts, candidate.id).expert;
          const url = await getEligibilityDraftUrl(stored.id, allowed, context);
          return NextResponse.json(url, { headers: { 'Cache-Control': 'no-store' } });
        } catch (candidateError) {
          if (!(candidateError instanceof EligibilityAccessError)) throw candidateError;
          // Try only contexts this actor can access; no metadata is returned on denial.
        }
      }
      throw error;
    }
    const result = body.action === 'create' ? await createEligibilityDraft(expert, actor.id, {
      fileName: body.fileName || '', fileSize: body.fileSize || 0, declaredTitle: body.declaredTitle || '',
      deliverableType: body.deliverableType || '', saCode: body.saCode || '',
    }, context) : body.action === 'revise' ? await reviseEligibilityDraft(body.documentId || '', expert, { declaredTitle: body.declaredTitle || '', deliverableType: body.deliverableType || '', saCode: body.saCode || '' }, context)
      : body.action === 'complete' ? await completeEligibilityDraft(body.documentId || '', expert, context)
      : await getEligibilityDraftUrl(body.documentId || '', expert, context);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof AiGovernanceError
      ? { ...(await aiErrorResponse(error, 'Cererea a fost respinsa.').json()), status: error.status, action: 'Redeschide aplicatia si reincearca.' }
      : error instanceof EligibilityAccessError
        ? { error: error.message, code: `DOCUMENT_ACCESS_${error.status}`, status: error.status,
          action: error.status === 401 ? 'Autentifica-te din nou.' : 'Corecteaza problema indicata; daca persista, contacteaza administratorul.' }
        : error instanceof z.ZodError || (context.stage === 'request' && error instanceof SyntaxError)
          ? { error: 'Datele cererii sunt invalide sau incomplete.', code: 'DOCUMENT_REQUEST_INVALID', status: 422, action: 'Verifica datele documentului si subactivitatea selectata.' }
          : diagnoseDocumentError(error, context.stage);
    // No file content, signed URL, credentials or raw provider message in diagnostics.
    const provider = error as { name?: string; code?: string; $metadata?: { requestId?: string; httpStatusCode?: number } } | null;
    const safeIdentifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value) ? value : undefined;
    console.error('[ELIGIBILITY_DOCUMENT_ERROR]', { requestId, stage: context.stage, code: failure.code,
      errorType: safeIdentifier(provider?.name), providerCode: safeIdentifier(provider?.code),
      providerRequestId: safeIdentifier(provider?.$metadata?.requestId), providerStatus: provider?.$metadata?.httpStatusCode });
    return NextResponse.json({ error: failure.error, code: failure.code,
      diagnostic: { stage: context.stage, code: failure.code, action: failure.action, requestId } },
    { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
