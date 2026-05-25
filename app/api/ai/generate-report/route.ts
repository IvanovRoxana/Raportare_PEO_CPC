import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { NextResponse } from 'next/server';
import { openaiModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const { activities, month, year, expertName } = body;

    if (!activities || activities.length === 0) {
      return NextResponse.json({ error: 'Nu există activități pentru raport' }, { status: 400 });
    }

    const activitiesSummary = activities
      .map((a: { date: string; hours: number; activityType: string; title: string; description: string; gdprGeneratedText?: string; gdprTemplateCode?: string; gdprConclusionCode?: string }) =>
        `- Data: ${a.date}, Ore: ${a.hours}, Tip: ${a.activityType}, Titlu: ${a.title}, Descriere: ${a.gdprGeneratedText || a.description}${a.gdprTemplateCode ? `, Cod GDPR: ${a.gdprTemplateCode}` : ''}${a.gdprConclusionCode ? `, Concluzie GDPR: ${a.gdprConclusionCode}` : ''}`
      )
      .join('\n');

    const result = await governedGenerateText({
      endpoint: '/api/ai/generate-report',
      operation: 'generate-report',
      request: body,
      actorName: expertName,
      month,
      year,
      projectCode: '302141',
      model: openaiModel(),
      system: `Ești un asistent care generează rapoarte de activitate pentru proiecte PEO (Proiecte cu finanțare europeană).
Generează rapoarte clare, profesionale, în limba română.
Folosește formatul standard pentru rapoarte de activitate cu secțiuni clare.`,
      prompt: `Generează un raport de activitate pentru:
Expert: ${expertName}
Luna: ${month} ${year}
Cod Proiect: 302141

Activități înregistrate:
${activitiesSummary}

Structura raportului:
# RAPORT DE ACTIVITATE
## Perioada: ${month} ${year}
## Expert: ${expertName}

### 1. Rezumat executiv
(scurt rezumat al activităților lunare)

### 2. Activități desfășurate
(pentru fiecare activitate: data, tipul, descrierea detaliată)

### 3. Rezultate și livrabile
(enumerare rezultate concrete)

### 4. Concluzii și recomandări
(concluzii privind activitățile și recomandări pentru perioada următoare)`,
    });

    return NextResponse.json({ report: result.text, auditId: result.auditId });
  } catch (error) {
    console.error('Error generating report:', error);
    return aiErrorResponse(error, 'Eroare la generarea raportului. Verificați cheia API.');
  }
}
