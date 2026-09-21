import { eligibilityStageLabel } from './eligibility-job-policy.ts';
import type { DeliverableEligibilityCheck } from './types.ts';

export type EligibilityProgress = { runId: string; executionStatus: string; stage?: string; message: string; reconnecting?: boolean };
export type EligibilityRunResponse = { runId: string; executionStatus: string; stage?: string; current?: boolean;
  result?: DeliverableEligibilityCheck; errorCode?: string; diagnostic?: unknown };

export class EligibilityPollingStopped extends Error {}
export class EligibilityTransportError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function pollEligibilityRun(runId: string, options: {
  read: () => Promise<EligibilityRunResponse>; isCurrent: () => boolean;
  progress: (value: EligibilityProgress) => void; sleep?: (ms: number) => Promise<void>;
}) {
  let interval = 2000;
  const sleep = options.sleep || ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  while (options.isCurrent()) {
    let value: EligibilityRunResponse;
    try { value = await options.read(); }
    catch (error) {
      if (!options.isCurrent()) break;
      // Expired authentication pauses observation, never declares the durable job failed.
      options.progress({ runId, executionStatus: 'pending', reconnecting: true,
        message: error instanceof EligibilityTransportError && [401, 403].includes(error.status)
          ? 'Autentifică-te din nou pentru a consulta evaluarea.'
          : 'Conexiune întreruptă. Reconectare la evaluarea salvată…' });
      await sleep(interval); interval = Math.min(10_000, Math.round(interval * 1.5)); continue;
    }
    if (!options.isCurrent()) break;
    if (value.executionStatus === 'failed') throw new Error(`Evaluarea nu a produs un verdict. Cod: ${value.errorCode || 'ELIGIBILITY_EXECUTION_FAILED'}; evaluare: ${runId}. Reîncearcă verificarea.`);
    if (value.executionStatus === 'completed') {
      if (!value.current) throw new Error(`Contextul evaluării s-a modificat. Reia verificarea. Referință: ${runId}.`);
      if (!value.result || typeof value.result.summary !== 'string') throw new Error(`Rezultatul evaluării nu poate fi interpretat. Referință: ${runId}.`);
      return value.result;
    }
    options.progress({ runId, executionStatus: value.executionStatus, stage: value.stage, message: eligibilityStageLabel(value.stage) });
    await sleep(interval); interval = Math.min(10_000, Math.round(interval * 1.5));
  }
  throw new EligibilityPollingStopped('Contextul verificării s-a schimbat.');
}
