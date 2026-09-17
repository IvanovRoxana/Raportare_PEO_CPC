import { NextResponse } from 'next/server';
import { readAuthorizedEligibilityRun } from '@/lib/eligibility-run-read';
import { eligibilityStore, eligibilityTable } from '@/lib/eligibility-server-store';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { assertAllowedAiRequest } from '@/lib/ai-governance';
import type { Activity, Deliverable } from '@/lib/types';
import { eligibilityActivityManifest } from '@/lib/eligibility-binding';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const { run, current } = await readAuthorizedEligibilityRun(req, String(body.runId || ''));
    const activity = await eligibilityStore.get<Activity>('Activity', String(body.activityId || ''));
    if (!current || !activity || activity.expertId !== run.expertId || activity.projectCode !== run.projectCode || activity.saCode !== run.saCode) {
      throw new EligibilityAccessError('Evaluarea nu poate fi asociata acestui dosar. Reia verificarea in contextul salvat.', 409);
    }
    const period = run.inputSnapshot.period as { activityDates?: string[] } | undefined;
    if (period?.activityDates?.length && !period.activityDates.includes(activity.date)) throw new EligibilityAccessError('Data dosarului difera de perioada evaluata.', 409);
    const classifiedId = run.resultJson?.classification?.activityId;
    if (classifiedId && activity.catalogActivityId !== classifiedId) throw new EligibilityAccessError('Incadrarea dosarului s-a modificat. Reia verificarea.', 409);
    const documents = await eligibilityStore.list<Deliverable>('Deliverable', { field: 'activityId', value: activity.id });
    const expected = run.inputSnapshot.documents as Array<{ id: string; fileHash: string }>;
    if (!expected.every((item) => documents.some((doc) => (doc.id === item.id || doc.documentId === item.id) && doc.fileHash === item.fileHash))) {
      throw new EligibilityAccessError('Documentele salvate difera de cele evaluate.', 409);
    }
    const binding = { activityId: activity.id, date: activity.date, saCode: activity.saCode, catalogActivityId: activity.catalogActivityId,
      documents: expected, manifestHash: eligibilityActivityManifest(documents) };
    const previous = run.activityBindings;
    const bindings = [...(previous || (run.activityBinding ? [run.activityBinding] : [])).filter((item) => item.activityId !== activity.id), binding];
    await eligibilityStore.transact([{ Update: { TableName: eligibilityTable('EligibilityEvaluationRun'), Key: { id: run.id },
      UpdateExpression: 'SET activityBindings = :bindings', ConditionExpression: '#status = :completed AND evaluationKey = :key AND '
        + (previous ? 'activityBindings = :previous' : 'attribute_not_exists(activityBindings)'),
      ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':bindings': bindings, ':completed': 'completed', ':key': run.evaluationKey,
        ...(previous ? { ':previous': previous } : {}) },
    } }]);
    return NextResponse.json({ runId: run.runId, activityId: activity.id, bound: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EligibilityAccessError ? error.message : 'Activitatea este salvata, dar asocierea evaluarii necesita reluare.' },
      { status: error instanceof EligibilityAccessError ? error.status : 503 });
  }
}
