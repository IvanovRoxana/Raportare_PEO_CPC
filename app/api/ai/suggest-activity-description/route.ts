import { governedGenerateText, aiErrorResponse } from '@/lib/ai-governance';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CatalogGuidance = {
  description?: string;
  objectives?: string;
  serviceComponent?: string;
  beneficiaries?: string;
  expectedResults?: string;
  deliverables?: string;
  indicators?: string;
};

function cleanText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function hasCatalogGuidance(catalog: CatalogGuidance) {
  return Object.values(catalog).some((value) => cleanText(value).length > 0);
}

function formatCatalogValue(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || 'Nespecificat în catalog';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      activityId,
      activityName,
      subactivity,
      date,
      hours,
      expertName,
      rawDescription,
      catalog = {},
    } = body as {
      activityId?: string;
      activityName?: string;
      subactivity?: string;
      date?: string;
      hours?: string | number;
      expertName?: string;
      rawDescription?: string;
      catalog?: CatalogGuidance;
    };

    const cleanedActivityName = cleanText(activityName);
    const cleanedRawDescription = cleanText(rawDescription);

    if (!cleanedActivityName || !cleanedRawDescription || !hasCatalogGuidance(catalog)) {
      return NextResponse.json(
        { error: 'Activitatea, descrierea brută și reperele din catalog sunt obligatorii.' },
        { status: 400 }
      );
    }

    const result = await governedGenerateText({
      endpoint: '/api/ai/suggest-activity-description',
      operation: 'suggest-activity-description',
      request: {
        activityId,
        activityName: cleanedActivityName,
        subactivity,
        date,
        hours,
        expertName,
        rawDescription: cleanedRawDescription,
        catalog,
      },
      actorName: cleanText(expertName) || undefined,
      projectCode: '302141',
      model: 'openai/gpt-4o-mini',
      system: `Ești un asistent de redactare pentru completarea pontajului experților într-un proiect PEO cu finanțare europeană. Rolul tău este să ajuți expertul să formuleze clar și profesional activitatea efectiv realizată. Nu inventa activități, ore, livrabile, rezultate, întâlniri sau documente. Folosește reperele din catalog doar ca orientare pentru încadrare și terminologie. Textul final trebuie să rămână verificabil și editabil de către expert. Scrie în limba română, la persoana I, păstrează strict faptele introduse de expert și returnează doar textul propus, fără explicații suplimentare.`,
      prompt: `Activitate selectată: ${cleanedActivityName}
Subactivitate: ${formatCatalogValue(subactivity)}
Data: ${formatCatalogValue(date)}
Ore: ${formatCatalogValue(hours)}
Expert: ${formatCatalogValue(expertName)}

Text brut introdus de expert:
${cleanedRawDescription}

Repere din catalog:
Descriere: ${formatCatalogValue(catalog.description)}
Obiective: ${formatCatalogValue(catalog.objectives)}
Componenta serviciului: ${formatCatalogValue(catalog.serviceComponent)}
Beneficiari: ${formatCatalogValue(catalog.beneficiaries)}
Rezultate așteptate: ${formatCatalogValue(catalog.expectedResults)}
Livrabile: ${formatCatalogValue(catalog.deliverables)}
Indicatori / observații relevante: ${formatCatalogValue(catalog.indicators)}

Te rog să reformulezi textul brut într-o descriere profesională pentru câmpul de pontaj, fără să adaugi informații neconfirmate. Păstrează textul relativ concis, dar suficient de specific.`,
    });

    const suggestion = cleanText(result.text);
    if (!suggestion) {
      return NextResponse.json({ error: 'Sugestia AI este goală.' }, { status: 502 });
    }

    return NextResponse.json({ suggestion, auditId: result.auditId });
  } catch (error) {
    console.error('Error suggesting activity description:', error);
    return aiErrorResponse(
      error,
      'Sugestia AI nu a putut fi generată momentan. Poți completa manual descrierea activității.'
    );
  }
}
