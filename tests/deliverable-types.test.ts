import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEventDate, inferDeliverableStadiuFromEligibility } from '../lib/deliverable-types.ts';

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

test('extrage data evenimentului din linia DATA, nu data intocmirii MOM', () => {
  assert.equal(
    extractEventDate(`
MINUTA DE INTALNIRE (MOM)

EVENIMENT: Consultare membri
DATA: joi, 20 august 2026
LOCATIA: online

Intocmit de: Expert Test
Data intocmirii: 01.09.2026
`),
    '2026-08-20',
  );
});
