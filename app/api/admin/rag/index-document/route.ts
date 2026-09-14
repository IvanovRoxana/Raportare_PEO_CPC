import { NextResponse } from 'next/server';
import { guardRagAdminRequest } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { indexKnowledgeDocument } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const denied = guardRagAdminRequest(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    const title = typeof body?.title === 'string' ? body.title : body?.originalFileName;
    const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : 'other';
    const projectCode = typeof body?.projectCode === 'string' ? body.projectCode.trim() : '';
    const saCode = typeof body?.saCode === 'string' ? body.saCode.trim() : '';
    const expertId = typeof body?.expertId === 'string' ? body.expertId.trim() : '';
    const expertName = typeof body?.expertName === 'string' ? body.expertName.trim() : '';
    const expertRole = typeof body?.expertRole === 'string' ? body.expertRole.trim() : '';
    const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';
    const authToken = getCognitoAccessTokenFromRequest(req, {
      allowAuthorizationHeader: Boolean(req.headers.get('x-rag-admin-token')),
    });

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
    if (sourceType === 'fisa_post' && !expertId && !expertName && !expertRole) {
      return NextResponse.json({ error: 'Sursa fisei postului necesita un expert sau un rol.' }, { status: 400 });
    }

    if (!dryRun && !authToken) {
      return NextResponse.json({ error: 'Importul RAG real necesita x-cognito-access-token pentru scrierea in AppSync.' }, { status: 401 });
    }

    const result = await indexKnowledgeDocument({
      title,
      sourceType,
      text,
      category: typeof body?.category === 'string' ? body.category : undefined,
      expertId: expertId || undefined,
      expertName: expertName || undefined,
      expertRole: expertRole || undefined,
      projectCode: projectCode || undefined,
      month: Number.isFinite(Number(body?.month)) ? Number(body.month) : undefined,
      year: Number.isFinite(Number(body?.year)) ? Number(body.year) : undefined,
      saCode: saCode || undefined,
      activityName: typeof body?.activityName === 'string' ? body.activityName : undefined,
      approvalStatus: typeof body?.approvalStatus === 'string' ? body.approvalStatus : undefined,
      originalFileName: typeof body?.originalFileName === 'string' ? body.originalFileName : undefined,
      s3Key: typeof body?.s3Key === 'string' ? body.s3Key : undefined,
      createdBy: typeof body?.createdBy === 'string' ? body.createdBy : 'admin-rag-index',
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    }, { dryRun, authToken });

    return NextResponse.json({
      ok: true,
      dryRun: result.dryRun,
      documentId: result.document?.id,
      chunks: result.chunks.length,
      preview: result.chunks.slice(0, 3).map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        tokenEstimate: chunk.tokenEstimate,
        text: chunk.text.slice(0, 220),
      })),
    });
  } catch (error) {
    console.error('[admin-rag-index-document] Failed to index document.', error);
    return NextResponse.json({ error: 'Indexarea documentului RAG a esuat.' }, { status: 500 });
  }
}
