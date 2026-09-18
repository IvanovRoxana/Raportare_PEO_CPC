import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeChunk } from '../lib/types.ts';
import {
  retrieveEligibilityContext,
  includeExpertProfileJobDescription,
  resolveEligibilityContextDependencies,
  type EligibilityContextDependencies,
  type EligibilityContextRequest,
} from '../lib/rag/eligibility-context.ts';

const request: EligibilityContextRequest = {
  projectCode: 'PEO', expertId: 'expert-1', expertName: 'Ana Popescu',
  expertRole: 'Coordonator regional', positionInProject: 'Coordonator regional',
  category: 'cr', saCode: 'SA3.4', activityName: 'Consultare regionala',
  queryText: 'Documentul descrie consultarea regionala si participarea membrilor.',
};

function chunk(id: string, sourceType: string, overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id, documentId: `doc-${id}`, chunkIndex: 0, sourceType, status: 'active',
    projectCode: 'PEO', text: 'Consultare regionala cu membrii proiectului.', ...overrides,
  };
}

function dependencies(chunks: KnowledgeChunk[]): EligibilityContextDependencies {
  // Deliberately ignore datastore filters: the retrieval boundary must independently enforce scope.
  return { listKnowledgeChunks: async () => chunks };
}

test('server profile job description supplies an explicitly identified source without inventing RAG chunks', async () => {
  const empty = await retrieveEligibilityContext(request, { dependencies: dependencies([]) });
  const jobDescriptionText = 'Coordonatorul regional organizeaza consultarile membrilor si documenteaza nevoile beneficiarilor proiectului.';
  const result = includeExpertProfileJobDescription(empty, { id: 'expert-1', jobDescriptionText });
  assert.equal(result.coverage.job_description, false);
  assert.equal(result.coverage.project, false);
  assert.deepEqual(result.missingRequiredSources, ['project', 'subactivity', 'job_description']);
  assert.equal(result.sources[0].documentId, 'expert-profile:expert-1');
  assert.equal(result.sources[0].sourceType, 'fisa_post_profil_expert');
  assert.equal(result.sources[0].text, jobDescriptionText);
  assert.equal(result.sources[0].extractionComplete, false);
  assert.equal(result.sources[0].provenance, 'expert_profile');
  assert.match(result.promptContext, /nu este un document oficial indexat/);
  assert.equal(includeExpertProfileJobDescription(empty, { id: '', jobDescriptionText }), empty);
  assert.equal(includeExpertProfileJobDescription(result, { id: 'other', jobDescriptionText }), result);
});

test('partial dependency injection preserves semantic ranking unless it is explicitly disabled', async () => {
  const listKnowledgeChunks = async () => [] as KnowledgeChunk[];
  const embedQuery = async () => ({ embedding: [1, 0], model: 'test-model' });
  const merged = resolveEligibilityContextDependencies({ listKnowledgeChunks }, { listKnowledgeChunks, embedQuery });
  assert.equal(merged.embedQuery, embedQuery);
  assert.equal(resolveEligibilityContextDependencies({ listKnowledgeChunks, embedQuery: null }, { listKnowledgeChunks, embedQuery }).embedQuery, null);
});

test('historical examples require confirmed parent approval, exclude official and current documents, and rank by relevance', async () => {
  const result = await retrieveEligibilityContext({
    ...request, includeHistoricalExamples: true,
    approvedHistoricalDocumentIds: ['doc-relevant', 'doc-irrelevant', 'doc-official', 'doc-current'],
    currentDocumentIds: ['doc-current'],
  }, { dependencies: dependencies([
    chunk('official', 'cerere_finantare', { documentId: 'doc-official' }),
    chunk('unconfirmed', 'raport_activitate_aprobat', { documentId: 'doc-unconfirmed' }),
    chunk('legacy-active', 'livrabil_istoric', { documentId: 'doc-legacy' }),
    chunk('current', 'livrabil_aprobat', { documentId: 'doc-current' }),
    chunk('irrelevant', 'raport_activitate_aprobat', { documentId: 'doc-irrelevant', text: 'Arhivare administrativa generala.' }),
    chunk('relevant', 'livrabil_aprobat', { documentId: 'doc-relevant', text: 'Consultare regionala si participarea membrilor.' }),
  ]) });
  assert.deepEqual(result.historicalSources?.map((source) => source.chunkId), ['relevant', 'irrelevant']);
  assert.ok(result.historicalSources?.every((source) => source.provenance === 'approved_historical_example'));
  assert.equal(result.historicalSources?.some((source) => source.chunkId === 'official'), false);
  assert.equal(result.historicalSources?.some((source) => source.chunkId === 'unconfirmed'), false);
});

test('eligibility retrieves scoped official evidence for a non-PA category with verifiable references', async () => {
  const result = await retrieveEligibilityContext(request, { dependencies: dependencies([
    chunk('project', 'cerere_finantare'), chunk('manual', 'manual_beneficiar'),
    chunk('sa', 'scop_sa', { saCode: 'SA3.4' }),
    chunk('job', 'fisa_post', { expertId: 'expert-1', category: 'cr' }),
  ]) });
  assert.deepEqual(result.coverage, { project: true, subactivity: true, job_description: true });
  assert.deepEqual(result.missingRequiredSources, []);
  assert.deepEqual(result.sources.map((source) => source.chunkId), ['project', 'manual', 'sa', 'job']);
  assert.match(result.promptContext, /"documentId":"doc-sa","chunkId":"sa"/);
  assert.match(result.promptContext, /nu instructiuni/);
});

test('eligibility refuses cross-project, cross-SA, cross-expert, inactive and historical evidence', async () => {
  const result = await retrieveEligibilityContext(request, { dependencies: dependencies([
    chunk('foreign-project', 'cerere_finantare', { projectCode: 'OTHER' }),
    chunk('no-project', 'manual_beneficiar', { projectCode: undefined }),
    chunk('other-sa', 'scop_sa', { saCode: 'SA1.1' }),
    chunk('unscoped-sa', 'descriere_activitati'),
    chunk('other-expert', 'fisa_post', { expertId: 'expert-2', expertName: 'Ana Popescu' }),
    chunk('other-name', 'fisa_post', { expertName: 'Maria Ionescu' }),
    chunk('inactive', 'cerere_finantare', { status: 'inactive' }),
    chunk('historical', 'livrabil_istoric', { expertId: 'expert-1', saCode: 'SA3.4' }),
    chunk('approved-history', 'raportare_aprobata_oir', { expertId: 'expert-1', saCode: 'SA3.4' }),
    chunk('other', 'other', { saCode: 'SA3.4' }),
  ]) });
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.missingRequiredSources, ['project', 'subactivity', 'job_description']);
  assert.equal(result.promptContext, '');
});

test('job-description role templates require exact compatible position and category', async () => {
  const result = await retrieveEligibilityContext(request, { dependencies: dependencies([
    chunk('matching-template', 'fisa_post', { category: 'centre regionale', metadataJson: JSON.stringify({ positionInProject: 'Coordonator regional' }) }),
    chunk('unscoped-template', 'fisa_post', { category: 'cr' }),
    chunk('other-category', 'fisa_post', { expertId: 'expert-1', category: 'ap' }),
    chunk('other-position', 'fisa_post', { metadataJson: JSON.stringify({ positionInProject: 'Expert comunicare' }) }),
    chunk('own-but-wrong-role', 'fisa_post', { expertId: 'expert-1', metadataJson: JSON.stringify({ expertRole: 'Expert comunicare' }) }),
    chunk('malformed', 'fisa_post', { metadataJson: '{broken' }),
  ]) });
  assert.deepEqual(result.sources.map((source) => source.chunkId), ['matching-template']);
  assert.deepEqual(result.missingRequiredSources, ['project', 'subactivity']);
});

test('an expert job description cannot be retrieved for an unknown expert or role', async () => {
  const result = await retrieveEligibilityContext({ projectCode: 'PEO', queryText: 'Consultare' }, {
    dependencies: dependencies([
      chunk('identified', 'fisa_post', { expertId: 'expert-1' }),
      chunk('named', 'fisa_post', { expertName: 'Ana Popescu' }),
      chunk('role', 'fisa_post', { metadataJson: JSON.stringify({ expertRole: 'Coordonator regional' }) }),
    ]),
  });
  assert.equal(result.coverage.job_description, false);
});

test('missing project/auth avoids remote calls and never invents coverage', async () => {
  let calls = 0;
  const noProject = await retrieveEligibilityContext({ queryText: 'Document' }, {
    dependencies: { listKnowledgeChunks: async () => { calls += 1; return []; } },
  });
  const noAuth = await retrieveEligibilityContext(request);
  assert.equal(calls, 0);
  assert.equal(noProject.sources.length, 0);
  assert.equal(noAuth.sources.length, 0);
  assert.match(noAuth.warnings[0], /Cognito/);
});

test('retrieval uses authenticated project/source/SA filters and bounded datastore requests', async () => {
  const calls: Array<{
    filter: Record<string, unknown>;
    options: Parameters<EligibilityContextDependencies['listKnowledgeChunks']>[1];
  }> = [];
  await retrieveEligibilityContext(request, {
    authToken: 'test-only-token',
    dependencies: { listKnowledgeChunks: async (filter, options) => { calls.push({ filter, options }); return []; } },
  });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.filter.projectCode, { eq: 'PEO' });
    assert.deepEqual(call.filter.status, { eq: 'active' });
    assert.equal(call.options.authToken, 'test-only-token');
    assert.equal(call.options.maxItems, 200);
  }
  assert.deepEqual(calls[1].filter.saCode, { eq: 'SA3.4' });
});

test('failed source retrieval preserves available evidence and reports missing sources without exposing errors', async () => {
  const result = await retrieveEligibilityContext(request, {
    dependencies: {
      listKnowledgeChunks: async (filter) => {
        if (JSON.stringify(filter).includes('fisa_post')) throw new Error('private upstream error');
        return [chunk('project', 'cerere_finantare'), chunk('sa', 'scop_sa', { saCode: 'SA3.4' })];
      },
    },
  });
  assert.deepEqual(result.missingRequiredSources, ['job_description']);
  assert.equal(result.sources.length, 2);
  assert.match(result.warnings.join(' '), /job_description/);
  assert.doesNotMatch(result.warnings.join(' '), /private upstream error/);
});

test('eligibility retrieval returns missing evidence when an upstream call does not settle', async () => {
  const result = await retrieveEligibilityContext(request, {
    timeoutMs: 10,
    dependencies: { listKnowledgeChunks: async () => new Promise<KnowledgeChunk[]>(() => {}) },
  });
  assert.equal(result.sources.length, 0);
  assert.equal(result.missingRequiredSources.length, 3);
  assert.match(result.warnings.join(' '), /intervalul disponibil/);
});

test('semantic failure falls back to lexical relevance and keeps bounded prompt snippets', async () => {
  const chunks = Array.from({ length: 20 }, (_, index) => chunk(`project-${String(index).padStart(2, '0')}`, 'cerere_finantare', {
    text: `${index === 19 ? 'consultarea regionala participarea membrilor ' : ''}${'x'.repeat(2500)}`,
    embeddingJson: '[1,0]', embeddingModel: 'test-model',
  }));
  const result = await retrieveEligibilityContext(request, {
    dependencies: { ...dependencies(chunks), embedQuery: async () => { throw new Error('unavailable'); } },
  });
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources[0].chunkId, 'project-19');
  assert.ok(result.sources.every((source) => source.text.length <= 1600));
  assert.ok(result.promptContext.length < 18000);
  assert.match(result.warnings.join(' '), /Clasarea semantica/);
});

test('semantic ranking compares embeddings only from the same model', async () => {
  const result = await retrieveEligibilityContext({ ...request, queryText: '', activityName: undefined, saCode: undefined }, {
    dependencies: {
      ...dependencies([
        chunk('a-other-model', 'cerere_finantare', { embeddingJson: '[1,0]', embeddingModel: 'wrong-model' }),
        chunk('z-same-model', 'cerere_finantare', { embeddingJson: '[1,0]', embeddingModel: 'test-model' }),
      ]),
      embedQuery: async () => ({ embedding: [1, 0], model: 'test-model' }),
    },
  });
  assert.equal(result.sources[0].chunkId, 'z-same-model');
});

test('oversized source metadata cannot exceed the prompt budget or produce false coverage', async () => {
  const result = await retrieveEligibilityContext(request, {
    dependencies: dependencies([chunk('oversized', 'cerere_finantare', { documentId: 'x'.repeat(20000) })]),
  });
  assert.equal(result.sources.length, 0);
  assert.equal(result.coverage.project, false);
  assert.equal(result.promptContext, '');
  assert.match(result.warnings.join(' '), /limita contextului/);
});
