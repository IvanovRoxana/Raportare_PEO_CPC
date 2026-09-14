import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { resolveDocumentTitleSuggestion, suggestTitleFromFirstPage } from '@/lib/title-suggestion';
import { openaiModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const titleSchema = z.object({
  suggestedTitle: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  alternatives: z.array(z.string()),
  reason: z.string(),
});

function trimText(value: unknown, maxChars: number) {
  return String(value ?? '').slice(0, maxChars);
}

export async function POST(req: Request) {
  let fallbackSuggestion = suggestTitleFromFirstPage(null);
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const {
      fileName,
      firstPageText,
      selectedActivityId,
      selectedDeliverableType,
      projectCode,
      expertName,
    } = body;

    if (!firstPageText || String(firstPageText).trim().length < 20) {
      const fallback = suggestTitleFromFirstPage(firstPageText);
      return NextResponse.json(fallback);
    }

    const localSuggestion = suggestTitleFromFirstPage(firstPageText);
    fallbackSuggestion = localSuggestion;
    const selectedActivityOrDeliverable = [selectedActivityId, selectedDeliverableType].filter(Boolean).join(' / ') || 'Nespecificat';

    const result = await governedGenerateText({
      endpoint: '/api/ai/suggest-document-title',
      operation: 'suggest-document-title',
      request: body,
      actorName: expertName,
      projectCode,
      model: openaiModel(),
      system: 'Identifică titlul real al documentului din textul primei pagini. Copiază titlul literal, fără reformulare. Câmpurile etichetate Ședință, Ref., Subiect, Titlu sau Denumire pot conține titlul; elimină doar eticheta și prefixul administrativ, nu conținutul titlului. Ignoră data, locația, participanții și codurile. Returnează suggestedTitle null dacă nu există un titlu clar. Returnează doar JSON valid.',
      prompt: `Nume fișier: ${fileName || 'Nespecificat'}

Text extras din prima pagină:
${trimText(firstPageText, 6000)}

Activitate/livrabil selectat:
${selectedActivityOrDeliverable}

Sugestie euristică locală (folosește-o doar dacă este susținută de text):
${JSON.stringify(localSuggestion)}

Identifică titlul literal cel mai probabil. Nu parafraza. Dacă există o linie de forma „Ședință: Ref. ...”, folosește textul de după „Ref.” ca titlu, fără data finală dacă data este separată. Folosește confidence high numai pentru un titlu explicit; altfel folosește medium sau suggestedTitle null cu confidence low.

Returnează JSON valid cu:
{
  "suggestedTitle": "... sau null daca nu exista titlu clar",
  "confidence": "high|medium|low",
  "alternatives": ["...", "..."],
  "reason": "..."
}`,
      output: Output.object({ schema: titleSchema }),
    });

    const parsed = titleSchema.safeParse(result.output);
    if (!parsed.success) {
      return NextResponse.json({ ...localSuggestion, auditId: result.auditId });
    }

    const resolved = resolveDocumentTitleSuggestion({
      localSuggestion,
      aiSuggestion: parsed.data,
      documentText: firstPageText,
    });

    return NextResponse.json({ ...resolved, auditId: result.auditId });
  } catch (error) {
    console.error('Error suggesting document title:', error);
    const response = aiErrorResponse(error, 'Eroare la sugerarea titlului documentului');
    if (response.status !== 500) return response;

    return NextResponse.json(fallbackSuggestion, { status: 200 });
  }
}
