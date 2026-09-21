import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type { Deliverable } from '../lib/types.ts';
import type { DocumentDiagnosticContext } from '../lib/eligibility-document-diagnostics.ts';

class GetObjectCommand {
  input: Record<string, unknown>;
  constructor(input: Record<string, unknown>) { this.input = input; }
}
class PutObjectCommand extends GetObjectCommand {}
const original = new TextEncoder().encode('Document pentru verificarea eligibilitatii.');
const fileHash = crypto.createHash('sha256').update(original).digest('hex');
const document = { id: 'test', s3Key: 'eligibility-private/originals/draft_test/raport.docx', fileName: 'raport.docx', fileHash } as Deliverable;
const denied = () => Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
const source = readFileSync(new URL('../lib/eligibility-originals.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function reader(options: { originalError?: Error; cacheError?: Error; writeError?: Error; cache?: unknown } = {}) {
  const calls: GetObjectCommand[] = [];
  let extractions = 0;
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    'node:crypto': crypto,
    '@aws-sdk/client-s3': { GetObjectCommand, PutObjectCommand, S3Client: class {
      async send(command: GetObjectCommand) {
        calls.push(command);
        if (command instanceof PutObjectCommand) {
          if (options.writeError) throw options.writeError;
          return {};
        }
        if (command.input.Key === document.s3Key) {
          if (options.originalError) throw options.originalError;
          return { ContentLength: original.length, Body: { transformToByteArray: async () => original } };
        }
        if (options.cacheError) throw options.cacheError;
        return { Body: { transformToString: async () => JSON.stringify(options.cache) } };
      }
    } },
    './eligibility-environment.ts': { eligibilityRegion: 'test-region', eligibilityBucket: 'test-bucket' },
    './rag/reference-document-text.ts': { extractReferenceDocumentText: async (_name: string, buffer: ArrayBuffer) => {
      extractions++;
      assert.deepEqual(new Uint8Array(buffer), original);
      return { text: 'Text extras din originalul verificat.', complete: true };
    } },
  };
  const exports = {} as { readEligibilityOriginal: (document: Deliverable, context: DocumentDiagnosticContext) => Promise<Deliverable> };
  new Function('require', 'exports', compiled)((id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return { read: exports.readEligibilityOriginal, calls, extractionCount: () => extractions };
}

test('first extraction rebuilds an absent cache reported as S3 AccessDenied without ListBucket', async () => {
  const service = reader({ cacheError: denied() });
  const context: DocumentDiagnosticContext = { stage: 'request' };
  const result = await service.read(document, context);
  assert.equal(result.docText, 'Text extras din originalul verificat.');
  assert.equal(result.fileHash, fileHash);
  assert.equal(result.extractionComplete, true);
  assert.equal(service.extractionCount(), 1);
  assert.equal(service.calls.length, 3);
  assert.equal(service.calls[0].input.Key, document.s3Key);
  assert.equal(service.calls[1].input.Key, `eligibility-private/extractions/v1/${fileHash}.docx.json`);
  assert.ok(service.calls[2] instanceof PutObjectCommand);
  assert.equal(service.calls[2].input.Key, service.calls[1].input.Key);
  assert.deepEqual(JSON.parse(String(service.calls[2].input.Body)), { hash: fileHash, text: result.docText, complete: true });
});

test('normal cache misses still extract while valid cached text avoids duplicate processing', async () => {
  for (const name of ['NoSuchKey', 'NotFound']) {
    const service = reader({ cacheError: Object.assign(new Error(name), { name }) });
    assert.equal((await service.read(document, { stage: 'request' })).extractionComplete, true);
    assert.equal(service.extractionCount(), 1);
  }
  const service = reader({ cache: { hash: fileHash, text: 'Text memorat.', complete: false } });
  const result = await service.read(document, { stage: 'request' });
  assert.equal(result.docText, 'Text memorat.');
  assert.equal(result.extractionComplete, false);
  assert.equal(service.extractionCount(), 0);
  assert.equal(service.calls.length, 2);
});

test('denied originals and changed original hashes cannot fall back to cached text', async () => {
  const error = denied();
  const service = reader({ originalError: error });
  const context: DocumentDiagnosticContext = { stage: 'request' };
  await assert.rejects(service.read(document, context), (caught) => caught === error);
  assert.equal(context.stage, 'original');
  assert.equal(service.calls.length, 1);
  assert.equal(service.extractionCount(), 0);
  const changed = reader();
  await assert.rejects(changed.read({ ...document, fileHash: 'wrong' }, context), /ELIGIBILITY_ORIGINAL_HASH_MISMATCH/);
  assert.equal(changed.calls.length, 1);
  assert.equal(changed.extractionCount(), 0);
});

test('denied extraction writes remain blocking with the correct diagnostic stage', async () => {
  const error = denied();
  const service = reader({ cacheError: denied(), writeError: error });
  const context: DocumentDiagnosticContext = { stage: 'request' };
  await assert.rejects(service.read(document, context), (caught) => caught === error);
  assert.equal(context.stage, 'extraction_save');
  assert.equal(service.extractionCount(), 1);
});

test('timeouts and expired credentials are not interpreted as missing cache entries', async () => {
  for (const name of ['TimeoutError', 'ExpiredToken', 'CredentialsProviderError']) {
    const error = Object.assign(new Error(name), { name });
    const service = reader({ cacheError: error });
    const context: DocumentDiagnosticContext = { stage: 'request' };
    await assert.rejects(service.read(document, context), (caught) => caught === error);
    assert.equal(context.stage, 'extraction_cache');
    assert.equal(service.extractionCount(), 0);
    assert.equal(service.calls.length, 2);
  }
});
