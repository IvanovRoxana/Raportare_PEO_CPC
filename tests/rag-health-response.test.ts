import assert from 'node:assert/strict';
import test from 'node:test';
import { readHealthResponse } from '../lib/rag/health-response.ts';

test('health rejects empty, truncated and proxy responses without exposing JSON parser errors', async () => {
  for (const body of ['', '{', '<html>Gateway error</html>']) {
    await assert.rejects(readHealthResponse(new Response(body)), /Serverul nu a returnat/);
    await assert.rejects(readHealthResponse(new Response(body, { status: 504 })), /HTTP 504/);
  }
});

test('health preserves server errors and accepts a complete empty health result', async () => {
  await assert.rejects(readHealthResponse(Response.json({ error: 'Sesiune expirata' }, { status: 401 })), /Sesiune expirata/);
  await assert.rejects(readHealthResponse(Response.json({})), /Serverul nu a returnat/);
  const data = { cards: [], recentAudits: [], warnings: [] };
  assert.deepEqual(await readHealthResponse(Response.json(data)), data);
});
