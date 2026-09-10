import assert from 'node:assert/strict';
import test from 'node:test';
import type { Activity, Expert } from '../lib/types.ts';
import { getActivitiesPendingClassification, inferLegacyActivityPeriodGroups } from '../lib/submit-readiness.ts';
import { buildActivitySaveWorkBlockInput } from '../lib/activity-report/activity-save-work-block.ts';
import { buildWorkBlocks, validateWorkBlockAllocation } from '../lib/activity-report/work-blocks.ts';
import { prepareDraftWorkBlockSave } from '../lib/activity-report/draft-work-blocks.ts';
import { buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import { getAnexa10ExportReadiness, assertCanExportAnexa10Docx } from '../lib/activity-report/export-readiness.ts';
import { buildDeterministicAnexa10Preflight } from '../lib/activity-report/preflight.ts';
import { generatePontajExcel } from '../lib/pontaj-excel-export.ts';

const expert: Expert = {
  id: 'expert-1', name: 'Expert Test', role: 'Expert PEO', category: 'ap', norma: 4,
  positionInProject: 'Expert politici publice', projectCode: '302141',
  contractNumber: '12/2026', contractType: 'CIM',
};

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1', expertId: expert.id, projectCode: '302141', date: '2026-06-02', hours: 2,
    activityType: 'Analiza legislativa', title: 'Analiza legislativa', catalogActivityId: 'catalog-current',
    saCode: 'SA3.4', status: 'draft', deliverables: [],
    activitySummary: 'Am analizat propunerea legislativă și am sintetizat observațiile membrilor.',
    ...overrides,
  };
}

function pending(overrides: Partial<Activity> = {}): Activity {
  return activity({ activityType: 'pending_classification', title: 'Încadrare în așteptare', catalogActivityId: undefined, ...overrides });
}

const modelFor = (activities: Activity[], workBlockBundles?: ReturnType<typeof buildWorkBlocks>) =>
  buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026, workBlockBundles });

test('readiness identifies pending drafts independently of hours, deliverables or legacy missing catalog IDs', () => {
  const unresolved = pending({ deliverables: [{ id: 'd1', fileName: 'proba.pdf', fileType: 'application/pdf', fileSize: 20, uploaded: true }] });
  const legacy = activity({ id: 'legacy', catalogActivityId: undefined });
  const zeroHours = pending({ id: 'zero', hours: 0 });
  assert.deepEqual(getActivitiesPendingClassification([unresolved, legacy, zeroHours]).map((item) => item.id), ['activity-1', 'zero']);
});

test('unrelated pending drafts never acquire an inferred legacy period group', () => {
  const activities = [pending({ id: 'a1', createdAt: '2026-06-02T10:00:00Z' }), pending({ id: 'a2', date: '2026-06-03', createdAt: '2026-06-02T10:00:01Z' })];
  assert.equal(inferLegacyActivityPeriodGroups(activities).size, 0);
});

test('pending drafts cannot create automatic reporting blocks, including a mixed series', () => {
  const unresolved = pending();
  assert.deepEqual(buildWorkBlocks([unresolved]), []);
  for (const savedActivities of [[unresolved], [activity({ id: 'resolved', periodGroupId: 'series' }), pending({ periodGroupId: 'series' })]]) {
    assert.equal(buildActivitySaveWorkBlockInput({ savedActivities, expertId: expert.id, projectCode: '302141', month: 5, year: 2026 }), null);
  }
});

test('pending hours stay in activity data while report omits them and blocks even with no persisted blocks', () => {
  const activities = [activity({ id: 'resolved' }), pending({ id: 'pending', date: '2026-06-03', hours: 3 })];
  const before = structuredClone(activities);
  const model = modelFor(activities);
  assert.equal(activities.reduce((sum, item) => sum + item.hours, 0), 5);
  assert.deepEqual(activities, before);
  assert.equal(model.totalHours, 2);
  assert.equal(model.tableRows.length, 1);
  assert.equal(getAnexa10ExportReadiness(model).canExport, false);
  assert.equal(modelFor(activities, []).problems.some((problem) => problem.code === 'pending_classification'), true);
  assert.throws(() => assertCanExportAnexa10Docx(model), /încadrării de către PM/);
  const finding = buildDeterministicAnexa10Preflight(model).findings.find((item) => item.title === 'Încadrare în așteptare');
  assert.equal(finding?.area, 'table');
  assert.equal(finding?.severity, 'critical');
});

test('persisted blocks cannot leak pending records or old generated prose into Anexa 10', () => {
  const bundles = buildWorkBlocks([activity()]);
  bundles[0].workBlock.generatedTableSummary = 'PROZA VECHE';
  bundles[0].workBlock.generatedNarrative = 'PROZA VECHE';
  const model = modelFor([pending()], bundles);
  assert.deepEqual(model.tableRows, []);
  assert.deepEqual(model.saSections, []);
  assert.equal(model.totalHours, 0);
  assert.equal(getAnexa10ExportReadiness(model).canExport, false);
  assert.doesNotMatch(JSON.stringify(model), /PROZA VECHE/);
});

test('manual reporting block input cannot bypass pending classification', () => {
  const unresolved = pending();
  const result = prepareDraftWorkBlockSave({ expertId: expert.id, projectCode: '302141', month: 5, year: 2026, title: 'Titlu completat', saCode: 'SA3.4', reportingFlowType: 'deliverable', activityIds: [unresolved.id] }, [unresolved]);
  assert.equal(result.canSave, false);
  assert.equal(result.bundle, null);
  assert.equal(result.issues.some((issue) => issue.code === 'pending_classification'), true);
});

test('PM assignment restores automatic block allocation and removes the pending report blocker', () => {
  const resolved = { ...pending(), ...activity() };
  const input = buildActivitySaveWorkBlockInput({ savedActivities: [resolved], expertId: expert.id, projectCode: '302141', month: 5, year: 2026 });
  assert.deepEqual(input?.allocatedHoursByActivityId, { 'activity-1': 2 });
  assert.equal(modelFor([resolved]).problems.length, 0);
  assert.equal(modelFor([resolved]).totalHours, 2);
});

test('partial reassignment with stale SA or catalog identity cannot export old persisted text', () => {
  const current = activity();
  for (const staleFields of [{ saCode: 'SA1.1' }, { activityCode: 'catalog-old' }, { aiConsolidationStatus: 'classification_review_required' }]) {
    const bundles = buildWorkBlocks([current]);
    Object.assign(bundles[0].workBlock, staleFields, { generatedTableSummary: 'PROZA VECHE' });
    const model = modelFor([current], bundles);
    assert.equal(model.problems.some((problem) => problem.code === 'stale_classification'), true);
    assert.deepEqual(model.tableRows, []);
    assert.doesNotMatch(JSON.stringify(model), /PROZA VECHE/);
  }
});

test('legacy persisted block without catalog ID still detects a changed canonical activity in the same SA', () => {
  const current = activity();
  const bundles = buildWorkBlocks([activity({ catalogActivityId: undefined, activityType: 'Activitatea veche', title: 'Activitatea veche' })]);
  bundles[0].workBlock.generatedTableSummary = 'PROZA VECHE';
  const model = modelFor([current], bundles);
  assert.equal(model.problems.some((problem) => problem.code === 'stale_classification'), true);
  assert.deepEqual(model.tableRows, []);
});

test('legacy known catalog title catches reassignment even without saved category', () => {
  const current = activity();
  const bundles = buildWorkBlocks([current]);
  Object.assign(bundles[0].workBlock, { activityCode: undefined, activityCategory: undefined, title: 'Elaborare document de pozitie / analiza legislativa' });
  assert.equal(modelFor([current], bundles).problems.some((problem) => problem.code === 'stale_classification'), true);
});

test('legacy canonical names and generic financing codes remain valid', () => {
  const current = activity();
  for (const activityCode of [undefined, 'A3', 'SA3.4']) {
    const bundles = buildWorkBlocks([current]);
    Object.assign(bundles[0].workBlock, { activityCode, activityCategory: '  Analiză legislativă  ' });
    assert.deepEqual(validateWorkBlockAllocation([current], bundles), []);
  }
});

test('monthly COM multi-activity groups remain reportable within the same SA', () => {
  const first = activity({ activityType: 'Articole pentru concordia.ro', title: 'Articole pentru concordia.ro', catalogActivityId: 'com-articles', periodGroupId: 'com-month' });
  const second = activity({ id: 'com-social', activityType: 'Continut pentru social media', title: 'Continut pentru social media', catalogActivityId: 'com-social', periodGroupId: 'com-month' });
  const bundle = buildWorkBlocks([first, second]);
  assert.deepEqual(validateWorkBlockAllocation([first, second], bundle), []);
  assert.equal(validateWorkBlockAllocation([first, { ...second, saCode: 'SA1.1' }], bundle).some((problem) => problem.code === 'stale_classification'), true);
});

test('coherent reassignment uses current activity prose instead of stale generated consolidation', () => {
  const current = activity();
  const bundles = buildWorkBlocks([current]);
  Object.assign(bundles[0].workBlock, { aiConsolidationStatus: 'stale', generatedTableSummary: 'PROZA VECHE', generatedNarrative: 'PROZA VECHE', cleanedActivitySummary: 'PROZA VECHE' });
  const model = modelFor([current], bundles);
  assert.deepEqual(model.problems, []);
  assert.equal(model.tableRows[0].performedActivity, current.activitySummary);
  assert.doesNotMatch(JSON.stringify(model), /PROZA VECHE/);
  assert.equal(bundles[0].workBlock.generatedTableSummary, 'PROZA VECHE');
});

test('PEO and consolidated Excel stop before generating a month with pending classification', async () => {
  for (const kind of ['peo', 'consolidated'] as const) {
    await assert.rejects(generatePontajExcel({ kind, expert, activities: [pending()], month: 5, year: 2026 }), /activități în așteptarea încadrării de către PM/);
  }
});

test('pending classification outside the exported month or expert does not block Excel', async () => {
  const result = await generatePontajExcel({ kind: 'peo', expert, activities: [pending({ date: '2026-07-02' })], month: 5, year: 2026 });
  assert.ok(result.buffer.length > 0);
});
