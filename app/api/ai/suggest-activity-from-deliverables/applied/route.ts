import { NextResponse } from 'next/server';
import { assertAllowedAiRequest } from '@/lib/ai-governance';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { markActivityAutofillAuditApplied } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    const body = await req.json();
    const modelAuditId = typeof body?.modelAuditId === 'string' ? body.modelAuditId : undefined;
    const auditId = typeof body?.auditId === 'string' ? body.auditId : undefined;

    if (!modelAuditId && !auditId) {
      return NextResponse.json({ ok: false, error: 'Lipseste auditId/modelAuditId.' }, { status: 400 });
    }

    const audit = await markActivityAutofillAuditApplied({
      id: auditId,
      modelAuditId,
      finalSaCode: typeof body?.finalSaCode === 'string' ? body.finalSaCode : undefined,
      finalActivityName: typeof body?.finalActivityName === 'string' ? body.finalActivityName : undefined,
      finalDescriptionPreview: typeof body?.finalDescriptionPreview === 'string'
        ? body.finalDescriptionPreview.slice(0, 500)
        : undefined,
    }, { authToken });

    return NextResponse.json({ ok: true, auditId: audit?.id });
  } catch (error) {
    console.warn('[activity-autofill-rag] Failed to mark audit applied.', error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
