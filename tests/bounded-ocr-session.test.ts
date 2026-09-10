import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { createBoundedOcrSession, type BoundedOcrWorker } from '../lib/bounded-ocr-session.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test('concurrent document images share one initialized worker and are recognized serially', async () => {
  const first = deferred<{ data: { text: string } }>();
  const second = deferred<{ data: { text: string } }>();
  let creations = 0;
  let initializations = 0;
  let terminations = 0;
  const calls: string[] = [];
  const session = createBoundedOcrSession<string>({
    createWorker: async () => {
      creations += 1;
      return { recognize: async (input) => { calls.push(input); return input === 'one' ? first.promise : second.promise; }, terminate: async () => { terminations += 1; } };
    },
    initializeWorker: async () => { initializations += 1; },
  });
  const resultOne = session.recognize('one');
  const resultTwo = session.recognize('two');
  await setImmediate();
  assert.deepEqual(calls, ['one']);
  first.resolve({ data: { text: 'Prima imagine' } });
  assert.deepEqual(await resultOne, { text: 'Prima imagine', complete: true });
  await setImmediate();
  assert.deepEqual(calls, ['one', 'two']);
  second.resolve({ data: { text: 'A doua imagine' } });
  assert.deepEqual(await resultTwo, { text: 'A doua imagine', complete: true });
  await session.close();
  await session.close();
  assert.equal(creations, 1);
  assert.equal(initializations, 1);
  assert.equal(terminations, 1);
});

test('creation timeout returns promptly and terminates a worker that arrives late', { timeout: 1000 }, async () => {
  const creation = deferred<BoundedOcrWorker<string>>();
  let creations = 0;
  let terminations = 0;
  const session = createBoundedOcrSession<string>({
    createWorker: () => { creations += 1; return creation.promise; }, operationTimeoutMs: 10,
  });
  assert.deepEqual(await session.recognize('one'), { text: null, complete: false });
  assert.deepEqual(await session.recognize('two'), { text: null, complete: false });
  creation.resolve({ recognize: async () => ({ data: { text: 'unused' } }), terminate: async () => { terminations += 1; } });
  await setImmediate();
  assert.equal(creations, 1);
  assert.equal(terminations, 1);
});

test('parameter initialization timeout cleans up without starting recognition', { timeout: 1000 }, async () => {
  let recognitions = 0;
  let terminations = 0;
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({ recognize: async () => { recognitions += 1; return { data: { text: '' } }; }, terminate: async () => { terminations += 1; } }),
    initializeWorker: async () => new Promise(() => {}), operationTimeoutMs: 10,
  });
  assert.equal((await session.recognize('one')).complete, false);
  assert.equal(recognitions, 0);
  assert.equal(terminations, 1);
});

test('recognition timeout preserves earlier recovered text and never starts remaining queued images', { timeout: 1000 }, async () => {
  const calls: string[] = [];
  let terminations = 0;
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({
      recognize: async (input) => {
        calls.push(input);
        return input === 'one' ? { data: { text: 'Text recuperat integral din prima imagine.' } } : new Promise(() => {});
      },
      terminate: async () => { terminations += 1; },
    }),
    operationTimeoutMs: 10,
  });
  const results = await Promise.all(['one', 'two', 'three'].map(session.recognize));
  assert.equal(results[0].text, 'Text recuperat integral din prima imagine.');
  assert.deepEqual(results.map((result) => result.complete), [true, false, false]);
  assert.deepEqual(calls, ['one', 'two']);
  assert.equal(terminations, 1);
});

test('a hung terminate promise cannot leave extraction waiting after an OCR failure', { timeout: 1000 }, async () => {
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({ recognize: async () => { throw new Error('worker failed'); }, terminate: async () => new Promise(() => {}) }),
    cleanupTimeoutMs: 10,
  });
  assert.deepEqual(await session.recognize('one'), { text: null, complete: false });
  await session.close();
  assert.equal(session.isStopped(), true);
});

test('document budget also bounds rendering and cancels the worker before further pages', { timeout: 1000 }, async () => {
  let terminations = 0;
  let recognitions = 0;
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({ recognize: async () => { recognitions += 1; return { data: { text: 'Pagina citita' } }; }, terminate: async () => { terminations += 1; } }),
    totalTimeoutMs: 25, operationTimeoutMs: 1000,
  });
  assert.equal((await session.recognize('one')).complete, true);
  await assert.rejects(session.runTask(async () => new Promise(() => {})), /time budget/);
  assert.equal((await session.recognize('two')).complete, false);
  assert.equal(recognitions, 1);
  assert.equal(terminations, 1);
});

test('cancellation releases in-flight initialization and queued calls without waiting their remaining budget', { timeout: 1000 }, async () => {
  const initialization = deferred<void>();
  let recognitions = 0;
  let terminations = 0;
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({ recognize: async () => { recognitions += 1; return { data: { text: 'must not run' } }; }, terminate: async () => { terminations += 1; } }),
    initializeWorker: () => initialization.promise,
    totalTimeoutMs: 5000, operationTimeoutMs: 5000,
  });
  const one = session.recognize('one');
  const two = session.recognize('two');
  await setImmediate();
  await session.close();
  assert.deepEqual((await Promise.all([one, two])).map((result) => result.complete), [false, false]);
  initialization.resolve();
  await setImmediate();
  assert.equal(recognitions, 0);
  assert.equal(terminations, 1);
});

test('successful OCR with no text is distinct from failure, as for a logo or photograph', async () => {
  const session = createBoundedOcrSession<string>({
    createWorker: async () => ({ recognize: async () => ({ data: { text: '   ' } }), terminate: async () => {} }),
  });
  assert.deepEqual(await session.recognize('logo'), { text: null, complete: true });
  await session.close();
});

test('PDF cleanup remains bounded even after its loading or rendering task times out', { timeout: 1000 }, async () => {
  const session = createBoundedOcrSession<string>({
    createWorker: async () => { throw new Error('OCR is not needed'); },
    operationTimeoutMs: 10, cleanupTimeoutMs: 10,
  });
  await assert.rejects(session.runTask(async () => new Promise(() => {})), /time budget/);
  let destroyCalled = false;
  await session.cleanupTask(async () => {
    destroyCalled = true;
    return new Promise(() => {});
  });
  assert.equal(destroyCalled, true);
  assert.equal(session.isStopped(), true);
});
