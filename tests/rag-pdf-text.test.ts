import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfTextFromBuffer, joinPdfTextItems } from '../lib/rag/pdf-text.ts';

test('PDF extraction keeps split font-run words together and preserves explicit spaces and lines', () => {
  assert.equal(joinPdfTextItems([
    { str: 'Fi' }, { str: '\u0219' }, { str: '\u0103 de post' }, { str: '', hasEOL: true },
    { str: 'Business' }, { str: 'HUB' }, { str: ' ' }, { str: 'M' }, { str: 'anager' },
  ]), 'Fi\u0219\u0103 de post\nBusinessHUB Manager');
});

test('PDF extraction ignores non-text marked content', () => {
  assert.equal(joinPdfTextItems([null, {}, { type: 'beginMarkedContent' }, { str: 'Text' }, { str: '', hasEOL: true }]), 'Text');
});

test('PDF extraction runs in Node without browser DOM globals', async () => {
  const stream = 'BT /F1 12 Tf 72 720 Td (Reference document test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractPdfTextFromBuffer(new TextEncoder().encode(pdf).buffer);
  assert.equal(result.pageCount, 1);
  assert.match(result.text, /Reference document test/);
});
