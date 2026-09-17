import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { generateText } from 'ai';
import { aiModelId, runMeteredAiCall, aggregateGenerationUsage } from './ai-usage.ts';
import { NextResponse } from 'next/server';
import { isOpenAIConfigurationError } from '@/lib/openai';

type GenerateTextOptions = Parameters<typeof generateText>[0];

type AiGovernanceMetadata = {
  runId?: string;
  endpoint: string;
  operation: string;
  request?: unknown;
  actorId?: string;
  actorName?: string;
  projectCode?: string;
  month?: number | string;
  year?: number | string;
};

type GovernedGenerateTextOptions = GenerateTextOptions & AiGovernanceMetadata;

type UsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type LimitSnapshot = {
  requestLimitPerMinute: number;
  requestLimitPerDay: number;
  dailyCostLimitUsd: number;
  monthlyCostLimitUsd: number;
  requestCostLimitUsd: number;
};

type AiGovernanceState = {
  requestTimestamps: number[];
  dailySpendUsd: Map<string, number>;
  monthlySpendUsd: Map<string, number>;
};

const GLOBAL_STATE_KEY = '__peoAiGovernanceState';
const OPENAI_GPT_4O_MINI_INPUT_PER_1M = 0.15;
const OPENAI_GPT_4O_MINI_OUTPUT_PER_1M = 0.6;

export class AiGovernanceError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AiGovernanceError';
    this.code = code;
    this.status = status;
  }
}

function getState(): AiGovernanceState {
  const globalWithState = globalThis as typeof globalThis & {
    [GLOBAL_STATE_KEY]?: AiGovernanceState;
  };

  if (!globalWithState[GLOBAL_STATE_KEY]) {
    globalWithState[GLOBAL_STATE_KEY] = {
      requestTimestamps: [],
      dailySpendUsd: new Map(),
      monthlySpendUsd: new Map(),
    };
  }

  return globalWithState[GLOBAL_STATE_KEY];
}

function readNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getLimits(): LimitSnapshot {
  return {
    requestLimitPerMinute: readNumberEnv('AI_RATE_LIMIT_PER_MINUTE', 20),
    requestLimitPerDay: readNumberEnv('AI_RATE_LIMIT_PER_DAY', 500),
    dailyCostLimitUsd: readNumberEnv('AI_DAILY_COST_LIMIT_USD', 25),
    monthlyCostLimitUsd: readNumberEnv('AI_MONTHLY_COST_LIMIT_USD', 300),
    requestCostLimitUsd: readNumberEnv('AI_REQUEST_COST_LIMIT_USD', 2),
  };
}

function getAuditLogPath() {
  const configuredPath = process.env.AI_AUDIT_LOG_PATH;
  if (configuredPath) {
    return configuredPath;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'console';
  }

  return join(process.cwd(), 'data', 'audit', 'ai-audit.ndjson');
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        stack: item.stack,
      };
    }
    return item;
  });
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/api[-_]?key|authorization|password|secret|token|openai/i.test(key)) {
        return [key, '[redacted]'];
      }

      return [key, redactSecrets(item)];
    })
  );
}

function textFromMessages(messages: unknown) {
  if (!Array.isArray(messages)) return '';

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') return String(message);
      const record = message as Record<string, unknown>;
      return `${String(record.role ?? '')}: ${stableStringify(record.content ?? '')}`;
    })
    .join('\n');
}

function estimateTokens(value: unknown) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return Math.ceil((text?.length ?? 0) / 4);
}

function getInputTokenEstimate(options: GenerateTextOptions) {
  const record = options as Record<string, unknown>;
  return estimateTokens(record.system) + estimateTokens(record.prompt) + estimateTokens(textFromMessages(record.messages));
}

function getExpectedOutputTokens(options: GenerateTextOptions) {
  const record = options as Record<string, unknown>;
  const maxOutputTokens = Number(record.maxOutputTokens);
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens >= 0) {
    return maxOutputTokens;
  }

  return readNumberEnv('AI_DEFAULT_EXPECTED_OUTPUT_TOKENS', 1000);
}

function getModelPricing(model: unknown) {
  const modelName = aiModelId(model);
  const normalized = modelName.toLowerCase();
  const defaultInput = normalized.includes('gpt-4o-mini') ? OPENAI_GPT_4O_MINI_INPUT_PER_1M : 1;
  const defaultOutput = normalized.includes('gpt-4o-mini') ? OPENAI_GPT_4O_MINI_OUTPUT_PER_1M : 3;

  return {
    inputPerMillion: readNumberEnv('AI_MODEL_INPUT_COST_PER_1M_USD', defaultInput),
    outputPerMillion: readNumberEnv('AI_MODEL_OUTPUT_COST_PER_1M_USD', defaultOutput),
  };
}

export function estimateCostUsd(model: unknown, usage: UsageSnapshot) {
  const pricing = getModelPricing(model);
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

function normalizeUsage(result: unknown, fallbackInputTokens: number): UsageSnapshot {
  return aggregateGenerationUsage(result, fallbackInputTokens);
}

function enforcePreflightLimits(estimatedCostUsd: number, limits: LimitSnapshot) {
  const now = Date.now();
  const state = getState();
  const oneMinuteAgo = now - 60_000;
  const oneDayAgo = now - 24 * 60 * 60_000;

  state.requestTimestamps = state.requestTimestamps.filter((timestamp) => timestamp > oneDayAgo);

  const requestsLastMinute = state.requestTimestamps.filter((timestamp) => timestamp > oneMinuteAgo).length;
  if (limits.requestLimitPerMinute > 0 && requestsLastMinute >= limits.requestLimitPerMinute) {
    throw new AiGovernanceError(
      'Limita de cereri AI pe minut a fost atinsa. Incearca din nou peste cateva momente.',
      'AI_RATE_LIMIT_PER_MINUTE',
      429
    );
  }

  if (limits.requestLimitPerDay > 0 && state.requestTimestamps.length >= limits.requestLimitPerDay) {
    throw new AiGovernanceError(
      'Limita zilnica de cereri AI a fost atinsa.',
      'AI_RATE_LIMIT_PER_DAY',
      429
    );
  }

  if (limits.requestCostLimitUsd > 0 && estimatedCostUsd > limits.requestCostLimitUsd) {
    throw new AiGovernanceError(
      'Cererea AI depaseste plafonul estimat de cost pentru o singura cerere.',
      'AI_REQUEST_COST_LIMIT_USD',
      402
    );
  }

  const currentDaySpend = state.dailySpendUsd.get(dayKey()) ?? 0;
  if (limits.dailyCostLimitUsd > 0 && currentDaySpend + estimatedCostUsd > limits.dailyCostLimitUsd) {
    throw new AiGovernanceError(
      'Plafonul zilnic de cost AI ar fi depasit de aceasta cerere.',
      'AI_DAILY_COST_LIMIT_USD',
      402
    );
  }

  const currentMonthSpend = state.monthlySpendUsd.get(monthKey()) ?? 0;
  if (limits.monthlyCostLimitUsd > 0 && currentMonthSpend + estimatedCostUsd > limits.monthlyCostLimitUsd) {
    throw new AiGovernanceError(
      'Plafonul lunar de cost AI ar fi depasit de aceasta cerere.',
      'AI_MONTHLY_COST_LIMIT_USD',
      402
    );
  }
}

function recordRequestAndSpend(costUsd: number) {
  const state = getState();
  const today = dayKey();
  const thisMonth = monthKey();

  state.requestTimestamps.push(Date.now());
  state.dailySpendUsd.set(today, (state.dailySpendUsd.get(today) ?? 0) + costUsd);
  state.monthlySpendUsd.set(thisMonth, (state.monthlySpendUsd.get(thisMonth) ?? 0) + costUsd);
}

export function assertAllowedAiRequest(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    return;
  }

  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AiGovernanceError('Cererea AI are un header Origin invalid.', 'AI_ORIGIN_INVALID', 403);
  }

  if (originHost !== host) {
    throw new AiGovernanceError('Cererea AI a fost respinsa.', 'AI_ORIGIN_DENIED', 403);
  }
}

async function appendAuditRecord(record: Record<string, unknown>) {
  const serialized = stableStringify(record);
  const path = getAuditLogPath();

  if (path === 'console' || process.env.AI_AUDIT_LOG_TO_CONSOLE === 'true') {
    const { input, output, error, ...metadata } = record;
    console.info(`[AI_AUDIT] ${stableStringify({ ...metadata,
      inputHash: (input as { sha256?: string } | undefined)?.sha256,
      outputHash: (output as { sha256?: string } | undefined)?.sha256,
      error: redactSecrets(error) })}`);
  }

  if (path === 'console') {
    return;
  }

  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${serialized}\n`, 'utf8');
  } catch (error) {
    console.error('[AI_AUDIT_WRITE_FAILED]', error);
    if (process.env.AI_AUDIT_FAIL_CLOSED === 'true') {
      throw error;
    }
  }
}

function buildAuditInput(options: GenerateTextOptions, request: unknown) {
  const record = options as Record<string, unknown>;
  const input = {
    system: record.system,
    prompt: record.prompt,
    messages: record.messages,
    request: redactSecrets(request),
  };

  return {
    sha256: sha256(input),
  };
}

function buildAuditOutput(result: unknown) {
  const record = result as Record<string, unknown>;
  const output = {
    text: record.text,
    output: record.output,
  };

  return {
    sha256: sha256(output),
  };
}

export async function governedGenerateText(optionsWithMetadata: GovernedGenerateTextOptions): Promise<any> {
  const { runId, endpoint, operation, request, actorId, actorName, projectCode, month, year, ...options } = optionsWithMetadata;
  const id = `ai_${randomUUID()}`;
  const limits = getLimits();
  const model = aiModelId(options.model);
  const inputTokensEstimate = getInputTokenEstimate(options);
  const estimatedUsage = { inputTokens: inputTokensEstimate, outputTokens: getExpectedOutputTokens(options),
    totalTokens: inputTokensEstimate + getExpectedOutputTokens(options) };
  const estimatedCostUsd = estimateCostUsd(model, estimatedUsage);
  const retryLimit = Math.min(Math.max(options.maxRetries ?? 2, 0), 3);
  let retries = 0;
  let totalCostUsd = 0;
  const totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const result = await runMeteredAiCall({
    call: () => generateText({ ...options, maxRetries: 0 }), maxRetries: retryLimit,
    preflight: () => enforcePreflightLimits(estimatedCostUsd, limits),
    record: async (attempt) => {
      retries = attempt.retry;
      const usage = attempt.result ? normalizeUsage(attempt.result, inputTokensEstimate) : estimatedUsage;
      const costUsd = estimateCostUsd(model, usage);
      totalCostUsd += costUsd;
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      recordRequestAndSpend(costUsd);
      await appendAuditRecord({ id, runId, endpoint, operation, actorId, actorName, projectCode, month, year,
        createdAt: new Date().toISOString(), status: attempt.error ? 'error' : 'success', model,
        configuration: { maxOutputTokens: options.maxOutputTokens, temperature: options.temperature, retryLimit },
        retry: attempt.retry, durationMs: attempt.durationMs, usage, embeddingTokens: 0, costUsd,
        usageEstimated: !attempt.result, estimatedCostUsd, limits,
        input: buildAuditInput(options, request), output: attempt.result ? buildAuditOutput(attempt.result) : undefined,
        error: attempt.error instanceof Error ? { name: attempt.error.name } : undefined,
      });
    },
  });
  return Object.assign(result, { auditId: id, runId, retries, costUsd: totalCostUsd, usageAudit: {
    ...totalUsage, embeddingTokens: 0, retries, costUsd: totalCostUsd, model,
  } });
}

export async function governedEmbeddingCall<T extends { usage?: { tokens?: number } }>(options: {
  model: string; values: string[]; operation: string; runId?: string; actorId?: string; projectCode?: string; call: () => Promise<T>;
}) {
  const id = `embedding_${randomUUID()}`;
  const limits = getLimits();
  const estimatedTokens = options.values.reduce((sum, text) => sum + estimateTokens(text), 0);
  const price = readNumberEnv('AI_EMBEDDING_COST_PER_1M_USD', 0.02);
  return runMeteredAiCall({ call: options.call, maxRetries: 2,
    preflight: () => enforcePreflightLimits(estimatedTokens * price / 1_000_000, limits),
    record: async (attempt) => {
      const tokens = attempt.result?.usage?.tokens ?? estimatedTokens;
      const costUsd = tokens * price / 1_000_000;
      recordRequestAndSpend(costUsd);
      await appendAuditRecord({ id, runId: options.runId, operation: options.operation, model: options.model,
        actorId: options.actorId, projectCode: options.projectCode, createdAt: new Date().toISOString(),
        inputTokens: 0, outputTokens: 0, embeddingTokens: tokens, retry: attempt.retry,
        durationMs: attempt.durationMs, costUsd, usageEstimated: !attempt.result,
        status: attempt.error ? 'error' : 'success', documentHashes: options.values.map(sha256),
        error: attempt.error instanceof Error ? { name: attempt.error.name } : undefined });
    },
  });
}

export function aiErrorResponse(error: unknown, fallbackMessage: string) {
  if (isOpenAIConfigurationError(error)) {
    return NextResponse.json(
      {
        error: 'OPENAI_API_KEY lipseste din configuratia serverului.',
        code: 'OPENAI_API_KEY_MISSING',
      },
      { status: 500 }
    );
  }

  if (error instanceof AiGovernanceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status }
    );
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
