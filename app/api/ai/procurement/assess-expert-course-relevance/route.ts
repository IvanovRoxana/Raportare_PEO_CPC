import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiErrorResponse, governedGenerateText } from '@/lib/ai-governance';
import { LEARNING_HUB_COURSE_PROFILES } from '@/lib/procurement-evaluation/courses';
import { isProcurementAiEnabled, selectProcurementEvaluationModel, truncateForProcurementAi } from '@/lib/procurement-evaluation/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  procurementCode: z.string().optional(),
  supplierName: z.string().optional(),
  expertName: z.string(),
  courseId: z.string(),
  cvText: z.string().optional(),
  evidenceText: z.string(),
  yearsClaimedF6: z.number().optional(),
  yearsClaimedCv: z.number().optional(),
  yearsProvenGeneral: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    if (!isProcurementAiEnabled()) {
      return NextResponse.json({ error: 'AI procurement review is disabled.' }, { status: 503 });
    }

    const body = requestSchema.parse(await req.json());
    const course = LEARNING_HUB_COURSE_PROFILES.find((item) => item.courseId === body.courseId);

    const result = await governedGenerateText({
      endpoint: '/api/ai/procurement/assess-expert-course-relevance',
      operation: 'procurement-assess-expert-course-relevance',
      request: { ...body, cvText: truncateForProcurementAi(body.cvText ?? '', 6000), evidenceText: truncateForProcurementAi(body.evidenceText, 9000) },
      projectCode: body.procurementCode,
      actorName: body.supplierName,
      model: selectProcurementEvaluationModel(),
      system: `Ești asistent de review pentru relevanța expert-curs.
Folosește doar dovezile documentare pentru concluziile de eligibilitate. CV-ul poate sprijini interpretarea, dar nu dovedește singur experiența.`,
      prompt: `Analizează relevanța expertului pentru curs.

Expert: ${body.expertName}
Curs: ${course?.courseName ?? body.courseId}
Profil curs: ${JSON.stringify(course ?? {}, null, 2)}
Ani declarați Formular 6: ${body.yearsClaimedF6 ?? 'necunoscut'}
Ani declarați CV: ${body.yearsClaimedCv ?? 'necunoscut'}
Ani dovediți calculați determinist: ${body.yearsProvenGeneral ?? 'necunoscut'}

CV:
${truncateForProcurementAi(body.cvText ?? '', 6000)}

Dovezi:
${truncateForProcurementAi(body.evidenceText, 9000)}`,
      output: Output.object({
        schema: z.object({
          relevanceLevel: z.enum(['ridicata', 'medie', 'scazuta', 'review']),
          confidence: z.number().min(0).max(1),
          evidenceSupportsCourse: z.boolean(),
          evidenceSupportsClaimedYears: z.boolean(),
          reviewRequired: z.boolean(),
          reasons: z.array(z.string()),
          missingEvidence: z.array(z.string()),
        }),
      }),
    });

    return NextResponse.json(result.output);
  } catch (error) {
    return aiErrorResponse(error, 'Analiza AI a relevanței expert-curs nu este disponibilă.');
  }
}
