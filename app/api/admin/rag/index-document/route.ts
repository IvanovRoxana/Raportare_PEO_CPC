import { archiveRagOriginal } from '@/lib/eligibility-originals';
import { extractReferenceDocumentText } from '@/lib/rag/reference-document-text';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { NextResponse } from 'next/server';
import { assertRagAdminRequest, guardRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { indexKnowledgeDocument } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let authToken = '';
    if (req.headers.get('authorization')) {
      authToken = await assertRagAdminRequest(req);
    } else {
      const denied = guardRagAdminRequest(req);
      if (denied) return denied;
      authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: false });
    }

    const url = new URL(req.url);
    const body = await req.json();
    let text = typeof body?.text === 'string' ? body.text : '';
    const title = typeof body?.title === 'string' ? body.title : body?.originalFileName;
    const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : 'other';
    const projectCode = typeof body?.projectCode === 'string' ? body.projectCode.trim() : '';
    const saCode = typeof body?.saCode === 'string' ? body.saCode.trim() : '';
    const expertId = typeof body?.expertId === 'string' ? body.expertId.trim() : '';
    const expertName = typeof body?.expertName === 'string' ? body.expertName.trim() : '';
    const expertRole = typeof body?.expertRole === 'string' ? body.expertRole.trim() : '';
    const roleId = typeof body?.roleId === 'string' ? body.roleId.trim() : '';
    const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';

    if (!text.trim() || !title) {
      return NextResponse.json({ error: 'Documentul RAG are nevoie de title si text.' }, { status: 400 });
    }

    if (['cerere_finantare', 'manual_beneficiar'].includes(sourceType) && !projectCode) {
      return NextResponse.json({ error: 'Sursele de proiect necesita codul proiectului.' }, { status: 400 });
    }
    if (['cerere_finantare', 'manual_beneficiar'].includes(sourceType) && saCode) {
      return NextResponse.json({ error: 'Sursele globale de proiect nu pot fi asociate accidental unui cod SA.' }, { status: 400 });
    }
    if (['scop_sa', 'descriere_activitati'].includes(sourceType) && (!projectCode || !saCode)) {
      return NextResponse.json({ error: 'Sursele subactivitatii necesita codul proiectului si codul SA.' }, { status: 400 });
    }
    if (sourceType === 'fisa_post' && !expertId && !expertName && !expertRole && !roleId) {
      return NextResponse.json({ error: 'Sursa fisei postului necesita un expert sau un rol.' }, { status: 400 });
    }

    const isApprovedHistorical = ['raport_activitate_aprobat', 'livrabil_aprobat'].includes(sourceType);
    if (isApprovedHistorical) {
      const month = Number(body?.month);
      const year = Number(body?.year);
      const requiresActivityScope = sourceType === 'livrabil_aprobat';
      if (!expertId || !projectCode || (requiresActivityScope && (!saCode || !body?.activityName)) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
        return NextResponse.json({ error: requiresActivityScope
          ? 'Livrabilele aprobate necesita expert, proiect, luna, an, SA si activitate.'
          : 'Rapoartele de activitate aprobate necesita expert, proiect, luna si an.' }, { status: 400 });
      }
      if (body?.approvalStatus !== 'approved') {
        return NextResponse.json({ error: 'Doar documentele aprobate pot fi indexate in istoricul RAG.' }, { status: 400 });
      }
      const now = new Date();
      const ageInMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
      if (ageInMonths < 0 || ageInMonths >= 12) {
        return NextResponse.json({ error: 'Documentul trebuie sa apartina ultimelor 12 luni.' }, { status: 400 });
      }
    }

    if (!dryRun && !authToken) {
      return NextResponse.json({ error: 'Importul RAG real necesita x-cognito-access-token pentru scrierea in AppSync.' }, { status: 401 });
    }

    let original: { s3Key: string; originalFileHash: string } | undefined;
    let actorId = 'dry-run';
    if (!dryRun) {
      const actor = await authenticateEligibilityRequest(req);
      if (!actor.roles.some((role) => ['pm', 'admin'].includes(role))) return NextResponse.json({ error: 'Importul necesita PM/Admin.' }, { status: 403 });
      actorId = actor.id;
      const fileName = typeof body.originalFileName === 'string' ? body.originalFileName : `${title}.txt`;
      const binary = /\.(pdf|docx)$/i.test(fileName);
      if (binary && !body.originalFileBase64) return NextResponse.json({ error: 'Trimite originalul PDF/DOCX pentru arhivare si verificarea extragerii.' }, { status: 422 });
      {
        const bytes = body.originalFileBase64 ? new Uint8Array(Buffer.from(String(body.originalFileBase64), 'base64')) : new TextEncoder().encode(text);
        original = await archiveRagOriginal(fileName, bytes);
        if (binary) {
          const extracted = await extractReferenceDocumentText(fileName, Uint8Array.from(bytes).buffer);
          text = extracted.text; body.extractionComplete = extracted.complete;
          body.metadata = { ...body.metadata, processedSections: extracted.processedSections, failedSections: extracted.failedSections };
        } else { body.extractionComplete = true; }
      }
    }
    const result = await indexKnowledgeDocument({
      title,
      sourceType,
      text,
      category: typeof body?.category === 'string' ? body.category : undefined,
      expertId: expertId || undefined,
      expertName: expertName || undefined,
      expertRole: expertRole || undefined,
      roleId: roleId || undefined,
      projectCode: projectCode || undefined,
      month: Number.isFinite(Number(body?.month)) ? Number(body.month) : undefined,
      year: Number.isFinite(Number(body?.year)) ? Number(body.year) : undefined,
      saCode: saCode || undefined,
      activityName: typeof body?.activityName === 'string' ? body.activityName : undefined,
      approvalStatus: typeof body?.approvalStatus === 'string' ? body.approvalStatus : undefined,
      originalFileName: typeof body?.originalFileName === 'string' ? body.originalFileName : undefined,
      s3Key: original?.s3Key || (typeof body?.s3Key === 'string' ? body.s3Key : undefined),
      createdBy: actorId,
      metadata: { ...(body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}), originalFileHash: original?.originalFileHash },
      extractionSource: body?.extractionSource === 'ocr' ? 'ocr' : body?.extractionSource === 'native' ? 'native' : undefined,
      extractionComplete: typeof body?.extractionComplete === 'boolean' ? body.extractionComplete : undefined,
    }, { dryRun, authToken });

    return NextResponse.json({
      ok: true,
      dryRun: result.dryRun,
      documentId: result.document?.id,
      chunks: result.chunks.length,
      duplicate: result.chunks.length === 0 && Boolean(result.document?.id),
      preview: result.chunks.slice(0, 3).map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        tokenEstimate: chunk.tokenEstimate,
        text: chunk.text.slice(0, 220),
      })),
    });
  } catch (error) {
    const authError = ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-index-document] Failed to index document.', error);
    return NextResponse.json({ error: 'Indexarea documentului RAG a esuat.' }, { status: 500 });
  }
}
