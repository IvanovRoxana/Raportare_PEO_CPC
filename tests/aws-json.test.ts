import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAwsJsonField, serializeAwsJsonField } from '../lib/aws-json.ts';

test('serializeaza obiectele pentru campurile AWSJSON', () => {
  const eligibilityCheck = {
    status: 'eligibil',
    score: 92,
    summary: 'Document eligibil.',
    checks: [{ criterion: 'Corelare activitate', status: 'pass', explanation: 'Se potriveste.' }],
    missingElements: [],
    recommendations: [],
    riskFlags: [],
  };

  const serialized = serializeAwsJsonField(eligibilityCheck);

  assert.equal(typeof serialized, 'string');
  assert.deepEqual(JSON.parse(serialized as string), eligibilityCheck);
});

test('parseaza campurile AWSJSON citite din AppSync inapoi ca obiecte', () => {
  const serialized = JSON.stringify({
    status: 'eligibil_cu_observatii',
    score: 75,
    summary: 'Necesita revizuire PM.',
  });

  assert.deepEqual(parseAwsJsonField(serialized), {
    status: 'eligibil_cu_observatii',
    score: 75,
    summary: 'Necesita revizuire PM.',
  });
});

test('lasa obiectele deja parsate neschimbate pentru fallback/local data', () => {
  const value = { status: 'neconcludent', score: 0 };
  assert.equal(parseAwsJsonField(value), value);
});
