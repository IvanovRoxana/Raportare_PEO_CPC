import { canonicalRoleId, appliesToEligibilityScope, readScopeMetadata } from '../eligibility-scope.ts';
import type { KnowledgeDocument } from '../types.ts';
import { RAG_DEFAULT_PROJECT } from './project-backfill.ts';

type Graphql = (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Additive migration. Legacy extraction completeness is never invented. */
export async function backfillRagMetadataPage(nextToken: string | null, graphql: Graphql) {
  const data = await graphql(`query MetadataBackfill($nextToken: String) {
    listKnowledgeDocuments(limit: 5, nextToken: $nextToken) { items { id projectCode category expertId expertName expertRole roleId sourceType saCode metadataJson updatedAt } nextToken }
  }`, { nextToken });
  const page = data.listKnowledgeDocuments as { items: KnowledgeDocument[]; nextToken?: string };
  if (!page || !Array.isArray(page.items)) throw new Error('Pagina de migrare invalida.');
  const failed: string[] = [];
  let updated = 0;
  for (const document of page.items.filter(Boolean)) {
    const scope = readScopeMetadata({ ...document, projectCode: document.projectCode || RAG_DEFAULT_PROJECT });
    const roleId = canonicalRoleId(scope);
    if (!appliesToEligibilityScope({ ...scope, sourceType: document.sourceType }, scope)) { failed.push(document.id); continue; }
    try {
      await graphql(`mutation BackfillDocumentScope($input: UpdateKnowledgeDocumentInput!, $condition: ModelKnowledgeDocumentConditionInput) {
        updateKnowledgeDocument(input: $input, condition: $condition) { id }
      }`, { input: { id: document.id, projectCode: scope.projectCode, ...(roleId ? { roleId } : {}) }, condition: { updatedAt: { eq: document.updatedAt } } });
      let chunkToken: string | null = null;
      do {
        const chunks = await graphql(`query BackfillChunkScope($documentId: ID!, $nextToken: String) {
          listKnowledgeChunkByDocumentId(documentId: $documentId, limit: 100, nextToken: $nextToken) { items { id updatedAt } nextToken }
        }`, { documentId: document.id, nextToken: chunkToken });
        const chunkPage = chunks.listKnowledgeChunkByDocumentId as { items: Array<{ id: string; updatedAt: string }>; nextToken?: string };
        if (!chunkPage || !Array.isArray(chunkPage.items)) throw new Error('Pagina de fragmente invalida.');
        for (const chunk of chunkPage.items.filter(Boolean)) {
          await graphql(`mutation BackfillChunkScope($input: UpdateKnowledgeChunkInput!, $condition: ModelKnowledgeChunkConditionInput) {
            updateKnowledgeChunk(input: $input, condition: $condition) { id }
          }`, { input: { id: chunk.id, projectCode: scope.projectCode, category: document.category ?? null,
            expertId: document.expertId ?? null, expertName: document.expertName ?? null, saCode: document.saCode ?? null, roleId: roleId || null },
            condition: { updatedAt: { eq: chunk.updatedAt } } });
        }
        chunkToken = chunkPage.nextToken || null;
      } while (chunkToken);
      updated++;
    } catch { failed.push(document.id); }
  }
  return { updated, failed, nextToken: page.nextToken || null };
}
