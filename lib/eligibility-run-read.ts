import 'server-only';
import { eligibilityStore } from './eligibility-server-store.ts';
import { authenticateEligibilityRequest, resolveEligibilityContext } from './eligibility-resolver.ts';
import type { EligibilityActor } from './eligibility-authorization.ts';
import { EligibilityAccessError } from './eligibility-authorization.ts';
import { evaluationHash, applicableCriteriaSnapshot, ELIGIBILITY_MODEL_CONFIGURATION } from './eligibility-evaluation.ts';
import { parseExecutableRuleset } from './eligibility-rules.ts';
import { getActiveAiEligibilityRuleset } from './ai-eligibility-ruleset-runtime.ts';
import { DEFAULT_OPENAI_MODEL } from './openai.ts';
import { ELIGIBILITY_ASSESSMENT_VERSION } from './eligibility-assessment.ts';
import type { EligibilityRun } from './eligibility-run-store.ts';

export async function readAuthorizedEligibilityRun(request: Request, runId: string) {
  const actor = await authenticateEligibilityRequest(request);
  const run = await eligibilityStore.get<EligibilityRun>('EligibilityEvaluationRun', runId);
  if (!run) throw new EligibilityAccessError('Evaluarea nu exista.', 404);
  const verified = await verifyEligibilityRunSnapshot(request, run, actor);
  return { run, resolved: verified.resolved, current: run.authoritative && run.status === 'completed' && verified.current };
}

export async function verifyEligibilityRunSnapshot(request: Request, run: EligibilityRun, actor?: EligibilityActor) {
  const documents = run.inputSnapshot.documents as Array<{ id: string; hash: string; fileHash?: string; documentTitle?: string; deliverableType?: string }>;
  const resolved = await resolveEligibilityContext(request, { expertId: run.expertId, projectCode: run.projectCode, saCode: run.saCode, documentIds: documents.map((doc) => doc.id), historical: true }, actor);
  const activeRules = await getActiveAiEligibilityRuleset({ projectCode: run.projectCode });
  const catalog = await eligibilityStore.list('ActivityCatalog');
  const sources = resolved.parents.map((doc) => ({ id: doc.id, version: doc.documentVersionId, generation: doc.publishedGeneration, hash: doc.textHash })).sort((a, b) => a.id.localeCompare(b.id));
  const current = resolved.expert.saCodes?.includes(run.saCode) === true && run.inputSnapshot.expert === evaluationHash(resolved.expert)
    && run.inputSnapshot.fullCatalogHash === evaluationHash(catalog.sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))))
    && run.inputSnapshot.rules === evaluationHash(activeRules)
    && evaluationHash(run.inputSnapshot.applicableCriteria) === evaluationHash(applicableCriteriaSnapshot(activeRules ? parseExecutableRuleset(activeRules.rulesJson) : null, {
      projectCode: run.projectCode, roleId: resolved.roleId, category: resolved.expert.category || '', saCode: run.saCode, at: new Date().toISOString(),
    }))
    && evaluationHash(run.inputSnapshot.configuration) === evaluationHash(ELIGIBILITY_MODEL_CONFIGURATION)
    && evaluationHash(run.inputSnapshot.sources) === evaluationHash(sources)
    && run.inputSnapshot.model === DEFAULT_OPENAI_MODEL && run.inputSnapshot.evaluatorVersion === ELIGIBILITY_ASSESSMENT_VERSION
    && documents.every((expected, i) => {
      const actual = resolved.documents[i];
      return actual && expected.hash === evaluationHash(actual.docText) && expected.fileHash === actual.fileHash
        && expected.documentTitle === (actual.declaredTitle || actual.docTitle || actual.originalFileName || actual.fileName)
        && expected.deliverableType === (actual.deliverableType || '');
    });
  return { run, resolved, current };
}
