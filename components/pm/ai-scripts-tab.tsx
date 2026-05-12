'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, Sparkles, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

interface AIScript {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  category: 'raport' | 'verificare' | 'analiza';
}

const DEFAULT_SCRIPTS: AIScript[] = [
  {
    id: 'raport_activitate',
    name: 'Generare Raport Activitate',
    description: 'Generează raportul de activitate lunar pentru un expert',
    category: 'raport',
    systemPrompt: `Ești un expert în redactarea rapoartelor de activitate pentru proiecte cu finanțare europeană.
Generează un raport de activitate profesional, clar și concis.
Folosește un stil formal, la persoana I.
Include: obiective, activități realizate, rezultate, dificultăți (dacă există), pași următori.`,
    userPromptTemplate: `Generează raportul de activitate pentru:
Expert: {{expertName}}
Luna: {{month}} {{year}}
Activități realizate:
{{activities}}

Ore totale: {{totalHours}}h`,
  },
  {
    id: 'verificare_titlu',
    name: 'Verificare Titlu Document',
    description: 'Verifică dacă titlul documentului este conform cu activitatea',
    category: 'verificare',
    systemPrompt: `Ești un expert în verificarea conformității documentelor pentru proiecte PEO.
Analizează dacă titlul documentului corespunde cu activitatea și tipul de livrabil declarat.
Răspunde în format JSON: {"conform": true/false, "motiv": "explicație", "sugestii": ["lista sugestii"]}`,
    userPromptTemplate: `Verifică conformitatea:
Titlu document: {{documentTitle}}
Tip activitate: {{activityType}}
Descriere activitate: {{activityDescription}}`,
  },
  {
    id: 'analiza_cross',
    name: 'Analiză Cross-Expert',
    description: 'Analizează similitudinile între activitățile experților',
    category: 'analiza',
    systemPrompt: `Ești un expert în analiza proiectelor cu finanțare europeană.
Identifică posibile suprapuneri sau similitudini problematice între activitățile experților.
Acordă atenție la: aceleași date, activități similare, livrabile comune.`,
    userPromptTemplate: `Analizează activitățile pentru {{month}} {{year}}:
{{expertsData}}

Identifică potențiale probleme de suprapunere sau dublare.`,
  },
];

interface AIScriptsTabProps {
  onSaveScripts?: (scripts: AIScript[]) => void;
}

export function AIScriptsTab({ onSaveScripts }: AIScriptsTabProps) {
  const [scripts, setScripts] = useState<AIScript[]>(DEFAULT_SCRIPTS);
  const [activeScript, setActiveScript] = useState<string>(scripts[0]?.id || '');
  const [hasChanges, setHasChanges] = useState(false);

  const currentScript = scripts.find(s => s.id === activeScript);

  const updateScript = (id: string, updates: Partial<AIScript>) => {
    setScripts(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setHasChanges(true);
  };

  const resetScript = (id: string) => {
    const defaultScript = DEFAULT_SCRIPTS.find(s => s.id === id);
    if (defaultScript) {
      setScripts(prev => prev.map(s => s.id === id ? defaultScript : s));
    }
  };

  const saveAll = () => {
    onSaveScripts?.(scripts);
    setHasChanges(false);
    // Could save to localStorage or database here
    localStorage.setItem('peo_ai_scripts', JSON.stringify(scripts));
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'raport': return 'bg-blue-100 text-blue-800';
      case 'verificare': return 'bg-green-100 text-green-800';
      case 'analiza': return 'bg-purple-100 text-purple-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'raport': return <FileText className="h-3 w-3" />;
      case 'verificare': return <CheckCircle className="h-3 w-3" />;
      case 'analiza': return <AlertTriangle className="h-3 w-3" />;
      default: return <Sparkles className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Configurare Scripturi AI</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Personalizează prompturile folosite pentru generarea rapoartelor și verificări
          </p>
        </div>
        <Button
          onClick={saveAll}
          disabled={!hasChanges}
          size="sm"
          className="text-xs"
        >
          <Save className="h-3 w-3 mr-1" />
          Salvează modificările
        </Button>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-4">
        {/* Scripts List */}
        <div className="space-y-2">
          {scripts.map((script) => (
            <button
              key={script.id}
              onClick={() => setActiveScript(script.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                activeScript === script.id
                  ? 'bg-slate-100 border-slate-300'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className={`text-[10px] ${getCategoryColor(script.category)}`}>
                  {getCategoryIcon(script.category)}
                  <span className="ml-1">{script.category}</span>
                </Badge>
              </div>
              <div className="text-xs font-medium text-slate-900">{script.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{script.description}</div>
            </button>
          ))}
        </div>

        {/* Script Editor */}
        {currentScript && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm">{currentScript.name}</CardTitle>
                  <CardDescription className="text-xs">{currentScript.description}</CardDescription>
                </div>
                <Button
                  onClick={() => resetScript(currentScript.id)}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Resetează
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-medium">System Prompt</Label>
                <p className="text-[10px] text-slate-500 mb-2">
                  Instrucțiunile de bază pentru AI - definește personalitatea și stilul răspunsurilor
                </p>
                <Textarea
                  value={currentScript.systemPrompt}
                  onChange={(e) => updateScript(currentScript.id, { systemPrompt: e.target.value })}
                  rows={6}
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-medium">User Prompt Template</Label>
                <p className="text-[10px] text-slate-500 mb-2">
                  Template-ul pentru cerere. Variabile disponibile: {`{{expertName}}, {{month}}, {{year}}, {{activities}}, {{totalHours}}`}
                </p>
                <Textarea
                  value={currentScript.userPromptTemplate}
                  onChange={(e) => updateScript(currentScript.id, { userPromptTemplate: e.target.value })}
                  rows={8}
                  className="text-xs font-mono"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="text-xs font-medium text-slate-700 mb-2">Variabile disponibile:</div>
                <div className="flex flex-wrap gap-2">
                  {['{{expertName}}', '{{month}}', '{{year}}', '{{activities}}', '{{totalHours}}', '{{documentTitle}}', '{{activityType}}', '{{activityDescription}}', '{{expertsData}}'].map((v) => (
                    <Badge key={v} variant="outline" className="text-[10px] font-mono">
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
