import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('reference imports index extracted text without archiving an uploaded original', () => {
  const source = readFileSync(new URL('../app/api/admin/rag/index-reference-pdfs/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /archiveRagOriginal/);
  assert.match(source, /text: extracted\.text/);
  assert.match(source, /importEndpoint: 'index-reference-pdfs'/);
});
