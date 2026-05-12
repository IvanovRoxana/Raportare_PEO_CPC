import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { title, activityType, description, apiKey, subActivity, activityTitle, deliverableType, declaredTitle, docText } = await req.json();

    // Handle legacy format (simple title check)
    if (title && !declaredTitle) {
      const result = await generateText({
        model: 'openai/gpt-4o-mini',
        system: `Ești un expert în verificarea conformității titlurilor de activități pentru proiecte cu finanțare europeană (PEO).
Verifică dacă titlul activității este:
1. Relevant pentru tipul de activitate specificat
2. Suficient de descriptiv și clar
3. Formulat profesional
4. Conform cu standardele de raportare PEO

Răspunde scurt și concis în limba română.`,
        prompt: `Verifică titlul activității:

Titlu: "${title}"
Tip activitate: ${activityType}
Descriere: ${description || 'Fără descriere'}

Oferă o evaluare scurtă (2-3 propoziții) și sugestii de îmbunătățire dacă este cazul.`,
      });

      return NextResponse.json({ result: result.text });
    }

    // Handle new format (eligibility check)
    if (declaredTitle) {
      const systemPrompt = `Ești un expert în verificarea eligibilității documentelor pentru proiecte PEO (Program de Educație și Ocupare).

Analizează dacă documentul descris este eligibil pentru activitatea specificată. Răspunde în format JSON strict:
{
  "eligible": true/false/null,
  "reason": "Explicație scurtă în română",
  "issues": ["Lista problemelor identificate"]
}

Criterii de eligibilitate:
1. Titlul documentului trebuie să fie relevant pentru activitatea și sub-activitatea specificate
2. Conținutul (dacă este disponibil) trebuie să demonstreze legătura cu obiectivele activității
3. Tipul de livrabil trebuie să fie potrivit pentru tipul de activitate
4. Documentul trebuie să respecte standardele de calitate PEO

Dacă nu poți determina eligibilitatea, setează "eligible" ca null.`;

      const userPrompt = `Verifică eligibilitatea următorului document:

Sub-activitate: ${subActivity || 'Nespecificată'}
Titlu activitate: ${activityTitle || 'Nespecificat'}
Tip livrabil declarat: ${deliverableType || 'Nespecificat'}
Titlu document: ${declaredTitle}
${docText ? `\nConținut document (primele 2000 caractere):\n${docText.substring(0, 2000)}` : ''}

Răspunde doar cu JSON valid.`;

      const result = await generateText({
        model: 'openai/gpt-4o-mini',
        system: systemPrompt,
        prompt: userPrompt,
      });

      // Parse JSON from response
      const content = result.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json(parsed);
        } catch {
          // Fall through to default response
        }
      }

      return NextResponse.json({
        eligible: null,
        reason: 'Nu am putut analiza răspunsul AI',
        issues: [],
      });
    }

    return NextResponse.json({ error: 'Parametri lipsă' }, { status: 400 });
  } catch (error) {
    console.error('Error verifying title:', error);
    return NextResponse.json(
      { 
        eligible: null, 
        reason: error instanceof Error ? error.message : 'Eroare necunoscută',
        issues: [],
        error: 'Eroare la verificarea titlului' 
      },
      { status: 500 }
    );
  }
}
