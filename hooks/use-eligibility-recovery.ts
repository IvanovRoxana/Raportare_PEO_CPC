'use client';
import { useEffect, useRef } from 'react';
import { lookupEligibilityRun, watchEligibilityRun } from '@/lib/eligibility-evaluation-client';
import type { EligibilityProgress } from '@/lib/eligibility-polling';
import type { DeliverableEligibilityCheck } from '@/lib/types';

/** Server lookup is authoritative; no document text or account data is stored in localStorage. */
export function useEligibilityRecovery(input: unknown, callbacks: {
  contextKey: string; busy: boolean; enabled: boolean; progress: (p: EligibilityProgress) => void;
  completed: (result: DeliverableEligibilityCheck) => void; failed: (error: unknown) => void;
  loading: (value: boolean) => void;
}) {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const body = input ? JSON.stringify(input) : '';
  const contextKey = callbacks.contextKey;
  useEffect(() => {
    if (!body || !latest.current.enabled || latest.current.busy) return;
    let current = true;
    let observing = false;
    void (async () => {
      try {
        const existing = await lookupEligibilityRun(body);
        if (!current || !existing.runId || latest.current.busy) return;
        observing = true; latest.current.loading(true);
        const result = await watchEligibilityRun(existing.runId, (p) => { if (current) latest.current.progress(p); }, () => current);
        if (current) latest.current.completed(result);
      } catch (error) { if (current && observing) latest.current.failed(error); }
      finally { if (current && observing) latest.current.loading(false); }
    })();
    return () => { current = false; };
  }, [body, contextKey]);
}
