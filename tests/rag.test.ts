import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTextIntoRagChunks } from '../lib/rag/chunking.ts';
import { guardRagAdminRequest } from '../lib/rag/admin-auth.ts';
import { getCognitoAccessTokenFromRequest } from '../lib/rag/cognito-auth.ts';
import {
  retrieveActivityAutofillContext,
  shouldRunActivityAutofillRag,
} from '../lib/rag/retrieval.ts';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
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
  });

  assert.equal(result.enabled, false);
  assert.equal(result.skippedReason, 'rag_disabled');
  assert.deepEqual(result.chunks, []);

  restoreEnv('ACTIVITY_AUTOFILL_RAG_ENABLED', previousEnabled);
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
