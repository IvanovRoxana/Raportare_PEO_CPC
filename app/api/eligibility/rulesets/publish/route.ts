import { NextResponse } from 'next/server';
import { assertAllowedAiRequest } from '@/lib/ai-governance';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { eligibilityStore, eligibilityTable, immutablePut } from '@/lib/eligibility-server-store';
import { parseExecutableRuleset } from '@/lib/eligibility-rules';
import type { AiEligibilityRuleset, AiEligibilityRuleVersion, KnowledgeChunk, KnowledgeDocument } from '@/lib/types';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const actor = await authenticateEligibilityRequest(req);
    if (!actor.roles.some((role) => role === 'pm' || role === 'admin')) throw new EligibilityAccessError('Publicarea necesita PM/Admin.');
    const body = await req.json();
    const draft = await eligibilityStore.get<AiEligibilityRuleset>('AiEligibilityRuleset', String(body.rulesetId));
    if (!draft) return NextResponse.json({ error: 'Ruleset inexistent.' }, { status: 404 });
    const restored = body.restoreVersionId ? await eligibilityStore.get<AiEligibilityRuleVersion>('AiEligibilityRuleVersion', String(body.restoreVersionId)) : null;
    if (body.restoreVersionId && (!restored || restored.rulesetId !== draft.id || !['published-v2', 'published-v3'].includes(restored.status))) throw new Error('Restaurarea necesita o versiune validata si publicata a acestui ruleset.');
    const now = new Date().toISOString();
    const rules = parseExecutableRuleset(restored ? restored.newRulesJson : draft.rulesJson);
    if (restored) {
      rules.validFrom = now; delete rules.validTo;
      rules.criteria = rules.criteria.map((rule) => ({ ...rule, validFrom: now, validTo: undefined, approvedBy: actor.id }));
    }
    if (!restored && draft.status !== 'draft') throw new Error('Numai o ciorna poate fi publicata.');
    if (Date.parse(rules.validFrom) < Date.parse(now) - 60_000) throw new Error('Publicarea retroactiva nu este permisa. Actualizeaza validFrom.');
    for (const criterion of rules.criteria) {
      const source = await eligibilityStore.get<KnowledgeDocument>('KnowledgeDocument', criterion.provenance.documentId);
      const anchor = await eligibilityStore.get<KnowledgeChunk>('KnowledgeChunk', criterion.provenance.anchor);
      if (!source || source.projectCode !== rules.projectCode || source.status !== 'active'
        || source.documentVersionId !== criterion.provenance.sourceVersion || !source.extractionComplete
        || !anchor || anchor.documentId !== source.id || anchor.indexGenerationId !== source.publishedGeneration
        || !['cerere_finantare', 'manual_beneficiar', 'descriere_activitati', 'scop_sa', 'fisa_post'].includes(source.sourceType)) {
        throw new Error(`Sursa/ancora normativa lipseste sau nu este publicata: ${criterion.criterionId}`);
      }
      criterion.approvedBy = actor.id;
    }
    const headId = `head:${rules.projectCode}`;
    const head = await eligibilityStore.get<AiEligibilityRuleVersion>('AiEligibilityRuleVersion', headId);
    const version = (head?.version || 0) + 1;
    const publication = { id: `publication:${rules.projectCode}:${version}`, rulesetId: draft.id, version,
      status: rules.schemaVersion === 'eligibility-rules-v3' ? 'published-v3' : 'published-v2', newRulesJson: rules, changedBy: actor.id, changeReason: draft.changeReason || 'Publicare validata', publishedAt: now };
    const published = { ...draft, id: draft.id, status: 'active', version, rulesJson: rules,
      schemaVersion: rules.schemaVersion, activeFrom: rules.validFrom, activeTo: rules.validTo, publishedAt: now, publishedBy: actor.id };
    await eligibilityStore.transact([
      immutablePut('AiEligibilityRuleVersion', publication),
      { Put: { TableName: eligibilityTable('AiEligibilityRuleVersion'), Item: { id: headId, rulesetId: draft.id, version, status: 'head', createdAt: now, updatedAt: now },
        ConditionExpression: head ? '#version = :previous' : 'attribute_not_exists(id)',
        ...(head ? { ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':previous': head.version } } : {}) } },
      { Put: { TableName: eligibilityTable('AiEligibilityRuleset'), Item: { ...published, updatedAt: now },
        ConditionExpression: 'updatedAt = :expected AND #status = :status', ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':expected': draft.updatedAt, ':status': draft.status } } },
    ]);
    return NextResponse.json(published);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Publicare esuata.' }, { status: error instanceof EligibilityAccessError ? error.status : 422 });
  }
}
