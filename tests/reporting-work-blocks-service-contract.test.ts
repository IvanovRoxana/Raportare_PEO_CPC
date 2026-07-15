import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const backendStoreSource = readFileSync(new URL('../lib/backend-store.ts', import.meta.url), 'utf8');
const backendHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const reportingWorkBlocksServiceSource = awsStoreSource.match(
  /export const reportingWorkBlocksService = \{[\s\S]*?\n\};/,
)?.[0] ?? '';
const reportingWorkBlockBundlesHookSource = backendHooksSource.match(
  /export function useReportingWorkBlockBundles\([\s\S]*?\n\}/,
)?.[0] ?? '';

test('reporting work blocks service is read-only and exported through backend store', () => {
  assert.match(reportingWorkBlocksServiceSource, /export const reportingWorkBlocksService = \{/);
  assert.match(reportingWorkBlocksServiceSource, /getBundlesByExpertAndMonth\(expertId: string, month: number, year: number\)/);
  assert.match(reportingWorkBlocksServiceSource, /buildPersistedWorkBlockBundles/);
  assert.doesNotMatch(reportingWorkBlocksServiceSource, /async (create|update|delete|upsert)\(/);
  assert.match(backendStoreSource, /export const reportingWorkBlocksService = awsStore\.reportingWorkBlocksService;/);
});

test('reporting work block bundles hook is opt-in and uses an isolated cache key', () => {
  assert.match(backendHooksSource, /reportingWorkBlocksService,/);
  assert.match(reportingWorkBlockBundlesHookSource, /export function useReportingWorkBlockBundles\(expertId: string \| null, month: number, year: number\)/);
  assert.match(reportingWorkBlockBundlesHookSource, /isReportingWorkBlocksEnabledClient\(\)/);
  assert.match(reportingWorkBlockBundlesHookSource, /reporting-work-block-bundles-\$\{expertId\}-\$\{month\}-\$\{year\}/);
  assert.match(reportingWorkBlockBundlesHookSource, /reportingWorkBlocksService\.getBundlesByExpertAndMonth\(expertId!, month, year\)/);
  assert.doesNotMatch(reportingWorkBlockBundlesHookSource, /activities-|shared-deliverables|concurrent-project-timesheet/);
});
