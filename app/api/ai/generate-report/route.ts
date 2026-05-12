import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { activities, month, year, expertName } = await req.json();

    if (!activities || activities.length === 0) {
      return NextResponse.json({ error: 'Nu există activități pentru raport' }, { status: 400 });
    }

    const activitiesSummary = activities
      .map((a: { date: string; hours: number; activityType: string; title: string; description: string }) =>
        `- Data: ${a.date}, Ore: ${a.hours}, Tip: ${a.activityType}, Titlu: ${a.title}, Descriere: ${a.description}`
      )
      .join('\n');

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
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

    return NextResponse.json({ report: result.text });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Eroare la generarea raportului. Verificați cheia API.' },
      { status: 500 }
    );
  }
}
