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
      originalPath: z.string(),
      filename: z.string(),
      deterministicType: z.string().optional(),
      deterministicConfidence: z.number().optional(),
      extractedText: z.string().optional(),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    if (!isProcurementAiEnabled()) {
      return NextResponse.json({ error: 'AI procurement review is disabled.' }, { status: 503 });
    }

    const body = requestSchema.parse(await req.json());
    const documents = body.documents.map((document) => ({
      ...document,
      extractedText: truncateForProcurementAi(document.extractedText ?? '', 4000),
    }));

    const result = await governedGenerateText({
      endpoint: '/api/ai/procurement/classify-documents',
      operation: 'procurement-classify-documents',
      request: { ...body, documents },
      projectCode: body.procurementCode,
      actorName: body.supplierName,
      model: selectProcurementEvaluationModel(),
      system: `Ești asistent de clasificare documente pentru evaluarea ofertelor de achiziții.
Returnezi doar JSON valid. Nu decide conformitatea ofertei; propui tip document, scor de încredere și dacă este necesar review uman.`,
      prompt: `Clasifică documentele din dosarul ofertantului.

Tipuri standard: OPIS, FORMULAR_1, FORMULAR_1A, FORMULAR_1B, FORMULAR_2, FORMULAR_3, FORMULAR_4, FORMULAR_5, FORMULAR_6, FORMULAR_7, FORMULAR_8, FORMULAR_9, FORMULAR_10, FORMULAR_11, FORMULAR_12, FORMULAR_12_ANEXA, FORMULAR_13, OFERTA_TEHNICA, OFERTA_FINANCIARA, ANEXA_FINANCIARA, CV, DIPLOMA, CERTIFICAT_FORMATOR, RECOMANDARE, ADEVERINTA, CONTRACT_SIMILAR, PROCES_VERBAL_RECEPTIE, CALENDAR_IMPLEMENTARE, DOCUMENT_PLATFORMA_ELEARNING, CERTIFICAT_CONSTATATOR, NECLASIFICAT.

Documente:
${JSON.stringify(documents, null, 2)}`,
      output: Output.object({
        schema: z.object({
          classifications: z.array(
            z.object({
              documentId: z.string(),
              docType: z.string(),
              confidence: z.number().min(0).max(1),
              reviewRequired: z.boolean(),
              reason: z.string(),
              supportSignals: z.array(z.string()),
            }),
          ),
        }),
      }),
    });

    return NextResponse.json(result.output);
  } catch (error) {
    return aiErrorResponse(error, 'Clasificarea AI a documentelor nu este disponibilă.');
  }
}
