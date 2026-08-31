import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest, AiGovernanceError } from '@/lib/ai-governance';
import { isOpenAIConfigurationError, openaiModel } from '@/lib/openai';
import {
  buildDeliverableEligibilitySemanticAudit,
  buildNonConclusiveAiFailure,
  CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES,
  DEFAULT_ELIGIBILITY_RULE_VERSION_ID,
  deliverableEligibilityAiSchema,
  deliverableEligibilitySchema,
  hasSufficientDeliverableEvidenceForEligibility,
  isConcordiaPublishedDeliverableType,
  normalizeDeliverableEligibilityAiOutput,
  normalizeDeliverableEligibilityActivityCandidates,
  normalizeDeliverableEligibilityDocuments,
  normalizeDeliverableEligibilityStringList,
  protectConcordiaPublicationEligibility,
  protectVerifiedDocumentTitleEligibility,
  validateEligibilitySuggestedSettings,
} from '@/lib/deliverable-eligibility';
import {
  DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE,
  DELIVERABLE_ELIGIBILITY_DISABLED_STATUS,
  isDeliverableEligibilityCheckEnabled,
} from '@/lib/feature-flags';
import { getActiveAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function trimText(value: unknown, maxChars: number) {
  return String(value ?? '').slice(0, maxChars);
}

function normalizeForSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortlistActivityCandidates(
  candidates: ReturnType<typeof normalizeDeliverableEligibilityActivityCandidates>,
  context: string,
  currentSaCode?: string,
  currentCategory?: string,
) {
  const query = normalizeForSearch(context);
  const normalizedCategory = normalizeForSearch(currentCategory);
  const categoryMatches = normalizedCategory
    ? candidates.filter((candidate) => normalizeForSearch(candidate.category) === normalizedCategory)
    : [];
  const scopedCandidates = categoryMatches.length > 0 ? categoryMatches : candidates;

  return scopedCandidates
    .map((candidate, index) => {
      const text = normalizeForSearch([
        candidate.category,
        candidate.saCode,
        candidate.activityName,
        candidate.serviceCategory,
        candidate.description,
        candidate.objectives,
        candidate.deliverables,
        candidate.indicators,
      ].filter(Boolean).join(' '));
      let score = candidate.saCode === currentSaCode ? 15 : 0;
      if (normalizedCategory && normalizeForSearch(candidate.category) === normalizedCategory) score += 25;
      text.split(' ').forEach((token) => {
        if (token.length >= 4 && query.includes(token)) score += 1;
      });
      if (query.includes(normalizeForSearch(candidate.activityName))) score += 20;
      return { candidate, score, index };
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 12)
    .map((item) => item.candidate);
}

function nonConclusive(reason: string) {
  return {
    status: 'neconcludent' as const,
    score: 0,
    summary: reason,
    checks: [
      {
        criterion: 'Text extras din document',
        status: 'unknown' as const,
        explanation: reason,
      },
    ],
    missingElements: ['Text extras suficient pentru analiză'],
    recommendations: ['Extrage sau încarcă un document cu text lizibil și repetă verificarea.'],
    riskFlags: ['Analiza nu poate confirma eligibilitatea fără conținut relevant.'],
  };
}

function nonConclusiveAiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Eroare necunoscuta.';
  return buildNonConclusiveAiFailure(trimText(message, 180));
}

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    if (!isDeliverableEligibilityCheckEnabled()) {
      return NextResponse.json(
        {
          status: DELIVERABLE_ELIGIBILITY_DISABLED_STATUS,
          message: DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE,
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const {
      documentTitle,
      fileName,
      extractedText,
      deliverables: rawDeliverables,
      primaryDeliverableId,
      activityGroupId,
      periodGroupId,
      workingGroupId,
      workBlockId,
      workingGroupActivities,
      collaborators,
      expertId,
      expertCategory,
      expertFunction,
      expertProjectRole,
      catalogSource,
      ruleVersionId,
      selectedActivityId,
      selectedActivityName,
      currentSaCode,
      deliverableType,
      activityCatalogCandidates: rawActivityCatalogCandidates,
      deliverableOptions: rawDeliverableOptions,
      catalogDescription,
      catalogObjectives,
      catalogComponent,
      catalogBeneficiaries,
      catalogExpectedResults,
      catalogDeliverables,
      catalogIndicators,
      projectCode,
      month,
      year,
      expertName,
      textScope,
    } = body;

    const eligibilityDocuments = normalizeDeliverableEligibilityDocuments({
      deliverables: rawDeliverables,
      primaryDeliverableId,
      activityGroupId,
      workBlockId,
      documentTitle,
      fileName,
      extractedText,
      deliverableType,
      textScope,
    });
    const primaryEligibilityDocument = eligibilityDocuments.find((deliverable) => deliverable.isPrimary)
      ?? eligibilityDocuments[0];
    const hasSufficientExtractedEvidence = eligibilityDocuments.some((deliverable) =>
      hasSufficientDeliverableEvidenceForEligibility({
        extractedText: deliverable.extractedText,
        documentTitle: deliverable.documentTitle || deliverable.declaredTitle || deliverable.suggestedTitle,
        titleConfirmed: deliverable.titleCheckStatus === 'matched' || deliverable.titleCheckStatus === 'admin_overridden',
        fileName: deliverable.fileName,
        deliverableType: deliverable.deliverableType || deliverableType,
        expertCategory,
      }),
    );
    const trimmedExtractedText = eligibilityDocuments
      .map((deliverable, index) => [
        `Livrabil ${index + 1}${deliverable.isPrimary ? ' (principal)' : ''}`,
        `Titlu: ${deliverable.documentTitle || 'Nespecificat'}`,
        `Titlu declarat: ${deliverable.declaredTitle || 'Nespecificat'}`,
        `Titlu sugerat din document: ${deliverable.suggestedTitle || 'Nespecificat'}`,
        `Sursa titlu: ${deliverable.titleSource || 'Nespecificat'}`,
        `Incredere sugestie titlu: ${deliverable.titleSuggestionConfidence || 'Nespecificat'}`,
        `Status verificare titlu: ${deliverable.titleCheckStatus || 'Nespecificat'}`,
        `Mesaj verificare titlu: ${deliverable.titleCheckMessage || 'Nespecificat'}`,
        `Fisier: ${deliverable.fileName || 'Nespecificat'}`,
        `Tip: ${deliverable.deliverableType || 'Nespecificat'}`,
        `Arie text: ${deliverable.textScope || 'Text extras disponibil'}`,
        deliverable.extractedText,
      ].filter(Boolean).join('\n'))
      .join('\n\n---\n\n')
      .slice(0, 18000)
      .trim();
    if (!hasSufficientExtractedEvidence) {
      return NextResponse.json(nonConclusive('Textul extras este insuficient pentru verificarea eligibilității.'));
    }

    const allActivityCatalogCandidates = normalizeDeliverableEligibilityActivityCandidates(rawActivityCatalogCandidates);
    const deliverableOptions = normalizeDeliverableEligibilityStringList(rawDeliverableOptions);
    const currentDeliverableType = primaryEligibilityDocument?.deliverableType || String(deliverableType || '').trim();
    const concordiaPublicationPromptRules = isConcordiaPublishedDeliverableType(currentDeliverableType)
      ? CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES
      : '';
    const currentDocumentTitle = primaryEligibilityDocument?.documentTitle || documentTitle;
    const currentDeclaredTitle = primaryEligibilityDocument?.declaredTitle || '';
    const currentSuggestedTitle = primaryEligibilityDocument?.suggestedTitle || '';
    const currentTitleSource = primaryEligibilityDocument?.titleSource || '';
    const currentTitleSuggestionConfidence = primaryEligibilityDocument?.titleSuggestionConfidence || '';
    const currentTitleCheckStatus = primaryEligibilityDocument?.titleCheckStatus || '';
    const currentTitleCheckMessage = primaryEligibilityDocument?.titleCheckMessage || '';
    const currentFileName = primaryEligibilityDocument?.fileName || fileName;
    const activityCatalogCandidates = shortlistActivityCandidates(
      allActivityCatalogCandidates,
      [
        currentDocumentTitle,
        currentFileName,
        currentDeliverableType,
        selectedActivityName,
        catalogDescription,
        catalogObjectives,
        catalogDeliverables,
        trimmedExtractedText.slice(0, 3000),
      ].filter(Boolean).join(' '),
      currentSaCode,
      expertCategory,
    );
    const activeRuleset = ruleVersionId ? null : await getActiveAiEligibilityRuleset();
    const effectiveRuleVersionId = ruleVersionId
      || (activeRuleset ? `${activeRuleset.id}:v${activeRuleset.version}` : DEFAULT_ELIGIBILITY_RULE_VERSION_ID);
    const activeRulesetContext = activeRuleset?.rulesJson
      ? `\nReguli administrate PM active:\n${trimText(JSON.stringify(activeRuleset.rulesJson, null, 2), 4000)}\n`
      : '';

    let result;
    try {
      result = await governedGenerateText({
      endpoint: '/api/ai/check-deliverable-eligibility',
      operation: 'check-deliverable-eligibility',
      request: {
        ...body,
        deliverables: eligibilityDocuments,
        primaryDeliverableId,
        activityGroupId,
        periodGroupId,
        workingGroupId,
        workBlockId,
        workingGroupActivities,
        collaborators,
        expertId,
        expertCategory,
        expertFunction,
        expertProjectRole,
        catalogSource,
        ruleVersionId: effectiveRuleVersionId,
        activeRulesetId: activeRuleset?.id,
        extractedText: trimmedExtractedText,
        activityCatalogCandidates,
        deliverableOptions,
      },
      actorName: expertName,
      projectCode,
      month,
      year,
      model: openaiModel(),
      system: `Ești un evaluator de conformitate pentru livrabile într-un proiect PEO cu finanțare europeană. Rolul tău este să verifici dacă documentele încărcate pentru același grup de activități par eligibile ca livrabile pentru activitatea selectată, pe baza textului extras din documente și a reperelor oficiale din Catalogul activităților. Nu inventa informații. Nu confirma eligibilitatea dacă dovezile sunt insuficiente. Returnează doar JSON valid, fără explicații în afara JSON.`,
      prompt: `Verifică eligibilitatea livrabilelor încărcate pentru grupul de activități curent.

Date livrabil principal:
- Nume fișier: ${currentFileName || 'Nespecificat'}
- Titlu document: ${currentDocumentTitle || 'Nespecificat'}
- Titlu declarat: ${currentDeclaredTitle || 'Nespecificat'}
- Titlu sugerat din document: ${currentSuggestedTitle || 'Nespecificat'}
- Sursa titlu: ${currentTitleSource || 'Nespecificat'}
- Incredere sugestie titlu: ${currentTitleSuggestionConfidence || 'Nespecificat'}
- Status verificare titlu: ${currentTitleCheckStatus || 'Nespecificat'}
- Mesaj verificare titlu: ${currentTitleCheckMessage || 'Nespecificat'}
- Tip livrabil selectat: ${currentDeliverableType || 'Nespecificat'}
- Grup activități: ${activityGroupId || workBlockId || 'Nespecificat'}
- Working group / perioada: ${workingGroupId || periodGroupId || 'Nespecificat'}
- Work block: ${workBlockId || 'Nespecificat'}
- Număr livrabile analizate din grup: ${eligibilityDocuments.length}

Context expert si proiect:
- Expert ID: ${expertId || 'Nespecificat'}
- Categoria expertului: ${expertCategory || 'Nespecificat'}
- Functie expert: ${expertFunction || 'Nespecificat'}
- Rol expert in proiect: ${expertProjectRole || 'Nespecificat'}
- Colaboratori declarati: ${Array.isArray(collaborators) ? collaborators.length : 0}
- Activitati in working group: ${Array.isArray(workingGroupActivities) ? workingGroupActivities.length : 0}
- Sursa catalogului: ${catalogSource || 'catalog-filtrat-aplicatie'}
- Versiune reguli: ${effectiveRuleVersionId}
${activeRulesetContext}

Activitate selectată:
- ID: ${selectedActivityId || 'Nespecificat'}
- Subactivitate: ${currentSaCode || 'Nespecificat'}
- Nume: ${selectedActivityName || 'Nespecificat'}

Repere din Catalog activități:
- Descriere: ${catalogDescription || 'Nespecificat'}
- Obiective: ${catalogObjectives || 'Nespecificat'}
- Componenta serviciului: ${catalogComponent || 'Nespecificat'}
- Beneficiari: ${catalogBeneficiaries || 'Nespecificat'}
- Rezultate așteptate: ${catalogExpectedResults || 'Nespecificat'}
- Livrabile: ${catalogDeliverables || 'Nespecificat'}
- Indicatori/observații: ${catalogIndicators || 'Nespecificat'}

Activitati disponibile pentru expert (singurele alternative permise):
${JSON.stringify(activityCatalogCandidates, null, 2)}

Tipuri de livrabil disponibile (singurele alternative permise):
${JSON.stringify(deliverableOptions, null, 2)}

Text extras din livrabilele grupului:
${trimmedExtractedText}

Reguli:
- Analizează doar livrabilele enumerate mai sus; nu presupune existența altor documente din lună sau din alte grupuri.
- Livrabilul marcat principal are prioritate, dar livrabilele secundare pot susține eligibilitatea și precizia raportării.
- Verifica mai intai daca problema vine din setarile alese in formular. Daca documentul pare potrivit pentru alta activitate sau alt tip de livrabil din listele permise, completeaza suggestedSettings.
- Nu recomanda modificarea documentului cand documentul pare coerent, dar activitatea sau tipul de livrabil selectat sunt gresite. In acel caz foloseste suggestedSettings si explica motivul.
- suggestedSettings.saCode/activityName/selectedActivityId trebuie sa existe exact in activitatile disponibile.
- suggestedSettings.deliverableType trebuie sa existe exact in tipurile de livrabil disponibile.
- Pentru categoria expertului COM, nu recomanda activitati din alta categorie daca exista activitati COM disponibile.
- Daca alternativa nu este clara, seteaza suggestedSettings.hasSuggestion=false si lasa campurile text goale.
- Daca exista alternativa clara, seteaza suggestedSettings.hasSuggestion=true si completeaza campurile relevante.
- „eligibil” doar dacă documentul pare clar corelat cu activitatea și tipul de livrabil.
- „eligibil_cu_observatii” dacă documentul pare potrivit, dar lipsesc elemente sau sunt necesare clarificări.
- „neeligibil” dacă documentul nu se potrivește cu activitatea, tipul livrabilului sau obiectivele.
- „neconcludent” dacă textul extras este insuficient sau documentul nu poate fi analizat.
- Nu inventa conținut care nu apare în document.
- Nu valida automat un document doar pentru că titlul pare potrivit.
- Verifica separat titlul documentului. Daca Status verificare titlu este "matched" sau "admin_overridden", considera titlul confirmat si nu marca probleme de titlu doar pentru ca Incredere sugestie titlu este low/medium.
- Daca titlul declarat lipseste, este doar numele fisierului, nu este sustinut de text sau pare o linie administrativa (data, locatie, participanti, semnaturi, screenshot, Teams/Zoom, tabel), marcheaza explicit problema in checks si riskFlags.
- Daca documentul nu contine un titlu clar, mentioneaza explicit in summary sau recommendations: "Nu a fost identificat un titlu clar in document." Nu inventa un titlu ca sa compensezi lipsa lui.
- Daca documentul pare eligibil ca livrabil, dar titlul este suspect sau lipseste, foloseste cel mult eligibil_cu_observatii si explica problema de titlu separat de potrivirea continutului.
${concordiaPublicationPromptRules}
- Dacă textul extras conține secțiuni marcate ca OCR din screenshot-uri/imagini sau mențiunea că documentul conține imagini încorporate, tratează-le ca dovadă vizuală extrasă din document. Pentru livrabile de tip screenshot confirmare publicare, caută indicii de postare publicată: platformă social media, dată/oră, autor/pagină, interfață de postare, reacții, comentarii, distribuiri sau link/URL. Nu marca automat lipsă screenshot-ul dacă documentul conține imagini încorporate relevante pentru social media; folosește cel mult eligibil_cu_observatii când dovada vizuală există, dar OCR-ul nu poate confirma toate detaliile.
- Menționează explicit în summary sau recommendations dacă analiza s-a bazat doar pe prima pagină.
- Recomandările trebuie să fie practice și scurte.

Returnează strict JSON valid cu:
status, score, summary, checks, missingElements, recommendations, riskFlags, suggestedSettings.
suggestedSettings trebuie sa fie mereu obiect cu: hasSuggestion, saCode, activityName, selectedActivityId, deliverableType, confidence, reason, changes.`,
      output: Output.object({ schema: deliverableEligibilityAiSchema }),
      });
    } catch (generationError) {
      console.error('Recoverable deliverable eligibility AI failure:', generationError);
      if (isOpenAIConfigurationError(generationError) || generationError instanceof AiGovernanceError) {
        throw generationError;
      }
      return NextResponse.json(nonConclusiveAiFailure(generationError));
    }

    const aiParsed = deliverableEligibilityAiSchema.safeParse(result.output);
    const parsed = aiParsed.success
      ? deliverableEligibilitySchema.safeParse(normalizeDeliverableEligibilityAiOutput(aiParsed.data))
      : aiParsed;
    if (!parsed.success) {
      return NextResponse.json({
        ...nonConclusive('Nu am putut interpreta răspunsul AI pentru eligibilitate.'),
        modelAuditId: result.auditId,
      });
    }

    const titleProtectedData = protectVerifiedDocumentTitleEligibility({
      result: parsed.data,
      documents: eligibilityDocuments,
    });
    const protectedData = protectConcordiaPublicationEligibility({
      result: titleProtectedData,
      deliverableType: currentDeliverableType,
      documentTitle: currentDocumentTitle,
      fileName: currentFileName,
      extractedText: trimmedExtractedText,
    });
    const semanticAudit = buildDeliverableEligibilitySemanticAudit({
      result: protectedData,
      documents: eligibilityDocuments,
      ruleVersionId: effectiveRuleVersionId,
      selectedActivityId,
      selectedActivityName,
      saCode: currentSaCode,
      deliverableType: currentDeliverableType,
      catalogDescription,
      catalogObjectives,
      catalogBeneficiaries,
      catalogExpectedResults,
      catalogDeliverables,
      catalogIndicators,
      expertId,
      expertCategory,
      expertFunction,
      expertProjectRole,
      projectCode,
      activityGroupId,
      periodGroupId,
      workingGroupId,
      workBlockId,
      catalogSource,
      collaborators,
      workingGroupActivities,
    });

    return NextResponse.json({
      ...protectedData,
      score: semanticAudit.normalizedScore,
      aiScore: semanticAudit.aiScore,
      rubricScore: semanticAudit.rubricScore,
      normalizedScore: semanticAudit.normalizedScore,
      rubricScores: semanticAudit.rubricScores,
      semanticAudit,
      appliedRules: semanticAudit.appliedRules,
      evidenceUsed: semanticAudit.evidenceUsed,
      documentsRead: semanticAudit.documentsRead,
      fallbackFlags: semanticAudit.fallbackFlags,
      ruleVersionId: semanticAudit.ruleVersionId,
      categoryContextUsed: semanticAudit.categoryContextUsed,
      analyzedDeliverables: eligibilityDocuments.map((deliverable) => ({
        id: deliverable.id,
        documentTitle: deliverable.documentTitle,
        fileName: deliverable.fileName,
        deliverableType: deliverable.deliverableType,
        isPrimary: deliverable.isPrimary,
      })),
      suggestedSettings: validateEligibilitySuggestedSettings({
        suggestedSettings: protectedData.suggestedSettings,
        activityCatalogCandidates,
        deliverableOptions,
        currentSaCode,
        currentActivityName: selectedActivityName,
        currentDeliverableType,
        currentCategory: expertCategory,
      }) ?? null,
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error checking deliverable eligibility:', error);
    return aiErrorResponse(error, 'Eroare la verificarea eligibilității livrabilului');
  }
}
