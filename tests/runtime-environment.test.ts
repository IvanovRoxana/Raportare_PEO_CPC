import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAppEnvironment,
  isProductionEnvironment,
  isStagingEnvironment,
  markTestFilename,
} from '../lib/runtime-environment.ts';

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('staging is explicit and marks exported filenames', () => {
  const previousPublic = process.env.NEXT_PUBLIC_APP_ENV;
  const previousServer = process.env.APP_ENV;
  process.env.NEXT_PUBLIC_APP_ENV = 'staging';
  process.env.APP_ENV = 'production';
  try {
    assert.equal(getAppEnvironment(), 'staging');
    assert.equal(isStagingEnvironment(), true);
    assert.equal(isProductionEnvironment(), false);
    assert.equal(markTestFilename('Pontaj_Iunie.xlsx'), 'Pontaj_Iunie_TEST.xlsx');
  } finally {
    restore('NEXT_PUBLIC_APP_ENV', previousPublic);
    restore('APP_ENV', previousServer);
  }
});

test('missing environment remains production-safe', () => {
  const previousPublic = process.env.NEXT_PUBLIC_APP_ENV;
  const previousServer = process.env.APP_ENV;
  delete process.env.NEXT_PUBLIC_APP_ENV;
  delete process.env.APP_ENV;
  try {
    assert.equal(getAppEnvironment(), 'production');
    assert.equal(isProductionEnvironment(), true);
    assert.equal(markTestFilename('Pontaj.xlsx'), 'Pontaj.xlsx');
  } finally {
    restore('NEXT_PUBLIC_APP_ENV', previousPublic);
    restore('APP_ENV', previousServer);
  }
});
