import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadReferenceFile, validateReferenceUpload } from '../lib/rag/reference-upload.ts';

const file = new File(['Official source text'], 'Descriere SA3.4.pdf', { type: 'application/pdf' });
const override = { sourceType: 'scop_sa', saCode: 'SA3.4' };

test('reference upload validates type, size, project and explicitly reviewed mappings', () => {
  assert.equal(validateReferenceUpload(file, '302141', override), null);
  assert.ok(validateReferenceUpload({ name: 'bad.exe', size: 100 }, '302141', override));
  assert.ok(validateReferenceUpload({ name: 'big.pdf', size: 16 * 1024 * 1024 }, '302141', override));
  assert.ok(validateReferenceUpload({ name: 'empty.pdf', size: 0 }, '302141', override));
  assert.ok(validateReferenceUpload(file, '', override));
  assert.ok(validateReferenceUpload(file, '302141', {}));
  assert.ok(validateReferenceUpload(file, '302141', { ...override, saCode: '' }));
  assert.ok(validateReferenceUpload(file, '302141', { sourceType: 'fisa_post', expertRole: '' }));
});

test('reference upload uses authenticated multipart and explicit dry-run without a JSON content type', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, '/api/admin/rag/index-reference-pdfs');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
    assert.equal(new Headers(init?.headers).get('content-type'), null);
    const body = init?.body as FormData;
    assert.equal(body.get('dryRun'), 'true');
    assert.equal(body.get('projectCode'), '302141');
    assert.equal((body.get('files') as File).name, file.name);
    assert.deepEqual(JSON.parse(String(body.get('overrides'))), { [file.name]: override });
    return Response.json({ results: [{ fileName: file.name, status: 'dry_run', chunks: 2 }] });
  };
  assert.equal((await uploadReferenceFile(file, '302141', override, true, 'test-token', fetcher)).status, 'dry_run');
});

test('reference upload accepts writes and duplicates only during the real import', async () => {
  for (const status of ['indexed', 'duplicate']) {
    const fetcher: typeof fetch = async (_url, init) => {
      assert.equal((init?.body as FormData).get('dryRun'), 'false');
      return Response.json({ results: [{ fileName: file.name, status, documentId: 'doc-1' }] });
    };
    assert.equal((await uploadReferenceFile(file, '302141', override, false, 'token', fetcher)).status, status);
  }
});

test('reference upload preserves per-file failures and refuses unconfirmed server responses', async () => {
  const failed: typeof fetch = async () => Response.json({ results: [{ fileName: file.name, status: 'failed', error: 'Index failed' }] });
  assert.equal((await uploadReferenceFile(file, '302141', override, false, 'token', failed)).error, 'Index failed');
  for (const data of [{}, { results: [{ fileName: 'other.pdf', status: 'dry_run' }] }, { results: [{ fileName: file.name, status: 'indexed' }] }]) {
    await assert.rejects(uploadReferenceFile(file, '302141', override, true, 'token', async () => Response.json(data)), /nu a confirmat/);
  }
  await assert.rejects(uploadReferenceFile(file, '302141', override, true, 'token', async () => new Response('error', { status: 500 })), /HTTP 500/);
  await assert.rejects(uploadReferenceFile(file, '302141', override, true, '', async () => { throw new Error('must not call'); }), /Cognito/);
  await assert.rejects(uploadReferenceFile(file, '302141', override, true, 'token', async () => Response.json({ error: 'Access denied' }, { status: 403 })), /Access denied/);
});
