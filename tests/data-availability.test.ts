import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDataStatus } from '../lib/data-availability.ts';

test('resolveDataStatus reports disabled before other states', () => {
  assert.equal(resolveDataStatus({ data: [{ id: 'one' }], error: new Error('boom'), isLoading: true, enabled: false }), 'disabled');
});

test('resolveDataStatus reports loading before error and data checks', () => {
  assert.equal(resolveDataStatus({ data: [], error: new Error('boom'), isLoading: true }), 'loading');
});

test('resolveDataStatus reports error after loading completes', () => {
  assert.equal(resolveDataStatus({ data: [], error: new Error('boom'), isLoading: false }), 'error');
});

test('resolveDataStatus reports empty for missing or empty data', () => {
  assert.equal(resolveDataStatus({ data: null, isLoading: false }), 'empty');
  assert.equal(resolveDataStatus({ data: [], isLoading: false }), 'empty');
});

test('resolveDataStatus reports success for non-empty data', () => {
  assert.equal(resolveDataStatus({ data: [{ id: 'one' }], isLoading: false }), 'success');
});
