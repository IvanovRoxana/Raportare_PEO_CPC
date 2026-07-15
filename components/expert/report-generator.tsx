'use client';

import { useMemo, useState } from 'react';
import { FileText, Download, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMonthName } from '@/lib/app-utils';
import {
  buildLocalActivityReport,
  isBlockedActivityReportExport,
  isLocalFallbackReport,
  MAX_DELIVERABLE_TITLES,
  truncateActivityReportText,
} from '@/lib/activity-report/local-fallback';
import { buildAnexa10ReportModel } from '@/lib/activity-report/build-report-model';
import { buildAnexa10DocxBlob, buildAnexa10DocxFilename } from '@/lib/activity-report/docx-export';
import { getAnexa10ExportReadiness } from '@/lib/activity-report/export-readiness';
import { combineActivityReportSections, splitActivityReportSections } from '@/lib/activity-report/sections';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { Activity, Expert } from '@/lib/types';

interface ReportGeneratorProps {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
  expert?: Pick<Expert, 'id' | 'name' | 'positionInProject' | 'role' | 'contractNumber' | 'contractType' | 'category' | 'projectCode' | 'projectTitle' | 'beneficiary'>;
  enableDeterministicAnexa10Docx?: boolean;
}

type ReportSectionKind = 'table' | 'narrative';

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

type GeneratedReportTab = 'full' | 'table' | 'narrative';

const REPORT_GENERATION_TIMEOUT_MS = 110_000;

export function ReportGenerator({
  activities,
  month,
  year,
  expertName,
  expert,
  enableDeterministicAnexa10Docx = false,
}: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDeterministicDocx, setIsExportingDeterministicDocx] = useState(false);
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
  const [generatedTableSection, setGeneratedTableSection] = useState('');
  const [generatedNarrativeSection, setGeneratedNarrativeSection] = useState('');
  const [activeGeneratedTab, setActiveGeneratedTab] = useState<GeneratedReportTab>('full');
  const [isLocalFallbackDraft, setIsLocalFallbackDraft] = useState(false);
  const deterministicAnexa10Model = useMemo(() => {
    if (!enableDeterministicAnexa10Docx || activities.length === 0) return null;

    const reportExpert = expert ?? {
      id: activities[0]?.expertId || 'expert',
      name: expertName,
      role: '',
      projectCode: activities.find((activity) => activity.projectCode)?.projectCode || '302141',
    };
    return buildAnexa10ReportModel({
      expert: reportExpert,
      activities,
      month,
      year,
    });
  }, [activities, enableDeterministicAnexa10Docx, expert, expertName, month, year]);
  const deterministicExportReadiness = deterministicAnexa10Model
    ? getAnexa10ExportReadiness(deterministicAnexa10Model)
    : null;

  const generateWithAI = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedReport('');
    setGeneratedTableSection('');
    setGeneratedNarrativeSection('');
    setActiveGeneratedTab('table');
    setIsLocalFallbackDraft(false);
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
      const generatedSections: Partial<Record<ReportSectionKind, string>> = {};
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

        generatedSections[section.sectionKind] = data.report.trim();
        for (const warning of data.warnings || []) warnings.add(warning);
      }

      const tableSection = generatedSections.table || '';
      const narrativeSection = generatedSections.narrative || '';
      setGeneratedTableSection(tableSection);
      setGeneratedNarrativeSection(narrativeSection);
      setGeneratedReport(combineActivityReportSections({ table: tableSection, narrative: narrativeSection }));
      setActiveGeneratedTab('full');
      setIsLocalFallbackDraft(false);
      setGenerationWarnings([
        'Raportul a fost generat cu AI in doua parti: Sectiunea 1 tabel si Sectiunea 2 narativ.',
        ...Array.from(warnings),
      ]);
      setCalculatedTotalHours(totalHours);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        useFallbackReport('Generarea AI a depasit timpul disponibil. Am generat local doar un draft RA pentru verificare.');
      } else {
        const message = err instanceof Error ? err.message : 'Eroare la generarea raportului';
        if (/504|timeout|expir/i.test(message)) {
          useFallbackReport('AI-ul nu a finalizat in timpul disponibil. Am generat local doar un draft RA pentru verificare.');
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
    const fallbackReport = buildLocalActivityReport({
      activities,
      month,
      year,
      expertName,
      preferredPhrases: splitPhrases(preferredPhrases),
      forbiddenPhrases: splitPhrases(forbiddenPhrases),
    });
    const { table, narrative } = splitActivityReportSections(fallbackReport);
    setGeneratedReport(fallbackReport);
    setGeneratedTableSection(table);
    setGeneratedNarrativeSection(narrative);
    setActiveGeneratedTab('full');
    setIsLocalFallbackDraft(true);
    setCalculatedTotalHours(totalHours);
    setGenerationWarnings([warning]);
    setError(null);
  };

  const updateGeneratedSection = (section: ReportSectionKind, value: string) => {
    const nextTable = section === 'table' ? value : generatedTableSection;
    const nextNarrative = section === 'narrative' ? value : generatedNarrativeSection;
    setGeneratedTableSection(nextTable);
    setGeneratedNarrativeSection(nextNarrative);
    setGeneratedReport(combineActivityReportSections({ table: nextTable, narrative: nextNarrative }));
  };

  const updateGeneratedReport = (value: string) => {
    const { table, narrative } = splitActivityReportSections(value);
    setGeneratedReport(value);
    setGeneratedTableSection(table);
    setGeneratedNarrativeSection(narrative);
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
    if (isLocalFallbackDraft || isBlockedActivityReportExport(generatedReport)) {
      setError('Draftul local sau textul trunchiat nu poate fi exportat ca Anexa 10. Regenerati raportul inainte de export.');
      return;
    }

    setIsExporting(true);
    try {
      const {
        AlignmentType,
        BorderStyle,
        Document,
        HeadingLevel,
        Packer,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = await import('docx');

      const children = buildWordReportChildren(generatedReport, {
        AlignmentType,
        BorderStyle,
        HeadingLevel,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  right: 720,
                  bottom: 720,
                  left: 720,
                },
              },
            },
            children,
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

  const exportDeterministicAnexa10Docx = async () => {
    if (!deterministicAnexa10Model || !deterministicExportReadiness?.canExport) return;

    setIsExportingDeterministicDocx(true);
    setError(null);
    try {
      const blob = await buildAnexa10DocxBlob(deterministicAnexa10Model);
      downloadBlob(blob, buildAnexa10DocxFilename(deterministicAnexa10Model));
    } catch (err) {
      console.error('Error exporting deterministic Anexa 10 DOCX:', err);
      setError('Eroare la exportul determinist Anexa 10');
    } finally {
      setIsExportingDeterministicDocx(false);
    }
  };

  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);
  const uniqueDates = new Set(activities.map((a) => a.date)).size;
  const hasLocalFallbackReport = isLocalFallbackDraft || isLocalFallbackReport(generatedReport);
  const isExportBlocked = hasLocalFallbackReport || isBlockedActivityReportExport(generatedReport);

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

        {enableDeterministicAnexa10Docx && deterministicExportReadiness && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">
              Export Anexa 10 determinist: {deterministicExportReadiness.canExport ? 'pregatit' : 'blocat pentru verificare'}
            </p>
            {deterministicExportReadiness.blockingMessages.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {deterministicExportReadiness.blockingMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
            {deterministicExportReadiness.warningMessages.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {deterministicExportReadiness.warningMessages.map((message) => <li key={message}>{message}</li>)}
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
            disabled={!generatedReport || isExporting || isExportBlocked}
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
          {enableDeterministicAnexa10Docx && (
            <Button
              variant="outline"
              onClick={exportDeterministicAnexa10Docx}
              disabled={
                activities.length === 0
                || isExportingDeterministicDocx
                || !deterministicExportReadiness?.canExport
              }
            >
              {isExportingDeterministicDocx ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Export Anexa 10...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Anexa 10 DOCX
                </>
              )}
            </Button>
          )}
          <Button variant="secondary" onClick={markAsValidatedExample} disabled={!generatedReport || isExportBlocked}>
            Marchează acest raport ca exemplu validat
          </Button>
          <Button variant="outline" onClick={exportTrainingExamples}>
            Exportă exemple pentru fine-tuning
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
        )}

        {hasLocalFallbackReport && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            Draft local generat dupa esecul AI. Documentul nu poate fi exportat ca Anexa 10.
          </div>
        )}

        {generatedReport && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Raport generat:</Label>
              <div className="flex rounded-lg border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={activeGeneratedTab === 'full' ? 'secondary' : 'ghost'}
                  onClick={() => setActiveGeneratedTab('full')}
                >
                  Complet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeGeneratedTab === 'table' ? 'secondary' : 'ghost'}
                  onClick={() => setActiveGeneratedTab('table')}
                >
                  Sectiunea 1
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeGeneratedTab === 'narrative' ? 'secondary' : 'ghost'}
                  onClick={() => setActiveGeneratedTab('narrative')}
                >
                  Sectiunea 2
                </Button>
              </div>
            </div>
            <Textarea
              value={
                activeGeneratedTab === 'table'
                  ? generatedTableSection
                  : activeGeneratedTab === 'narrative'
                    ? generatedNarrativeSection
                    : generatedReport
              }
              onChange={(e) => {
                if (activeGeneratedTab === 'table') {
                  updateGeneratedSection('table', e.target.value);
                  return;
                }
                if (activeGeneratedTab === 'narrative') {
                  updateGeneratedSection('narrative', e.target.value);
                  return;
                }
                updateGeneratedReport(e.target.value);
              }}
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
  return truncateActivityReportText(value);
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

function buildWordReportChildren(report: string, docx: Record<string, any>) {
  const {
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docx;
  const children: any[] = [];
  const lines = report.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (isMarkdownTableRow(line) && isMarkdownTableSeparator(lines[index + 1] || '')) {
      const tableLines: string[] = [line];
      index += 2;
      while (index < lines.length && isMarkdownTableRow(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      children.push(buildWordTable(tableLines, { BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType }));
      children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
      continue;
    }

    if (!line) {
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      continue;
    }

    if (line.startsWith('# ')) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        spacing: { after: 240 },
        text: stripMarkdown(line.replace(/^#\s+/, '')),
      }));
      continue;
    }

    if (line.startsWith('## ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        text: stripMarkdown(line.replace(/^##\s+/, '')),
      }));
      continue;
    }

    if (line.startsWith('### ')) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 160, after: 80 },
        text: stripMarkdown(line.replace(/^###\s+/, '')),
      }));
      continue;
    }

    children.push(new Paragraph({
      children: [new TextRun(stripMarkdown(line.replace(/^[-*]\s+/, '')))],
      spacing: { after: 90 },
    }));
  }

  return children;
}

function buildWordTable(lines: string[], docx: Record<string, any>) {
  const { BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  const rows = lines.map((line, rowIndex) => new TableRow({
    children: splitMarkdownTableRow(line).map((cell) => new TableCell({
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'B7C4D6' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'B7C4D6' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'B7C4D6' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'B7C4D6' },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ bold: rowIndex === 0, text: stripMarkdown(cell) })],
          spacing: { after: 60 },
        }),
      ],
      margins: {
        top: 100,
        bottom: 100,
        left: 100,
        right: 100,
      },
      shading: rowIndex === 0 ? { fill: 'EAF1F8' } : undefined,
    })),
  }));

  return new Table({
    rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

function isMarkdownTableRow(line: string) {
  return line.startsWith('|') && line.endsWith('|') && line.split('|').length > 2;
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line: string) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
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
  return [
    {
      sectionKind: 'table',
      sectionTitle: 'Sectiunea 1 - Tabel activitati',
      activities,
    },
    {
      sectionKind: 'narrative',
      sectionTitle: 'Sectiunea 2 - Narativ detaliat',
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
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetchReportSection({ payload, section, sectionIndex, totalSections });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      if (!/504|timeout|expir|AbortError/i.test(message) || attempt === 2) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Eroare la generarea sectiunii "${section.sectionTitle}".`);
}

async function fetchReportSection({
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

function buildValidatedExamples(value: string) {
  return value.split('---').map((example, index) => example.trim()).filter(Boolean).map((outputExample, index) => ({
    title: `Exemplu validat ${index + 1}`,
    outputExample,
  }));
}
