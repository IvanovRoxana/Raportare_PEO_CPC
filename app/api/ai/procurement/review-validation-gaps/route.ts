import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiErrorResponse, governedGenerateText } from '@/lib/ai-governance';
import { isProcurementAiEnabled, selectProcurementEvaluationModel } from '@/lib/procurement-evaluation/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  procurementCode: z.string().optional(),
  supplierName: z.string().optional(),
  validations: z.array(z.record(z.unknown())),
  mappings: z.array(z.record(z.unknown())).optional(),
});

export async function POST(req: Request) {
  try {
    if (!isProcurementAiEnabled()) {
      return NextResponse.json({ error: 'AI procurement review is disabled.' }, { status: 503 });
    }

    const body = requestSchema.parse(await req.json());
    const result = await governedGenerateText({
      endpoint: '/api/ai/procurement/review-validation-gaps',
      operation: 'procurement-review-validation-gaps',
      request: body,
      projectCode: body.procurementCode,
      actorName: body.supplierName,
      model: selectProcurementEvaluationModel(),
      system: `Ești asistent de audit pentru evaluarea ofertelor.
Nu schimba statusurile. Rezumă riscurile, dovezile lipsă și pașii de review uman.`,
      prompt: `Analizează rezultatele de validare și mapările expert-curs. Returnează un rezumat scurt pentru comisia de evaluare.

Validări:
${JSON.stringify(body.validations, null, 2)}

Mapări:
${JSON.stringify(body.mappings ?? [], null, 2)}`,
      output: Output.object({
        schema: z.object({
          summary: z.string(),
          blockingIssues: z.array(z.string()),
          reviewPriorities: z.array(z.string()),
          suggestedEvaluatorNotes: z.array(z.string()),
        }),
      }),
    });

    return NextResponse.json(result.output);
  } catch (error) {
    return aiErrorResponse(error, 'Review-ul AI al validărilor nu este disponibil.');
  }
}
