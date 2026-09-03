import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const adminPage = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/admin/pontaj-signatures-panel.tsx', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../amplify/data/resource.ts', import.meta.url), 'utf8');
const adminRoute = readFileSync(new URL('../app/api/admin/experts/route.ts', import.meta.url), 'utf8');
const awsStore = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');

test('Admin include tab pentru semnaturile pontajului', () => {
  assert.match(adminPage, /semnaturi-pontaj/);
  assert.match(adminPage, /PontajSignaturesPanel/);
  assert.match(panel, /Semnaturi pontaj/);
  assert.match(panel, /managerName/);
  assert.match(panel, /legalRepresentativeName/);
  assert.match(panel, /authorizedRepresentativeName/);
  assert.match(panel, /\/api\/admin\/experts/);
});

test('campurile de semnatura sunt persistabile pe Expert', () => {
  for (const field of [
    'managerName',
    'managerTitle',
    'legalRepresentativeName',
    'legalRepresentativeTitle',
    'authorizedRepresentativeName',
    'authorizedRepresentativeTitle',
  ]) {
    assert.match(schema, new RegExp(`${field}:\\s*a\\.string\\(\\)`));
    assert.match(adminRoute, new RegExp(`'${field}'`));
    assert.match(adminRoute, new RegExp(`\\b${field}\\b`));
    assert.match(awsStore, new RegExp(`${field}:\\s*expert\\.${field}`));
    assert.match(awsStore, new RegExp(`${field}:\\s*item\\.${field} \\?\\? undefined`));
  }
});
