import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEligibilityCatalogLoader,
  scopeEligibilityCatalog,
  type EligibilityCatalogExpert,
} from '../lib/eligibility-catalog.ts';
import type { ActivityCatalog } from '../lib/types.ts';

const expert: EligibilityCatalogExpert = {
  id: 'expert-1',
  name: 'Expert proiect',
  category: 'Comunicare',
  saCodes: [' SA3.1 ', 'SA3.2'],
  projectCode: '302141',
  isActive: true,
  jobDescriptionText: 'Responsabilitati aprobate pentru expertul selectat.',
};

function item(id: string, overrides: Partial<ActivityCatalog> = {}): ActivityCatalog {
  return {
    id,
    category: 'com',
    saCode: 'SA3.1',
    activityNumber: 1,
    activityName: 'Comunicare',
    serviceCategory: 'Comunicare',
    description: 'Descriere din referinta.',
    isActive: true,
    ...overrides,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const request = { expertId: 'expert-1', currentSaCode: 'SA3.1' };
const options = { authToken: 'mock-cognito-access-token' };

function makeLoader(fetchImpl: typeof fetch, extra: {
  referenceCatalog?: ActivityCatalog[];
  timeoutMs?: number;
  maxPages?: number;
} = {}) {
  return createEligibilityCatalogLoader({
    endpoint: 'https://catalog.invalid/graphql',
    referenceCatalog: [item('reference')],
    referenceExperts: [expert],
    fetchImpl,
    ...extra,
  });
}

test('catalogul este limitat de categoria si SA-urile profilului, intersectate cu ID-urile permise', () => {
  const catalog = [
    item('allowed', { category: 'Comunicare', saCode: ' SA3.1 ' }),
    item('other-category', { category: 'ap' }),
    item('other-sa', { saCode: 'SA6.1' }),
    item('inactive', { isActive: false }),
    item('other-tab', { activityNumber: 2 }),
  ];
  const scoped = scopeEligibilityCatalog(catalog, expert, ['allowed', 'other-category', 'other-sa', 'inactive']);
  assert.deepEqual(scoped.map((candidate) => candidate.id), ['allowed']);
  assert.equal(scoped[0].category, 'com');
  assert.equal(scoped[0].saCode, 'SA3.1');
  assert.deepEqual(scopeEligibilityCatalog(catalog, expert, []), []);
  assert.deepEqual(scopeEligibilityCatalog(catalog, { ...expert, saCodes: [] }), []);
  assert.deepEqual(scopeEligibilityCatalog(catalog, { ...expert, category: undefined }), []);
  assert.deepEqual(scopeEligibilityCatalog(catalog, { ...expert, isActive: false }), []);
});

test('citirea paginata foloseste profilul backend si descrierea editata, fara continut din formular', async () => {
  const pages: Array<string | null> = [];
  let profileLookups = 0;
  const loader = makeLoader(async (url, init) => {
    assert.equal(url, 'https://catalog.invalid/graphql');
    assert.equal(new Headers(init?.headers).get('Authorization'), options.authToken);
    assert.equal(init?.cache, 'no-store');
    const body = JSON.parse(String(init?.body)) as { query: string; variables: { id?: string; nextToken?: string | null } };
    if (body.query.includes('getExpert')) {
      profileLookups += 1;
      assert.deepEqual(body.variables, { id: 'expert-1' });
      return response({ data: { getExpert: { ...expert, projectCode: 'authoritative-project' } } });
    }
    pages.push(body.variables.nextToken ?? null);
    return body.variables.nextToken
      ? response({ data: { listActivityCatalogs: { items: [item('inactive-backend', { activityNumber: 2, isActive: false })], nextToken: null } } })
      : response({ data: { listActivityCatalogs: {
        items: [null, item('backend', { description: 'Descriere editata oficial in baza de date.' })],
        nextToken: 'page-2',
      } } });
  }, { referenceCatalog: [item('reference'), item('inactive-reference', { activityNumber: 2 })] });

  const result = await loader({ ...request, expertCategory: 'ap', allowedCandidateIds: ['backend', 'inactive-backend'] }, options);

  assert.deepEqual(pages, [null, 'page-2']);
  assert.equal(profileLookups, 1);
  assert.equal(result.source, 'backend');
  assert.equal(result.expert.category, 'com');
  assert.equal(result.expert.projectCode, 'authoritative-project');
  assert.equal(result.expert.jobDescriptionText, expert.jobDescriptionText);
  assert.deepEqual(result.candidates.map((candidate) => candidate.id), ['backend']);
  assert.equal(result.candidates[0].description, 'Descriere editata oficial in baza de date.');
  assert.ok(result.warnings.some((warning) => /Categoria din formular/.test(warning)));
});

test('mutarea unei activitati backend nu reactiveaza copia locala veche cu acelasi ID', async () => {
  const loader = makeLoader(async (_, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    return body.query.includes('getExpert')
      ? response({ data: { getExpert: expert } })
      : response({ data: { listActivityCatalogs: { items: [item('reference', { category: 'ap', isActive: false })], nextToken: null } } });
  });
  const result = await loader(request, options);
  assert.deepEqual(result.candidates, []);
});

test('profilul lipsa foloseste doar referinta expertului cerut si semnaleaza fallback', async () => {
  const loader = makeLoader(async (_, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    return body.query.includes('getExpert')
      ? response({ data: { getExpert: null } })
      : response({ data: { listActivityCatalogs: { items: [], nextToken: null } } });
  });
  const result = await loader({ ...request, expertCategory: 'ap' }, options);
  assert.equal(result.source, 'reference_fallback');
  assert.equal(result.expert.id, 'expert-1');
  assert.equal(result.expert.category, 'com');
  assert.ok(result.warnings.some((warning) => /Profilul expertului provine/.test(warning)));
  await assert.rejects(loader({ ...request, expertId: 'unknown-expert' }, options), /Profilul expertului nu a putut fi identificat/);
});

test('indisponibilitatea backendului nu este raportata ca validare autoritara', async () => {
  const result = await makeLoader(async () => { throw new Error('Private network diagnostics'); })(request, options);
  assert.equal(result.source, 'reference_fallback');
  assert.equal(result.candidates.length, 1);
  assert.ok(result.warnings.some((warning) => /necesita confirmare/.test(warning)));
  assert.equal(JSON.stringify(result).includes('Private network diagnostics'), false);
});

test('lipsa autentificarii sau accesul respins nu foloseste fallback pentru a ocoli autentificarea', async () => {
  let calls = 0;
  const loader = makeLoader(async () => { calls += 1; return response({}, 401); });
  await assert.rejects(loader(request, {}), /Lipseste autentificarea Cognito/);
  assert.equal(calls, 0);
  await assert.rejects(loader(request, options), /Sesiunea Cognito nu permite/);
  const graphqlDenied = makeLoader(async () => response({ errors: [{ errorType: 'Unauthorized', message: 'private error' }] }));
  await assert.rejects(graphqlDenied(request, options), /Sesiunea Cognito nu permite/);
});

test('paginarea repetata sau trunchiata produce fallback explicit, fara aprobare implicita', async () => {
  for (const maxPages of [1, 10]) {
    let pages = 0;
    const loader = makeLoader(async (_, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('getExpert')) return response({ data: { getExpert: expert } });
      pages += 1;
      return response({ data: { listActivityCatalogs: { items: [], nextToken: 'repeated-token' } } });
    }, { maxPages });
    const result = await loader(request, options);
    assert.equal(result.source, 'reference_fallback');
    assert.ok(pages <= 2);
    assert.ok(result.warnings.some((warning) => /citit complet/.test(warning)));
  }
});

test('timeoutul include raspunsurile blocate si abandoneaza cererile', async () => {
  const signals: AbortSignal[] = [];
  const loader = makeLoader(async (_, init) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise<Response>(() => {});
  }, { timeoutMs: 10 });
  const result = await loader(request, options);
  assert.equal(result.source, 'reference_fallback');
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('profilul backend nu este completat cu o categorie sau SA mai permisiva din formular ori seed', async () => {
  const loader = makeLoader(async (_, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    return body.query.includes('getExpert')
      ? response({ data: { getExpert: { ...expert, saCodes: ['SA6.1'] } } })
      : response({ data: { listActivityCatalogs: { items: [], nextToken: null } } });
  });
  await assert.rejects(loader(request, options), /Subactivitatea selectata nu este atribuita/);
});
