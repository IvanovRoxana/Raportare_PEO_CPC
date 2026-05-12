import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { files, activities, month, year } = body;

    // New format: text-based analysis with activities array
    if (activities && activities.length > 0) {
      const activitiesText = activities.map((a: { expertName: string; date: string; activityType: string; title: string; hours: number; description?: string }) => 
        `- ${a.expertName} | ${a.date} | ${a.activityType || 'N/A'} | ${a.title || 'Fără titlu'} | ${a.hours}h`
      ).join('\n');

      const result = await generateText({
        model: 'openai/gpt-4o-mini',
        system: `Ești un expert în analiza și verificarea rapoartelor de activitate pentru proiecte cu finanțare europeană (PEO).
Analizează activitățile mai multor experți și identifică:
1. Suprapuneri suspecte (activități similare pe aceleași date)
2. Posibile dublări de efort
3. Inconsistențe în raportare
4. Potențiale probleme de conformitate

Răspunde în limba română, concis și organizat.
Dacă nu găsești probleme, menționează că totul pare în regulă.`,
        prompt: `Analizează activitățile din ${month} ${year}:

${activitiesText}

Identifică potențiale probleme de suprapunere sau dublare între experți.`,
      });

      return NextResponse.json({ analysis: result.text });
    }

    // Legacy format: file-based comparison
    if (!files || files.length < 2) {
      return NextResponse.json(
        { error: 'Sunt necesare cel puțin 2 rapoarte pentru comparare' },
        { status: 400 }
      );
    }

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `Ești un expert în detectarea suprapunerilor suspecte între activitățile raportate de diferiți experți 
în proiecte cu finanțare europeană. Analizezi rapoartele pentru a identifica:
1. Activități identice sau foarte similare raportate de experți diferiți în aceeași zi
2. Descrieri copiate sau aproape identice
3. Ore de lucru care se suprapun

Aceasta este o verificare importantă pentru prevenirea fraudelor.`,
      prompt: `Analizează rapoartele a ${files.length} experți și identifică suprapuneri suspecte:

FIȘIERE:
${files.map((f: { name: string }, i: number) => `Expert ${i + 1}: ${f.name}`).join('\n')}

Generează o analiză care identifică potențiale suprapuneri.
Pentru demonstrație, simulează o analiză tipică cu câteva exemple de suprapuneri găsite și câteva care sunt OK.

Returnează rezultatul în format JSON:
{
  "comparisons": [
    {
      "id": "cross-1",
      "date": "2024-01-15",
      "expert1": "Expert 1",
      "expert2": "Expert 2",
      "activity1": "Titlul activității expert 1",
      "activity2": "Titlul activității expert 2",
      "similarity": 85,
      "isPotentialIssue": true
    }
  ]
}

similarity este un procent de 0-100 care indică similaritatea.
isPotentialIssue este true dacă similarity > 70%.`,
      output: Output.object({
        schema: z.object({
          comparisons: z.array(
            z.object({
              id: z.string(),
              date: z.string(),
              expert1: z.string(),
              expert2: z.string(),
              activity1: z.string(),
              activity2: z.string(),
              similarity: z.number(),
              isPotentialIssue: z.boolean(),
            })
          ),
        }),
      }),
    });

    const output = result.output;
    return NextResponse.json({ comparisons: output?.comparisons || [] });
  } catch (error) {
    console.error('Error in cross-expert analysis:', error);
    return NextResponse.json(
      { 
        error: 'Eroare la analiza cross-expert',
        analysis: 'Eroare la analiza cross-expert: ' + (error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 500 }
    );
  }
}
