import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { splitTextIntoRagChunks } from '../lib/rag/chunking.ts';
import { assertRagAdminRequest, guardRagAdminRequest } from '../lib/rag/admin-auth.ts';
import { getCognitoAccessTokenFromRequest } from '../lib/rag/cognito-auth.ts';
import {
  retrieveActivityAutofillContext,
  shouldRunActivityAutofillRag,
} from '../lib/rag/retrieval.ts';
import type { KnowledgeChunk } from '../lib/types.ts';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function testChunk(id: string, patch: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id,
    documentId: `doc-${id}`,
    chunkIndex: 0,
    text: `Fragment relevant ${id}`,
    embeddingJson: '[1,0]',
    embeddingModel: 'text-embedding-3-small',
    sourceType: 'raportare_aprobata_oir',
    category: 'cr',
    status: 'active',
    metadataJson: JSON.stringify({ positionInProject: 'Coordonator Centre Regionale' }),
    ...patch,
  };
}

test('chunking normalizes text and keeps overlap-sized chunks', () => {
  const text = Array.from({ length: 80 }, (_, index) => `Paragraful ${index + 1} contine informatii relevante pentru raportare.`).join('\n\n');
  const chunks = splitTextIntoRagChunks({ text, maxChars: 600, overlapChars: 80 });

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks.every((chunk) => chunk.text.length <= 700), true);
  assert.equal(chunks.every((chunk) => chunk.textHash.length === 64), true);
  assert.equal(chunks.every((chunk) => chunk.tokenEstimate > 0), true);
});

test('retrieval fallback returns empty context when RAG is disabled', async () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  delete process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;

  const guard = shouldRunActivityAutofillRag({ category: 'ap' });
  assert.equal(guard.ok, false);
  assert.equal(guard.reason, 'rag_disabled');

  const result = await retrieveActivityAutofillContext({
    category: 'ap',
    deliverables: [
      {
        extractedText: 'Text livrabil PA pentru autocompletare.',
      },
    ],
    catalogCandidates: [
      {
        id: 'cat-1',
        category: 'ap',
        saCode: 'SA1.1',
        activityName: 'Activitate PA',
      },
    ],
    selectedActivityId: 'cat-1',
    saCode: 'SA1.1',
    activityName: 'Activitate PA',
    currentDescription: 'Descriere curenta pentru activitatea PA.',
  });

  assert.equal(result.enabled, false);
  assert.equal(result.skippedReason, 'rag_disabled');
  assert.deepEqual(result.chunks, []);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
});

test('PA-only RAG can be extended to an explicitly allowed project position', () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  const previousPaOnly = process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  const previousAllowedPositions = process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS;

  process.env.ACTIVITY_AUTOFILL_RAG_ENABLED = 'true';
  process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY = 'true';
  delete process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS;

  const blocked = shouldRunActivityAutofillRag({
    category: 'cr',
    expertRole: 'Coordonator Centre Regionale',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'not_pa_category');

  process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS = 'Coordonator Centre Regionale';
  const allowed = shouldRunActivityAutofillRag({
    category: 'cr',
    expertRole: 'Coordonator Centre Regionale',
  });
  assert.equal(allowed.ok, true);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_PA_ONLY', previousPaOnly);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS', previousAllowedPositions);
});

test('PA-only RAG can be extended to an explicitly allowed category', () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  const previousPaOnly = process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  const previousAllowedCategories = process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_CATEGORIES;

  process.env.ACTIVITY_AUTOFILL_RAG_ENABLED = 'true';
  process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY = 'true';
  process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_CATEGORIES = 'cr';

  const allowed = shouldRunActivityAutofillRag({ category: 'cr' });
  assert.equal(allowed.ok, true);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_PA_ONLY', previousPaOnly);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_ALLOWED_CATEGORIES', previousAllowedCategories);
});

test('activity autofill retrieval prioritizes expert position category SA and activity before reference sources', async () => {
  const previousEnabled = process.env.ACTIVITY_AUTOFILL_RAG_ENABLED;
  const previousPaOnly = process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY;
  const previousAllowedPositions = process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS;

  process.env.ACTIVITY_AUTOFILL_RAG_ENABLED = 'true';
  process.env.ACTIVITY_AUTOFILL_RAG_PA_ONLY = 'true';
  process.env.ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS = 'Coordonator Centre Regionale';

  const calls: string[] = [];
  const result = await retrieveActivityAutofillContext({
    category: 'cr',
    expertId: 'expert-cr-1',
    expertName: 'Irina Nicolae',
    expertRole: 'Coordonator Centre Regionale',
    positionInProject: 'Coordonator Centre Regionale',
    projectCode: '302141',
    month: 8,
    year: 2026,
    deliverables: [{ documentTitle: 'Minuta Hub Est', extractedText: 'Agenda speakeri paneluri si cerinte eveniment regional.' }],
    catalogCandidates: [{ id: 'cat-1', category: 'cr', saCode: 'SA3.3', activityName: 'Organizarea si coordonarea evenimentelor anuale ale centrelor regionale' }],
    selectedActivityId: 'cat-1',
    saCode: 'SA3.3',
    activityName: 'Organizarea si coordonarea evenimentelor anuale ale centrelor regionale',
    currentDescription: 'Am participat la intalnirea de aliniere speakeri.',
  }, {
    topK: 6,
    dependencies: {
      generateEmbedding: async () => [1, 0],
      listKnowledgeChunksByExpertId: async () => {
        calls.push('expert:expertId');
        return Array.from({ length: 4 }, (_, index) => testChunk(`expert-${index + 1}`, { expertId: 'expert-cr-1' }));
      },
      listKnowledgeChunksBySaCode: async (saCode) => {
        calls.push(`category-sa:${saCode}`);
        return Array.from({ length: 4 }, (_, index) => testChunk(`sa-${index + 1}`, { saCode }));
      },
      listKnowledgeChunksByCategoryAndSourceType: async (_category, sourceType, filter) => {
        const record = filter as Record<string, unknown> | undefined;
        if (sourceType !== 'raportare_aprobata_oir') {
          calls.push(`reference:${sourceType}`);
          return [testChunk(`reference-${sourceType}`, { sourceType })];
        }
        if (record && 'expertName' in record) {
          calls.push('expert:expertName');
          return [];
        }
        if (record && 'activityName' in record) {
          calls.push('activity');
          return Array.from({ length: 3 }, (_, index) => testChunk(`activity-${index + 1}`, {
            activityName: 'Organizarea si coordonarea evenimentelor anuale ale centrelor regionale',
          }));
        }
        calls.push('position');
        return Array.from({ length: 7 }, (_, index) => testChunk(`position-${index + 1}`));
      },
    },
  });

  assert.deepEqual(calls, [
    'expert:expertId',
    'expert:expertName',
    'position',
    'category-sa:SA3.3',
    'activity',
  ]);
  assert.deepEqual(result.chunks.map(({ chunk }) => chunk.id), [
    'expert-1',
    'position-1',
    'sa-1',
    'activity-1',
    'expert-2',
    'position-2',
  ]);
  assert.equal(result.chunks.some(({ chunk }) => chunk.sourceType !== 'raportare_aprobata_oir'), false);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_PA_ONLY', previousPaOnly);
  restoreEnv('ACTIVITY_AUTOFILL_RAG_ALLOWED_POSITIONS', previousAllowedPositions);
});

test('RAG admin guard fails closed when token is not configured', () => {
  const previousToken = process.env.RAG_ADMIN_IMPORT_TOKEN;
  delete process.env.RAG_ADMIN_IMPORT_TOKEN;

  const response = guardRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document', {
    method: 'POST',
  }));

  assert.equal(response?.status, 503);
  restoreEnv('RAG_ADMIN_IMPORT_TOKEN', previousToken);
});

test('RAG admin guard accepts matching header token only', () => {
  const previousToken = process.env.RAG_ADMIN_IMPORT_TOKEN;
  process.env.RAG_ADMIN_IMPORT_TOKEN = 'local-test-token';

  const denied = guardRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document', {
    method: 'POST',
    headers: { 'x-rag-admin-token': 'wrong-token' },
  }));
  assert.equal(denied?.status, 403);

  const allowed = guardRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document', {
    method: 'POST',
    headers: { 'x-rag-admin-token': 'local-test-token' },
  }));
  assert.equal(allowed, null);

  restoreEnv('RAG_ADMIN_IMPORT_TOKEN', previousToken);
});

test('Cognito token helper reads explicit and bearer tokens without using admin token header', () => {
  const explicit = getCognitoAccessTokenFromRequest(new Request('http://localhost/api/admin/rag/index-document', {
    method: 'POST',
    headers: {
      'x-rag-admin-token': 'admin-token',
      'x-cognito-access-token': 'cognito-token',
    },
  }));
  assert.equal(explicit, 'cognito-token');

  const bearer = getCognitoAccessTokenFromRequest(new Request('http://localhost/api/ai/suggest-activity-from-deliverables', {
    method: 'POST',
    headers: {
      authorization: 'Bearer cognito-bearer-token',
    },
  }), { allowAuthorizationHeader: true });
  assert.equal(bearer, 'cognito-bearer-token');

  const ignoredBearer = getCognitoAccessTokenFromRequest(new Request('http://localhost/api/admin/rag/index-document', {
    method: 'POST',
    headers: {
      authorization: 'Bearer admin-token',
    },
  }));
  assert.equal(ignoredBearer, '');
});

function makeAccessToken(groups: string[]) {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    iss: 'https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_RVfck2jAV',
    token_use: 'access',
    exp: Math.floor(Date.now() / 1000) + 300,
    username: 'admin@example.com',
    sub: 'admin-id',
    'cognito:groups': groups,
  })}.signature`;
}

test('RAG admin Cognito guard allows an Admin without the legacy import header', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ Username: 'admin@example.com' }), { status: 200 });
  const token = makeAccessToken(['admin']);
  const result = await assertRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document', {
    headers: { authorization: `Bearer ${token}` },
  }));
  assert.equal(result, token);
  globalThis.fetch = previousFetch;
});

test('RAG admin Cognito guard returns 401 without a session and 403 for non-Admin', async () => {
  async function rejectionOf(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      return error as Error & { status?: number };
    }
    throw new Error('Expected request to be rejected.');
  }

  const noSession = await rejectionOf(
    () => assertRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document')),
  );
  assert.equal(noSession.status, 401);

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ Username: 'expert@example.com' }), { status: 200 });
  const token = makeAccessToken(['expert']);
  const nonAdmin = await rejectionOf(
    () => assertRagAdminRequest(new Request('http://localhost/api/admin/rag/index-document', {
      headers: { authorization: `Bearer ${token}` },
    })),
  ) as Error & { status?: number };
  assert.equal(nonAdmin.status, 403);
  globalThis.fetch = previousFetch;
});

test('Admin RAG UI no longer asks for or sends the legacy token', () => {
  const source = readFileSync(new URL('../components/admin/ai-context-health-panel.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('Token RAG admin'), false);
  assert.equal(source.includes('ragAdminToken'), false);
  assert.equal(source.includes('x-rag-admin-token'), false);
});

test('approved activity reports are indexed at expert/project/month scope', () => {
  const route = readFileSync(new URL('../app/api/admin/rag/index-document/route.ts', import.meta.url), 'utf8');
  assert.match(route, /const requiresActivityScope = sourceType === 'livrabil_aprobat'/);
  assert.match(route, /Rapoartele de activitate aprobate necesita expert, proiect, luna si an/);
});

test('AI context health can resolve a merged fallback expert by email', () => {
  const route = readFileSync(new URL('../app/api/admin/ai-context-health/route.ts', import.meta.url), 'utf8');
  assert.match(route, /expertEmail = url\.searchParams\.get\('expertEmail'\)/);
  assert.match(route, /item\.email\?\.trim\(\)\.toLowerCase\(\) === expertEmail/);
});

test('AI context health ignores stale responses after a filter change', () => {
  const source = readFileSync(new URL('../components/admin/ai-context-health-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /const healthRequestId = useRef\(0\)/);
  assert.match(source, /if \(requestId !== healthRequestId\.current\) return/);
});

test('AI context health ruleset card opens the existing PM governance editor', () => {
  const source = readFileSync(new URL('../components/admin/ai-context-health-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /card\.id === 'eligibility-rules'/);
  assert.match(source, /\/pm\?tab=eligibility-governance/);
});

test('ruleset publish creates the first draft when no ruleset exists', () => {
  const source = readFileSync(new URL('../components/pm/eligibility-governance-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /const saved = selectedRuleset\n\s+\? await updateDraft/);
  assert.match(source, /: await createDraft\(\{\n\s+title,\n\s+rulesJson: parsedRules/);
});
