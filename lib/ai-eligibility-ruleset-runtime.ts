import 'server-only';
import outputs from '@/amplify_outputs.json';
import type { AiEligibilityRuleset } from '@/lib/types';

// Forward the caller's session explicitly: a server-global Amplify client has no browser session.
export async function getActiveAiEligibilityRuleset(options: {
  authToken?: string;
  timeoutMs?: number;
} = {}): Promise<AiEligibilityRuleset | null> {
  if (!options.authToken || !outputs?.data?.url) return null;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 3000);
  try {
    const rows: AiEligibilityRuleset[] = [];
    let nextToken: string | null = null;
    for (let page = 0; page < 5; page++) {
      const response: Response = await fetch(outputs.data.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: options.authToken },
        signal,
        cache: 'no-store',
        body: JSON.stringify({
          query: `query ActiveEligibilityRules($nextToken: String) {
            listAiEligibilityRulesets(filter: {status: {eq: "active"}}, limit: 100, nextToken: $nextToken) {
              items { id title status version rulesJson schemaVersion activeFrom publishedAt publishedBy createdBy updatedBy changeReason createdAt updatedAt }
              nextToken
            }
          }`,
          variables: { nextToken },
        }),
      });
      if (!response.ok) return null;
      const result: { errors?: unknown[]; data?: { listAiEligibilityRulesets?: { items?: AiEligibilityRuleset[]; nextToken?: string | null } } } = await response.json();
      if (result.errors?.length) return null;
      const pageData: { items?: AiEligibilityRuleset[]; nextToken?: string | null } | undefined = result.data?.listAiEligibilityRulesets;
      if (!pageData) return null;
      rows.push(...(pageData.items || []).filter(Boolean));
      nextToken = pageData.nextToken || null;
      if (!nextToken) return rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] || null;
    }
    // A partial page set cannot establish the latest active version.
    return null;
  } catch {
    return null;
  }
}
