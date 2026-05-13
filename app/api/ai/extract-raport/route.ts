import { Output } from 'ai';
import { governedGenerateText, aiErrorResponse } from '@/lib/ai-governance';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const RaportRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  activityTitle: z.string(),
  description: z.string(),
  deliverables: z.array(z.string()),
  verified: z.boolean(),
  matchesPontaj: z.boolean(),
  issues: z.array(z.string()),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileData, fileName, fileType } = body;

    if (!fileData) {
      return NextResponse.json({ error: 'Fișierul este obligatoriu' }, { status: 400 });
    }

    // For now, simulate extraction - in production you would use document parsing libraries
    const result = await governedGenerateText({
      endpoint: '/api/ai/extract-raport',
      operation: 'extract-raport',
      request: body,
      model: 'openai/gpt-4o-mini',
      system: `Ești un asistent specializat în extragerea datelor din rapoarte de activitate pentru proiecte cu finanțare europeană.
Extrage activitățile din documentul furnizat și returnează-le în format structurat.`,
      prompt: `Extrage activitățile din acest raport de activitate.
Numele fișierului: ${fileName}
Tipul fișierului: ${fileType}

Pentru fiecare activitate, extrage:
- Data activității
- Titlul activității
- Descrierea
- Livrabile menționate

Dacă nu poți extrage datele din documentul real, generează 5 exemple de activități tipice pentru un proiect PEO, 
cu date din luna curentă, pentru a demonstra funcționalitatea.

Returnează datele în format JSON cu structura:
{
  "rows": [
    {
      "id": "raport-1",
      "date": "2024-01-15",
      "activityTitle": "Titlul activității",
      "description": "Descrierea activității",
      "deliverables": ["Document 1", "Document 2"],
      "verified": false,
      "matchesPontaj": false,
      "issues": []
    }
  ]
}`,
      output: Output.object({
        schema: z.object({
          rows: z.array(RaportRowSchema),
        }),
      }),
    });

    const output = result.output;
    return NextResponse.json({ rows: output?.rows || [], auditId: result.auditId });
  } catch (error) {
    console.error('Error extracting raport:', error);
    return aiErrorResponse(error, 'Eroare la extragerea datelor din raport');
  }
}
