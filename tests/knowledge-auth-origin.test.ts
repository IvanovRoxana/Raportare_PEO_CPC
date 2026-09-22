import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSamePublicRequestOrigin } from '../lib/rag/request-origin.ts';

test('knowledge requests accept the public Amplify host forwarded to SSR', () => {
  const request = new Request('http://127.0.0.1:3000/api/admin/rag/index-reference-pdfs', {
    headers: {
      origin: 'https://main.d19mquq8thd1uj.amplifyapp.com',
      host: '127.0.0.1:3000',
      'x-forwarded-host': 'main.d19mquq8thd1uj.amplifyapp.com',
    },
  });

  assert.equal(hasSamePublicRequestOrigin(request), true);
});

test('knowledge requests reject a different browser origin', () => {
  const request = new Request('https://main.d19mquq8thd1uj.amplifyapp.com/api/admin/rag/index-reference-pdfs', {
    headers: {
      origin: 'https://untrusted.example',
      host: 'main.d19mquq8thd1uj.amplifyapp.com',
      'x-forwarded-host': 'main.d19mquq8thd1uj.amplifyapp.com',
    },
  });

  assert.equal(hasSamePublicRequestOrigin(request), false);
});
