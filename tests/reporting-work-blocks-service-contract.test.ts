import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const backendStoreSource = readFileSync(new URL('../lib/backend-store.ts', import.meta.url), 'utf8');
const reportingWorkBlocksServiceSource = awsStoreSource.match(
  /export const reportingWorkBlocksService = \{[\s\S]*?\n\};/,
)?.[0] ?? '';

test('reporting work blocks service is read-only and exported through backend store', () => {
  assert.match(reportingWorkBlocksServiceSource, /export const reportingWorkBlocksService = \{/);
  assert.match(reportingWorkBlocksServiceSource, /getBundlesByExpertAndMonth\(expertId: string, month: number, year: number\)/);
  assert.match(reportingWorkBlocksServiceSource, /buildPersistedWorkBlockBundles/);
  assert.doesNotMatch(reportingWorkBlocksServiceSource, /async (create|update|delete|upsert)\(/);
  assert.match(backendStoreSource, /export const reportingWorkBlocksService = awsStore\.reportingWorkBlocksService;/);
});
