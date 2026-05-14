'use client';

import { useState } from 'react';
import { Plus, Trash2, MessageSquare, Bot, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateId, formatDateRo } from '@/lib/app-utils';
import type { VerificationNote } from '@/lib/types';

interface NotesTabProps {
  data: VerificationNote[];
  onDataChange: (data: VerificationNote[]) => void;
}

const CATEGORIES = [
  'General',
  'Pontaj',
  'Raport',
  'Livrabile',
  'Recomandări',
  'Observații',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function NotesTab({ data, onDataChange }: NotesTabProps) {
  const [newNote, setNewNote] = useState('');
  const [category, setCategory] = useState('General');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const addNote = () => {
    if (!newNote.trim()) return;

    const note: VerificationNote = {
      id: generateId(),
      content: newNote,
      category,
      createdAt: new Date().toISOString(),
      author: 'PM',
    };

    onDataChange([note, ...data]);
    setNewNote('');
  };

  const deleteNote = (id: string) => {
    onDataChange(data.filter((n) => n.id !== id));
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages([...chatMessages, userMessage]);
    setChatInput('');
    setIsSending(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMessage],
          context: {
            notes: data,
          },
        }),
      });

      const result = await response.json();
      if (result.message) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.message },
        ]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Eroare la comunicarea cu asistentul AI.' },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Notes Section */}
      <div className="space-y-6">
        {/* Add Note */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Note Verificare
            </CardTitle>
            <CardDescription>
              Adăugați note și observații pentru procesul de verificare
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Categorie</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Badge
                    key={cat}
                    variant={category === cat ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notă</Label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Scrieți nota aici..."
                rows={3}
              />
            </div>
            <Button onClick={addNote} disabled={!newNote.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Adaugă notă
            </Button>
          </CardContent>
        </Card>

        {/* Notes List */}
        <Card>
          <CardHeader>
            <CardTitle>Note ({data.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {data.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {data.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-muted rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {note.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {note.createdAt ? formatDateRo(note.createdAt) : '-'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteNote(note.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nu există note.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Assistant Chat */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Asistent AI (Ramona)
          </CardTitle>
          <CardDescription>
            Întrebați asistentul AI despre verificarea documentelor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chat Messages */}
          <ScrollArea className="h-[400px] border rounded-lg p-4">
            {chatMessages.length > 0 ? (
              <div className="space-y-4">
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>Bună! Sunt Ramona, asistentul tău AI.</p>
                  <p className="text-xs mt-1">Întreabă-mă orice despre verificarea documentelor.</p>
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Chat Input */}
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Scrie un mesaj..."
              disabled={isSending}
            />
            <Button onClick={sendChatMessage} disabled={!chatInput.trim() || isSending}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
