import { NextResponse } from 'next/server';
import { guardRagAdminRequest } from '@/lib/rag/admin-auth';
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
    const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';

    if (!text.trim() || !title) {
      return NextResponse.json({ error: 'Documentul RAG are nevoie de title si text.' }, { status: 400 });
    }

    const result = await indexKnowledgeDocument({
      title,
      sourceType,
      text,
      category: typeof body?.category === 'string' ? body.category : undefined,
      expertId: typeof body?.expertId === 'string' ? body.expertId : undefined,
      expertName: typeof body?.expertName === 'string' ? body.expertName : undefined,
      expertRole: typeof body?.expertRole === 'string' ? body.expertRole : undefined,
      projectCode: typeof body?.projectCode === 'string' ? body.projectCode : undefined,
      month: Number.isFinite(Number(body?.month)) ? Number(body.month) : undefined,
      year: Number.isFinite(Number(body?.year)) ? Number(body.year) : undefined,
      saCode: typeof body?.saCode === 'string' ? body.saCode : undefined,
      activityName: typeof body?.activityName === 'string' ? body.activityName : undefined,
      approvalStatus: typeof body?.approvalStatus === 'string' ? body.approvalStatus : undefined,
      originalFileName: typeof body?.originalFileName === 'string' ? body.originalFileName : undefined,
      s3Key: typeof body?.s3Key === 'string' ? body.s3Key : undefined,
      createdBy: typeof body?.createdBy === 'string' ? body.createdBy : 'admin-rag-index',
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    }, { dryRun });

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
