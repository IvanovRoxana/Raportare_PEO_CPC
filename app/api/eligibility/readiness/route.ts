import { NextResponse } from 'next/server';
import { resolveEligibilityContext } from '@/lib/eligibility-resolver';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { getActiveAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';
import { parseExecutableRuleset } from '@/lib/eligibility-rules';
import { buildEvidencePlan } from '@/lib/eligibility-evaluation';
import { getEligibilityModelName } from '@/lib/openai';
import { isDeliverableEligibilityCheckEnabled } from '@/lib/feature-flags';
import { eligibilityExecutionLimits } from '@/lib/eligibility-execution';
import { eligibilityTable } from '@/lib/eligibility-server-store';
import { assertAllowedAiRequest } from '@/lib/ai-governance';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const context = await resolveEligibilityContext(req, { expertId: String(body.expertId || ''), saCode: String(body.saCode || ''), documentIds: [] });
    if (!context.actor.roles.some((role) => ['admin', 'pm'].includes(role))) throw new EligibilityAccessError('Diagnosticul necesita PM/Admin.');
    const now = new Date().toISOString();
    const ruleset = await getActiveAiEligibilityRuleset({ projectCode: context.expert.projectCode!, at: now });
    const rules = ruleset ? parseExecutableRuleset(ruleset.rulesJson) : null;
    const plan = buildEvidencePlan(rules, { projectCode: context.expert.projectCode!, roleId: context.roleId,
      category: context.expert.category || '', saCode: body.saCode, at: now, documents: [], aiFindings: [],
      sources: context.chunks.map((chunk) => ({ documentId: chunk.documentId, chunkId: chunk.id, coverage: 'project', text: chunk.text,
        documentVersionId: chunk.documentVersionId, extractionComplete: chunk.extractionComplete })) });
    let runtimeReady = true;
    try { eligibilityTable('EligibilityRuntime'); } catch { runtimeReady = false; }
    const missing = plan.criteria.filter((rule) => rule.applicable && rule.mandatory && !rule.sourceAvailable).map((rule) => rule.criterionId);
    return NextResponse.json({ enabled: isDeliverableEligibilityCheckEnabled(), runtimeReady,
      ready: runtimeReady && Boolean(rules) && missing.length === 0 && plan.criteria.some((rule) => rule.applicable),
      model: getEligibilityModelName(), limits: eligibilityExecutionLimits(), missingCriteriaSources: missing,
      ruleset: ruleset ? { id: ruleset.id, version: ruleset.version } : null,
      sources: context.parents.map((source) => ({ id: source.id, title: source.title, version: source.documentVersionId,
        published: Boolean(source.publishedGeneration), extractionComplete: source.extractionComplete === true })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EligibilityAccessError ? error.message : 'Contextul nu poate fi verificat acum.' },
      { status: error instanceof EligibilityAccessError ? error.status : 503 });
  }
}
