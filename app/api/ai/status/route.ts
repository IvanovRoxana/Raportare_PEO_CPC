import { NextResponse } from 'next/server';
import { DEFAULT_OPENAI_MODEL } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isEnabledEnv(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export async function GET() {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  return NextResponse.json(
    {
      ok: hasApiKey,
      provider: 'openai',
      model,
      configured: {
        apiKey: hasApiKey,
        deliverableEligibilityCheck: isEnabledEnv(process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK),
      },
      governance: {
        auditLog: process.env.AI_AUDIT_LOG_PATH || (process.env.NODE_ENV === 'production' ? 'console' : './data/audit/ai-audit.ndjson'),
        auditLogToConsole: isEnabledEnv(process.env.AI_AUDIT_LOG_TO_CONSOLE),
        failClosed: isEnabledEnv(process.env.AI_AUDIT_FAIL_CLOSED),
        rateLimitPerMinute: readNumberEnv('AI_RATE_LIMIT_PER_MINUTE', 20),
        rateLimitPerDay: readNumberEnv('AI_RATE_LIMIT_PER_DAY', 500),
        dailyCostLimitUsd: readNumberEnv('AI_DAILY_COST_LIMIT_USD', 25),
        monthlyCostLimitUsd: readNumberEnv('AI_MONTHLY_COST_LIMIT_USD', 300),
        requestCostLimitUsd: readNumberEnv('AI_REQUEST_COST_LIMIT_USD', 2),
      },
    },
    {
      status: hasApiKey ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
