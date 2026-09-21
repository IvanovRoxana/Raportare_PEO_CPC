import 'server-only';
import type { EvaluationDiagnosticContext } from './eligibility-evaluation-diagnostics.ts';
import { assertAllowedAiRequest } from './ai-governance.ts';
import { isDeliverableEligibilityCheckEnabled } from './feature-flags.ts';
import { authenticateEligibilityRequest, resolveEligibilityContext } from './eligibility-resolver.ts';
import { parseEligibilityJobInput, eligibilityDocumentVersions, eligibilityRequestKey } from './eligibility-job-input.ts';
import { evaluationHash, ELIGIBILITY_MODEL_CONFIGURATION } from './eligibility-evaluation.ts';
import { ELIGIBILITY_ASSESSMENT_VERSION } from './eligibility-assessment.ts';
import { EligibilityExecutionError, eligibilityExecutionLimits, resolveEligibilityPeriod } from './eligibility-execution.ts';
import { getEligibilityModelName } from './openai.ts';
import { acceptEligibilityJob } from './eligibility-jobs.ts';

export async function submitEligibility(req: Request, diagnostic: EvaluationDiagnosticContext = { stage: 'request' }) {
  assertAllowedAiRequest(req);
  if (!isDeliverableEligibilityCheckEnabled() || process.env.ELIGIBILITY_ASYNC_ENABLED !== 'true') {
    throw new EligibilityExecutionError('ELIGIBILITY_DISABLED', 'Pornirea evaluarilor este suspendata temporar. Evaluarile acceptate pot fi consultate in continuare.', 503);
  }
  diagnostic.stage = 'context';
  const actor = await authenticateEligibilityRequest(req);
  const raw = await req.text();
  if (raw.length > 2_000_000) throw new EligibilityExecutionError('ELIGIBILITY_INPUT_TOO_LARGE', 'Cererea este prea mare.');
  let body;
  try { body = parseEligibilityJobInput(JSON.parse(raw)); }
  catch { throw new EligibilityExecutionError('ELIGIBILITY_INPUT_INVALID', 'Datele verificarii sunt incomplete sau invalide.'); }
  resolveEligibilityPeriod(body, new Date().toISOString(), process.env.ELIGIBILITY_RULES_TIME_POLICY || 'evaluation_time');
  const resolved = await resolveEligibilityContext(req, { expertId: body.expertId, projectCode: body.projectCode,
    saCode: body.currentSaCode, documentIds: body.deliverables.map((d) => d.serverDocumentId), metadataOnly: true, loadReferenceChunks: false }, actor);
  if (!resolved.documents.every((d) => d.fileHash && d.s3Key)) throw new EligibilityExecutionError('ELIGIBILITY_DOCUMENT_NOT_READY', 'Incarca si verifica originalele inainte de evaluare.');
  body.projectCode = resolved.expert.projectCode!;
  diagnostic.stage = 'snapshot';
  const versions = { documents: eligibilityDocumentVersions(resolved.documents), expert: evaluationHash(resolved.expert),
    sources: evaluationHash(resolved.parents.map((d) => ({ id: d.id, version: d.documentVersionId, generation: d.publishedGeneration, hash: d.textHash })).sort((a,b) => a.id.localeCompare(b.id))) };
  const requestKey = eligibilityRequestKey(actor.id, body);
  const evaluationKey = evaluationHash({ requestKey, versions, evaluator: ELIGIBILITY_ASSESSMENT_VERSION,
    model: getEligibilityModelName(), configuration: ELIGIBILITY_MODEL_CONFIGURATION, limits: eligibilityExecutionLimits() });
  diagnostic.stage = 'registration';
  return acceptEligibilityJob({ requestKey, evaluationKey, idempotencyKey: evaluationHash({ actorId: actor.id, request: body.clientRequestId || evaluationKey }), identity: { id: actor.id, username: actor.username || actor.id }, input: body, versions },
    { documents: resolved.documents.map((d) => ({ id: d.id, fileHash: d.fileHash })), requestKey, versions });
}
