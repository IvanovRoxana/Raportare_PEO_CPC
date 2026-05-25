import { Output } from 'ai';
import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openaiModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const { raportData, pontajData } = body;

    if (!raportData || !pontajData) {
      return NextResponse.json(
        { error: 'Datele din pontaj și raport sunt obligatorii' },
        { status: 400 }
      );
    }

    const result = await governedGenerateText({
      endpoint: '/api/ai/compare-documents',
      operation: 'compare-documents',
      request: body,
      model: openaiModel(),
      system: `Ești un expert în verificarea conformității documentelor pentru proiecte cu finanțare europeană.
Compară datele din pontajul Excel cu cele din raportul de activitate și identifică:
1. Activități care se potrivesc (aceeași dată, ore similare)
2. Discrepanțe între ore declarate
3. Activități din raport care nu apar în pontaj
4. Activități din pontaj care nu apar în raport`,
      prompt: `Compară datele din pontaj cu cele din raportul de activitate:

PONTAJ:
${JSON.stringify(pontajData, null, 2)}

RAPORT ACTIVITATE:
${JSON.stringify(raportData, null, 2)}

Pentru fiecare activitate din raport, verifică dacă se potrivește cu pontajul și identifică probleme.

Returnează datele actualizate în format JSON:
{
  "comparedData": [
    {
      "id": "...",
      "date": "...",
      "activityTitle": "...",
      "description": "...",
      "deliverables": [],
      "verified": false,
      "matchesPontaj": true/false,
      "issues": ["problemă identificată"]
    }
  ],
  "summary": "Rezumatul comparației"
}`,
      output: Output.object({
        schema: z.object({
          comparedData: z.array(
            z.object({
              id: z.string(),
              date: z.string(),
              activityTitle: z.string(),
              description: z.string(),
              deliverables: z.array(z.string()),
              verified: z.boolean(),
              matchesPontaj: z.boolean(),
              issues: z.array(z.string()),
            })
          ),
          summary: z.string(),
        }),
      }),
    });

    const output = result.output;
    return NextResponse.json({
      comparedData: output?.comparedData || raportData,
      summary: output?.summary || '',
      auditId: result.auditId,
    });
  } catch (error) {
    console.error('Error comparing documents:', error);
    return aiErrorResponse(error, 'Eroare la compararea documentelor');
  }
}
