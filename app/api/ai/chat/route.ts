import { generateText } from 'ai';
import { NextResponse } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Mesajele sunt obligatorii' }, { status: 400 });
    }

    const contextInfo = context?.notes
      ? `\n\nNote existente în verificare:\n${context.notes.map((n: { content: string }) => `- ${n.content}`).join('\n')}`
      : '';

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: `Ești Ramona, un asistent AI specializat în verificarea documentelor pentru proiecte cu finanțare europeană (PEO).
Ești expertă în:
- Verificarea conformității pontajelor și rapoartelor de activitate
- Identificarea neconformităților și a inconsistențelor
- Procedurile de raportare pentru proiecte europene
- Regulamentele și ghidurile de finanțare

Răspunzi în limba română, într-un mod profesional dar prietenos.
Oferi sfaturi practice și actionabile.${contextInfo}`,
      messages: messages.map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return NextResponse.json({ message: result.text });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json(
      { error: 'Eroare la comunicarea cu asistentul AI' },
      { status: 500 }
    );
  }
}
