import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const { livrabile, raportData, files } = await req.json();

    if (!livrabile || !raportData) {
      return NextResponse.json(
        { error: 'Datele despre livrabile și raport sunt obligatorii' },
        { status: 400 }
      );
    }

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `Ești un expert în verificarea conformității numelor de fișiere livrabile pentru proiecte cu finanțare europeană.
Verifică dacă numele fișierelor încărcate corespund cu titlurile activităților din raportul de activitate.
Un nume de fișier trebuie să conțină elemente din titlul activității pentru a fi considerat valid.`,
      prompt: `Verifică dacă numele fișierelor livrabile corespund cu activitățile din raport:

FIȘIERE ÎNCĂRCATE:
${files.map((f: { name: string }) => f.name).join('\n')}

ACTIVITĂȚI DIN RAPORT:
${JSON.stringify(raportData, null, 2)}

Pentru fiecare fișier, identifică:
1. Dacă numele fișierului poate fi asociat cu o activitate din raport
2. Data activității corespunzătoare
3. Titlul activității corespunzătoare
4. Probleme (dacă numele nu corespunde sau activitatea nu există)

Returnează rezultatul în format JSON:
{
  "verifiedData": [
    {
      "id": "livrabil-1",
      "fileName": "nume_fisier.pdf",
      "activityDate": "2024-01-15" sau "",
      "activityTitle": "Titlul activității" sau "",
      "fileExists": true,
      "titleMatch": true/false,
      "issues": ["problemă identificată"]
    }
  ]
}`,
      output: Output.object({
        schema: z.object({
          verifiedData: z.array(
            z.object({
              id: z.string(),
              fileName: z.string(),
              activityDate: z.string(),
              activityTitle: z.string(),
              fileExists: z.boolean(),
              titleMatch: z.boolean(),
              issues: z.array(z.string()),
            })
          ),
        }),
      }),
    });

    const output = result.output;
    return NextResponse.json({ verifiedData: output?.verifiedData || livrabile });
  } catch (error) {
    console.error('Error verifying livrabile:', error);
    return NextResponse.json(
      { error: 'Eroare la verificarea livrabilelor' },
      { status: 500 }
    );
  }
}
