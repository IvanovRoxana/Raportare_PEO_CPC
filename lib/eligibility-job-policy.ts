/** Shared, deterministic policy: SQS redelivery is not an extra evaluation attempt. */
export const ELIGIBILITY_JOB_MAX_ATTEMPTS = 3;
export const ELIGIBILITY_JOB_LEASE_MS = 90_000;
export const ELIGIBILITY_JOB_TIMEOUT_MS = 240_000;
export const ELIGIBILITY_JOB_DEADLINE_MS = 30 * 60_000;
export const ELIGIBILITY_REDISPATCH_MS = 120_000;

export function eligibilityRetryable(error: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  const e = error as { code?: string; name?: string; status?: number; statusCode?: number; $metadata?: { httpStatusCode?: number };
    data?: { error?: { code?: string } }; cause?: unknown; lastError?: unknown };
  // Domain failures (including cost budgets and malformed findings) are never retried.
  if (e?.code?.startsWith('ELIGIBILITY_')) return e.code === 'ELIGIBILITY_TIMEOUT';
  if (e?.name === 'EligibilityAccessError') return false;
  if (['insufficient_quota', 'invalid_json_schema', 'context_length_exceeded', 'model_not_found', 'OPENAI_API_KEY_MISSING'].includes(e?.data?.error?.code || e?.code || '')) return false;
  const status = e?.statusCode ?? e?.status ?? e?.$metadata?.httpStatusCode;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
    || ['TimeoutError', 'AbortError', 'ThrottlingException', 'ProvisionedThroughputExceededException',
      'RequestTimeout', 'ServiceUnavailable', 'InternalServerError'].includes(e?.name || '')
    || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(e?.code || '')
    || Boolean((e?.cause || e?.lastError) && eligibilityRetryable(e.cause || e.lastError, depth + 1));
}

export function eligibilityJobAction(job: { state: string; attempts: number; leaseUntil?: number; nextDispatchAt: number; deadline: number }, now: number) {
  if (job.state === 'completed' || job.state === 'failed') return 'none';
  if (job.state === 'running' && (job.leaseUntil || 0) > now) return 'none';
  if (now >= job.deadline || job.attempts >= ELIGIBILITY_JOB_MAX_ATTEMPTS) return 'fail';
  return job.nextDispatchAt <= now ? 'dispatch' : 'none';
}

export const eligibilityStageLabel = (stage?: string) => stage === 'model' ? 'Evaluare'
  : ['result_validation', 'revalidation', 'save'].includes(stage || '') ? 'Validare rezultat'
    : !stage || stage === 'queued' ? 'În așteptare' : 'Pregătire documente';
