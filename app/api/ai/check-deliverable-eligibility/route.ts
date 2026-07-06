import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest, AiGovernanceError } from '@/lib/ai-governance';
import { isOpenAIConfigurationError, openaiModel } from '@/lib/openai';
import {
  buildNonConclusiveAiFailure,
  deliverableEligibilitySchema,
  normalizeDeliverableEligibilityActivityCandidates,
  normalizeDeliverableEligibilityStringList,
  validateEligibilitySuggestedSettings,
} from '@/lib/deliverable-eligibility';
import {
  DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE,
  DELIVERABLE_ELIGIBILITY_DISABLED_STATUS,
  isDeliverableEligibilityCheckEnabled,
} from '@/lib/feature-flags';

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
) {
  const query = normalizeForSearch(context);
  return candidates
    .map((candidate, index) => {
      const text = normalizeForSearch([
        candidate.saCode,
        candidate.activityName,
        candidate.serviceCategory,
        candidate.description,
        candidate.objectives,
        candidate.deliverables,
        candidate.indicators,
      ].filter(Boolean).join(' '));
      let score = candidate.saCode === currentSaCode ? 15 : 0;
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

    const trimmedExtractedText = trimText(extractedText, 12000).trim();
    if (trimmedExtractedText.length < 80) {
      return NextResponse.json(nonConclusive('Textul extras este insuficient pentru verificarea eligibilității.'));
    }

    const allActivityCatalogCandidates = normalizeDeliverableEligibilityActivityCandidates(rawActivityCatalogCandidates);
    const deliverableOptions = normalizeDeliverableEligibilityStringList(rawDeliverableOptions);
    const currentDeliverableType = String(deliverableType || '').trim();
    const activityCatalogCandidates = shortlistActivityCandidates(
      allActivityCatalogCandidates,
      [
        documentTitle,
        fileName,
        currentDeliverableType,
        selectedActivityName,
        catalogDescription,
        catalogObjectives,
        catalogDeliverables,
        trimmedExtractedText.slice(0, 3000),
      ].filter(Boolean).join(' '),
      currentSaCode,
    );

    let result;
    try {
      result = await governedGenerateText({
      endpoint: '/api/ai/check-deliverable-eligibility',
      operation: 'check-deliverable-eligibility',
      request: {
        ...body,
        extractedText: trimText(extractedText, 12000),
        activityCatalogCandidates,
        deliverableOptions,
      },
      actorName: expertName,
      projectCode,
      month,
      year,
      model: openaiModel(),
      system: `Ești un evaluator de conformitate pentru livrabile într-un proiect PEO cu finanțare europeană. Rolul tău este să verifici dacă un document încărcat pare eligibil ca livrabil pentru activitatea selectată, pe baza textului extras din document și a reperelor oficiale din Catalogul activităților. Nu inventa informații. Nu confirma eligibilitatea dacă dovezile sunt insuficiente. Returnează doar JSON valid, fără explicații în afara JSON.`,
      prompt: `Verifică eligibilitatea următorului livrabil.

Date document:
- Nume fișier: ${fileName || 'Nespecificat'}
- Titlu document: ${documentTitle || 'Nespecificat'}
- Tip livrabil selectat: ${currentDeliverableType || 'Nespecificat'}
- Aria textului analizat: ${textScope || 'Text extras disponibil'}

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

Text extras din document:
${trimmedExtractedText}

Reguli:
- Verifica mai intai daca problema vine din setarile alese in formular. Daca documentul pare potrivit pentru alta activitate sau alt tip de livrabil din listele permise, completeaza suggestedSettings.
- Nu recomanda modificarea documentului cand documentul pare coerent, dar activitatea sau tipul de livrabil selectat sunt gresite. In acel caz foloseste suggestedSettings si explica motivul.
- suggestedSettings.saCode/activityName/selectedActivityId trebuie sa existe exact in activitatile disponibile.
- suggestedSettings.deliverableType trebuie sa existe exact in tipurile de livrabil disponibile.
- Nu include suggestedSettings daca alternativa nu este clara.
- „eligibil” doar dacă documentul pare clar corelat cu activitatea și tipul de livrabil.
- „eligibil_cu_observatii” dacă documentul pare potrivit, dar lipsesc elemente sau sunt necesare clarificări.
- „neeligibil” dacă documentul nu se potrivește cu activitatea, tipul livrabilului sau obiectivele.
- „neconcludent” dacă textul extras este insuficient sau documentul nu poate fi analizat.
- Nu inventa conținut care nu apare în document.
- Nu valida automat un document doar pentru că titlul pare potrivit.
- Menționează explicit în summary sau recommendations dacă analiza s-a bazat doar pe prima pagină.
- Recomandările trebuie să fie practice și scurte.

Returnează strict JSON valid cu:
status, score, summary, checks, missingElements, recommendations, riskFlags, suggestedSettings.`,
      output: Output.object({ schema: deliverableEligibilitySchema }),
      });
    } catch (generationError) {
      console.error('Recoverable deliverable eligibility AI failure:', generationError);
      if (isOpenAIConfigurationError(generationError) || generationError instanceof AiGovernanceError) {
        throw generationError;
      }
      return NextResponse.json(nonConclusiveAiFailure(generationError));
    }

    const parsed = deliverableEligibilitySchema.safeParse(result.output);
    if (!parsed.success) {
      return NextResponse.json({
        ...nonConclusive('Nu am putut interpreta răspunsul AI pentru eligibilitate.'),
        modelAuditId: result.auditId,
      });
    }

    return NextResponse.json({
      ...parsed.data,
      suggestedSettings: validateEligibilitySuggestedSettings({
        suggestedSettings: parsed.data.suggestedSettings,
        activityCatalogCandidates,
        deliverableOptions,
        currentSaCode,
        currentActivityName: selectedActivityName,
        currentDeliverableType,
      }) ?? null,
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error checking deliverable eligibility:', error);
    return aiErrorResponse(error, 'Eroare la verificarea eligibilității livrabilului');
  }
}
