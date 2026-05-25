import { governedGenerateText, aiErrorResponse, assertAllowedAiRequest } from '@/lib/ai-governance';
import { NextResponse } from 'next/server';
import { openaiModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const { text, templateLabel, expertName, month, year, projectCode } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Textul GDPR este obligatoriu.' }, { status: 400 });
    }

    const result = await governedGenerateText({
      endpoint: '/api/ai/improve-gdpr-text',
      operation: 'improve-gdpr-text',
      request: body,
      actorName: expertName,
      month,
      year,
      projectCode: projectCode || '302141',
      model: openaiModel(),
      system: `Esti un asistent care imbunatateste texte de raportare GDPR pentru proiecte PEO.
Pastreaza sensul, nu inventa fapte, nu adauga neconformitati sau incidente care nu exista.
Scrie in romana, la persoana I singular, cu ton tehnic-administrativ.
Returneaza doar textul imbunatatit, fara explicatii.`,
      prompt: `Imbunatateste urmatorul text pentru activitatea GDPR "${templateLabel || 'activitate GDPR'}".
Pastreaza toate datele, livrabilele, concluziile si limitarile mentionate.

TEXT:
${text}`,
    });

    return NextResponse.json({ text: result.text, auditId: result.auditId });
  } catch (error) {
    console.error('Error improving GDPR text:', error);
    return aiErrorResponse(error, 'Eroare la imbunatatirea textului GDPR.');
  }
}
