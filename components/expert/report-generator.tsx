'use client';

import { useState } from 'react';
import { FileText, Download, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMonthName } from '@/lib/app-utils';
import type { Activity } from '@/lib/types';

interface ReportGeneratorProps {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
}

export function ReportGenerator({ activities, month, year, expertName }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detailLevel, setDetailLevel] = useState('foarte_detaliat');
  const [useFineTunedModel, setUseFineTunedModel] = useState(false);
  const [preferredPhrases, setPreferredPhrases] = useState('');
  const [forbiddenPhrases, setForbiddenPhrases] = useState('');
  const [validatedExamples, setValidatedExamples] = useState('');
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [calculatedTotalHours, setCalculatedTotalHours] = useState<number | null>(null);

  const generateWithAI = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/generate-activity-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: activities.map((activity) => ({
            date: activity.date,
            hours: activity.hours,
            saCode: activity.saCode,
            activityType: activity.activityType,
            title: activity.title,
            description: activity.gdprGeneratedText || activity.description || activity.title,
            location: activity.location,
            gdprTemplateCode: activity.gdprTemplateCode,
            gdprConclusionCode: activity.gdprConclusionCode,
            deliverables: activity.deliverables?.map((deliverable) => deliverable.declaredTitle || deliverable.fileName).filter(Boolean) || [],
          })),
          month: getMonthName(month),
          year,
          expertName,
          projectCode: activities.find((activity) => activity.projectCode)?.projectCode || '302141',
          useFineTunedModel,
          reportingRules: {
            detailLevel,
            preferredPhrases: splitPhrases(preferredPhrases),
            forbiddenPhrases: splitPhrases(forbiddenPhrases),
          },
          validatedExamples: buildValidatedExamples(validatedExamples),
        }),
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedReport(data.report);
        setGenerationWarnings(data.warnings || []);
        setCalculatedTotalHours(data.totals?.totalHours ?? null);
      }
    } catch (err) {
      setError('Eroare la generarea raportului');
    } finally {
      setIsGenerating(false);
    }
  };


  const markAsValidatedExample = () => {
    if (!generatedReport) return;

    const example = {
      id: `activity_report_${Date.now()}`,
      createdAt: new Date().toISOString(),
      expertName,
      month: getMonthName(month),
      year,
      input: {
        activities,
        reportingRules: { detailLevel, preferredPhrases: splitPhrases(preferredPhrases), forbiddenPhrases: splitPhrases(forbiddenPhrases) },
      },
      validatedOutput: generatedReport,
    };
    const current = JSON.parse(window.localStorage.getItem('activity-report-training-examples') || '[]');
    window.localStorage.setItem('activity-report-training-examples', JSON.stringify([...current, example]));
  };

  const exportTrainingExamples = () => {
    const current = JSON.parse(window.localStorage.getItem('activity-report-training-examples') || '[]');
    const jsonl = current.map((example: { input: unknown; validatedOutput: string }) => JSON.stringify({
      messages: [
        { role: 'system', content: 'Ești un asistent specializat în redactarea Rapoartelor de Activitate PEO / Anexa 10 pentru proiecte cu finanțare europeană.' },
        { role: 'user', content: JSON.stringify(example.input) },
        { role: 'assistant', content: example.validatedOutput },
      ],
    })).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-report-training-examples-${Date.now()}.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToWord = async () => {
    if (!generatedReport) return;

    setIsExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
      const { saveAs } = await import('file-saver');

      const paragraphs = generatedReport.split('\n').map((line) => {
        if (line.startsWith('# ')) {
          return new Paragraph({
            text: line.replace('# ', ''),
            heading: HeadingLevel.HEADING_1,
          });
        }
        if (line.startsWith('## ')) {
          return new Paragraph({
            text: line.replace('## ', ''),
            heading: HeadingLevel.HEADING_2,
          });
        }
        if (line.startsWith('### ')) {
          return new Paragraph({
            text: line.replace('### ', ''),
            heading: HeadingLevel.HEADING_3,
          });
        }
        return new Paragraph({
          children: [new TextRun(line)],
        });
      });

      const doc = new Document({
        sections: [
          {
            children: paragraphs,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Raport_${expertName}_${getMonthName(month)}_${year}.docx`);
    } catch (err) {
      setError('Eroare la exportul documentului');
    } finally {
      setIsExporting(false);
    }
  };

  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);
  const uniqueDates = new Set(activities.map((a) => a.date)).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Generare Raport
        </CardTitle>
        <CardDescription>
          Generează raportul de activitate pentru {getMonthName(month)} {year}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{activities.length}</p>
            <p className="text-sm text-muted-foreground">Activități</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{uniqueDates}</p>
            <p className="text-sm text-muted-foreground">Zile lucrate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{totalHours}</p>
            <p className="text-sm text-muted-foreground">Total ore</p>
          </div>
        </div>


        <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nivel detaliere</Label>
            <Select value={detailLevel} onValueChange={setDetailLevel}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mediu">Mediu</SelectItem>
                <SelectItem value="detaliat">Detaliat</SelectItem>
                <SelectItem value="foarte_detaliat">Foarte detaliat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-7">
            <Checkbox id="fine-tuned-report" checked={useFineTunedModel} onCheckedChange={(checked) => setUseFineTunedModel(Boolean(checked))} />
            <Label htmlFor="fine-tuned-report">Folosește model fine-tuned dacă este disponibil</Label>
          </div>
          <div className="space-y-2">
            <Label>Formulări preferate (separate prin virgulă)</Label>
            <Input value={preferredPhrases} onChange={(event) => setPreferredPhrases(event.target.value)} placeholder="am elaborat, am consolidat" />
          </div>
          <div className="space-y-2">
            <Label>Formulări interzise (separate prin virgulă)</Label>
            <Input value={forbiddenPhrases} onChange={(event) => setForbiddenPhrases(event.target.value)} placeholder="conform documentului" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Exemple validate / fragmente de stil</Label>
            <Textarea value={validatedExamples} onChange={(event) => setValidatedExamples(event.target.value)} rows={3} placeholder="Lipește unul sau mai multe exemple scurte, separate prin ---" />
          </div>
        </div>

        {(calculatedTotalHours !== null || generationWarnings.length > 0) && (
          <div className="rounded-lg border p-3 text-sm">
            {calculatedTotalHours !== null && <p className="font-medium">Total ore calculate: {calculatedTotalHours}</p>}
            {generationWarnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {generationWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={generateWithAI} disabled={isGenerating || activities.length === 0}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Se generează...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generează cu AI
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={exportToWord}
            disabled={!generatedReport || isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Export...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Word
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={markAsValidatedExample} disabled={!generatedReport}>
            Marchează acest raport ca exemplu validat
          </Button>
          <Button variant="outline" onClick={exportTrainingExamples}>
            Exportă exemple pentru fine-tuning
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
        )}

        {generatedReport && (
          <div className="space-y-2">
            <Label>Raport generat:</Label>
            <Textarea
              value={generatedReport}
              onChange={(e) => setGeneratedReport(e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function splitPhrases(value: string) {
  return value.split(',').map((phrase) => phrase.trim()).filter(Boolean);
}

function buildValidatedExamples(value: string) {
  return value.split('---').map((example, index) => example.trim()).filter(Boolean).map((outputExample, index) => ({
    title: `Exemplu validat ${index + 1}`,
    outputExample,
  }));
}
