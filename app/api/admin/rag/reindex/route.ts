import { NextResponse } from 'next/server';
import { guardRagAdminRequest } from '@/lib/rag/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const denied = guardRagAdminRequest(req);
    if (denied) return denied;

    return NextResponse.json({
      ok: true,
      status: 'not_started',
      message: 'MVP-ul foloseste scripts/import-rag-pa-documents.mjs si endpointul index-document. Reindexarea in masa este intentionat lasata fara efect destructiv.',
    });
  } catch {
    return NextResponse.json({ error: 'Cerere RAG reindex respinsa.' }, { status: 403 });
  }
}
