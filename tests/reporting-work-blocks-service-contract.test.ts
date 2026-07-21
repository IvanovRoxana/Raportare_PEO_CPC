import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const backendStoreSource = readFileSync(new URL('../lib/backend-store.ts', import.meta.url), 'utf8');
const backendHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const exportPageSource = readFileSync(new URL('../app/expert/peo/export/page.tsx', import.meta.url), 'utf8');
const reportingWorkBlocksPanelSource = readFileSync(new URL('../components/expert/reporting-work-blocks-panel.tsx', import.meta.url), 'utf8');
const reportingWorkBlockDraftPanelSource = readFileSync(new URL('../components/expert/reporting-work-block-draft-panel.tsx', import.meta.url), 'utf8');
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
  assert.match(reportingWorkBlocksServiceSource, /prepareSaveDraft\(input: DraftWorkBlockInput, activities: Activity\[\]\): PreparedDraftWorkBlockSave/);
  assert.match(reportingWorkBlocksServiceSource, /prepareDraftWorkBlockSave\(input, activities\)/);
  assert.match(reportingWorkBlocksServiceSource, /async saveDraft\(input: DraftWorkBlockInput, activities: Activity\[\]\): Promise<ReportingWorkBlockBundle>/);
  assert.match(reportingWorkBlocksServiceSource, /await assertCanAccessExpert\(client, input\.expertId\)/);
  assert.match(reportingWorkBlocksServiceSource, /await assertReportMonthIsMutable\(client, input\.expertId, input\.month, input\.year\)/);
  assert.match(reportingWorkBlocksServiceSource, /preparedDraft\.canSave/);
  assert.match(reportingWorkBlocksServiceSource, /client\.models\.ReportingWorkBlock\.(update|create)/);
  assert.match(reportingWorkBlocksServiceSource, /client\.models\.WorkBlockActivityLink\.create/);
  assert.match(reportingWorkBlocksServiceSource, /client\.models\.WorkBlockDeliverableLink\.create/);
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
  assert.match(reportingWorkBlockDraftHookSource, /const prepareSaveDraft = \(input: DraftWorkBlockInput, activities: Activity\[\]\)/);
  assert.match(reportingWorkBlockDraftHookSource, /reportingWorkBlocksService\.prepareSaveDraft\(input, activities\)/);
  assert.doesNotMatch(reportingWorkBlockDraftHookSource, /mutate\(|useSWR|create|update|delete|upsert/);
});

test('reporting work block draft panel persists only session-scoped UI state', () => {
  assert.match(reportingWorkBlockDraftPanelSource, /WorkBlockDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /reporting-work-block-draft:\$\{expertId\}:\$\{projectCode\}:\$\{year\}:\$\{month\}/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.setItem\(storageKey, serializedSessionDraft\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.removeItem\(storageKey\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /createEmptyDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /serializeDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /lastSavedSessionDraft/);
  assert.match(reportingWorkBlockDraftPanelSource, /serializedSessionDraft === lastSavedSessionDraft/);
  assert.match(reportingWorkBlockDraftPanelSource, /hasUnsavedSessionChanges/);
  assert.match(reportingWorkBlockDraftPanelSource, /isReadyForControlledSave/);
  assert.match(reportingWorkBlockDraftPanelSource, /saveDraftPreview\.canSave/);
  assert.match(reportingWorkBlockDraftPanelSource, /controlledSaveLabel/);
  assert.match(reportingWorkBlockDraftPanelSource, /!hasUnsavedSessionChanges/);
  assert.match(reportingWorkBlockDraftPanelSource, /availableActivityIds/);
  assert.match(reportingWorkBlockDraftPanelSource, /availableDeliverableIds/);
  assert.match(reportingWorkBlockDraftPanelSource, /current\.filter\(\(activityId\) => availableActivityIds\.has\(activityId\)\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /Object\.entries\(current\)\.filter\(\(\[activityId\]\) => availableActivityIds\.has\(activityId\)\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /current\.filter\(\(deliverableId\) => availableDeliverableIds\.has\(deliverableId\)\)/);
  assert.doesNotMatch(reportingWorkBlockDraftPanelSource, /localStorage/);
  assert.doesNotMatch(reportingWorkBlockDraftPanelSource, /reportingWorkBlocksService\.(create|update|delete|upsert)/);
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
