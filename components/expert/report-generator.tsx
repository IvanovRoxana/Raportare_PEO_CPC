'use client';

import { useState } from 'react';
import { FileText, Download, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

  const generateWithAI = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities,
          month: getMonthName(month),
          year,
          expertName,
        }),
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedReport(data.report);
      }
    } catch (err) {
      setError('Eroare la generarea raportului');
    } finally {
      setIsGenerating(false);
    }
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

        <div className="flex gap-2">
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
