import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const DateVerificationSchema = z.object({
  extractedDates: z.array(z.object({
    date: z.string(),
    context: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  documentDate: z.string().nullable(),
  matchesPontajDate: z.boolean(),
  discrepancy: z.string().nullable(),
  recommendation: z.string(),
});

export async function POST(req: Request) {
  try {
    const { documentText, documentTitle, pontajDate, activityTitle } = await req.json();

    if (!documentText && !documentTitle) {
      return NextResponse.json({ error: 'Textul sau titlul documentului este obligatoriu' }, { status: 400 });
    }

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `Ești un asistent specializat în verificarea documentelor pentru proiecte cu finanțare europeană.
Sarcina ta este să extragi datele din documente și să verifici dacă corespund cu data pontată.
Fii atent la:
- Date explicite în text (ex: "15 ianuarie 2024")
- Date din titlul documentului
- Referințe la perioade (ex: "luna ianuarie", "trimestrul I")
- Date implicite din context`,
      prompt: `Analizează următorul document și verifică corespondența datei cu pontajul.

Titlul documentului: ${documentTitle || 'N/A'}
Conținutul documentului (fragment): ${documentText ? documentText.substring(0, 2000) : 'N/A'}
Data pontată: ${pontajDate}
Titlul activității: ${activityTitle}

Extrage toate datele menționate în document și verifică dacă cel puțin una corespunde cu data pontată (${pontajDate}).

Returnează în format JSON:
- extractedDates: lista datelor găsite cu contextul și nivelul de încredere
- documentDate: data principală a documentului (dacă poate fi determinată)
- matchesPontajDate: true dacă data documentului corespunde cu data pontată (toleranță +/- 3 zile)
- discrepancy: descrierea discrepanței (dacă există)
- recommendation: recomandare pentru utilizator`,
      output: Output.object({
        schema: DateVerificationSchema,
      }),
    });

    return NextResponse.json({ verification: result.output });
  } catch (error) {
    console.error('Error verifying date:', error);
    return NextResponse.json(
      { error: 'Eroare la verificarea datei documentului' },
      { status: 500 }
    );
  }
}
