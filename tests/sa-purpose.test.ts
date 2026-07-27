import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSaPurposeSection,
  findSaPurposeContext,
  normalizeSaPurposeCode,
} from '../lib/rag/sa-purpose.ts';
import type { KnowledgeChunk } from '../lib/types.ts';

test('normalizeaza variantele de cod SA folosite in document', () => {
  assert.equal(normalizeSaPurposeCode('SA3.2'), 'SA3.2');
  assert.equal(normalizeSaPurposeCode('SA.3.3'), 'SA3.3');
  assert.equal(normalizeSaPurposeCode(' s.a. 3.4 '), 'SA3.4');
});

test('extrage doar sectiunea SA solicitata si ignora referintele interne la alte SA-uri', () => {
  const documentText = `
(SA3.1) Planificare strategica
Am realizat studiul care contribuie si la SA3.3.
Text suplimentar pentru SA3.1.

(SA3.2) Infrastructura structurilor regionale
Subactivitatea urmareste functionarea structurilor regionale si informarea membrilor.
Au fost prevazute activitati de monitorizare si comunicare.

(SA.3.3) Campanii pentru membri
Sectiunea urmatoare nu trebuie inclusa.
`;

  const section = extractSaPurposeSection(documentText, 'SA3.2');
  assert.equal(section?.saCode, 'SA3.2');
  assert.match(section?.text || '', /functionarea structurilor regionale/);
  assert.doesNotMatch(section?.text || '', /Sectiunea urmatoare/);
});

test('reconstruieste documentul din chunkuri si returneaza sursa auditabila', () => {
  const chunks: KnowledgeChunk[] = [
    {
      id: 'chunk-2',
      documentId: 'sauri-document',
      chunkIndex: 1,
      text: 'Continuarea scopului SA3.2.\n\n(SA.3.3) Campanii\nText SA3.3.',
      sourceType: 'descriere_activitati',
    },
    {
      id: 'chunk-1',
      documentId: 'sauri-document',
      chunkIndex: 0,
      text: '(SA3.2) Infrastructura\nScopul oficial pentru structurile regionale.',
      sourceType: 'descriere_activitati',
    },
  ];

  const context = findSaPurposeContext(chunks, 'SA3.2');
  assert.equal(context?.documentId, 'sauri-document');
  assert.equal(context?.sourceType, 'descriere_activitati');
  assert.deepEqual(context?.chunkIds, ['chunk-1', 'chunk-2']);
  assert.match(context?.text || '', /Continuarea scopului SA3.2/);
  assert.doesNotMatch(context?.text || '', /Text SA3.3/);
});
