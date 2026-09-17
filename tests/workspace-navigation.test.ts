import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAdminLocation, resolveKnowledgeSection, isKnowledgeTab, adminDataSections } from '../lib/workspace-navigation.ts';
import { canManageKnowledge } from '../lib/rag/knowledge-access.ts';
import type { Expert } from '../lib/types.ts';

test('legacy Admin bookmarks resolve inside the single data tab', () => {
  assert.deepEqual(resolveAdminLocation('utilizatori'), { tab: 'surse-date', section: 'experti' });
  assert.deepEqual(resolveAdminLocation('ai'), { tab: 'surse-date', section: 'infrastructura' });
  for (const section of adminDataSections) {
    assert.deepEqual(resolveAdminLocation('surse-date', section), { tab: 'surse-date', section });
  }
  assert.equal(resolveAdminLocation('proiecte').section, 'proiecte');
  assert.equal(resolveAdminLocation('suport').tab, 'suport');
  assert.equal(resolveAdminLocation('surse-date', 'invalid').section, 'experti');
});

test('legacy PM links open the intended knowledge section', () => {
  for (const [tab, section] of [['eligibility-categories', 'catalog'], ['eligibility-governance', 'reguli'], ['ai-rag', 'audit']]) {
    assert.equal(isKnowledgeTab(tab), true);
    assert.equal(resolveKnowledgeSection(tab), section);
  }
  assert.equal(resolveKnowledgeSection('knowledge', 'audit'), 'audit');
  assert.equal(resolveKnowledgeSection('knowledge', 'invalid'), 'surse');
  assert.equal(isKnowledgeTab('timesheets'), false);
});

test('knowledge access preserves self-scoped hybrid Expert/PM restrictions', () => {
  assert.equal(canManageKnowledge({ roles: ['admin'] }), true);
  assert.equal(canManageKnowledge({ roles: ['pm'] }), true);
  assert.equal(canManageKnowledge({ roles: ['expert'] }), false);
  assert.equal(canManageKnowledge({ roles: [] }), false);
  assert.equal(canManageKnowledge({ roles: ['expert', 'pm'], email: 'expert@example.com' }), false);
  assert.equal(canManageKnowledge({ roles: ['expert', 'pm'], email: ' ROXANA.IVANOV@CONFEDERATIA-CONCORDIA.RO ' }), true);
  assert.equal(canManageKnowledge({ roles: ['pm'], email: 'expert@example.com' }, [
    { id: 'expert', email: 'expert@example.com', role: 'Expert/PM', hasPmAccess: true } as Expert,
  ]), false, 'a pure PM token must not override a self-scoped Expert/PM profile');
});

test('technical RAG repair stays Admin-only while reference curation uses PM authorization', () => {
  const route = readFileSync(new URL('../app/api/admin/rag/library/route.ts', import.meta.url), 'utf8');
  const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
  assert.match(patch, /await assertRagAdminRequest\(req\)/);
  assert.doesNotMatch(patch, /await assertKnowledgeRequest/);
  assert.match(route.slice(route.indexOf('export async function DELETE')), /await assertKnowledgeRequest\(req\)/);
  const knowledge = readFileSync(new URL('../components/admin/ai-context-health-panel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(knowledge, /completeMissingProjects|complete-project/);
  const admin = readFileSync(new URL('../components/admin/data-sources-workspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(admin, /<AiContextHealthPanel|<EligibilityGovernancePanel/);
});
