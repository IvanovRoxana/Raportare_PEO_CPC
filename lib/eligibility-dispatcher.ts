import 'server-only';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { eligibilityStore, eligibilityTable } from './eligibility-server-store.ts';
import { eligibilityRegion } from './eligibility-environment.ts';
import { expireEligibilityJob, getEligibilityJob, type EligibilityJob } from './eligibility-jobs.ts';
import { eligibilityJobAction, ELIGIBILITY_REDISPATCH_MS } from './eligibility-job-policy.ts';
import { isConditionalConflict } from './eligibility-runtime-store.ts';

const sqs = new SQSClient({ region: eligibilityRegion, maxAttempts: 2 });
export async function dispatchEligibilityJob(job: EligibilityJob) {
  const action = eligibilityJobAction(job, Date.now());
  if (action === 'none') return;
  try {
    if (action === 'fail') {
      await expireEligibilityJob(job);
      console.error(JSON.stringify({ event: 'ELIGIBILITY_JOB_EXPIRED', runId: job.runId, attempts: job.attempts }));
      return;
    }
    if (!process.env.ELIGIBILITY_QUEUE_URL) throw new Error('ELIGIBILITY_QUEUE_NOT_CONFIGURED');
    // Send before acknowledging: a crash can duplicate a message, but cannot lose a job.
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.ELIGIBILITY_QUEUE_URL, MessageBody: JSON.stringify({ runId: job.runId }) }));
    await eligibilityStore.transact([{ Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: job.id },
      UpdateExpression: 'SET nextDispatchAt = :next', ConditionExpression: 'nextDispatchAt = :old AND attempts = :attempts AND (#state = :pending OR (#state = :running AND leaseUntil <= :now))',
      ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':next': Date.now() + ELIGIBILITY_REDISPATCH_MS,
        ':old': job.nextDispatchAt, ':attempts': job.attempts, ':pending': 'pending', ':running': 'running', ':now': Date.now() } } }]);
  } catch (error) { if (!isConditionalConflict(error)) throw error; }
}

export async function dispatchEligibility(event: { Records?: Array<{ eventID?: string; dynamodb?: { SequenceNumber?: string; Keys?: { id?: { S?: string } } } }> }) {
  if (event.Records) {
    const batchItemFailures: { itemIdentifier: string }[] = [];
    for (const record of event.Records) {
      const id = record.dynamodb?.Keys?.id?.S;
      if (!id?.startsWith('job:')) continue;
      try { const job = await getEligibilityJob(id.slice(4)); if (job) await dispatchEligibilityJob(job); }
      catch { batchItemFailures.push({ itemIdentifier: record.dynamodb?.SequenceNumber || record.eventID! }); }
    }
    return { batchItemFailures };
  }
  // Scheduled sweep also covers stream expiry, missed deliveries and terminated workers.
  const jobs = await eligibilityStore.list<EligibilityJob>('EligibilityRuntime', { field: 'kind', value: 'eligibility-job' });
  let failures = 0;
  for (const job of jobs) {
    try { await dispatchEligibilityJob(job); }
    catch { failures++; console.error(JSON.stringify({ event: 'ELIGIBILITY_DISPATCH_FAILED', runId: job.runId })); }
  }
  if (failures) throw new Error('ELIGIBILITY_DISPATCH_FAILED');
  return { checked: jobs.length };
}
