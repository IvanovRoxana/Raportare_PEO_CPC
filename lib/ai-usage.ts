export type AiUsage = { inputTokens: number; outputTokens: number; embeddingTokens: number };

/** AI SDK usage is the final step; totalUsage already includes every step. Never add both. */
export function aggregateGenerationUsage(result: unknown, fallbackInputTokens = 0) {
  const value = result as { totalUsage?: Record<string, unknown>; usage?: Record<string, unknown> };
  const usage = value?.totalUsage ?? value?.usage ?? {};
  const safe = (n: unknown, fallback: number) => Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : fallback;
  const inputTokens = safe(usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens, fallbackInputTokens);
  const outputTokens = safe(usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens, 0);
  return { inputTokens, outputTokens, totalTokens: safe(usage.totalTokens ?? usage.total_tokens, inputTokens + outputTokens) };
}
export function aiModelId(model: unknown) {
  return typeof model === 'string' ? model : model && typeof model === 'object' && 'modelId' in model ? String(model.modelId) : 'unknown';
}
export function estimateAiUsageCost(usage: AiUsage, prices: { input: number; output: number; embedding: number }) {
  return (usage.inputTokens * prices.input + usage.outputTokens * prices.output + usage.embeddingTokens * prices.embedding) / 1_000_000;
}
/** Own retries so every attempt is observable; provider SDK retries must be disabled. */
export async function runMeteredAiCall<T>(options: {
  call: () => Promise<T>; maxRetries: number;
  preflight: () => void;
  record: (attempt: { retry: number; durationMs: number; result?: T; error?: unknown }) => Promise<void>;
}) {
  for (let retry = 0; ; retry++) {
    options.preflight();
    const start = Date.now();
    let result: T;
    try { result = await options.call(); }
    catch (error) {
      await options.record({ retry, durationMs: Date.now() - start, error });
      if (retry >= options.maxRetries || (error instanceof Error && /Abort|Timeout/.test(error.name))) throw error;
      continue;
    }
    await options.record({ retry, durationMs: Date.now() - start, result });
    return result;
  }
}
