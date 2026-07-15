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
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { Activity } from '@/lib/types';

interface ReportGeneratorProps {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
}

type ReportSectionKind = 'table' | 'sa-detail' | 'validation';

type ReportActivityPayload = {
  date: string;
  hours: number;
  saCode?: string;
  activityType?: string;
  title: string;
  description: string;
  location?: Activity['location'];
  gdprTemplateCode?: string;
  gdprConclusionCode?: string;
  deliverables: string[];
};

type ReportRequestPayload = {
  activities: ReportActivityPayload[];
  month: string;
  year: number;
  expertName: string;
  projectCode: string;
  useFineTunedModel: boolean;
  reportingRules: {
    detailLevel: string;
    preferredPhrases: string[];
    forbiddenPhrases: string[];
  };
  validatedExamples: ReturnType<typeof buildValidatedExamples>;
};

type ReportSectionPlan = {
  sectionKind: ReportSectionKind;
  sectionTitle: string;
  sectionSaCode?: string;
  activities: ReportActivityPayload[];
};

const REPORT_GENERATION_TIMEOUT_MS = 45_000;
const MAX_ACTIVITY_DESCRIPTION_CHARS = 700;
const MAX_DELIVERABLE_TITLES = 5;

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
  const [generationStatus, setGenerationStatus] = useState('');

  const generateWithAI = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedReport('');
    setGenerationWarnings([]);
    setGenerationStatus('Pregatesc sectiunile RA...');

    try {
      const payload = buildReportRequestPayload({
        activities,
        month,
        year,
        expertName,
        useFineTunedModel,
        detailLevel,
        preferredPhrases,
        forbiddenPhrases,
        validatedExamples,
      });
      const sections = buildReportSectionPlan(payload.activities);
      const generatedSections: string[] = [];
      const warnings = new Set<string>();

      for (const [index, section] of sections.entries()) {
        setGenerationStatus(`Generez ${index + 1}/${sections.length}: ${section.sectionTitle}`);
        const data = await generateReportSection({
          payload,
          section,
          sectionIndex: index + 1,
          totalSections: sections.length,
        });

        if (!data.report?.trim()) {
          throw new Error(`Sectiunea "${section.sectionTitle}" nu a generat continut.`);
        }

        generatedSections.push(data.report.trim());
        for (const warning of data.warnings || []) warnings.add(warning);
      }

      setGeneratedReport(generatedSections.join('\n\n'));
      setGenerationWarnings([
        `Raportul a fost generat cu AI in ${sections.length} sectiuni pentru a evita timeout-ul AWS.`,
        ...Array.from(warnings),
      ]);
      setCalculatedTotalHours(totalHours);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        useFallbackReport('O sectiune AI a durat prea mult. Am generat local un raport RA editabil si exportabil.');
      } else {
        const message = err instanceof Error ? err.message : 'Eroare la generarea raportului';
        if (/504|timeout|expir/i.test(message)) {
          useFallbackReport('AI-ul nu a terminat una dintre sectiuni in timpul disponibil. Am generat local un raport RA editabil si exportabil.');
        } else {
          setError(message);
        }
      }
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const useFallbackReport = (warning: string) => {
    setGeneratedReport(buildLocalActivityReport({
      activities,
      month,
      year,
      expertName,
      preferredPhrases: splitPhrases(preferredPhrases),
      forbiddenPhrases: splitPhrases(forbiddenPhrases),
    }));
    setCalculatedTotalHours(totalHours);
    setGenerationWarnings([warning]);
    setError(null);
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
      downloadBlob(blob, `Raport_${expertName}_${getMonthName(month)}_${year}.docx`);
    } catch (err) {
      console.error('Error exporting activity report:', err);
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
                {generationStatus || 'Se generează...'}
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

function truncateForReport(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_ACTIVITY_DESCRIPTION_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ACTIVITY_DESCRIPTION_CHARS).trim()}...`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildReportRequestPayload({
  activities,
  month,
  year,
  expertName,
  useFineTunedModel,
  detailLevel,
  preferredPhrases,
  forbiddenPhrases,
  validatedExamples,
}: {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
  useFineTunedModel: boolean;
  detailLevel: string;
  preferredPhrases: string;
  forbiddenPhrases: string;
  validatedExamples: string;
}): ReportRequestPayload {
  return {
    activities: activities.map((activity) => ({
      date: activity.date,
      hours: activity.hours,
      saCode: activity.saCode,
      activityType: activity.activityType,
      title: activity.title,
      description: truncateForReport(activity.gdprGeneratedText || activity.description || activity.title),
      location: activity.location,
      gdprTemplateCode: activity.gdprTemplateCode,
      gdprConclusionCode: activity.gdprConclusionCode,
      deliverables: (activity.deliverables?.map((deliverable) => getDocumentAuditTitle(deliverable)).filter(Boolean) || [])
        .slice(0, MAX_DELIVERABLE_TITLES),
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
  };
}

function buildReportSectionPlan(activities: ReportActivityPayload[]): ReportSectionPlan[] {
  const groupedBySa = activities.reduce<Record<string, ReportActivityPayload[]>>((groups, activity) => {
    const key = activity.saCode || 'SA neprecizata';
    groups[key] = [...(groups[key] || []), activity];
    return groups;
  }, {});

  return [
    {
      sectionKind: 'table',
      sectionTitle: 'Tabel activitati',
      activities,
    },
    ...Object.entries(groupedBySa).map(([saCode, items]) => ({
      sectionKind: 'sa-detail' as const,
      sectionTitle: `Descriere detaliata ${saCode}`,
      sectionSaCode: saCode,
      activities: items,
    })),
    {
      sectionKind: 'validation',
      sectionTitle: 'Validari si semnaturi',
      activities,
    },
  ];
}

async function generateReportSection({
  payload,
  section,
  sectionIndex,
  totalSections,
}: {
  payload: ReportRequestPayload;
  section: ReportSectionPlan;
  sectionIndex: number;
  totalSections: number;
}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REPORT_GENERATION_TIMEOUT_MS);

  try {
    const response = await fetch('/api/ai/generate-activity-report-section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        ...payload,
        activities: section.activities,
        sectionKind: section.sectionKind,
        sectionTitle: section.sectionTitle,
        sectionSaCode: section.sectionSaCode,
        sectionIndex,
        totalSections,
      }),
    });

    const contentType = response.headers.get('Content-Type') || '';
    const data = contentType.includes('application/json')
      ? ((await response.json().catch(() => ({}))) as {
          error?: string;
          report?: string;
          warnings?: string[];
          totals?: { totalHours?: number };
        })
      : { error: await response.text().catch(() => '') };

    if (!response.ok || data.error) {
      throw new Error(data.error || `Eroare la generarea sectiunii "${section.sectionTitle}". Status HTTP: ${response.status}`);
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildLocalActivityReport({
  activities,
  month,
  year,
  expertName,
  preferredPhrases,
  forbiddenPhrases,
}: {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
  preferredPhrases: string[];
  forbiddenPhrases: string[];
}) {
  const sortedActivities = [...activities].sort((first, second) => first.date.localeCompare(second.date));
  const totalHours = sortedActivities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
  const uniqueDates = [...new Set(sortedActivities.map((activity) => activity.date))];
  const bySa = sortedActivities.reduce<Record<string, Activity[]>>((groups, activity) => {
    const key = activity.saCode || 'SA neprecizata';
    groups[key] = [...(groups[key] || []), activity];
    return groups;
  }, {});
  const preferredPhrase = preferredPhrases[0] || 'am realizat';
  const forbiddenLine = forbiddenPhrases.length > 0
    ? `\nFormulari evitate: ${forbiddenPhrases.join(', ')}.`
    : '';

  const tableRows = Object.entries(bySa).map(([saCode, items]) => {
    const hours = items.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0);
    const dates = [...new Set(items.map((activity) => activity.date))].join(', ');
    const titles = [...new Set(items.map((activity) => activity.title || activity.activityType || 'Activitate'))].join('; ');
    const deliverables = collectDeliverableTitles(items);
    return `| ${saCode} | ${dates} | ${titles} | ${deliverables || 'Livrabile mentionate in activitatile raportate'} | ${hours} |`;
  });

  const detailRows = Object.entries(bySa).flatMap(([saCode, items]) => [
    `### ${saCode}`,
    ...items.map((activity) => {
      const description = truncateForReport(activity.gdprGeneratedText || activity.description || activity.title || activity.activityType || 'Activitate raportata');
      const deliverables = collectDeliverableTitles([activity]);
      return [
        `**${activity.date} - ${Number(activity.hours) || 0}h**`,
        `${preferredPhrase} activitatea "${activity.title || activity.activityType || 'activitate raportata'}". ${description}`,
        `Rezultat: activitatea a fost documentata si integrata in raportarea lunara.`,
        `Beneficiar: proiectul si partile interesate relevante.`,
        `Indicator/Impact: contributie la indeplinirea activitatilor planificate pentru ${getMonthName(month)} ${year}.`,
        `Livrabile: ${deliverables || 'nu sunt precizate in activitate'}.`,
        `Locatie: ${activity.location || 'neprecizata'}.`,
      ].join('\n');
    }),
  ]);

  return [
    `# Raport de Activitate - ${expertName}`,
    '',
    `## ${getMonthName(month)} ${year}`,
    '',
    `Raport generat local din activitatile introduse, deoarece generarea AI nu a finalizat in timpul disponibil.${forbiddenLine}`,
    '',
    '## 1. Tabel activitati',
    '',
    '| Subactivitate / cod SA | Perioada / zile acoperite | Activitate prestata | Rezultate / materiale elaborate / livrabile | Nr. ore lucrate |',
    '| --- | --- | --- | --- | ---: |',
    ...tableRows,
    '',
    '## 2. Descriere detaliata pe subactivitati si zile',
    '',
    ...detailRows,
    '',
    '## 3. Probleme / intarzieri',
    '',
    'Nu este cazul.',
    '',
    '## 4. Validari si observatii de completare',
    '',
    `Total ore in raport = ${totalHours}`,
    `Total ore introduse = ${totalHours}`,
    `Zile lucrate = ${uniqueDates.length}`,
    'Coerenta: DA',
    'Observatii: raportul poate fi revizuit manual inainte de export.',
    '',
    '## 5. Semnaturi',
    '',
    `Expert: ${expertName}`,
    'Semnatura: ____________________',
  ].join('\n');
}

function collectDeliverableTitles(activities: Activity[]) {
  return [...new Set(activities.flatMap((activity) =>
    (activity.deliverables || []).map((deliverable) => getDocumentAuditTitle(deliverable)).filter(Boolean),
  ))].slice(0, MAX_DELIVERABLE_TITLES).join('; ');
}

function buildValidatedExamples(value: string) {
  return value.split('---').map((example, index) => example.trim()).filter(Boolean).map((outputExample, index) => ({
    title: `Exemplu validat ${index + 1}`,
    outputExample,
  }));
}
