import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDocxExtractionMessages } from '../lib/rag/reference-document-text.ts';

test('DOCX style warnings do not mark successfully extracted text as incomplete', () => {
  const result = classifyDocxExtractionMessages([
    { type: 'warning', message: 'An unrecognised element was ignored: v:path' },
  ]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.failedSections, []);
  assert.match(result.warnings[0], /v:path/);
});

test('DOCX extraction errors remain blocking', () => {
  const result = classifyDocxExtractionMessages([
    { type: 'warning', message: 'Unrecognised style' },
    { type: 'error', message: 'Broken document part' },
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.failedSections, ['document:extraction-errors']);
});
