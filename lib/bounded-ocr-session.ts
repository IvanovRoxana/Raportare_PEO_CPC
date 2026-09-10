export interface BoundedOcrWorker<Input> {
  recognize: (input: Input) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
}

export interface BoundedOcrResult {
  text: string | null;
  complete: boolean;
}

class OcrDeadlineError extends Error {
  constructor() { super('OCR processing exceeded its time budget.'); this.name = 'OcrDeadlineError'; }
}

async function withinDeadline<T>(operation: () => Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0 || signal?.aborted) throw new OcrDeadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal?.aborted) throw new OcrDeadlineError();
        return operation();
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OcrDeadlineError()), remaining); }),
      ...(signal ? [new Promise<never>((_, reject) => {
        onAbort = () => reject(new OcrDeadlineError());
        signal.addEventListener('abort', onAbort, { once: true });
      })] : []),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

/** One serial worker, with a shared document deadline and bounded cleanup after failure. */
export function createBoundedOcrSession<Input, Worker extends BoundedOcrWorker<Input> = BoundedOcrWorker<Input>>(options: {
  createWorker: () => Promise<Worker>;
  initializeWorker?: (worker: Worker) => Promise<unknown>;
  totalTimeoutMs?: number;
  operationTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}) {
  const deadline = Date.now() + Math.max(1, options.totalTimeoutMs ?? 120_000);
  const operationTimeoutMs = Math.max(1, options.operationTimeoutMs ?? 30_000);
  const cleanupTimeoutMs = Math.max(1, options.cleanupTimeoutMs ?? 1000);
  let worker: Worker | undefined;
  let workerPromise: Promise<Worker> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let queue = Promise.resolve();
  let stopped = false;
  const controller = new AbortController();

  function cleanupTask(operation: () => Promise<unknown>) {
    return withinDeadline(operation, Date.now() + cleanupTimeoutMs).then(() => undefined, () => undefined);
  }

  function terminateWorker(created: Worker) {
    cleanupPromise ??= cleanupTask(() => created.terminate());
    return cleanupPromise;
  }

  async function close() {
    stopped = true;
    controller.abort();
    if (worker) await terminateWorker(worker);
  }

  function isStopped() {
    return stopped || Date.now() >= deadline;
  }

  async function getWorker(operationDeadline: number) {
    workerPromise ??= Promise.resolve().then(options.createWorker).then((created) => {
      worker = created;
      // A createWorker promise can settle after its timeout; do not leak that late worker.
      if (stopped) void terminateWorker(created);
      return created;
    });
    const created = await withinDeadline(() => workerPromise!, operationDeadline, controller.signal);
    if (stopped) throw new OcrDeadlineError();
    return created;
  }

  let initialized = false;
  function recognize(input: Input): Promise<BoundedOcrResult> {
    const result = queue.then(async (): Promise<BoundedOcrResult> => {
      if (isStopped()) {
        await close();
        return { text: null, complete: false };
      }
      const operationDeadline = Math.min(deadline, Date.now() + operationTimeoutMs);
      try {
        const created = await getWorker(operationDeadline);
        if (!initialized) {
          if (options.initializeWorker) await withinDeadline(() => options.initializeWorker!(created), operationDeadline, controller.signal);
          initialized = true;
        }
        if (isStopped()) throw new OcrDeadlineError();
        const output = await withinDeadline(() => created.recognize(input), operationDeadline, controller.signal);
        return { text: output.data.text?.trim() || null, complete: true };
      } catch {
        await close();
        return { text: null, complete: false };
      }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  // Also bounds PDF loading/rendering, so a page cannot hang before OCR starts.
  async function runTask<T>(operation: () => Promise<T>, timeoutMs = operationTimeoutMs): Promise<T> {
    if (isStopped()) { await close(); throw new OcrDeadlineError(); }
    try {
      return await withinDeadline(operation, Math.min(deadline, Date.now() + Math.max(1, timeoutMs)), controller.signal);
    } catch (error) {
      if (error instanceof OcrDeadlineError) await close();
      throw error;
    }
  }

  return { recognize, runTask, cleanupTask, close, isStopped };
}
