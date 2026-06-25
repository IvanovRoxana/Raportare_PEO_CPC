import { NextResponse } from 'next/server';
import { normalizePeoCategory } from '@/lib/peo-category';
import { guardRagAdminRequest } from '@/lib/rag/admin-auth';
import { normalizeRagText } from '@/lib/rag/chunking';
import { cosineSimilarity, generateEmbedding, parseEmbedding } from '@/lib/rag/embeddings';
import { listKnowledgeChunks } from '@/lib/rag/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const denied = guardRagAdminRequest(req);
    if (denied) return denied;

    const body = await req.json();
    const query = normalizeRagText(body?.query);
    const category = normalizePeoCategory(typeof body?.category === 'string' ? body.category : 'ap');
    const topK = Math.max(1, Math.min(Number(body?.topK) || 10, 25));

    if (!query) {
      return NextResponse.json({ error: 'Query lipsa pentru cautarea RAG.' }, { status: 400 });
    }

    const queryEmbedding = await generateEmbedding(query);
    const chunks = await listKnowledgeChunks({
      status: { eq: 'active' },
      ...(category ? { category: { eq: category } } : {}),
    });

    const results = chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, parseEmbedding(chunk.embeddingJson)),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item, index) => ({
        rank: index + 1,
        score: Number(item.score.toFixed(4)),
        chunkId: item.chunk.id,
        documentId: item.chunk.documentId,
        sourceType: item.chunk.sourceType,
        expertName: item.chunk.expertName,
        saCode: item.chunk.saCode,
        activityName: item.chunk.activityName,
        textPreview: item.chunk.text.slice(0, 500),
      }));

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error('[admin-rag-search] Search failed.', error);
    return NextResponse.json({ error: 'Cautarea RAG a esuat.' }, { status: 500 });
  }
}
