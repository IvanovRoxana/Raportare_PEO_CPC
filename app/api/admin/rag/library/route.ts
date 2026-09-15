import { NextResponse } from 'next/server';
import { guardRagAdminRequest } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { deleteKnowledgeDocument, listKnowledgeDocuments } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handleLibraryRequest(req);
}

export async function DELETE(req: Request) {
  try {
    const denied = guardRagAdminRequest(req);
    if (denied) return denied;
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    if (!authToken) return NextResponse.json({ error: 'Accesul la biblioteca RAG necesita autentificare.' }, { status: 401 });
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Lipseste id-ul documentului.' }, { status: 400 });
    const deleted = await deleteKnowledgeDocument(id, { authToken });
    return NextResponse.json({ ok: deleted });
  } catch (error) {
    console.error('[admin-rag-library] Delete failed.', error);
    return NextResponse.json({ error: 'Documentul nu a putut fi scos din biblioteca RAG.' }, { status: 500 });
  }
}

async function handleLibraryRequest(req: Request) {
  try {
    const denied = guardRagAdminRequest(req);
    if (denied) return denied;
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    if (!authToken) return NextResponse.json({ error: 'Accesul la biblioteca RAG necesita autentificare.' }, { status: 401 });
    const documents = await listKnowledgeDocuments({ status: { eq: 'active' } }, { authToken, limit: 100, maxItems: 500 });
    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    console.error('[admin-rag-library] List failed.', error);
    return NextResponse.json({ error: 'Biblioteca RAG nu a putut fi incarcata.' }, { status: 500 });
  }
}
