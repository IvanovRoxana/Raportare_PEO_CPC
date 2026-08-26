import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '@/amplify_outputs.json';
import type { Schema } from '@/amplify/data/resource';
import type { AiEligibilityRuleset } from '@/lib/types';

let configured = false;
let dataClient: ReturnType<typeof generateClient<Schema>> | null = null;

function getServerDataClient() {
  if (!configured) {
    Amplify.configure(outputs, { ssr: true });
    configured = true;
  }
  if (!dataClient) dataClient = generateClient<Schema>();
  return dataClient as any;
}

export async function getActiveAiEligibilityRuleset(): Promise<AiEligibilityRuleset | null> {
  if (!outputs?.auth?.user_pool_id || !outputs?.data?.url) return null;

  try {
    const client = getServerDataClient();
    const result = await client.models.AiEligibilityRuleset.list({
      filter: { status: { eq: 'active' } },
      limit: 100,
    });
    const data = result.data ?? [];
    const active = data
      .sort((a: any, b: any) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (!active) return null;

    return {
      id: active.id,
      title: active.title,
      status: active.status ?? 'active',
      version: active.version ?? 1,
      rulesJson: active.rulesJson,
      schemaVersion: active.schemaVersion ?? 'eligibility-rules-v1',
      activeFrom: active.activeFrom ?? undefined,
      publishedAt: active.publishedAt ?? undefined,
      publishedBy: active.publishedBy ?? undefined,
      createdBy: active.createdBy ?? undefined,
      updatedBy: active.updatedBy ?? undefined,
      changeReason: active.changeReason ?? undefined,
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
    };
  } catch (error) {
    console.warn('Active AI eligibility ruleset could not be loaded:', error);
    return null;
  }
}
