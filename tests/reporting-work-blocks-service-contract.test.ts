import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const backendStoreSource = readFileSync(new URL('../lib/backend-store.ts', import.meta.url), 'utf8');
const backendHooksSource = readFileSync(new URL('../hooks/use-backend-data.ts', import.meta.url), 'utf8');
const expertPeoPageSource = readFileSync(new URL('../app/expert/peo/page.tsx', import.meta.url), 'utf8');
const exportPageSource = readFileSync(new URL('../app/expert/peo/export/page.tsx', import.meta.url), 'utf8');
const reportingWorkBlocksPanelSource = readFileSync(new URL('../components/expert/reporting-work-blocks-panel.tsx', import.meta.url), 'utf8');
const reportingWorkBlockDraftPanelSource = readFileSync(new URL('../components/expert/reporting-work-block-draft-panel.tsx', import.meta.url), 'utf8');
const reportGeneratorSource = readFileSync(new URL('../components/expert/report-generator.tsx', import.meta.url), 'utf8');
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
  assert.match(reportingWorkBlockBundlesHookSource, /isValidating/);
  assert.match(reportingWorkBlockBundlesHookSource, /isRefreshing: isValidating/);
  assert.doesNotMatch(reportingWorkBlockBundlesHookSource, /activities-|shared-deliverables|concurrent-project-timesheet/);
});

test('reporting work block draft hook saves drafts with isolated cache invalidation', () => {
  assert.match(backendHooksSource, /import type \{ DraftWorkBlockInput \} from '@\/lib\/activity-report\/draft-work-blocks';/);
  assert.match(reportingWorkBlockDraftHookSource, /export function useReportingWorkBlockDraft\(\)/);
  assert.match(reportingWorkBlockDraftHookSource, /const prepareDraft = \(input: DraftWorkBlockInput, activities: Activity\[\]\)/);
  assert.match(reportingWorkBlockDraftHookSource, /reportingWorkBlocksService\.prepareDraft\(input, activities\)/);
  assert.match(reportingWorkBlockDraftHookSource, /const prepareSaveDraft = \(input: DraftWorkBlockInput, activities: Activity\[\]\)/);
  assert.match(reportingWorkBlockDraftHookSource, /reportingWorkBlocksService\.prepareSaveDraft\(input, activities\)/);
  assert.match(reportingWorkBlockDraftHookSource, /const saveDraft = async \(input: DraftWorkBlockInput, activities: Activity\[\]\)/);
  assert.match(reportingWorkBlockDraftHookSource, /consolidateWorkBlockBeforeSave\(preparedDraft\.bundle, activities\)/);
  assert.match(reportingWorkBlockDraftHookSource, /cleanedActivitySummary: consolidation\.cleanedActivitySummary/);
  assert.match(reportingWorkBlockDraftHookSource, /reportingWorkBlocksService\.saveDraft\(\{/);
  assert.match(reportingWorkBlockDraftHookSource, /mutate\(`reporting-work-block-bundles-\$\{input\.expertId\}-\$\{input\.month\}-\$\{input\.year\}`\)/);
  assert.doesNotMatch(reportingWorkBlockDraftHookSource, /useSWR|activities-|shared-deliverables|concurrent-project-timesheet/);
});

test('reporting work block draft panel persists only session-scoped UI state', () => {
  assert.match(reportingWorkBlockDraftPanelSource, /WorkBlockDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /reporting-work-block-draft:\$\{expertId\}:\$\{projectCode\}:\$\{year\}:\$\{month\}/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.setItem\(storageKey, serializedSessionDraft\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /window\.sessionStorage\.removeItem\(storageKey\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /applyDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /createEmptyDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /createDraftSessionStateFromBundle/);
  assert.match(reportingWorkBlockDraftPanelSource, /selectedWorkBlockId/);
  assert.match(reportingWorkBlockDraftPanelSource, /effectiveEditingWorkBlockId/);
  assert.match(reportingWorkBlockDraftPanelSource, /selectedEditingBundle/);
  assert.match(reportingWorkBlockDraftPanelSource, /existingBundlesLoading\?: boolean/);
  assert.match(reportingWorkBlockDraftPanelSource, /const isWaitingForSelectedBundle = Boolean/);
  assert.match(reportingWorkBlockDraftPanelSource, /Se reincarca work block-ul salvat/);
  assert.match(reportingWorkBlockDraftPanelSource, /<SelectItem value="new">Ajustare manuala noua<\/SelectItem>/);
  assert.match(reportingWorkBlockDraftPanelSource, /existingBundles\.map\(\(bundle\) =>/);
  assert.match(reportingWorkBlockDraftPanelSource, /serializeDraftSessionState/);
  assert.match(reportingWorkBlockDraftPanelSource, /lastSavedSessionDraft/);
  assert.match(reportingWorkBlockDraftPanelSource, /serializedSessionDraft === lastSavedSessionDraft/);
  assert.match(reportingWorkBlockDraftPanelSource, /hasUnsavedSessionChanges/);
  assert.match(reportingWorkBlockDraftPanelSource, /isReadyForControlledSave/);
  assert.match(reportingWorkBlockDraftPanelSource, /saveDraftPreview\.canSave/);
  assert.match(reportingWorkBlockDraftPanelSource, /saveDraft\(\{/);
  assert.match(reportingWorkBlockDraftPanelSource, /const savedBundle = await saveDraft\(\{/);
  assert.match(reportingWorkBlockDraftPanelSource, /setSelectedWorkBlockId\(savedBundle\.workBlock\.id \?\? 'new'\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /isSavingDraft/);
  assert.match(reportingWorkBlockDraftPanelSource, /saveDraftError/);
  assert.match(reportingWorkBlockDraftPanelSource, /saveDraftSuccess/);
  assert.match(reportingWorkBlockDraftPanelSource, /disabled=\{!isReadyForControlledSave \|\| isSavingDraft \|\| isWaitingForSelectedBundle\}/);
  assert.match(reportingWorkBlockDraftPanelSource, /controlledSaveLabel/);
  assert.match(reportingWorkBlockDraftPanelSource, /!hasUnsavedSessionChanges/);
  assert.match(reportingWorkBlockDraftPanelSource, /availableActivityIds/);
  assert.match(reportingWorkBlockDraftPanelSource, /availableDeliverableIds/);
  assert.match(reportingWorkBlockDraftPanelSource, /current\.filter\(\(activityId\) => availableActivityIds\.has\(activityId\)\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /Object\.entries\(current\)\.filter\(\(\[activityId\]\) => availableActivityIds\.has\(activityId\)\)/);
  assert.match(reportingWorkBlockDraftPanelSource, /current\.filter\(\(deliverableId\) => availableDeliverableIds\.has\(deliverableId\)\)/);
  assert.doesNotMatch(reportingWorkBlockDraftPanelSource, /localStorage/);
  assert.doesNotMatch(reportingWorkBlockDraftPanelSource, /reportingWorkBlocksService\.(create|update|delete|upsert)/);
  assert.doesNotMatch(reportingWorkBlockDraftPanelSource, /reportingWorkBlocksService\.saveDraft/);
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
  assert.match(exportPageSource, /bundles: persistedWorkBlockBundles/);
  assert.match(exportPageSource, /isLoading: isLoadingPersistedWorkBlockBundles/);
  assert.match(exportPageSource, /isRefreshing: isRefreshingPersistedWorkBlockBundles/);
  assert.match(exportPageSource, /useReportingWorkBlockBundles\(selectedExpertId, currentMonth, currentYear\);/);
  assert.match(exportPageSource, /persistedBundles=\{persistedWorkBlockBundles\}/);
  assert.match(exportPageSource, /existingBundles=\{persistedWorkBlockBundles\}/);
  assert.match(exportPageSource, /existingBundlesLoading=\{isLoadingPersistedWorkBlockBundles \|\| isRefreshingPersistedWorkBlockBundles\}/);
  assert.match(exportPageSource, /const isLoadingDeterministicWorkBlocks = reportingWorkBlocksEnabled/);
  assert.match(exportPageSource, /isLoadingDeterministicWorkBlocks=\{isLoadingDeterministicWorkBlocks\}/);
  assert.match(exportPageSource, /workBlockBundles=\{reportingWorkBlocksEnabled \? persistedWorkBlockBundles : \[\]\}/);
  assert.match(exportPageSource, /<MonthlyReportExport[\s\S]*workBlockBundles=\{reportingWorkBlocksEnabled \? persistedWorkBlockBundles : \[\]\}/);
  assert.match(exportPageSource, /<MonthlyReportExport[\s\S]*workBlockBundlesLoading=\{isLoadingDeterministicWorkBlocks\}/);
  assert.match(exportPageSource, /projectCode=\{selectedExpert\.projectCode \?\? '302141'\}/);
  assert.match(reportingWorkBlocksPanelSource, /persistedBundles\?: ReportingWorkBlockBundle\[\];/);
  assert.match(reportingWorkBlocksPanelSource, /persistedBundles = \[\]/);
  assert.match(reportingWorkBlocksPanelSource, /const activityBundles = useMemo\(\(\) => buildWorkBlocks\(activities\), \[activities\]\);/);
  assert.match(reportingWorkBlocksPanelSource, /const bundles = persistedBundles\.length > 0 \? persistedBundles : activityBundles;/);
  assert.match(reportingWorkBlocksPanelSource, /const isUsingPersistedBundles = persistedBundles\.length > 0;/);
  assert.match(reportingWorkBlocksPanelSource, /Sursa: salvate automat din formular/);
  assert.match(reportingWorkBlocksPanelSource, /Sursa: fallback din activitati/);
  assert.match(reportingWorkBlocksPanelSource, /getBundleDeliverableTitles\(blockActivities, bundle\)/);
  assert.match(reportingWorkBlocksPanelSource, /bundle\.deliverableLinks/);
  assert.match(reportingWorkBlocksPanelSource, /Livrabil asociat: \$\{link\.deliverableId\}/);
  assert.match(reportGeneratorSource, /workBlockBundles\?: ReportingWorkBlockBundle\[\];/);
  assert.match(reportGeneratorSource, /workBlockBundles: workBlockBundles && workBlockBundles\.length > 0 \? workBlockBundles : undefined/);
  assert.match(reportGeneratorSource, /const persistedWorkBlockCount = workBlockBundles\?\.length \?\? 0/);
  assert.match(reportGeneratorSource, /const deterministicWorkBlockSourceLabel = persistedWorkBlockCount > 0/);
  assert.match(reportGeneratorSource, /Work block-uri persistate: \$\{persistedWorkBlockCount\}/);
  assert.match(reportGeneratorSource, /Work block-uri generate din activitati \(fallback\)/);
  assert.match(reportGeneratorSource, /const deterministicExportButtonTitle = activities\.length === 0/);
  assert.match(reportGeneratorSource, /title=\{deterministicExportButtonTitle\}/);
  assert.match(reportGeneratorSource, /aria-label=\{deterministicExportButtonTitle\}/);
  assert.match(reportGeneratorSource, /if \(isLoadingDeterministicWorkBlocks\) return null;/);
  assert.match(reportGeneratorSource, /\|\| isLoadingDeterministicWorkBlocks/);
  assert.match(reportGeneratorSource, /\[activities, enableDeterministicAnexa10Docx, expert, expertName, isLoadingDeterministicWorkBlocks, month, workBlockBundles, year\]/);
  assert.match(exportPageSource, /enableDeterministicAnexa10Docx/);
  assert.match(reportGeneratorSource, /Exporta Raport de Activitate DOCX/);
  assert.doesNotMatch(reportGeneratorSource, /Genereaz[aă] cu AI/);
  assert.doesNotMatch(reportGeneratorSource, /Nivel detaliere/);
  assert.doesNotMatch(reportGeneratorSource, /fine-tuned/);
  assert.doesNotMatch(reportGeneratorSource, /Formul[aă]ri preferate/);
  assert.doesNotMatch(reportGeneratorSource, /Exemple validate/);
  assert.doesNotMatch(reportGeneratorSource, /Marcheaz[aă] acest raport ca exemplu validat/);
});

test('expert activity save flow auto-persists reporting work blocks from saved activities', () => {
  assert.match(expertPeoPageSource, /useReportingWorkBlockBundles,/);
  assert.match(expertPeoPageSource, /useReportingWorkBlockDraft,/);
  assert.match(expertPeoPageSource, /isReportingWorkBlocksEnabledClient/);
  assert.match(expertPeoPageSource, /buildActivitySaveWorkBlockInput/);
  assert.match(expertPeoPageSource, /const \[workBlockSaveNotice, setWorkBlockSaveNotice\]/);
  assert.match(expertPeoPageSource, /const saveAutomaticReportingWorkBlock = async/);
  assert.match(expertPeoPageSource, /\): Promise<boolean> =>/);
  assert.match(expertPeoPageSource, /reportingWorkBlocksEnabled \|\| isClarificationScopedAccess/);
  assert.match(expertPeoPageSource, /savedActivitiesForWorkBlock = \[\.\.\.updateActivities, \.\.\.createdActivities\]/);
  assert.match(expertPeoPageSource, /deletedActivityIdsForWorkBlock = deleteActivityIds/);
  assert.match(expertPeoPageSource, /savedActivitiesForWorkBlock = savedActivities/);
  assert.match(expertPeoPageSource, /const didSaveReportingWorkBlock = await saveAutomaticReportingWorkBlock\(\{/);
  assert.match(expertPeoPageSource, /await saveReportingWorkBlockDraft\(input, nextActivities\)/);
  assert.match(expertPeoPageSource, /setWorkBlockSaveNotice\('Work block-ul Anexa 10 a fost actualizat automat din formularul de activitate\.'\)/);
  assert.match(expertPeoPageSource, /\{workBlockSaveNotice && \(/);
  assert.match(expertPeoPageSource, /<Link href=\{exportRaHref\} className="font-semibold underline underline-offset-2">/);
  assert.match(expertPeoPageSource, /Verifica in Export/);
  assert.match(expertPeoPageSource, /Activitatea a fost salvata, dar work block-ul Anexa 10 nu a putut fi actualizat automat/);
  assert.match(expertPeoPageSource, /catch \(error\) \{\s+console\.error\('Error auto-saving reporting work block:', error\);/);
  assert.match(expertPeoPageSource, /setSaveError\('Activitatea a fost salvata, dar work block-ul Anexa 10 nu a putut fi actualizat automat\. Verifica sectiunea Export\.'\);/);
  assert.match(expertPeoPageSource, /setSaveError\('Activitatea a fost salvata, dar work block-ul Anexa 10 nu a putut fi actualizat automat\. Verifica sectiunea Export\.'\);\s+return false;/);
  assert.match(expertPeoPageSource, /if \(didSaveReportingWorkBlock\) \{\s+setWorkBlockSaveNotice/);
  assert.match(expertPeoPageSource, /await refreshActivities\(\);\s+setShowForm\(false\);/);
});
