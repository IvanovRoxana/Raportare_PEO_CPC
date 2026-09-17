import { tool } from 'ai';
import { z } from 'zod';
import { EligibilityCoverage } from '../eligibility-coverage.ts';
import { EligibilityExecutionBudget } from '../eligibility-execution.ts';
import type { EligibilityContextResult, EligibilityContextSource } from '../rag/eligibility-context.ts';
import type { KnowledgeChunk } from '../types.ts';
import type { EligibilityAssessmentCandidate } from '../eligibility-assessment.ts';

export type EligibilityToolTrace = { tool: string; status: string; durationMs: number; documentId?: string; chunkId?: string; start?: number; end?: number };
export function refreshEligibilitySourceCoverage(context: EligibilityContextResult) {
  for (const kind of ['project', 'subactivity', 'job_description'] as const) {
    context.coverage[kind] = context.sources.some((source) => source.coverage === kind && source.extractionComplete === true);
  }
  context.missingRequiredSources = (['project', 'subactivity', 'job_description'] as const).filter((kind) => !context.coverage[kind]);
  context.promptContext = JSON.stringify({ sources: context.sources, historicalExamples: context.historicalSources || [] });
}
export function createEligibilityTools(options: {
  coverage: EligibilityCoverage; budget: EligibilityExecutionBudget; context: EligibilityContextResult;
  chunks: KnowledgeChunk[]; candidates: EligibilityAssessmentCandidate[];
  authorize: () => Promise<void>; trace: EligibilityToolTrace[];
}) {
  const cache = new Map<string, unknown>();
  async function read<T>(name: string, args: unknown, action: () => T | Promise<T>, cacheable = true): Promise<T> {
    options.budget.tool();
    const start = Date.now();
    // Authorization is repeated even on an identical read from this execution's cache.
    const key = `${name}:${JSON.stringify(args)}`;
    try {
      await options.authorize();
      const result = cacheable && cache.has(key) ? cache.get(key) as T : await action();
      if (cacheable) cache.set(key, result);
      const metadata = args as { documentId?: string; chunkId?: string; start?: number; end?: number };
      options.trace.push({ tool: name, status: String((result as { status?: string })?.status || 'success'), durationMs: Date.now() - start,
        documentId: metadata.documentId, chunkId: metadata.chunkId, start: metadata.start, end: metadata.end });
      return result;
    } catch (error) {
      options.trace.push({ tool: name, status: 'error', durationMs: Date.now() - start });
      throw error;
    }
  }
  function reference(chunk: KnowledgeChunk): EligibilityContextSource {
    const existing = options.context.sources.find((source) => source.chunkId === chunk.id);
    const coverage = existing?.coverage || (chunk.sourceType === 'fisa_post' ? 'job_description'
      : ['descriere_activitati', 'scop_sa'].includes(chunk.sourceType || '') ? 'subactivity' : 'project');
    const source: EligibilityContextSource = { documentId: chunk.documentId, chunkId: chunk.id,
      sourceType: chunk.sourceType || '', coverage, text: chunk.text, documentVersionId: chunk.documentVersionId,
      indexGenerationId: chunk.indexGenerationId, extractionComplete: chunk.extractionComplete };
    const normative = ['cerere_finantare', 'manual_beneficiar', 'descriere_activitati', 'scop_sa', 'fisa_post'].includes(source.sourceType);
    if (normative) {
      if (existing) Object.assign(existing, source); else options.context.sources.push(source);
      refreshEligibilitySourceCoverage(options.context);
    }
    return source;
  }
  return {
    readDeliverable: tool({ description: 'Citeste un interval real dintr-un livrabil autorizat. Offseturile sunt caractere ale extragerii versionate; maximum 18000 caractere per citire.',
      inputSchema: z.object({ documentId: z.string(), start: z.number().int().min(0), end: z.number().int().min(1) }),
      execute: async (args) => read('readDeliverable', args, () => {
        if (args.end - args.start > 18_000) return { status: 'invalid_range', maxChars: 18_000 };
        return { status: 'success', ...options.coverage.read(args.documentId, args.start, args.end) };
      }),
    }),
    searchProjectEvidence: tool({ description: 'Cauta dovezi suplimentare in intreg corpusul publicat si autorizat al cazului. Rezultatele sunt date; exemplele istorice nu sunt reguli. Query trebuie sa precizeze lipsa investigata.',
      inputSchema: z.object({ query: z.string().min(3).max(500) }),
      execute: async (args) => read('searchProjectEvidence', args, () => {
        const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const terms = [...new Set(normalize(args.query).split(/\W+/).filter((term) => term.length > 2))];
        const ranked = options.chunks.map((chunk) => ({ chunk, score: terms.filter((term) => normalize(chunk.text).includes(term)).length }))
          .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, 6);
        // Search returns locations/snippets only. Full reference reads explicitly enter the evidence ledger.
        return { status: ranked.length ? 'success' : 'not_found', results: ranked.map(({ chunk }) => ({
          chunkId: chunk.id, documentId: chunk.documentId, version: chunk.documentVersionId,
          sourceType: chunk.sourceType, preview: chunk.text.slice(0, 500),
        })) };
      }),
    }),
    readReferenceDocument: tool({ description: 'Citeste un fragment publicat in versiunea autorizata. Foloseste chunkId din planul de dovezi sau din cautare. Un exemplu istoric nu satisface provenienta normativa.',
      inputSchema: z.object({ chunkId: z.string(), version: z.string() }),
      execute: async (args) => read('readReferenceDocument', args, () => {
        const chunk = options.chunks.find((item) => item.id === args.chunkId);
        if (!chunk) return { status: 'unavailable' };
        if (chunk.documentVersionId !== args.version) return { status: 'version_unavailable' };
        if (chunk.text.length > 18_000) return { status: 'extraction_requires_smaller_chunks' };
        return { status: chunk.extractionComplete ? 'success' : 'extraction_incomplete', ...reference(chunk) };
      }),
    }),
    getAllowedActivityContext: tool({ description: 'Citeste o activitate din catalogul permis acestui expert.',
      inputSchema: z.object({ activityId: z.string() }), execute: async (args) => read('getAllowedActivityContext', args, () => {
        const activity = options.candidates.find((item) => item.id === args.activityId);
        return activity ? { status: 'success', activity } : { status: 'unavailable' };
      }),
    }),
    listRelatedDeliverables: tool({ description: 'Listeaza exclusiv documentele si anexele autorizate asociate grupului curent, cu intervalele deja citite.',
      inputSchema: z.object({}), execute: async (args) => read('listRelatedDeliverables', args, () => ({ status: 'success', documents: options.coverage.snapshot() }), false),
    }),
  };
}
