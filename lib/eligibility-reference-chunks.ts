import type { KnowledgeChunk, KnowledgeDocument } from './types.ts';
import { onlyPublishedChunks } from './rag/index-generation.ts';
import { appliesToEligibilityScope, type EligibilityScope } from './eligibility-scope.ts';
import { EligibilityExecutionError } from './eligibility-execution.ts';

/** Read only authorized reference documents, never scan every project's embeddings. */
export async function loadEligibilityReferenceChunks(
  documents: KnowledgeDocument[],
  target: EligibilityScope,
  loadDocumentChunks: (documentId: string) => Promise<KnowledgeChunk[]>,
) {
  const parents = [...new Map(documents.filter((doc) => doc.status === 'active' && appliesToEligibilityScope(doc, target))
    .map((doc) => [doc.id, doc])).values()];
  const chunks: KnowledgeChunk[] = [];
  // Bound simultaneous database requests even for projects with many reference documents.
  for (let offset = 0; offset < parents.length; offset += 4) {
    const batch = await Promise.all(parents.slice(offset, offset + 4).map(async (parent) => {
      const rows = await loadDocumentChunks(parent.id);
      const published = onlyPublishedChunks(rows.filter((chunk) => chunk.documentId === parent.id), [parent]);
      // An index still catching up must not turn missing evidence into a completed evaluation.
      if (parent.publishedGeneration && Number.isInteger(parent.expectedChunkCount) && parent.expectedChunkCount! > 0
        && new Set(published.map((chunk) => chunk.id)).size !== parent.expectedChunkCount) {
        throw new EligibilityExecutionError('ELIGIBILITY_REFERENCE_INDEX_INCOMPLETE',
          'Fragmentele unei surse publicate nu sunt disponibile integral. Reincearca dupa finalizarea indexarii; daca problema persista, administratorul trebuie sa verifice sursele proiectului.', 503);
      }
      return published.filter((chunk) => appliesToEligibilityScope(chunk, target));
    }));
    chunks.push(...batch.flat());
  }
  return chunks;
}
