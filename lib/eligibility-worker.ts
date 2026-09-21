import 'server-only';
import { getEligibilityJob, claimEligibilityJob, heartbeatEligibilityJob, failOrRetryEligibilityJob } from './eligibility-jobs.ts';
import { eligibilityStore } from './eligibility-server-store.ts';
import { readEligibilityWorkerActor } from './eligibility-worker-actor.ts';
import { resolveEligibilityContext } from './eligibility-resolver.ts';
import { eligibilityDocumentVersions } from './eligibility-job-input.ts';
import { evaluationHash } from './eligibility-evaluation.ts';
import { evaluateEligibility } from './eligibility-service.ts';
import { diagnoseEvaluationError, type EvaluationDiagnosticContext } from './eligibility-evaluation-diagnostics.ts';
import { EligibilityExecutionError, abortableEligibilityRead } from './eligibility-execution.ts';
import { eligibilityRetryable, ELIGIBILITY_JOB_TIMEOUT_MS } from './eligibility-job-policy.ts';
import type { EligibilityRun } from './eligibility-run-store.ts';
import { isConditionalConflict } from './eligibility-runtime-store.ts';

export async function executeEligibilityJob(runId: string) {
  const queued = await getEligibilityJob(runId);
  if (!queued || ['completed', 'failed'].includes(queued.state)) return;
  const job = await claimEligibilityJob(queued);
  if (!job) return;
  const diagnostic: EvaluationDiagnosticContext = { stage: 'context', runId };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new EligibilityExecutionError('ELIGIBILITY_TIMEOUT', 'Evaluarea a depasit timpul disponibil.', 504)), ELIGIBILITY_JOB_TIMEOUT_MS);
  let stopped = false;
  let heartbeat = Promise.resolve();
  const pulse = (stage: EvaluationDiagnosticContext['stage']) => {
    heartbeat = heartbeat.then(async () => {
      controller.signal.throwIfAborted();
      await heartbeatEligibilityJob(job, stage);
    });
    return heartbeat;
  };
  const timer = setInterval(() => {
    if (!stopped) void pulse(diagnostic.stage).catch((error) => controller.abort(error));
  }, 20_000);
  let lastStage = 'queued', lastStageAt = Date.now();
  let failureAudit: Record<string, unknown> = {};
  try {
    const actor = await readEligibilityWorkerActor(job.identity);
    const req = new Request('https://eligibility.internal/evaluate', { method: 'POST', body: JSON.stringify(job.input), signal: controller.signal });
    const resolved = await resolveEligibilityContext(req, { expertId: job.input.expertId, projectCode: job.input.projectCode,
      saCode: job.input.currentSaCode, documentIds: job.input.deliverables.map((d) => d.serverDocumentId), metadataOnly: true, loadReferenceChunks: false }, actor);
    const versions = { documents: eligibilityDocumentVersions(resolved.documents), expert: evaluationHash(resolved.expert),
      sources: evaluationHash(resolved.parents.map((d) => ({ id: d.id, version: d.documentVersionId, generation: d.publishedGeneration, hash: d.textHash })).sort((a,b) => a.id.localeCompare(b.id))) };
    if (evaluationHash(versions) !== evaluationHash(job.versions)) throw new EligibilityExecutionError('ELIGIBILITY_STALE', 'Documentele sau contextul s-au modificat. Porneste o evaluare noua.', 409);
    const run = await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', runId);
    if (!run) throw new Error('ELIGIBILITY_RUN_MISSING');
    await abortableEligibilityRead(controller.signal, () => evaluateEligibility(req, diagnostic, { run, job, actor,
      authorizeActor: () => readEligibilityWorkerActor(job.identity),
      failureAudit: (audit) => { failureAudit = audit; },
      progress: async (stage) => {
        controller.signal.throwIfAborted();
        await pulse(stage);
        console.info(JSON.stringify({ event: 'ELIGIBILITY_STAGE', runId, attempt: job.attempts, stage, previousStage: lastStage, durationMs: Date.now() - lastStageAt }));
        lastStage = stage; lastStageAt = Date.now();
      },
    }));
    console.info(JSON.stringify({ event: 'ELIGIBILITY_COMPLETED', runId, attempt: job.attempts }));
  } catch (error) {
    const failure = diagnoseEvaluationError(error, diagnostic);
    // Losing the lease forbids every subsequent write, including failure writes.
    try { await failOrRetryEligibilityJob(job, failure, eligibilityRetryable(error), failureAudit); }
    catch (writeError) { if (!isConditionalConflict(writeError)) throw writeError; }
    console.error(JSON.stringify({ event: 'ELIGIBILITY_JOB_ATTEMPT_FAILED', runId, attempt: job.attempts, code: failure.code, stage: diagnostic.stage }));
  } finally {
    stopped = true; clearInterval(timer); clearTimeout(timeout);
    await heartbeat.catch(() => undefined);
  }
}

export async function eligibilityWorkerHandler(event: { Records: Array<{ messageId: string; body: string }> }) {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const { runId } = JSON.parse(record.body);
      if (typeof runId !== 'string' || !/^elg_[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid job envelope');
      await executeEligibilityJob(runId);
    } catch { batchItemFailures.push({ itemIdentifier: record.messageId }); }
  }
  return { batchItemFailures };
}
