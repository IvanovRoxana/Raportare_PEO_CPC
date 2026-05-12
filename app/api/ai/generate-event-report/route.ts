import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const EventReportSchema = z.object({
  eventTitle: z.string(),
  eventDate: z.string(),
  location: z.string(),
  participants: z.array(z.object({
    name: z.string(),
    organization: z.string(),
    role: z.string(),
  })),
  agenda: z.array(z.string()),
  discussions: z.string(),
  conclusions: z.string(),
  nextSteps: z.array(z.string()),
  attachments: z.array(z.string()),
});

export async function POST(req: Request) {
  try {
    const { description, activityTitle, date, expertName, subActivity } = await req.json();

    if (!description) {
      return NextResponse.json({ error: 'Descrierea activității este obligatorie' }, { status: 400 });
    }

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `Ești un asistent specializat în generarea rapoartelor de participare pentru evenimente în cadrul proiectelor PEO (finanțare europeană).
Generezi rapoarte profesionale, detaliate, în limba română, respectând formatul standard cerut de finanțator.
Extragi informațiile din descrierea activității și le completezi cu detalii plauzibile unde lipsesc.`,
      prompt: `Generează un raport de participare la eveniment bazat pe următoarele informații:

Titlul activității: ${activityTitle}
Data: ${date}
Expert responsabil: ${expertName}
Sub-activitate: ${subActivity || 'N/A'}

Descrierea activității:
${description}

Generează raportul în format JSON cu următoarea structură:
- eventTitle: Titlul complet al evenimentului
- eventDate: Data în format YYYY-MM-DD
- location: Locația (online/fizic + adresa/platforma)
- participants: Lista participanților cu nume, organizație și rol
- agenda: Lista punctelor de pe agendă
- discussions: Rezumatul discuțiilor
- conclusions: Concluziile principale
- nextSteps: Pașii următori stabiliți
- attachments: Lista anexelor recomandate

Dacă anumite informații lipsesc din descriere, completează-le cu valori plauzibile bazate pe contextul proiectului PEO.`,
      output: Output.object({
        schema: EventReportSchema,
      }),
    });

    const output = result.output;

    // Also generate the formatted MOM document text
    const momText = generateMOMText(output, expertName, date);

    return NextResponse.json({ 
      report: output,
      momText,
    });
  } catch (error) {
    console.error('Error generating event report:', error);
    return NextResponse.json(
      { error: 'Eroare la generarea raportului de eveniment' },
      { status: 500 }
    );
  }
}

function generateMOMText(report: z.infer<typeof EventReportSchema> | undefined, expertName: string, date: string): string {
  if (!report) return '';

  const formattedDate = new Date(date).toLocaleDateString('ro-RO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
MINUTĂ DE ÎNTÂLNIRE (MOM)
========================

Proiect: PEO - Parteneriat pentru Educație și Oportunități
Cod proiect: 302141

EVENIMENT: ${report.eventTitle}
DATA: ${formattedDate}
LOCAȚIA: ${report.location}

ORGANIZATOR: ${expertName}

---

PARTICIPANȚI:
${report.participants.map((p, i) => `${i + 1}. ${p.name} - ${p.organization} (${p.role})`).join('\n')}

---

AGENDA:
${report.agenda.map((item, i) => `${i + 1}. ${item}`).join('\n')}

---

DISCUȚII ȘI PUNCTE ABORDATE:

${report.discussions}

---

CONCLUZII:

${report.conclusions}

---

PAȘI URMĂTORI / ACȚIUNI:
${report.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

---

ANEXE:
${report.attachments.map((att, i) => `${i + 1}. ${att}`).join('\n')}

---

Întocmit de: ${expertName}
Data întocmirii: ${new Date().toLocaleDateString('ro-RO')}

Semnătură organizator: _____________________

Semnături participanți:
${report.participants.slice(0, 5).map((p) => `${p.name}: _____________________`).join('\n')}
`.trim();
}
