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
    const selectedActivityOrDeliverable = [selectedActivityId, selectedDeliverableType].filter(Boolean).join(' / ') || 'Nespecificat';

    const result = await governedGenerateText({
      endpoint: '/api/ai/suggest-document-title',
      operation: 'suggest-document-title',
      request: body,
      actorName: expertName,
      projectCode,
      model: openaiModel(),
      system: `Ești un asistent care identifică titlul real al unui document încărcat într-o aplicație de raportare PEO. Primești text extras din prima pagină sau din începutul documentului. Alege numai un titlu care apare explicit în textul primit, fără reformulare și fără sinteză. Evită antetele instituționale, datele izolate, codurile de proiect, numerele de pagină, denumirile organizației, adresele și textele administrative. Nu inventa un titlu care nu este susținut literal de text. Dacă documentul nu conține un titlu clar, returnează suggestedTitle null, confidence low și explică în reason că nu a fost identificat un titlu clar în document. Returnează doar JSON valid.`,
      prompt: `Nume fișier: ${fileName || 'Nespecificat'}

Text extras din prima pagină:
${trimText(firstPageText, 6000)}

Activitate/livrabil selectat:
${selectedActivityOrDeliverable}

Sugestie euristică locală (folosește-o doar dacă este susținută de text):
${JSON.stringify(localSuggestion)}

Te rog să identifici titlul cel mai probabil al documentului.
Reguli stricte:
- suggestedTitle trebuie să fie copiat din textul extras, nu parafrazat.
- Folosește confidence high doar când titlul este explicit și curat.
- Folosește confidence medium când titlul este probabil, dar are nevoie de confirmare.
- Folosește suggestedTitle null și confidence low când vezi doar antete, date, locații, participanți sau text administrativ.

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

    return NextResponse.json(suggestTitleFromFirstPage(null), { status: 200 });
  }
}
