import assert from 'node:assert/strict';
import test from 'node:test';
import { joinPdfTextItems } from '../lib/rag/pdf-text.ts';

test('PDF extraction keeps split font-run words together and preserves explicit spaces and lines', () => {
  assert.equal(joinPdfTextItems([
    { str: 'Fi' }, { str: '\u0219' }, { str: '\u0103 de post' }, { str: '', hasEOL: true },
    { str: 'Business' }, { str: 'HUB' }, { str: ' ' }, { str: 'M' }, { str: 'anager' },
  ]), 'Fi\u0219\u0103 de post\nBusinessHUB Manager');
});

test('PDF extraction ignores non-text marked content', () => {
  assert.equal(joinPdfTextItems([null, {}, { type: 'beginMarkedContent' }, { str: 'Text' }, { str: '', hasEOL: true }]), 'Text');
});
