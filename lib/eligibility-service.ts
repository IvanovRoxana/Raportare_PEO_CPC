import 'server-only';
import { eligibilityDocumentVersions } from './eligibility-job-input';
import { EligibilityCoverage } from './eligibility-coverage';
import { EligibilityExecutionBudget, eligibilityExecutionLimits, resolveEligibilityPeriod, EligibilityExecutionError, abortableEligibilityRead } from './eligibility-execution';
import { reserveEligibilityBudget, releaseEvaluation } from './eligibility-runtime-store';
import { runEligibilityAgent } from './agents/eligibility-agent';
import type { EligibilityToolTrace } from './agents/eligibility-tools';
import { refreshEligibilitySourceCoverage } from './agents/eligibility-tools';
import { eligibilityStore } from '@/lib/eligibility-server-store';
import { verifyEligibilityRunSnapshot } from '@/lib/eligibility-run-read';
import { resolveEligibilityContext } from '@/lib/eligibility-resolver';
import { EligibilityAccessError } from '@/lib/eligibility-authorization';
import { buildEvaluationKey, evaluationHash, buildEvidencePlan, finalizeAuthoritativeCriteria, eligibilityResultPresentation, applicableCriteriaSnapshot, ELIGIBILITY_MODEL_CONFIGURATION } from '@/lib/eligibility-evaluation';
import { parseExecutableRuleset, type RuleEvidence } from '@/lib/eligibility-rules';
import { startEligibilityRun, completeEligibilityRun, findReusableEligibilityRun, failEligibilityRun, EligibilityInProgress, type EligibilityRun } from '@/lib/eligibility-run-store';
import type { DeliverableEligibilityCheck } from '@/lib/types';
import { diagnoseEvaluationError, safeEvaluationErrorMetadata, type EvaluationDiagnosticContext } from './eligibility-evaluation-diagnostics';

import { assertAllowedAiRequest } from '@/lib/ai-governance';
import { getEligibilityModelName } from '@/lib/openai';
import { deliverableEligibilityDocumentSchema, normalizeDeliverableEligibilityStringList } from '@/lib/deliverable-eligibility';
import {
  DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE,
  isDeliverableEligibilityCheckEnabled,
} from '@/lib/feature-flags';
import { getActiveAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { retrieveEligibilityContext, includeExpertProfileJobDescription } from '@/lib/rag/eligibility-context';
import { loadEligibilityCatalog, loadEligibilityWorkerCatalog } from '@/lib/eligibility-catalog-runtime';
import { scopeEligibilityCatalog } from '@/lib/eligibility-catalog';
import type { ActivityCatalog } from '@/lib/types';
import {
  finalizeEligibilityAssessment,
  EligibilityAssessmentInputError,
  ELIGIBILITY_ASSESSMENT_VERSION,
  validateEligibilityAssessmentInput,
  type EligibilityAssessmentInput,
  limitEligibilityDocumentText,
} from '@/lib/eligibility-assessment';




export type EligibilityWorkerExecution = {
  run: EligibilityRun; job: import('./eligibility-jobs').EligibilityJob;
  actor: import('./eligibility-authorization').EligibilityActor;
  authorizeActor: () => Promise<import('./eligibility-authorization').EligibilityActor>;
  progress: (stage: EvaluationDiagnosticContext['stage']) => Promise<void>;
  failureAudit?: (audit: Record<string, unknown>) => void;
};

export async function evaluateEligibility(req: Request, diagnostic: EvaluationDiagnosticContext = { stage: 'request' }, worker?: EligibilityWorkerExecution) {
  const limits = { ...eligibilityExecutionLimits(), ...(worker ? { timeoutMs: 240_000 } : {}) };
  const budget = new EligibilityExecutionBudget(limits);
  const stage = async (value: EvaluationDiagnosticContext['stage']) => { diagnostic.stage = value; if (worker) await worker.progress(value); };
  let activeRun: EligibilityRun | undefined;
  let settleBudget: ((actualUsd?: number) => Promise<void>) | undefined;
  let billedCost: number | undefined;
  let executionSignal: AbortSignal | undefined;
  const trace: EligibilityToolTrace[] = [];
  try {
    if (!worker) assertAllowedAiRequest(req);
    if (!worker && !isDeliverableEligibilityCheckEnabled()) {
      throw new EligibilityExecutionError('ELIGIBILITY_DISABLED', DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE, 503);
    }
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    if (!worker && !authToken) throw new EligibilityAccessError('Sesiunea a expirat. Autentifica-te din nou pentru verificare.', 401);
    const rawBody = await req.text();
    if (rawBody.length > 2_000_000) {
      throw new EligibilityAssessmentInputError('Cererea este prea mare pentru o verificare completa. Redu numarul de livrabile din grup.');
    }
    let body;
    try { body = JSON.parse(rawBody); } catch {
      throw new EligibilityAssessmentInputError('Cererea de verificare nu contine date JSON valide.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new EligibilityAssessmentInputError('Datele verificarii lipsesc.');
    }
    const { expertId, currentSaCode, selectedActivityId, primaryDeliverableId, activityGroupId, workBlockId } = body;
    const parsedDocuments = deliverableEligibilityDocumentSchema.array().min(1).max(8).safeParse(body.deliverables);
    if (!parsedDocuments.success) {
      throw new EligibilityAssessmentInputError('Trimite intre 1 si 8 livrabile valide. Niciun document nu a fost omis sau evaluat partial.');
    }
    await stage('context');
    const resolved = await resolveEligibilityContext(req, {
      expertId: String(expertId || ''), projectCode: typeof body.projectCode === 'string' ? body.projectCode : undefined,
      saCode: String(currentSaCode || ''), documentIds: parsedDocuments.data.map((doc) => doc.serverDocumentId || doc.id || ''),
    }, worker?.actor);
    const documentsById = new Map(parsedDocuments.data.map((doc, i) => [doc.id || '', resolved.documents[i]!]));
    const authoritative = resolved.documents.every((doc) => Boolean(doc?.docText));
    if (!authoritative) throw new EligibilityExecutionError('ELIGIBILITY_EXTRACTION_INCOMPLETE', 'Originalele nu au text verificabil. Verifica extragerea.');
    await stage('catalog');
    const candidateIds = Array.isArray(body.activityCatalogCandidates) ? body.activityCatalogCandidates.map((item: { id?: string }) => item?.id).filter((id: unknown): id is string => typeof id === 'string') : undefined;
    const catalog = worker ? await loadEligibilityWorkerCatalog(resolved.expert, candidateIds) : await loadEligibilityCatalog({
      expertId: String(expertId || ''),
      expertCategory: resolved.expert.category || '',
      currentSaCode: String(currentSaCode || ''),
      allowedCandidateIds: Array.isArray(body.activityCatalogCandidates)
        ? body.activityCatalogCandidates.map((item: { id?: string }) => item?.id).filter((id: unknown): id is string => typeof id === 'string')
        : undefined,
    }, { authToken: authToken || undefined });
    const eligibilityDocuments = parsedDocuments.data.map((document) => {
      const stored = documentsById.get(document.id || '')!;
      return { id: document.id || stored.id, extractedText: stored.docText!, fileHash: stored.fileHash,
        documentTitle: stored.declaredTitle || stored.docTitle || stored.originalFileName || stored.fileName,
        fileName: stored.originalFileName || stored.fileName, deliverableType: stored.deliverableType || '',
        isPrimary: document.id === primaryDeliverableId || document.isPrimary === true,
        textScope: stored.extractionComplete === true ? 'Text integral verificat in backend' : 'Extragere incompleta' };
    });
    const input: EligibilityAssessmentInput = {
      documents: eligibilityDocuments.map((document, index) => ({
        ...document, id: document.id || `deliverable-${index + 1}`,
      })),
      candidates: catalog.candidates,
      category: resolved.expert.category || '',
      saCode: String(currentSaCode || ''),
      selectedActivityId: typeof selectedActivityId === 'string' ? selectedActivityId : undefined,
      classificationMode: body.classificationMode === 'automatic' ? 'automatic'
        : body.classificationMode === 'manual' || selectedActivityId ? 'manual' : 'automatic',
      projectCode: resolved.expert.projectCode,
      expertId: resolved.expert.id,
      expertName: resolved.expert.name,
      expertFunction: resolved.expert.positionInProject,
      currentDescription: typeof body.currentDescription === 'string' ? body.currentDescription : '',
      workingGroupActivities: Array.isArray(body.workingGroupActivities) ? body.workingGroupActivities : [],
      deliverableOptions: normalizeDeliverableEligibilityStringList(body.deliverableOptions),
      catalogSource: catalog.source,
      catalogWarnings: catalog.warnings,
    };
    await stage('validation');
    const coverage = new EligibilityCoverage(input.documents.map((document) => ({ id: document.id,
      text: document.extractedText, version: document.fileHash || evaluationHash(document.extractedText),
      extractionComplete: documentsById.get(document.id)?.extractionComplete === true })));
    input.documents = input.documents.map((document) => {
      const limitedText = limitEligibilityDocumentText(document.extractedText);
      coverage.read(document.id, 0, Math.max(1, limitedText.length));
      return limitedText.length < document.extractedText.length
        ? { ...document, extractedText: limitedText, textScope: `Primele ${limitedText.length} caractere analizate; restul documentului nu a fost transmis evaluatorului.` }
        : document;
    });
    validateEligibilityAssessmentInput(input);
    const evaluationAt = worker?.run.createdAt || new Date().toISOString();
    const period = resolveEligibilityPeriod(body, evaluationAt, process.env.ELIGIBILITY_RULES_TIME_POLICY || 'evaluation_time');
    await stage('rules');
    const activeRuleset = await getActiveAiEligibilityRuleset({ projectCode: resolved.expert.projectCode!, at: period.rulesEffectiveAt, knownAt: evaluationAt });
    const rules = activeRuleset ? parseExecutableRuleset(activeRuleset.rulesJson) : null;
    input.rulesContext = activeRuleset?.rulesJson ? JSON.stringify(activeRuleset.rulesJson) : '';
    await stage('references');
    const retrievedContext = await retrieveEligibilityContext({
      projectCode: input.projectCode, category: input.category, saCode: input.saCode,
      expertId: input.expertId, expertName: input.expertName,
      expertRole: input.expertFunction, positionInProject: input.expertFunction, roleId: resolved.roleId,
      includeHistoricalExamples: true,
      approvedHistoricalDocumentIds: resolved.parents.filter((document) => ['approved', 'approved_oir'].includes(document.approvalStatus || ''))
        .map((document) => document.id),
      currentDocumentIds: resolved.documents.map((document) => document.id),
      queryText: input.documents.map((document) => [
        document.documentTitle, document.deliverableType,
        document.extractedText.slice(0, 2000), document.extractedText.slice(-2000),
      ].filter(Boolean).join('\n')).join('\n\n'),
    }, { timeoutMs: 7000, dependencies: { listKnowledgeChunks: async () => resolved.chunks } });
    const context = includeExpertProfileJobDescription(retrievedContext, resolved.expert);
    // Every applicable normative anchor is included, even when lexical top-k would omit it.
    for (const rule of rules?.criteria || []) {
      const chunk = resolved.chunks.find((item) => item.id === rule.provenance.anchor);
      if (chunk && !context.sources.some((source) => source.chunkId === chunk.id)) {
        context.sources.push({ documentId: chunk.documentId, chunkId: chunk.id, sourceType: chunk.sourceType || '',
          coverage: 'coverage' in rule.parameters ? rule.parameters.coverage : chunk.sourceType === 'fisa_post' ? 'job_description'
            : ['descriere_activitati', 'scop_sa'].includes(chunk.sourceType || '') ? 'subactivity' : 'project', text: chunk.text,
          documentVersionId: chunk.documentVersionId, indexGenerationId: chunk.indexGenerationId, extractionComplete: chunk.extractionComplete });
      }
    }
    refreshEligibilitySourceCoverage(context);
    const evidence: RuleEvidence = {
      projectCode: resolved.expert.projectCode!, roleId: resolved.roleId, category: input.category, saCode: input.saCode, at: period.rulesEffectiveAt, activityId: input.selectedActivityId, deliverableTypes: input.documents.map((doc) => doc.deliverableType || ''),
      documents: input.documents.map((doc) => ({ ...doc, analysisComplete: Boolean(documentsById.get(doc.id)?.extractionComplete)
        && doc.extractedText.length === documentsById.get(doc.id)?.docText?.length })),
      sources: context.sources, aiFindings: [],
    };
    input.evidencePlan = buildEvidencePlan(rules, evidence);
    // A multi-date group must not silently use the first date's rules for every date.
    await stage('rules');
    if (period.policy === 'activity_date') for (const date of period.activityDates.slice(1)) {
      const at = date + 'T12:00:00.000Z';
      const datedRuleset = await getActiveAiEligibilityRuleset({ projectCode: resolved.expert.projectCode!, at, knownAt: evaluationAt });
      if (evaluationHash(datedRuleset) !== evaluationHash(activeRuleset)
        || evaluationHash(applicableCriteriaSnapshot(rules, { ...evidence, at })) !== evaluationHash(applicableCriteriaSnapshot(rules, evidence))) {
        throw new EligibilityExecutionError('ELIGIBILITY_PERIOD_SPLIT_REQUIRED', 'Perioada traverseaza versiuni de reguli. Verifica separat grupurile de date cu aceleasi cerinte.');
      }
    }
    await stage('snapshot');
    const snapshot = {
      documents: input.documents.map((doc) => ({ id: documentsById.get(doc.id)!.id, clientId: doc.id, hash: evaluationHash(documentsById.get(doc.id)?.docText || doc.extractedText),
        fileHash: documentsById.get(doc.id)?.fileHash || doc.fileHash, analysisHash: evaluationHash(doc.extractedText), textScope: doc.textScope,
        documentTitle: doc.documentTitle, deliverableType: doc.deliverableType, isPrimary: doc.isPrimary })).sort((a, b) => a.id.localeCompare(b.id)),
      expert: evaluationHash(resolved.expert), projectCode: input.projectCode, roleId: resolved.roleId, saCode: input.saCode,
      catalog: evaluationHash(catalog.candidates), rules: evaluationHash(activeRuleset),
      applicableCriteria: applicableCriteriaSnapshot(rules, evidence),
      scopedCatalogHash: evaluationHash(scopeEligibilityCatalog(await eligibilityStore.list<ActivityCatalog>('ActivityCatalog'), resolved.expert).sort((a, b) => a.id.localeCompare(b.id))),
      sources: resolved.parents.map((doc) => ({ id: doc.id, version: doc.documentVersionId, generation: doc.publishedGeneration, hash: doc.textHash })).sort((a, b) => a.id.localeCompare(b.id)),
      context: evaluationHash(context), selectedActivityId: input.selectedActivityId, classificationMode: input.classificationMode,
      currentDescription: evaluationHash(input.currentDescription), workingGroupActivities: evaluationHash(input.workingGroupActivities),
      deliverableOptions: input.deliverableOptions, evaluatorVersion: ELIGIBILITY_ASSESSMENT_VERSION,
      model: getEligibilityModelName(), configuration: ELIGIBILITY_MODEL_CONFIGURATION, authoritative,
      period: { policy: period.policy, activityDates: period.activityDates, rulesEffectiveAt: period.policy === 'activity_date' ? period.rulesEffectiveAt : undefined },
      executionLimits: limits,
    };
    const evaluationKey = worker?.run.evaluationKey || buildEvaluationKey(snapshot);
    await stage('reuse');
    const reused = !worker && authoritative ? await findReusableEligibilityRun(evaluationKey) : null;
    if (reused?.resultJson && (await verifyEligibilityRunSnapshot(req, reused)).current) return { ...reused.resultJson, reused: true };
    await stage('registration');
    const run = worker?.run || await startEligibilityRun({ evaluationKey, expertId: resolved.expert.id, projectCode: resolved.expert.projectCode!,
      saCode: input.saCode, actorId: resolved.actor.id, authoritative, inputSnapshot: snapshot });
    run.inputSnapshot = snapshot;
    activeRun = run;
    diagnostic.runId = run.runId;
    await stage('budget');
    budget.checkTime();
    settleBudget = await reserveEligibilityBudget(resolved.expert.projectCode!, budget.limits.costUsd);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(Math.max(1, budget.limits.timeoutMs - (Date.now() - budget.startedAt)))]);
    executionSignal = signal;
    const authorize = async () => {
      signal.throwIfAborted();
      const actor = worker ? await worker.authorizeActor() : undefined;
      const current = await abortableEligibilityRead(signal, () => resolveEligibilityContext(req, { expertId: resolved.expert.id, projectCode: input.projectCode,
        saCode: input.saCode, documentIds: parsedDocuments.data.map((doc) => doc.serverDocumentId || doc.id || ''), loadReferenceChunks: false, metadataOnly: true }, actor));
      signal.throwIfAborted();
      budget.checkTime();
      if (evaluationHash(current.parents) !== evaluationHash(resolved.parents)
        || evaluationHash(current.expert) !== evaluationHash(resolved.expert)
        || evaluationHash(eligibilityDocumentVersions(current.documents)) !== evaluationHash(eligibilityDocumentVersions(resolved.documents))) {
        throw new EligibilityExecutionError('ELIGIBILITY_STALE', 'Documentele sau sursele s-au modificat. Reia evaluarea.', 409);
      }
    };
    const agentOptions = { runId: run.runId, actorId: resolved.actor.id, input, context, coverage, budget, chunks: resolved.chunks, authorize, signal, trace };
    await stage('model');
    let result = await runEligibilityAgent(agentOptions);
    await stage('result_validation');
    const updateReadEvidence = () => {
      const states = coverage.snapshot();
      input.documents = input.documents.map((doc) => {
        const state = states.find((item) => item.documentId === doc.id)!;
        return { ...doc, consultedTexts: coverage.texts(doc.id),
          extractedText: coverage.texts(doc.id).join('\n[interval neconsultat]\n'), analysisComplete: state.analysisComplete,
          textScope: state.analysisComplete ? 'Text integral consultat si verificat in backend'
            : `Consultate ${state.consultedChars} din ${state.totalChars} caractere. Extragere ${state.extractionComplete ? 'completa' : 'incompleta'}.` };
      });
      evidence.documents = input.documents.map((doc) => ({ ...doc, analysisComplete: doc.analysisComplete === true }));
      evidence.sources = context.sources;
    };
    updateReadEvidence();
    let assessment = finalizeEligibilityAssessment(input, context, result.output);
    const classified = assessment.classification;
    const finalActivity = classified.activityId && !classified.requiresSaConfirmation ? classified.activityId : input.selectedActivityId;
    const previousPlan = applicableCriteriaSnapshot(rules, evidence);
    evidence.activityId = finalActivity;
    if (evaluationHash(previousPlan) !== evaluationHash(applicableCriteriaSnapshot(rules, evidence))) {
      input.evidencePlan = buildEvidencePlan(rules, evidence);
      await stage('model');
      result = await runEligibilityAgent({ ...agentOptions, input: { ...input, selectedActivityId: finalActivity, classificationMode: 'manual' } });
      await stage('result_validation');
      updateReadEvidence();
      assessment = finalizeEligibilityAssessment({ ...input, selectedActivityId: finalActivity, classificationMode: 'manual' }, context, result.output);
      if (assessment.classification.activityId !== finalActivity) throw new EligibilityExecutionError('ELIGIBILITY_CLASSIFICATION_CHANGED', 'Incadrarea nu a ramas stabila la verificarea cerintelor. Selecteaza activitatea si reia analiza.', 409);
      assessment.classification = { ...assessment.classification,
        autoApply: classified.autoApply && assessment.classification.confidence === 'high', appliedBy: classified.appliedBy };
    }
    evidence.aiFindings = result.output.criterionFindings;
    for (const criterion of buildEvidencePlan(rules, evidence).criteria.filter((item) => item.applicable)) {
      if (evidence.aiFindings.filter((finding) => finding.criterionId === criterion.criterionId).length !== 1) {
        throw new EligibilityExecutionError('ELIGIBILITY_FINDINGS_INCOMPLETE', 'Modelul nu a furnizat o constatare unica pentru fiecare cerinta. Reia verificarea.', 502);
      }
    }
    run.inputSnapshot.finalActivityId = evidence.activityId;
    run.inputSnapshot.finalApplicableCriteria = applicableCriteriaSnapshot(rules, evidence);
    const criteriaResult = finalizeAuthoritativeCriteria(rules, evidence, assessment.status);
    const presentation = eligibilityResultPresentation(criteriaResult, evidence.documents.every((doc) => doc.analysisComplete));
    billedCost = budget.usageComplete ? budget.costUsd : undefined;
    const classification = assessment.classification;
    const response: DeliverableEligibilityCheck = {
      ...assessment, ...criteriaResult, ...presentation, executionStatus: 'completed', verdict: criteriaResult.status,
      documentCoverage: coverage.snapshot(), executionAudit: { ...budget.snapshot(), trace, model: getEligibilityModelName(), period },
      suggestedSettings: assessment.suggestedSettings ? {
        ...assessment.suggestedSettings, saCode: assessment.suggestedSettings.saCode || undefined,
        activityName: assessment.suggestedSettings.activityName || undefined, selectedActivityId: assessment.suggestedSettings.selectedActivityId || undefined,
        deliverableType: assessment.suggestedSettings.deliverableType || undefined,
      } : null,
      runId: run.runId, evaluationKey, authoritative, checkedAt: new Date().toISOString(), checkedBy: resolved.actor.id,
      evaluationLimitations: [
        ...(!authoritative ? ['Propunere pe documente nesalvate; salvati si reluati evaluarea pentru un rezultat autoritar.'] : []),
        ...(!evidence.documents.every((doc) => doc.analysisComplete) ? ['Extragerea sau analiza documentelor nu este completa.'] : []),
      ],
      ruleVersionId: activeRuleset ? `${activeRuleset.id}:v${activeRuleset.version}` : ELIGIBILITY_ASSESSMENT_VERSION,
      checkedActivityId: classification.autoApply ? classification.activityId : selectedActivityId || currentSaCode,
      checkedSaCode: currentSaCode,
      checkedActivityName: classification.autoApply ? classification.activityName : body.selectedActivityName,
      checkedDeliverableType: input.documents.find((document) => document.isPrimary)?.deliverableType,
      analyzedDeliverables: input.documents.map(({ extractedText: _text, consultedTexts: _consulted, ...document }) => document),
      categoryContextUsed: {
        expertId: input.expertId, expertCategory: input.category, expertFunction: input.expertFunction,
        projectCode: input.projectCode, saCode: input.saCode,
        selectedActivityId: classification.activityId, selectedActivityName: classification.activityName,
        catalogSource: catalog.source, activityGroupId, workBlockId,
      },
      modelAuditId: result.auditId,
      usageAudit: { ...result.usageAudit, inputTokens: budget.inputTokens, outputTokens: budget.outputTokens, totalTokens: budget.totalTokens, costUsd: budget.costUsd },
      rulesSource: activeRuleset ? 'published_ruleset' : 'built_in_rules',
    };
    await stage('revalidation');
    if (authoritative && !(await verifyEligibilityRunSnapshot(req, run, worker ? await worker.authorizeActor() : undefined)).current) {
      if (worker) throw new EligibilityExecutionError('ELIGIBILITY_STALE', 'Contextul s-a modificat in timpul analizei. Reia evaluarea.', 409);
      response.authoritative = false; response.status = 'neconcludent'; response.verdict = 'neconcludent';
      response.summary = 'Contextul s-a modificat in timpul analizei. Reia evaluarea.';
      response.justification = response.summary;
      response.evaluationLimitations?.push(response.summary);
    }
    await stage('save');
    await completeEligibilityRun(run, response, worker?.job);
    return response;
  } catch (error) {
    if (error instanceof EligibilityInProgress) throw error;
    const failure = executionSignal?.aborted && Date.now() - budget.startedAt >= budget.limits.timeoutMs
      ? new EligibilityExecutionError('ELIGIBILITY_TIMEOUT', 'Evaluarea a depasit timpul disponibil. Reincearca verificarea; daca problema persista, transmite referinta administratorului.', 504)
      : error;
    diagnostic.failure = diagnoseEvaluationError(failure, diagnostic);
    worker?.failureAudit?.({ ...budget.snapshot(), trace, failure: diagnostic.failure });
    console.error('[ELIGIBILITY_EVALUATION_ERROR]', { ...diagnostic.failure, causes: safeEvaluationErrorMetadata(error) });
    if (activeRun && !worker) await failEligibilityRun(activeRun, { code: diagnostic.failure.code }, { ...budget.snapshot(), trace, failure: diagnostic.failure }).catch(() => undefined);
    throw failure;
  } finally {
    if (settleBudget) await settleBudget(billedCost).catch(() => undefined);
    if (activeRun && !worker) await releaseEvaluation(activeRun.evaluationKey, activeRun.runId).catch(() => undefined);
  }
}
