import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Activity, ActivityCatalog, PersistedReportingWorkBlock } from '../lib/types.ts';
import { planActivityReassignmentWorkBlockSync } from '../lib/activity-report/activity-reassignment-sync.ts';
import { buildWorkBlocks } from '../lib/activity-report/work-blocks.ts';
import { buildPersistedWorkBlockBundles } from '../lib/activity-report/persisted-work-blocks.ts';
import { buildDeterministicWorkBlockConsolidation, buildWorkBlockConsolidationRequest } from '../lib/activity-report/work-block-consolidation.ts';
import { buildPmActivityAssignmentPatch, buildPmReassignmentCheck } from '../lib/pm-activity-assignment.ts';
import { getDisplayEligibilityScore, getEligibilityAttemptState, isReusableEligibilityCheck } from '../lib/deliverable-check-state.ts';

const now = '2026-09-10T15:00:00.000Z';
const catalog: ActivityCatalog = { id: 'new', category: 'ap', saCode: 'SA1.1', activityName: 'Analiza noua', activityNumber: 1, serviceCategory: 'Analiza' };
const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: 'a1', expertId: 'e1', projectCode: '302141', date: '2026-06-02', hours: 2,
  saCode: 'SA3.4', catalogActivityId: 'old', activityType: 'Analiza veche', title: 'Analiza veche', status: 'draft',
  deliverables: [{ id: 'd1', fileName: 'proba.pdf', fileType: 'application/pdf', fileSize: 20, uploaded: true }], ...overrides,
});
const assigned = (source: Activity) => ({ ...source, ...buildPmActivityAssignmentPatch(source, catalog, now) });

test('PM assignment resets evidence evaluation without approving or fabricating a score', () => {
  const previous = activity({ status: 'approved', activitySummary: 'Proza veche' });
  const patch = buildPmActivityAssignmentPatch(previous, catalog, now);
  assert.equal(patch.status, 'draft');
  assert.equal(patch.activitySummary, '');
  assert.equal(patch.deliverables?.[0].aiStatus, 'review');
  const check = buildPmReassignmentCheck(catalog, 'Raport', now);
  assert.equal(check.status, 'neconcludent');
  assert.equal(check.classification?.appliedBy, 'pm');
  assert.equal(check.classification?.autoApply, false);
  assert.equal(getEligibilityAttemptState(check), 'blocked');
  assert.equal(getDisplayEligibilityScore(check), null);
  assert.equal(isReusableEligibilityCheck(check), false);
  assert.equal(previous.activitySummary, 'Proza veche');
});

test('one-day reassignment preserves allocations and marks a mixed series for reconciliation', () => {
  const previous = activity({ periodGroupId: 'series' });
  const sibling = activity({ id: 'a2', date: '2026-06-03', hours: 3, periodGroupId: 'series', deliverables: [] });
  const [bundle] = buildWorkBlocks([previous, sibling]);
  const originalLinks = structuredClone(bundle.activityLinks);
  const plan = planActivityReassignmentWorkBlockSync({ previous, current: assigned(previous), activities: [sibling],
    workBlocks: [bundle.workBlock], activityLinks: bundle.activityLinks, now });
  assert.equal(plan.updates[0].aiConsolidationStatus, 'classification_review_required');
  assert.equal(plan.updates[0].generatedNarrative, null);
  assert.deepEqual(bundle.activityLinks, originalLinks);
  assert.deepEqual(plan.appendActivityLinks, []);
  assert.deepEqual(plan.createBundles, []);
  assert.equal(sibling.catalogActivityId, 'old');
});

test('resolving every day restores a coherent SA and catalog without reallocating hours', () => {
  const previous = activity({ periodGroupId: 'series' });
  const sibling = assigned(activity({ id: 'a2', date: '2026-06-03', hours: 3, periodGroupId: 'series' }));
  const [bundle] = buildWorkBlocks([previous, sibling]);
  const plan = planActivityReassignmentWorkBlockSync({ previous, current: assigned(previous), activities: [sibling],
    workBlocks: [bundle.workBlock], activityLinks: bundle.activityLinks, now });
  assert.equal(plan.updates[0].saCode, 'SA1.1');
  assert.equal(plan.updates[0].activityCode, 'new');
  assert.equal(plan.updates[0].aiConsolidationStatus, 'stale');
  assert.equal(bundle.activityLinks.reduce((sum, link) => sum + link.allocatedHours, 0), 5);
});

test('retry after Activity write repairs legacy same-SA classification even without a stored catalog code', () => {
  const current = assigned(activity());
  const [bundle] = buildWorkBlocks([current]);
  bundle.workBlock.activityCode = undefined;
  bundle.workBlock.activityCategory = 'Activitate veche in aceeasi SA';
  const plan = planActivityReassignmentWorkBlockSync({ previous: current, current, activities: [current],
    workBlocks: [bundle.workBlock], activityLinks: bundle.activityLinks, now });
  assert.equal(plan.updates[0].activityCode, 'new');
  assert.equal(plan.updates[0].activityCategory, 'Analiza noua');
});

// Execute the actual orchestration with in-memory AppSync models. No network or credentials.
const source = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('aws-store.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'synchronizeReassignedActivityWorkBlocks');
assert.ok(declaration);
const js = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const synchronize = new Function('listModel', 'assertNoErrors', 'assertCanAccessExpert', 'attachActivityChildren',
  'planActivityReassignmentWorkBlockSync', 'buildPersistedWorkBlockBundles', 'buildWorkBlockConsolidationRequest', 'buildDeterministicWorkBlockConsolidation',
  `${js}\nreturn synchronizeReassignedActivityWorkBlocks;`)(
  async (model: any, filter: Record<string, { eq: unknown }>) => [...model.rows.values()].filter((row: any) => Object.entries(filter).every(([key, value]) => row[key] === value.eq)),
  (result: any) => { if (result.errors?.length) throw new Error(result.errors[0].message); },
  async (_client: unknown, expertId: string) => { assert.equal(expertId, 'e1'); },
  async (value: Activity) => value,
  planActivityReassignmentWorkBlockSync, buildPersistedWorkBlockBundles, buildWorkBlockConsolidationRequest, buildDeterministicWorkBlockConsolidation,
);

function model(initial: Array<Record<string, any>> = []) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  return {
    rows,
    async get({ id }: { id: string }) { return { data: rows.get(id) || null }; },
    async create(input: Record<string, any>) {
      assert.equal(rows.has(input.id), false, 'retry must not recreate an existing ID');
      assert.equal('activityDate' in input, false, 'AppSync link schema does not accept activityDate');
      rows.set(input.id, structuredClone(input));
      return { data: input };
    },
    async update(input: Record<string, any>) {
      assert.ok(rows.has(input.id));
      rows.set(input.id, { ...rows.get(input.id), ...input });
      return { data: rows.get(input.id) };
    },
  };
}

test('AppSync retry repairs a half-created block and preserves expert ownership and evidence', async () => {
  const previous = { ...activity({ activityType: 'pending_classification', catalogActivityId: undefined }), owner: 'expert-sub::expert-login' };
  const current = assigned(previous);
  const models = { ReportingWorkBlock: model(), WorkBlockActivityLink: model(), WorkBlockDeliverableLink: model(), Activity: model([current]) };
  const createLink = models.WorkBlockActivityLink.create;
  let failOnce = true;
  models.WorkBlockActivityLink.create = async (input) => {
    if (failOnce) { failOnce = false; throw new Error('temporary link failure'); }
    return createLink(input);
  };
  await assert.rejects(synchronize({ models }, previous, current), /temporary link failure/);
  assert.equal(models.ReportingWorkBlock.rows.size, 1);
  assert.equal(models.WorkBlockActivityLink.rows.size, 0);
  await synchronize({ models }, previous, current);
  assert.equal(models.ReportingWorkBlock.rows.size, 1);
  assert.equal(models.WorkBlockActivityLink.rows.size, 1);
  assert.equal(models.WorkBlockDeliverableLink.rows.size, 1);
  for (const row of [...models.ReportingWorkBlock.rows.values(), ...models.WorkBlockActivityLink.rows.values(), ...models.WorkBlockDeliverableLink.rows.values()]) {
    assert.equal(row.owner, previous.owner);
  }
  const block = [...models.ReportingWorkBlock.rows.values()][0] as PersistedReportingWorkBlock;
  assert.equal(block.saCode, 'SA1.1');
  assert.equal(block.activityCode, 'new');
  assert.equal(block.aiConsolidationStatus, 'deterministic_fallback');
  assert.match(block.generatedNarrative || '', /2 ore lucrate/);
  await synchronize({ models }, current, current);
  assert.equal(models.WorkBlockActivityLink.rows.size, 1);
});

test('pre-invalidation protects opaque legacy prose before any classification write', async () => {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'invalidateActivityClassificationWorkBlocks');
  assert.ok(node);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const invalidate = new Function('listModel', 'assertNoErrors', 'assertCanAccessExpert', `${code}\nreturn invalidateActivityClassificationWorkBlocks;`)(
    async (data: any) => [...data.rows.values()],
    (result: any) => { if (result.errors?.length) throw new Error('write failed'); },
    async (_client: unknown, expertId: string) => { assert.equal(expertId, 'e1'); },
  );
  const previous = activity();
  const [bundle] = buildWorkBlocks([previous]);
  const block = { ...bundle.workBlock, activityCode: undefined, activityCategory: undefined, title: 'Titlu liber', generatedNarrative: 'Proza veche' };
  const models = { ReportingWorkBlock: model([block]), WorkBlockActivityLink: model(bundle.activityLinks) };
  await invalidate({ models }, previous);
  assert.equal(models.ReportingWorkBlock.rows.get(block.id)?.aiConsolidationStatus, 'classification_review_required');
  assert.equal(models.WorkBlockActivityLink.rows.get(bundle.activityLinks[0].id)?.allocatedHours, 2);
  assert.ok(source.indexOf('await invalidateActivityClassificationWorkBlocks(client, existing.data as Activity)')
    < source.indexOf("const result = await client.models.Activity.update(omitUndefinedFields(withSupportedActivityShareFields({"));
});
