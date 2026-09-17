export class EligibilityExecutionError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 422) { super(message); this.name = 'EligibilityExecutionError'; this.code = code; this.status = status; }
}

export type EligibilityExecutionLimits = { modelCalls: number; toolCalls: number; totalTokens: number; timeoutMs: number; costUsd: number };
const numberSetting = (env: Record<string, string | undefined>, name: string, fallback: number, max: number) => {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback;
};
export function eligibilityExecutionLimits(env = process.env): EligibilityExecutionLimits {
  return {
    modelCalls: Math.floor(numberSetting(env, 'ELIGIBILITY_MAX_MODEL_CALLS', 5, 10)),
    toolCalls: Math.floor(numberSetting(env, 'ELIGIBILITY_MAX_TOOL_CALLS', 10, 30)),
    totalTokens: Math.floor(numberSetting(env, 'ELIGIBILITY_MAX_TOKENS', 120_000, 500_000)),
    timeoutMs: numberSetting(env, 'ELIGIBILITY_TIMEOUT_MS', 50_000, 55_000),
    costUsd: numberSetting(env, 'ELIGIBILITY_MAX_COST_USD', 1, 10),
  };
}

export class EligibilityExecutionBudget {
  modelCalls = 0; toolCalls = 0; totalTokens = 0; inputTokens = 0; outputTokens = 0; costUsd = 0; usageComplete = true;
  readonly startedAt = Date.now();
  readonly limits: EligibilityExecutionLimits;
  constructor(limits: EligibilityExecutionLimits) { this.limits = limits; }
  checkTime() {
    if (Date.now() - this.startedAt >= this.limits.timeoutMs) throw new EligibilityExecutionError('ELIGIBILITY_TIMEOUT', 'Evaluarea a depasit timpul disponibil.', 504);
  }
  model(estimatedTokens: number, estimatedCost: number) {
    this.checkTime();
    if (!this.usageComplete || this.modelCalls >= this.limits.modelCalls || this.totalTokens + estimatedTokens > this.limits.totalTokens
      || this.costUsd + estimatedCost > this.limits.costUsd) throw new EligibilityExecutionError('ELIGIBILITY_BUDGET_EXHAUSTED', 'Bugetul evaluarii nu permite un nou apel AI.', 429);
    this.modelCalls++;
  }
  tool() {
    this.checkTime();
    if (this.toolCalls >= this.limits.toolCalls) throw new EligibilityExecutionError('ELIGIBILITY_TOOL_LIMIT', 'Limita consultarilor a fost atinsa.', 429);
    this.toolCalls++;
  }
  record(tokens: number, cost: number, inputTokens = 0, outputTokens = 0) {
    this.totalTokens += tokens; this.costUsd += cost; this.inputTokens += inputTokens; this.outputTokens += outputTokens;
    if (!tokens) this.usageComplete = false;
  }
  snapshot() { return { modelCalls: this.modelCalls, toolCalls: this.toolCalls, totalTokens: this.totalTokens, inputTokens: this.inputTokens, outputTokens: this.outputTokens, costUsd: this.costUsd, usageComplete: this.usageComplete, durationMs: Date.now() - this.startedAt }; }
}

export function resolveEligibilityPeriod(input: { activityDates?: unknown; month?: unknown; year?: unknown }, evaluatedAt: string, policy = 'evaluation_time') {
  // Reporting calendars and API callers use JavaScript month indices: January = 0.
  const month = input.month == null ? undefined : Number(input.month);
  const year = input.year == null ? undefined : Number(input.year);
  const isPeriodNumber = (value: unknown) => typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value);
  if (month !== undefined && (!isPeriodNumber(input.month) || !Number.isInteger(month) || month < 0 || month > 11)
    || year !== undefined && (!isPeriodNumber(input.year) || !Number.isInteger(year) || year < 1 || year > 9999)) {
    throw new EligibilityExecutionError('ELIGIBILITY_PERIOD_INVALID', 'Luna sau anul raportarii nu sunt valide. Selecteaza din nou perioada in calendar.');
  }
  const dates = Array.isArray(input.activityDates) ? [...new Set(input.activityDates.map(String))].sort() : [];
  if (dates.length > 31 || dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(`${date}T12:00:00.000Z`).toISOString().slice(0, 10) !== date)) {
    throw new EligibilityExecutionError('ELIGIBILITY_PERIOD_INVALID', 'Datele activitatii nu sunt valide.');
  }
  const outsidePeriod = dates.filter((date) => month !== undefined && Number(date.slice(5, 7)) !== month + 1
    || year !== undefined && Number(date.slice(0, 4)) !== year);
  if (outsidePeriod.length) throw new EligibilityExecutionError('ELIGIBILITY_PERIOD_INVALID',
    `Datele ${outsidePeriod.join(', ')} nu corespund perioadei raportate (luna ${month === undefined ? 'nespecificata' : month + 1}, anul ${year ?? 'nespecificat'}). Corecteaza zilele selectate sau perioada din calendar.`);
  if (!['evaluation_time', 'activity_date'].includes(policy)) throw new EligibilityExecutionError('ELIGIBILITY_TIME_POLICY_INVALID', 'Politica temporala necesita configurare.', 503);
  if (policy === 'activity_date' && !dates.length) throw new EligibilityExecutionError('ELIGIBILITY_PERIOD_REQUIRED', 'Selecteaza datele activitatii inainte de verificare.');
  return { evaluatedAt, policy, activityDates: dates, rulesEffectiveAt: policy === 'activity_date' ? `${dates[0]}T12:00:00.000Z` : evaluatedAt };
}
