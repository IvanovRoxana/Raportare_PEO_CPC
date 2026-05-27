import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiErrorResponse, governedGenerateText } from '@/lib/ai-governance';
import { isProcurementAiEnabled, selectProcurementEvaluationModel, truncateForProcurementAi } from '@/lib/procurement-evaluation/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  procurementCode: z.string().optional(),
  supplierName: z.string().optional(),
  documents: z.array(
    z.object({
      documentId: z.string(),
      docType: z.string(),
      text: z.string(),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    if (!isProcurementAiEnabled()) {
      return NextResponse.json({ error: 'AI procurement review is disabled.' }, { status: 503 });
    }

    const body = requestSchema.parse(await req.json());
    const documents = body.documents.map((document) => ({ ...document, text: truncateForProcurementAi(document.text) }));

    const result = await governedGenerateText({
      endpoint: '/api/ai/procurement/extract-offer-data',
      operation: 'procurement-extract-offer-data',
      request: { ...body, documents },
      projectCode: body.procurementCode,
      actorName: body.supplierName,
      model: selectProcurementEvaluationModel(),
      system: `Ești asistent de extragere date din documente de ofertă. Returnezi JSON validat.
Nu inventa valori. Dacă o valoare nu apare clar, setează value null, confidence scăzut și reviewRequired true.`,
      prompt: `Extrage câmpurile relevante pentru validare administrativă, expert-curs și financiar.

Documente:
${JSON.stringify(documents, null, 2)}`,
      output: Output.object({
        schema: z.object({
          extractedFields: z.array(
            z.object({
              documentId: z.string(),
              field: z.string(),
              label: z.string(),
              value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
              confidence: z.number().min(0).max(1),
              reviewRequired: z.boolean(),
              evidenceSnippet: z.string().optional(),
            }),
          ),
          experts: z.array(
            z.object({
              expertName: z.string(),
              role: z.string(),
              coveredCourses: z.array(z.string()),
              yearsClaimedF6: z.number().optional(),
              yearsClaimedCv: z.number().optional(),
              yearsOnlineClaimed: z.number().optional(),
              reviewRequired: z.boolean(),
            }),
          ),
        }),
      }),
    });

    return NextResponse.json(result.output);
  } catch (error) {
    return aiErrorResponse(error, 'Extragerea AI a datelor din ofertă nu este disponibilă.');
  }
}
