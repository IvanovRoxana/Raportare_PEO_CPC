import 'server-only';
import { eligibilityStore } from './eligibility-server-store.ts';
import { authenticateEligibilityRequest, resolveEligibilityContext } from './eligibility-resolver.ts';
import type { EligibilityActor } from './eligibility-authorization.ts';
import { EligibilityAccessError } from './eligibility-authorization.ts';
import { evaluationHash, applicableCriteriaSnapshot, ELIGIBILITY_MODEL_CONFIGURATION } from './eligibility-evaluation.ts';
import { parseExecutableRuleset } from './eligibility-rules.ts';
import { getActiveAiEligibilityRuleset } from './ai-eligibility-ruleset-runtime.ts';
import { getEligibilityModelName } from './openai.ts';
import { eligibilityExecutionLimits } from './eligibility-execution.ts';
import { ELIGIBILITY_ASSESSMENT_VERSION } from './eligibility-assessment.ts';
import type { EligibilityRun } from './eligibility-run-store.ts';
import type { Activity, Deliverable, ActivityCatalog } from './types.ts';
import { scopeEligibilityCatalog } from './eligibility-catalog.ts';
import { eligibilityActivityManifest } from './eligibility-binding.ts';

export async function readAuthorizedEligibilityRun(request: Request, runId: string) {
  const actor = await authenticateEligibilityRequest(request);
  const run = await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', runId);
  if (!run) throw new EligibilityAccessError('Evaluarea nu exista.', 404);
  const verified = await verifyEligibilityRunSnapshot(request, run, actor);
  return { run, resolved: verified.resolved, current: run.authoritative && run.status === 'completed' && verified.current };
}

export async function verifyEligibilityRunSnapshot(request: Request, run: EligibilityRun, actor?: EligibilityActor) {
  const documents = run.inputSnapshot.documents as Array<{ id: string; hash: string; fileHash?: string; documentTitle?: string; deliverableType?: string }>;
  const resolved = await resolveEligibilityContext(request, { expertId: run.expertId, projectCode: run.projectCode, saCode: run.saCode, documentIds: documents.map((doc) => doc.id), historical: true, loadReferenceChunks: false }, actor);
  const period = run.inputSnapshot.period as { policy?: string; rulesEffectiveAt?: string; activityDates?: string[] } | undefined;
  const at = period?.policy === 'activity_date' ? period.rulesEffectiveAt : new Date().toISOString();
  const activeRules = await getActiveAiEligibilityRuleset({ projectCode: run.projectCode, at, knownAt: new Date().toISOString() });
  let periodCurrent = true;
  if (period?.policy === 'activity_date') for (const date of period.activityDates?.slice(1) || []) {
    const dateAt = date + 'T12:00:00.000Z';
    const dateRules = await getActiveAiEligibilityRuleset({ projectCode: run.projectCode, at: dateAt, knownAt: new Date().toISOString() });
    const context = { projectCode: run.projectCode, roleId: resolved.roleId, category: resolved.expert.category || '', saCode: run.saCode,
      activityId: (run.inputSnapshot.finalActivityId || run.inputSnapshot.selectedActivityId) as string | undefined,
      deliverableTypes: documents.map((doc) => doc.deliverableType || '') };
    periodCurrent = periodCurrent && evaluationHash(dateRules) === evaluationHash(activeRules)
      && evaluationHash(applicableCriteriaSnapshot(dateRules ? parseExecutableRuleset(dateRules.rulesJson) : null, { ...context, at: dateAt }))
      === evaluationHash(applicableCriteriaSnapshot(activeRules ? parseExecutableRuleset(activeRules.rulesJson) : null, { ...context, at: at! }));
  }
  const catalog = await eligibilityStore.list<ActivityCatalog>('ActivityCatalog');
  let bindingCurrent = true;
  for (const binding of run.activityBindings || (run.activityBinding ? [run.activityBinding] : [])) {
    const activity = await eligibilityStore.get<Activity>('Activity', binding.activityId);
    const savedDocuments = await eligibilityStore.list<Deliverable>('Deliverable', { field: 'activityId', value: binding.activityId });
    bindingCurrent = bindingCurrent && Boolean(activity && activity.expertId === run.expertId && activity.projectCode === run.projectCode
      && activity.date === binding.date && activity.saCode === binding.saCode && activity.catalogActivityId === binding.catalogActivityId
      && binding.documents.every((expected) => savedDocuments.some((doc) => (doc.id === expected.id || doc.documentId === expected.id) && doc.fileHash === expected.fileHash))
      && (!binding.manifestHash || binding.manifestHash === eligibilityActivityManifest(savedDocuments)));
  }
  const sources = resolved.parents.map((doc) => ({ id: doc.id, version: doc.documentVersionId, generation: doc.publishedGeneration, hash: doc.textHash })).sort((a, b) => a.id.localeCompare(b.id));
  const current = periodCurrent && bindingCurrent && resolved.expert.saCodes?.includes(run.saCode) === true && run.inputSnapshot.expert === evaluationHash(resolved.expert)
    && (run.inputSnapshot.scopedCatalogHash
      ? run.inputSnapshot.scopedCatalogHash === evaluationHash(scopeEligibilityCatalog(catalog, resolved.expert).sort((a, b) => a.id.localeCompare(b.id)))
      : run.inputSnapshot.fullCatalogHash === evaluationHash(catalog.sort((a, b) => a.id.localeCompare(b.id))))
    && run.inputSnapshot.rules === evaluationHash(activeRules)
    && evaluationHash(run.inputSnapshot.applicableCriteria) === evaluationHash(applicableCriteriaSnapshot(activeRules ? parseExecutableRuleset(activeRules.rulesJson) : null, {
      projectCode: run.projectCode, roleId: resolved.roleId, category: resolved.expert.category || '', saCode: run.saCode, at: at!,
      activityId: run.inputSnapshot.selectedActivityId as string | undefined,
      deliverableTypes: documents.map((doc) => doc.deliverableType || ''),
    }))
    && evaluationHash(run.inputSnapshot.configuration) === evaluationHash(ELIGIBILITY_MODEL_CONFIGURATION)
    && (!run.inputSnapshot.finalApplicableCriteria || evaluationHash(run.inputSnapshot.finalApplicableCriteria) === evaluationHash(applicableCriteriaSnapshot(activeRules ? parseExecutableRuleset(activeRules.rulesJson) : null, {
      projectCode: run.projectCode, roleId: resolved.roleId, category: resolved.expert.category || '', saCode: run.saCode, at: at!,
      activityId: run.inputSnapshot.finalActivityId as string | undefined, deliverableTypes: documents.map((doc) => doc.deliverableType || ''),
    })))
    && evaluationHash(run.inputSnapshot.sources) === evaluationHash(sources)
    && run.inputSnapshot.model === getEligibilityModelName() && run.inputSnapshot.evaluatorVersion === ELIGIBILITY_ASSESSMENT_VERSION
    && (!period || period.policy === (process.env.ELIGIBILITY_RULES_TIME_POLICY || 'evaluation_time'))
    && (!run.inputSnapshot.executionLimits || evaluationHash(run.inputSnapshot.executionLimits) === evaluationHash(eligibilityExecutionLimits()))
    && documents.every((expected, i) => {
      const actual = resolved.documents[i];
      return actual && expected.hash === evaluationHash(actual.docText) && expected.fileHash === actual.fileHash
        && expected.documentTitle === (actual.declaredTitle || actual.docTitle || actual.originalFileName || actual.fileName)
        && expected.deliverableType === (actual.deliverableType || '');
    });
  return { run, resolved, current };
}
