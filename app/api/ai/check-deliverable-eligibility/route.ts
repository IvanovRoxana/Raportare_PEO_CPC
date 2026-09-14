import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import { deliverableEligibilityDocumentSchema, normalizeDeliverableEligibilityDocuments, normalizeDeliverableEligibilityStringList } from '@/lib/deliverable-eligibility';
import {
  DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE,
  DELIVERABLE_ELIGIBILITY_DISABLED_STATUS,
  isDeliverableEligibilityCheckEnabled,
} from '@/lib/feature-flags';
import { getActiveAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { retrieveEligibilityContext, includeExpertProfileJobDescription } from '@/lib/rag/eligibility-context';
import { loadEligibilityCatalog } from '@/lib/eligibility-catalog-runtime';
import {
  buildEligibilityAssessmentPrompt,
  finalizeEligibilityAssessment,
  eligibilityAssessmentAiSchema,
  EligibilityAssessmentInputError,
  ELIGIBILITY_ASSESSMENT_VERSION,
  validateEligibilityAssessmentInput,
  type EligibilityAssessmentInput,
  limitEligibilityDocumentText,
} from '@/lib/eligibility-assessment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    if (!isDeliverableEligibilityCheckEnabled()) {
      return NextResponse.json(
        { status: DELIVERABLE_ELIGIBILITY_DISABLED_STATUS, message: DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE },
        { status: 503 },
      );
    }
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    if (!authToken) return NextResponse.json({ error: 'Sesiunea a expirat. Autentifica-te din nou pentru verificare.' }, { status: 401 });
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
    const { expertId, expertCategory, currentSaCode, selectedActivityId, primaryDeliverableId, activityGroupId, workBlockId } = body;
    const parsedDocuments = deliverableEligibilityDocumentSchema.array().min(1).max(8).safeParse(body.deliverables);
    if (!parsedDocuments.success) {
      throw new EligibilityAssessmentInputError('Trimite intre 1 si 8 livrabile valide. Niciun document nu a fost omis sau evaluat partial.');
    }
    const catalog = await loadEligibilityCatalog({
      expertId: String(expertId || ''),
      expertCategory: String(expertCategory || ''),
      currentSaCode: String(currentSaCode || ''),
      allowedCandidateIds: Array.isArray(body.activityCatalogCandidates)
        ? body.activityCatalogCandidates.map((item: { id?: string }) => item?.id).filter((id: unknown): id is string => typeof id === 'string')
        : undefined,
    }, { authToken });
    // Full extracted text reaches the model. Oversized or unreadable input is rejected, never silently clipped.
    const eligibilityDocuments = normalizeDeliverableEligibilityDocuments({
      deliverables: parsedDocuments.data,
      primaryDeliverableId, activityGroupId, workBlockId,
      documentTitle: body.documentTitle, fileName: body.fileName,
      extractedText: body.extractedText, deliverableType: body.deliverableType,
      textScope: body.textScope, maxTextChars: Number.POSITIVE_INFINITY,
    });
    if (eligibilityDocuments.length !== parsedDocuments.data.length) {
      throw new EligibilityAssessmentInputError('Un livrabil este gol sau apartine altui grup. Verifica toate documentele atasate.');
    }
    const input: EligibilityAssessmentInput = {
      documents: eligibilityDocuments.map((document, index) => ({
        ...document, id: document.id || `deliverable-${index + 1}`,
      })),
      candidates: catalog.candidates,
      category: catalog.expert.category || '',
      saCode: String(currentSaCode || ''),
      selectedActivityId: typeof selectedActivityId === 'string' ? selectedActivityId : undefined,
      classificationMode: body.classificationMode === 'automatic' ? 'automatic'
        : body.classificationMode === 'manual' || selectedActivityId ? 'manual' : 'automatic',
      projectCode: catalog.expert.projectCode,
      expertId: catalog.expert.id,
      expertName: catalog.expert.name,
      expertFunction: catalog.expert.positionInProject,
      currentDescription: typeof body.currentDescription === 'string' ? body.currentDescription : '',
      workingGroupActivities: Array.isArray(body.workingGroupActivities) ? body.workingGroupActivities : [],
      deliverableOptions: normalizeDeliverableEligibilityStringList(body.deliverableOptions),
      catalogSource: catalog.source,
      catalogWarnings: catalog.warnings,
    };
    input.documents = input.documents.map((document) => {
      const limitedText = limitEligibilityDocumentText(document.extractedText);
      return limitedText.length < document.extractedText.length
        ? { ...document, extractedText: limitedText, textScope: `Primele ${limitedText.length} caractere analizate; restul documentului nu a fost transmis evaluatorului.` }
        : document;
    });
    validateEligibilityAssessmentInput(input);
    const activeRuleset = await getActiveAiEligibilityRuleset({ authToken, timeoutMs: 3000 });
    input.rulesContext = activeRuleset?.rulesJson ? JSON.stringify(activeRuleset.rulesJson) : '';
    const retrievedContext = await retrieveEligibilityContext({
      projectCode: input.projectCode, category: input.category, saCode: input.saCode,
      expertId: input.expertId, expertName: input.expertName,
      expertRole: input.expertFunction, positionInProject: input.expertFunction,
      queryText: input.documents.map((document) => [
        document.documentTitle, document.deliverableType,
        document.extractedText.slice(0, 2000), document.extractedText.slice(-2000),
      ].filter(Boolean).join('\n')).join('\n\n'),
    }, { authToken, timeoutMs: 7000 });
    const context = catalog.source === 'backend'
      ? includeExpertProfileJobDescription(retrievedContext, catalog.expert)
      : retrievedContext;
    const prompt = buildEligibilityAssessmentPrompt(input, context);
    const result = await governedGenerateText({
      endpoint: '/api/ai/check-deliverable-eligibility',
      operation: 'check-deliverable-eligibility',
      request: { ...input, referenceSources: context.sources.map(({ text: _text, ...source }) => source) },
      actorId: input.expertId, actorName: input.expertName,
      projectCode: input.projectCode, month: body.month, year: body.year,
      model: openaiModel(),
      ...prompt,
      abortSignal: AbortSignal.timeout(55_000),
      maxRetries: 0,
      maxOutputTokens: 6000,
      output: Output.object({ schema: eligibilityAssessmentAiSchema }),
    });
    const assessment = finalizeEligibilityAssessment(input, context, result.output);
    const classification = assessment.classification;
    return NextResponse.json({
      ...assessment,
      ruleVersionId: activeRuleset ? `${activeRuleset.id}:v${activeRuleset.version}` : ELIGIBILITY_ASSESSMENT_VERSION,
      checkedActivityId: classification.autoApply ? classification.activityId : selectedActivityId || currentSaCode,
      checkedSaCode: currentSaCode,
      checkedActivityName: classification.autoApply ? classification.activityName : body.selectedActivityName,
      checkedDeliverableType: input.documents.find((document) => document.isPrimary)?.deliverableType,
      analyzedDeliverables: input.documents.map(({ extractedText: _text, ...document }) => document),
      categoryContextUsed: {
        expertId: input.expertId, expertCategory: input.category, expertFunction: input.expertFunction,
        projectCode: input.projectCode, saCode: input.saCode,
        selectedActivityId: classification.activityId, selectedActivityName: classification.activityName,
        catalogSource: catalog.source, activityGroupId, workBlockId,
      },
      modelAuditId: result.auditId,
      rulesSource: activeRuleset ? 'published_ruleset' : 'built_in_rules',
    });
  } catch (error) {
    if (error instanceof EligibilityAssessmentInputError) {
      return NextResponse.json({ error: error.message, code: 'ELIGIBILITY_INPUT_INCOMPLETE' }, { status: 422 });
    }
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      return NextResponse.json({ error: 'Evaluarea a depasit timpul disponibil. Poti reincepe verificarea.', code: 'ELIGIBILITY_TIMEOUT' }, { status: 504 });
    }
    console.error('Deliverable eligibility request failed:', error instanceof Error ? error.name : 'unknown');
    return aiErrorResponse(error, 'Evaluarea nu a putut fi finalizata. Reincearca verificarea.');
  }
}
