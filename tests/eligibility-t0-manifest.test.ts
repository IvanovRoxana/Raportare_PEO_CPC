import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectManifestDocuments } from '../scripts/rag-t0-manifest.mjs';

test('T0 manifest verifies originals, preserves multiple mappings and has stable identities on rerun', async () => {
  const prefix = path.join(tmpdir(), 'peo-t0-test-');
  const directory = await mkdtemp(prefix);
  try {
    const text = 'Continut documentar pentru cererea de finantare. '.repeat(10);
    const sha256 = createHash('sha256').update(text).digest('hex');
    await writeFile(path.join(directory, 'source.txt'), text);
    const manifest = { version: 1, id: 'test', sources: [{ id: 'source', file: 'source.txt', title: 'Cerere', sha256,
      mappings: [{ id: 'a', projectCode: 'one', sourceType: 'cerere_finantare' }, { id: 'b', projectCode: 'two', sourceType: 'cerere_finantare' }] }] };
    const file = path.join(directory, 'manifest.json');
    await writeFile(file, JSON.stringify(manifest));
    let extractions = 0;
    const extract = async () => { extractions++; return { text, complete: true }; };
    const first = await collectManifestDocuments(file, extract);
    assert.equal(first.documents.length, 2); assert.equal(extractions, 1);
    assert.notEqual(first.documents[0].metadata.sourceIdentity, first.documents[1].metadata.sourceIdentity);
    assert.equal(first.documents[0].originalFileBase64, first.documents[1].originalFileBase64);
    const second = await collectManifestDocuments(file, extract);
    assert.deepEqual(second, first);
    await assert.rejects(() => collectManifestDocuments(file, async () => ({ text, complete: false })), /incompleta/);
    manifest.sources[0].mappings.push(manifest.sources[0].mappings[0]);
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(() => collectManifestDocuments(file, extract), /duplicata/);
    await writeFile(path.join(directory, 'source.txt'), 'replaced');
    await assert.rejects(() => collectManifestDocuments(file, extract), /Hash diferit/);
  } finally {
    // Only the unique directory created by this test can be removed.
    if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected test directory');
    await rm(directory, { recursive: true, force: true });
  }
});
