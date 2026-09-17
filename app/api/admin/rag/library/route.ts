import { assertKnowledgeRequest, knowledgeAuthErrorResponse } from '@/lib/rag/knowledge-auth';
import { NextResponse } from 'next/server';
import { assertRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { backfillMissingRagProject, deleteKnowledgeDocument, listKnowledgeDocuments } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handleLibraryRequest(req);
}

export async function PATCH(req: Request) {
  try {
    const authToken = await assertRagAdminRequest(req);
    const body = await req.json();
    if (body?.action !== 'complete-project' || !['KnowledgeDocument', 'KnowledgeChunk'].includes(body?.model)
      || (body.nextToken != null && typeof body.nextToken !== 'string')) {
      return NextResponse.json({ error: 'Cerere de completare proiect invalida.' }, { status: 400 });
    }
    const result = await backfillMissingRagProject(body.model, body.nextToken || null, { authToken, timeoutMs: 5000 });
    return NextResponse.json(result);
  } catch (error) {
    const authError = ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-library] Project backfill failed.', error);
    return NextResponse.json({ error: 'Completarea proiectului s-a oprit. Operatia poate fi reluata; codurile deja completate sunt pastrate.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authToken = await assertKnowledgeRequest(req);
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Lipseste id-ul documentului.' }, { status: 400 });
    const deleted = await deleteKnowledgeDocument(id, { authToken });
    return NextResponse.json({ ok: deleted });
  } catch (error) {
    const authError = knowledgeAuthErrorResponse(error) || ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-library] Delete failed.', error);
    return NextResponse.json({ error: 'Documentul nu a putut fi scos din biblioteca RAG.' }, { status: 500 });
  }
}

async function handleLibraryRequest(req: Request) {
  try {
    const authToken = await assertKnowledgeRequest(req);
    const documents = await listKnowledgeDocuments({ status: { eq: 'active' } }, { authToken, limit: 100, maxItems: 500 });
    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    const authError = knowledgeAuthErrorResponse(error) || ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-library] List failed.', error);
    return NextResponse.json({ error: 'Biblioteca RAG nu a putut fi incarcata.' }, { status: 500 });
  }
}
