import { appliesToEligibilityScope, normalizeEligibilityScope } from '../eligibility-scope.ts';
import { onlyPublishedChunks } from './index-generation.ts';
import type { KnowledgeChunk, KnowledgeDocument } from '../types.ts';
import type { RagIndexDocumentInput } from './types.ts';

export const REPORTING_EXAMPLE_SOURCE_TYPE = 'exemplu_redactare_extragere';
export type ReportingExampleScope = {
  catalogActivityId: string; activityName: string; projectCode: string; category: string;
  saCode: string; expertId?: string; roleId?: string;
};
export type ReportingExamplesContext = { promptContext: string; documentIds: string[]; warnings: string[] };
export const emptyReportingExamples = (): ReportingExamplesContext => ({ promptContext: '', documentIds: [], warnings: [] });

export function validateReportingExampleInput(input: Pick<RagIndexDocumentInput, 'sourceType' | 'category' | 'projectCode' | 'saCode' | 'activityName' | 'approvalStatus' | 'metadata'>) {
  if (input.sourceType !== REPORTING_EXAMPLE_SOURCE_TYPE) return;
  if (!input.projectCode?.trim() || !input.category?.trim() || !input.saCode?.trim() || !input.activityName?.trim()
    || typeof input.metadata?.catalogActivityId !== 'string' || !input.metadata.catalogActivityId.trim()
    || input.metadata?.exampleOnly !== true || input.approvalStatus !== 'not_approved') {
    throw new Error('Exemplele necesita proiect, categorie, SA, activitate, catalogActivityId, exampleOnly=true si approvalStatus=not_approved.');
  }
}

function metadata(document: KnowledgeDocument) {
  try {
    const value: unknown = JSON.parse(document.metadataJson || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
  catch { return {}; }
}

export function matchesReportingExample(document: KnowledgeDocument, scope: ReportingExampleScope) {
  const meta = metadata(document);
  return document.sourceType === REPORTING_EXAMPLE_SOURCE_TYPE && document.approvalStatus === 'not_approved'
    && meta.exampleOnly === true && meta.catalogActivityId === scope.catalogActivityId
    && normalizeEligibilityScope(document.activityName) === normalizeEligibilityScope(scope.activityName)
    && document.category === scope.category && document.saCode === scope.saCode
    && appliesToEligibilityScope(document, scope);
}

/** Scoped RAG retrieval: only complete published examples, separate from factual/approved-report context. */
export function buildReportingExamplesContext(documents: KnowledgeDocument[], chunks: KnowledgeChunk[], scope: ReportingExampleScope): ReportingExamplesContext {
  const result = emptyReportingExamples();
  const sections: string[] = [];
  let chars = 0;
  for (const document of documents.filter(doc => matchesReportingExample(doc, scope)).sort((a,b)=>a.id.localeCompare(b.id))) {
    if (document.status !== 'active' || !document.publishedGeneration || !document.extractionComplete) continue;
    const parts = onlyPublishedChunks(chunks, [document]).filter(chunk => chunk.documentId === document.id
      && chunk.sourceType === REPORTING_EXAMPLE_SOURCE_TYPE && appliesToEligibilityScope(chunk, scope))
      .sort((a,b)=>a.chunkIndex-b.chunkIndex);
    if (!parts.length || parts.length !== document.expectedChunkCount || new Set(parts.map(c=>c.id)).size !== parts.length) {
      result.warnings.push(`Exemplu RAG incomplet omis: ${document.title}`);
      continue;
    }
    const section = JSON.stringify({ documentId: document.id, title: document.title, provenanceAndLimits: metadata(document),
      chunks: parts.map(chunk=>({ chunkId: chunk.id, text: chunk.text })) });
    if (result.documentIds.length >= 3 || chars + section.length > 18000) {
      result.warnings.push('Exemple suplimentare omise pentru limita de context; niciun exemplu nu a fost taiat partial.');
      continue;
    }
    result.documentIds.push(document.id);
    sections.push(section);
    chars += section.length;
  }
  if (sections.length) result.promptContext = [
    'EXEMPLE RAG DE REDACTARE SI EXTRAGERE — NEAPROBATE, DOAR INDRUMARE.',
    'Nu sunt dovezi pentru activitatea curenta sau reguli de eligibilitate. Nu transfera ore, date, cantitati, canale, teme sau actiuni in description, usedFacts ori fisa factuala.',
    'Pastreaza limitarile: an necunoscut, ore neverificate, subtotal nereconciliat si realizat/programat/publicat. Fragmentele se pot suprapune; repetitia nu este un material suplimentar.',
    ...sections,
  ].join('\n');
  return result;
}
