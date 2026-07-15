import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const backendStoreSource = readFileSync(new URL('../lib/backend-store.ts', import.meta.url), 'utf8');
const backendHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const exportPageSource = readFileSync(new URL('../app/expert/peo/export/page.tsx', import.meta.url), 'utf8');
const reportingWorkBlocksPanelSource = readFileSync(new URL('../components/expert/reporting-work-blocks-panel.tsx', import.meta.url), 'utf8');
const reportingWorkBlocksServiceSource = awsStoreSource.match(
  /export const reportingWorkBlocksService = \{[\s\S]*?\n\};/,
)?.[0] ?? '';
const reportingWorkBlockBundlesHookSource = backendHooksSource.match(
  /export function useReportingWorkBlockBundles\([\s\S]*?\n\}/,
)?.[0] ?? '';
const reportingWorkBlockDraftHookSource = backendHooksSource.match(
  /export function useReportingWorkBlockDraft\([\s\S]*?\n\}/,
)?.[0] ?? '';
const reportingWorkBlockActivityOptionsHookSource = backendHooksSource.match(
  /export function useReportingWorkBlockActivityOptions\([\s\S]*?\n\}/,
)?.[0] ?? '';
const reportingWorkBlockDeliverableOptionsHookSource = backendHooksSource.match(
  /export function useReportingWorkBlockDeliverableOptions\([\s\S]*?\n\}/,
)?.[0] ?? '';

test('reporting work blocks service is read-only and exported through backend store', () => {
  assert.match(reportingWorkBlocksServiceSource, /export const reportingWorkBlocksService = \{/);
  assert.match(reportingWorkBlocksServiceSource, /prepareDraft\(input: DraftWorkBlockInput, activities: Activity\[\]\): PreparedDraftWorkBlock/);
  assert.match(reportingWorkBlocksServiceSource, /prepareDraftWorkBlockBundle\(input, activities\)/);
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

test('reporting work block draft hook prepares local drafts without cache invalidation', () => {
  assert.match(backendHooksSource, /import type \{ DraftWorkBlockInput \} from '@\/lib\/activity-report\/draft-work-blocks';/);
  assert.match(reportingWorkBlockDraftHookSource, /export function useReportingWorkBlockDraft\(\)/);
  assert.match(reportingWorkBlockDraftHookSource, /const prepareDraft = \(input: DraftWorkBlockInput, activities: Activity\[\]\)/);
  assert.match(reportingWorkBlockDraftHookSource, /reportingWorkBlocksService\.prepareDraft\(input, activities\)/);
  assert.doesNotMatch(reportingWorkBlockDraftHookSource, /mutate\(|useSWR|create|update|delete|upsert/);
});

test('reporting work block activity options hook is pure and cache-safe', () => {
  assert.match(backendHooksSource, /buildDraftWorkBlockActivityOptions/);
  assert.match(reportingWorkBlockActivityOptionsHookSource, /export function useReportingWorkBlockActivityOptions\(/);
  assert.match(reportingWorkBlockActivityOptionsHookSource, /existingBundles: ReportingWorkBlockBundle\[\] = \[\]/);
  assert.match(reportingWorkBlockActivityOptionsHookSource, /buildDraftWorkBlockActivityOptions\(\{ activities, existingBundles, editingWorkBlockId \}\)/);
  assert.match(reportingWorkBlockActivityOptionsHookSource, /getUnallocatedActivityCount\(options\)/);
  assert.match(reportingWorkBlockActivityOptionsHookSource, /getUnallocatedHoursTotal\(options\)/);
  assert.doesNotMatch(reportingWorkBlockActivityOptionsHookSource, /mutate\(|useSWR|create|update|delete|upsert/);
});

test('reporting work block deliverable options hook is pure and cache-safe', () => {
  assert.match(backendHooksSource, /buildDraftWorkBlockDeliverableOptions/);
  assert.match(reportingWorkBlockDeliverableOptionsHookSource, /export function useReportingWorkBlockDeliverableOptions\(/);
  assert.match(reportingWorkBlockDeliverableOptionsHookSource, /existingBundles: ReportingWorkBlockBundle\[\] = \[\]/);
  assert.match(reportingWorkBlockDeliverableOptionsHookSource, /buildDraftWorkBlockDeliverableOptions\(\{ activities, existingBundles, editingWorkBlockId \}\)/);
  assert.match(reportingWorkBlockDeliverableOptionsHookSource, /getUnassociatedDeliverableCount\(options\)/);
  assert.doesNotMatch(reportingWorkBlockDeliverableOptionsHookSource, /mutate\(|useSWR|create|update|delete|upsert/);
});

test('export page wires persisted work block bundles as a read-only optional preview source', () => {
  assert.match(exportPageSource, /useReportingWorkBlockBundles,/);
  assert.match(exportPageSource, /ReportingWorkBlockDraftPanel/);
  assert.match(exportPageSource, /const \{ bundles: persistedWorkBlockBundles \} = useReportingWorkBlockBundles\(selectedExpertId, currentMonth, currentYear\);/);
  assert.match(exportPageSource, /persistedBundles=\{persistedWorkBlockBundles\}/);
  assert.match(exportPageSource, /existingBundles=\{persistedWorkBlockBundles\}/);
  assert.match(exportPageSource, /projectCode=\{selectedExpert\.projectCode \?\? '302141'\}/);
  assert.match(reportingWorkBlocksPanelSource, /persistedBundles\?: ReportingWorkBlockBundle\[\];/);
  assert.match(reportingWorkBlocksPanelSource, /persistedBundles = \[\]/);
  assert.match(reportingWorkBlocksPanelSource, /const activityBundles = useMemo\(\(\) => buildWorkBlocks\(activities\), \[activities\]\);/);
  assert.match(reportingWorkBlocksPanelSource, /const bundles = persistedBundles\.length > 0 \? persistedBundles : activityBundles;/);
});
