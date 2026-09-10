import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const form = readFileSync(new URL('../components/expert/activity-form.tsx', import.meta.url), 'utf8');
const item = readFileSync(new URL('../components/expert/deliverable-item.tsx', import.meta.url), 'utf8');
const formAst = ts.createSourceFile('activity-form.tsx', form, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodesMatching(predicate: (node: ts.Node) => boolean) {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(formAst);
  return matches;
}

function section(source: string, start: string, end: string) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, `Missing section: ${start}`);
  const endOffset = source.indexOf(end, offset + start.length);
  assert.ok(endOffset > offset, `Missing end: ${end}`);
  return source.slice(offset, endOffset);
}

test('standard classification renders a read-only result; manual catalog selection remains only in the other workflow branch', () => {
  const branches = nodesMatching((node) => ts.isConditionalExpression(node)
    && node.condition.getText(formAst) === 'automaticClassificationAllowed'
    && node.whenTrue.getText(formAst).includes('data-testid="standard-activity-classification"')) as ts.ConditionalExpression[];
  assert.equal(branches.length, 1);
  assert.doesNotMatch(branches[0].whenTrue.getText(formAst), /<Select(?:\s|>)/);
  assert.match(branches[0].whenTrue.getText(formAst), /PENDING_ACTIVITY_CLASSIFICATION_TITLE/);
  assert.match(branches[0].whenFalse.getText(formAst), /<Select value=\{selectedActivitySelectValue\}/);
  assert.doesNotMatch(form, /__automatic__|setAutoClassifyActivity/);
  assert.match(form, /automaticClassificationAllowed = showStandardActivityWorkflow\s*&& !isGdprExpert && activityFormTab === 'standard' && dayType === 'lucratoare'/);
  assert.match(form, /classificationMode = automaticClassificationAllowed \? 'automatic' : 'manual'/);
});

test('unclassified standard drafts keep an explicit pending identity and can save without an invented catalog activity', () => {
  assert.match(form, /isActivityClassificationPending\(\{ activityType: activitySeed\?\.activityType \}\) \? ''/);
  assert.match(form, /activityTypeForSave = isStandardClassificationPending \? PENDING_ACTIVITY_CLASSIFICATION_TYPE/);
  assert.match(form, /activityTitleForSave = isStandardClassificationPending \? PENDING_ACTIVITY_CLASSIFICATION_TITLE/);
  const blockers = section(form, 'const baseSaveBlockers =', '// Update activity when SA changes');
  assert.match(blockers, /!effectiveActivityTitle\.trim\(\) && !isLeave && !automaticClassificationAllowed/);
  assert.match(blockers, /automaticClassificationAllowed && !effectiveSaCode/);
  const validationPayload = section(form, 'const newActivityDrafts:', 'const existingActivityDrafts:');
  const savedPayload = section(form, 'id: activityId,', 'const excludedActivityIds =');
  for (const payload of [validationPayload, savedPayload]) {
    assert.match(payload, /finalStandardCatalogId/);
    assert.match(payload, /activityType: finalActivityType/);
    assert.match(payload, /title: finalActivityTitle/);
    assert.match(payload, /pendingClassificationForSave \? (?:\{ status: )?'draft'/);
  }
});

test('known-document continuation is explicit and discloses a different SA before saving', () => {
  assert.match(form, /isStandardClassificationPending && confirmedMonthlyDeliverableDuplicate\s*\? getKnownActivityContinuation/);
  assert.match(form, /choice\.requiresSaConfirmation && choice\.isCompatible/);
  assert.match(form, /Confirma schimbarea SA si continua activitatea/);
  assert.match(form, /eligibilityCheck: confirmedContinuation \? undefined/);
});

test('an unsuccessful reassessment cannot erase an existing assignment; document changes invalidate it separately', () => {
  const update = section(form, 'const updateDeliverable =', 'const applyEligibilitySuggestion =');
  assert.match(update, /if \(classifiedActivity && patch\.eligibilityCheck\?\.classification\)/);
  assert.doesNotMatch(update, /setActivityTitle\(''\)|setSelectedCatalogActivityId\(''\)/);
  assert.match(update, /patch\.eligibilityCheck\?\.executionStatus === 'completed'\s*\? next : reconcileDeliverableGroupEvidence/);
  const invalidation = section(form, 'const lastClassificationInvalidation =', 'const eligibilityExpertContext =');
  assert.match(invalidation, /lastClassificationInvalidation\.current === deliverableState\.classificationInvalidationVersion/);
  assert.match(invalidation, /setSelectedCatalogActivityId\(''\)/);
  assert.match(invalidation, /setActivityTitle\(''\)/);
});

test('standard expert confirms only a different SA and must obtain a new AI assignment', () => {
  const apply = section(form, 'const applyEligibilitySuggestion =', 'const removeDeliverable =');
  const automatic = section(apply, 'if (classificationContextRef.current.allowed)', 'setSaCode(catalogMatch.saCode);');
  assert.match(automatic, /if \(catalogMatch\.saCode === classificationContextRef\.current\.saCode\) return/);
  assert.match(automatic, /handleSaCodeChange\(catalogMatch\.saCode\);\s*return/);
  assert.doesNotMatch(automatic, /setActivityTitle|setSelectedCatalogActivityId/);
  const canApply = section(item, 'const canApplyActivity =', 'const canApplyDeliverableType =');
  assert.match(canApply, /classificationMode !== 'automatic' \|\| check\.classification\?\.requiresSaConfirmation/);
  assert.equal((item.match(/classificationMode=\{classificationMode\}/g) || []).length, 3);
});

test('existing-document source actions cannot bypass AI classification in standard flow, and special workflows remain present', () => {
  const sourceApply = section(form, "if (action === 'activity'", "if (action === 'deliverableType'");
  assert.match(sourceApply, /if \(classificationContextRef\.current\.allowed\) return/);
  assert.match(form, /if \(!classificationContextRef\.current\.allowed && !activityTitle && sourceCatalogMatch\)/);
  assert.match(form, /action\.id\.startsWith\('existing-source:'\) && action\.id\.endsWith\(':activity'\)/);
  assert.match(form, /onValueChange=\{handleGdprCatalogActivityChange\}/);
  assert.match(form, /isBusinessHubTabActive\s*\? businessHubRegistryActivityTitle/);
  assert.match(section(form, '<EventDocsPanel', 'deliverableNotesMode='), /classificationMode: 'manual'/);
});
