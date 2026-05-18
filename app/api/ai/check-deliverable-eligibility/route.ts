import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { governedGenerateText, aiErrorResponse } from '@/lib/ai-governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const checkSchema = z.object({
  criterion: z.string(),
  status: z.enum(['pass', 'warning', 'fail', 'unknown']),
  explanation: z.string(),
});

const eligibilitySchema = z.object({
  status: z.enum(['eligibil', 'eligibil_cu_observatii', 'neeligibil', 'neconcludent']),
  score: z.number().min(0).max(100),
  summary: z.string(),
  checks: z.array(checkSchema),
  missingElements: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
});

function trimText(value: unknown, maxChars: number) {
  return String(value ?? '').slice(0, maxChars);
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      documentTitle,
      fileName,
      extractedText,
      selectedActivityId,
      selectedActivityName,
      deliverableType,
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

    const result = await governedGenerateText({
      endpoint: '/api/ai/check-deliverable-eligibility',
      operation: 'check-deliverable-eligibility',
      request: {
        ...body,
        extractedText: trimText(extractedText, 12000),
      },
      actorName: expertName,
      projectCode,
      month,
      year,
      model: 'openai/gpt-4o-mini',
      system: `Ești un evaluator de conformitate pentru livrabile într-un proiect PEO cu finanțare europeană. Rolul tău este să verifici dacă un document încărcat pare eligibil ca livrabil pentru activitatea selectată, pe baza textului extras din document și a reperelor oficiale din Catalogul activităților. Nu inventa informații. Nu confirma eligibilitatea dacă dovezile sunt insuficiente. Returnează doar JSON valid, fără explicații în afara JSON.`,
      prompt: `Verifică eligibilitatea următorului livrabil.

Date document:
- Nume fișier: ${fileName || 'Nespecificat'}
- Titlu document: ${documentTitle || 'Nespecificat'}
- Tip livrabil selectat: ${deliverableType || 'Nespecificat'}
- Aria textului analizat: ${textScope || 'Text extras disponibil'}

Activitate selectată:
- ID: ${selectedActivityId || 'Nespecificat'}
- Nume: ${selectedActivityName || 'Nespecificat'}

Repere din Catalog activități:
- Descriere: ${catalogDescription || 'Nespecificat'}
- Obiective: ${catalogObjectives || 'Nespecificat'}
- Componenta serviciului: ${catalogComponent || 'Nespecificat'}
- Beneficiari: ${catalogBeneficiaries || 'Nespecificat'}
- Rezultate așteptate: ${catalogExpectedResults || 'Nespecificat'}
- Livrabile: ${catalogDeliverables || 'Nespecificat'}
- Indicatori/observații: ${catalogIndicators || 'Nespecificat'}

Text extras din document:
${trimmedExtractedText}

Reguli:
- „eligibil” doar dacă documentul pare clar corelat cu activitatea și tipul de livrabil.
- „eligibil_cu_observatii” dacă documentul pare potrivit, dar lipsesc elemente sau sunt necesare clarificări.
- „neeligibil” dacă documentul nu se potrivește cu activitatea, tipul livrabilului sau obiectivele.
- „neconcludent” dacă textul extras este insuficient sau documentul nu poate fi analizat.
- Nu inventa conținut care nu apare în document.
- Nu valida automat un document doar pentru că titlul pare potrivit.
- Menționează explicit în summary sau recommendations dacă analiza s-a bazat doar pe prima pagină.
- Recomandările trebuie să fie practice și scurte.

Returnează strict JSON valid cu:
status, score, summary, checks, missingElements, recommendations, riskFlags.`,
      output: Output.object({ schema: eligibilitySchema }),
    });

    const parsed = eligibilitySchema.safeParse(result.output);
    if (!parsed.success) {
      return NextResponse.json({
        ...nonConclusive('Nu am putut interpreta răspunsul AI pentru eligibilitate.'),
        modelAuditId: result.auditId,
      });
    }

    return NextResponse.json({ ...parsed.data, modelAuditId: result.auditId });
  } catch (error) {
    console.error('Error checking deliverable eligibility:', error);
    return aiErrorResponse(error, 'Eroare la verificarea eligibilității livrabilului');
  }
}
