import assert from 'node:assert/strict';
import test from 'node:test';
import { inferDeliverableStadiuFromEligibility } from '../lib/deliverable-types.ts';

test('pastreaza stadiul ales manual peste inferenta din eligibilitate', () => {
  assert.equal(
    inferDeliverableStadiuFromEligibility('approved', {
      status: 'eligibil',
      score: 90,
      summary: 'Eligibil.',
      checks: [],
      missingElements: [],
      recommendations: [],
      riskFlags: [],
    }),
    'approved',
  );
});

test('infera versiune finala pentru livrabile eligibile salvate fara stadiu', () => {
  assert.equal(
    inferDeliverableStadiuFromEligibility('', {
      status: 'eligibil_cu_observatii',
      score: 84,
      summary: 'Documentul este corelat cu activitatea.',
      checks: [],
      missingElements: [],
      recommendations: [],
      riskFlags: [],
    }),
    'final',
  );
});

test('nu infera stadiu final pentru verificari neconcludente', () => {
  assert.equal(
    inferDeliverableStadiuFromEligibility('', {
      status: 'neconcludent',
      score: 0,
      summary: 'Text insuficient.',
      checks: [],
      missingElements: [],
      recommendations: [],
      riskFlags: [],
    }),
    '',
  );
});
