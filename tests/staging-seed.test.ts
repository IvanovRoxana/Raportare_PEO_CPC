import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const seed = JSON.parse(readFileSync('data/staging/seed.json', 'utf8')) as {
  people: Array<{ name: string }>;
};
const script = readFileSync('scripts/seed-staging.ps1', 'utf8');

test('staging seed contains the 25 unique workbook people', () => {
  assert.equal(seed.people.length, 25);
  assert.equal(new Set(seed.people.map((person) => person.name)).size, 25);
});

test('staging seed refuses production and resolves exact branch tables', () => {
  assert.match(script, /Environment -ne "staging"/);
  assert.match(script, /stagingUrl -eq \$productionUrl/);
  assert.match(script, /"\$model-\$apiId-NONE"/);
  assert.doesNotMatch(script, /Expert-3wpaiebzefggpcmhzurrifx53i-NONE/);
});

test('staging seed is deterministic and supports a dry run', () => {
  assert.match(script, /staging-expert-\$slug/);
  assert.match(script, /\[switch\]\$DryRun/);
  assert.match(script, /duplicate-leave/);
});
