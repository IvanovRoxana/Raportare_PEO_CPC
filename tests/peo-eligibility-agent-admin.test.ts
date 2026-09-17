import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const adminPageSource = fs.readFileSync(path.join(repoRoot, 'app/admin/page.tsx'), 'utf8');
const adminUsersSource = fs.readFileSync(path.join(repoRoot, 'components/admin/admin-users-table.tsx'), 'utf8');
const pmPageSource = fs.readFileSync(path.join(repoRoot, 'app/pm/page.tsx'), 'utf8');
const pmWorkspaceSource = fs.readFileSync(path.join(repoRoot, 'components/pm/workspace/pm-workspace.tsx'), 'utf8');
const pmEligibilityGovernanceSource = fs.readFileSync(path.join(repoRoot, 'components/pm/eligibility-governance-panel.tsx'), 'utf8');
const pmAiReportingInstructionsSource = fs.readFileSync(path.join(repoRoot, 'components/pm/ai-reporting-instructions-panel.tsx'), 'utf8');
const panelSource = fs.readFileSync(path.join(repoRoot, 'components/pm/peo-eligibility-agent-panel.tsx'), 'utf8');
const envExampleSource = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');

test('PM eligibility area includes the PEO Eligibility Agent panel', () => {
  assert.doesNotMatch(adminPageSource, /PeoEligibilityAgentPanel/);
  assert.match(pmEligibilityGovernanceSource, /PeoEligibilityAgentPanel/);
  assert.match(pmEligibilityGovernanceSource, /<PeoEligibilityAgentPanel experts=\{experts\} \/>/);
});

test('PM centralizes knowledge panels in one visible workspace', () => {
  assert.doesNotMatch(pmPageSource, /value="eligibility-categories"|value="eligibility-governance"|value="ai-rag"/);
  assert.match(pmWorkspaceSource, /label: 'AI \+ RAG \/ Knowledge'/);
  assert.match(pmWorkspaceSource, /<KnowledgeWorkspace/);
  assert.match(pmWorkspaceSource, /props.canManageKnowledge/);
  const knowledge = fs.readFileSync(path.join(repoRoot, 'components/pm/knowledge-workspace.tsx'), 'utf8');
  for (const component of ['AiContextHealthPanel', 'ActivityCatalogGovernancePanel', 'EligibilityGovernancePanel', 'AiRagAuditTab']) {
    assert.ok(knowledge.includes('<' + component));
  }
});

test('AI reporting instructions are managed from PM, not Admin users', () => {
  assert.doesNotMatch(adminUsersSource, /Instructiuni AI pentru raportare/);
  assert.match(pmEligibilityGovernanceSource, /AiReportingInstructionsPanel/);
  assert.match(pmAiReportingInstructionsSource, /Prompturi AI pentru raportare/);
  assert.match(pmAiReportingInstructionsSource, /aiReportingInstructions/);
});

test('PEO Eligibility Agent panel defines controlled knowledge and tools', () => {
  const toolSource = fs.readFileSync(path.join(repoRoot, 'lib/agents/eligibility-tools.ts'), 'utf8');
  [
    'readDeliverable', 'searchProjectEvidence', 'readReferenceDocument',
    'getAllowedActivityContext', 'listRelatedDeliverables',
  ].forEach((expected) => {
    assert.match(toolSource, new RegExp(expected));
  });
  assert.match(panelSource, /api\/eligibility\/readiness/);
});

test('PEO Eligibility Agent remains advisory and does not expose an activation control', () => {
  assert.match(panelSource, /Decizia PM rămâne separată/);
  assert.match(panelSource, /result\.enabled/);
  assert.match(panelSource, /Salvarea în ciornă rămâne disponibilă/);
  assert.doesNotMatch(panelSource, /Switch/);
  assert.doesNotMatch(panelSource, /onCheckedChange/);
  assert.match(envExampleSource, /NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK=false/);
  assert.match(envExampleSource, /ENABLE_DELIVERABLE_ELIGIBILITY_CHECK=false/);
});
