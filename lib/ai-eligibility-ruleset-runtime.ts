import 'server-only';
import { eligibilityStore } from './eligibility-server-store.ts';
import { parseExecutableRuleset, selectTemporalRuleset } from './eligibility-rules.ts';
import type { AiEligibilityRuleVersion, AiEligibilityRuleset } from './types.ts';

export { parseExecutableRuleset, executableRulesetSchema, ELIGIBILITY_OPERATOR_HANDLERS } from './eligibility-rules.ts';

// Only validated immutable publication snapshots are executable.
export async function getActiveAiEligibilityRuleset(options: { projectCode: string; at?: string; knownAt?: string }) {
  const versions = await eligibilityStore.list<AiEligibilityRuleVersion>('AiEligibilityRuleVersion');
  const rows: AiEligibilityRuleset[] = versions.filter((version) => ['published-v2', 'published-v3'].includes(version.status)).map((version) => ({
    id: version.id, title: version.rulesetId, status: 'active', version: version.version,
    publishedAt: version.publishedAt, publishedBy: version.changedBy, rulesJson: version.newRulesJson,
  }));
  return selectTemporalRuleset(rows, options.projectCode, options.at || new Date().toISOString(), options.knownAt || options.at || new Date().toISOString())?.row || null;
}

/** A published future ruleset is informative, but never executable before validFrom. */
export async function getScheduledAiEligibilityRuleset(options: { projectCode: string; at?: string; knownAt?: string }) {
  const at = options.at || new Date().toISOString();
  const knownAt = options.knownAt || at;
  const versions = await eligibilityStore.list<AiEligibilityRuleVersion>('AiEligibilityRuleVersion');
  return versions
    .filter((version) => ['published-v2', 'published-v3'].includes(version.status) && version.publishedAt
      && Date.parse(version.publishedAt) <= Date.parse(knownAt))
    .map((version) => ({ version, rules: parseExecutableRuleset(version.newRulesJson) }))
    .filter(({ rules }) => rules.projectCode === options.projectCode && Date.parse(rules.validFrom) > Date.parse(at))
    .sort((left, right) => Date.parse(left.rules.validFrom) - Date.parse(right.rules.validFrom))[0] || null;
}
