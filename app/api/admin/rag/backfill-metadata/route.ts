import { NextResponse } from 'next/server';
import { assertRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { backfillKnowledgeMetadata } from '@/lib/rag/store';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const authToken = await assertRagAdminRequest(req);
    const body = await req.json();
    const result = await backfillKnowledgeMetadata(typeof body.nextToken === 'string' ? body.nextToken : null, { authToken });
    return NextResponse.json(result);
  } catch (error) { return ragAdminAuthErrorResponse(error) || NextResponse.json({ error: 'Migrarea metadatelor nu a putut fi finalizata.' }, { status: 503 }); }
}
