import 'server-only';
import { randomUUID } from 'node:crypto';
import { eligibilityStore, eligibilityTable } from './eligibility-server-store.ts';
import { EligibilityExecutionError } from './eligibility-execution.ts';

export function isConditionalConflict(error: unknown) {
  const value = error as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  return value?.name === 'ConditionalCheckFailedException' || value?.name === 'TransactionCanceledException'
    && value.CancellationReasons?.some((reason) => reason.Code === 'ConditionalCheckFailed');
}

export async function reserveEvaluation(key: string, runId: string) {
  const now = Date.now();
  try {
    await eligibilityStore.transact([{ Put: { TableName: eligibilityTable('EligibilityRuntime'),
      Item: { id: `run:${key}`, runId, expiresAt: now + 180_000 },
      ConditionExpression: 'attribute_not_exists(id) OR expiresAt < :now', ExpressionAttributeValues: { ':now': now },
    } }]);
    return { acquired: true, runId };
  } catch (error) {
    if (!isConditionalConflict(error)) throw error;
    const existing = await eligibilityStore.get<{ runId: string }>('EligibilityRuntime', `run:${key}`);
    if (!existing) throw error;
    return { acquired: false, runId: existing.runId };
  }
}

export async function releaseEvaluation(key: string, runId: string) {
  await eligibilityStore.transact([{ Delete: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: `run:${key}` },
    ConditionExpression: 'runId = :run', ExpressionAttributeValues: { ':run': runId },
  } }]);
}

/** Reserve the entire allowed run cost before billing; a crashed run conservatively keeps its reservation. */
export async function reserveEligibilityBudget(projectCode: string, ceilingUsd: number) {
  const reservationId = randomUUID();
  const now = new Date();
  const amount = Math.ceil(ceilingUsd * 1_000_000);
  const positive = (value: string | undefined, fallback: number) => Number(value) > 0 ? Number(value) : fallback;
  const keys = [
    { id: `budget:day:${projectCode}:${now.toISOString().slice(0, 10)}`, limit: positive(process.env.AI_DAILY_COST_LIMIT_USD, 25) },
    { id: `budget:month:${projectCode}:${now.toISOString().slice(0, 7)}`, limit: positive(process.env.AI_MONTHLY_COST_LIMIT_USD, 300) },
  ];
  const slots = Math.min(10, Math.floor(positive(process.env.ELIGIBILITY_MAX_CONCURRENT, 3)));
  if (keys.some(({ limit }) => ceilingUsd > limit)) throw new EligibilityExecutionError('ELIGIBILITY_SHARED_BUDGET', 'Bugetul unei evaluari depaseste plafonul proiectului.', 429);
  for (let slot = 0; slot < slots; slot++) {
    const slotId = `slot:${projectCode}:${slot}`;
    try {
      await eligibilityStore.transact([
        { Put: { TableName: eligibilityTable('EligibilityRuntime'), Item: { id: slotId, reservationId, expiresAt: Date.now() + 180_000 },
          ConditionExpression: 'attribute_not_exists(id) OR expiresAt < :now', ExpressionAttributeValues: { ':now': Date.now() } } },
        ...keys.map(({ id, limit }) => ({ Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id },
          UpdateExpression: 'ADD reservedMicros :amount',
          ConditionExpression: 'attribute_not_exists(reservedMicros) OR reservedMicros <= :available',
          ExpressionAttributeValues: { ':amount': amount, ':available': Math.floor(limit * 1_000_000) - amount },
        } })),
      ]);
      let settled = false;
      return async (actualUsd?: number) => {
        if (settled) return;
        // Unknown consumption retains the full reservation rather than recording zero.
        const refund = actualUsd === undefined ? 0 : Math.max(0, amount - Math.ceil(actualUsd * 1_000_000));
        await eligibilityStore.transact([
          { Delete: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id: slotId },
            ConditionExpression: 'reservationId = :id', ExpressionAttributeValues: { ':id': reservationId } } },
          ...keys.map(({ id }) => ({ Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id },
            UpdateExpression: 'ADD reservedMicros :refund', ExpressionAttributeValues: { ':refund': -refund },
          } })),
        ]);
        settled = true;
      };
    } catch (error) { if (!isConditionalConflict(error)) throw error; }
  }
  throw new EligibilityExecutionError('ELIGIBILITY_SHARED_BUDGET', 'Limita de concurenta sau bugetul partajat al proiectului este atins.', 429);
}
