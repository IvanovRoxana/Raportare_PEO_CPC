'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import type { Anexa10PreflightReport } from '@/lib/activity-report/preflight';
import { combineActivityReportSections, splitActivityReportSections } from '@/lib/activity-report/sections';
import type { ReportingWorkBlockBundle } from '@/lib/activity-report/work-blocks';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import type { Activity, Expert } from '@/lib/types';

interface ReportGeneratorProps {
  activities: Activity[];
  month: number;
  year: number;
  expertName: string;
  expert?: Pick<Expert, 'id' | 'name' | 'positionInProject' | 'role' | 'contractNumber' | 'contractType' | 'category' | 'expertExperienceCategory' | 'jobDescriptionText' | 'projectCode' | 'projectTitle' | 'beneficiary'>;
  enableDeterministicAnexa10Docx?: boolean;
  isLoadingDeterministicWorkBlocks?: boolean;
  workBlockBundles?: ReportingWorkBlockBundle[];
}

type ReportSectionKind = 'table' | 'narrative';

type ReportActivityPayload = {
  date: string;
  hours: number;
  saCode?: string;
  activityType?: string;
  title: string;
  summary?: string;
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
  isLoadingDeterministicWorkBlocks = false,
  workBlockBundles,
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
  const [isRunningAnexa10Preflight, setIsRunningAnexa10Preflight] = useState(false);
  const [anexa10PreflightReport, setAnexa10PreflightReport] = useState<Anexa10PreflightReport | null>(null);
  const deterministicAnexa10Model = useMemo(() => {
    if (!enableDeterministicAnexa10Docx || activities.length === 0) return null;
    if (isLoadingDeterministicWorkBlocks) return null;

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
      workBlockBundles: workBlockBundles && workBlockBundles.length > 0 ? workBlockBundles : undefined,
    });
  }, [activities, enableDeterministicAnexa10Docx, expert, expertName, isLoadingDeterministicWorkBlocks, month, workBlockBundles, year]);
  const persistedWorkBlockCount = workBlockBundles?.length ?? 0;
  const deterministicExportReadiness = deterministicAnexa10Model
    ? getAnexa10ExportReadiness(deterministicAnexa10Model, {
      usesPersistedWorkBlocks: persistedWorkBlockCount > 0,
    })
    : null;
  const deterministicWorkBlockSourceLabel = persistedWorkBlockCount > 0
    ? `Work block-uri persistate: ${persistedWorkBlockCount}`
    : 'Work block-uri generate din activitati (fallback)';
  const deterministicExportButtonTitle = activities.length === 0
    ? 'Nu exista activitati pentru export Anexa 10.'
    : isLoadingDeterministicWorkBlocks
      ? 'Se incarca work block-urile persistate pentru Anexa 10.'
    : deterministicExportReadiness?.canExport
      ? `${deterministicExportReadiness.statusLabel}. ${deterministicWorkBlockSourceLabel}.`
      : deterministicExportReadiness?.blockingMessages[0] ?? 'Exportul Anexa 10 este blocat pentru verificare.';

  useEffect(() => {
    setAnexa10PreflightReport(null);
  }, [deterministicAnexa10Model]);

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
    if (!deterministicAnexa10Model || !deterministicExportReadiness?.canExport || anexa10PreflightReport?.canExport === false) return;

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

  const runAnexa10Preflight = async () => {
    if (!deterministicAnexa10Model) return;

    setIsRunningAnexa10Preflight(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/anexa10-preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: deterministicAnexa10Model }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Preflight-ul Anexa 10 a esuat.');
      }
      setAnexa10PreflightReport(data as Anexa10PreflightReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preflight-ul Anexa 10 a esuat.');
    } finally {
      setIsRunningAnexa10Preflight(false);
    }
  };

  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);
  const uniqueDates = new Set(activities.map((a) => a.date)).size;
  const hasLocalFallbackReport = isLocalFallbackDraft || isLocalFallbackReport(generatedReport);
  const isExportBlocked = hasLocalFallbackReport || isBlockedActivityReportExport(generatedReport);
  const deterministicReadinessClassName = deterministicExportReadiness?.severity === 'blocked'
    ? 'border-destructive/40 bg-destructive/10'
    : deterministicExportReadiness?.severity === 'warning'
      ? 'border-amber-300 bg-amber-50'
      : 'border-emerald-200 bg-emerald-50';
  const preflightClassName = anexa10PreflightReport?.canExport === false
    ? 'border-destructive/40 bg-destructive/10'
    : anexa10PreflightReport && anexa10PreflightReport.findings.length > 0
      ? 'border-amber-300 bg-amber-50'
      : 'border-emerald-200 bg-emerald-50';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Export Raport de Activitate
        </CardTitle>
        <CardDescription>
          Verifica si descarca Raportul de Activitate in format Anexa 10 pentru {getMonthName(month)} {year}.
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
          <div className={`rounded-lg border p-3 text-sm ${deterministicReadinessClassName}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                Raport de Activitate: {deterministicExportReadiness.statusLabel}
              </p>
              <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">
                Readiness {deterministicExportReadiness.scoreLabel}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-background/70">
              <div
                className="h-2 rounded-full bg-current"
                style={{ width: `${deterministicExportReadiness.score}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-muted-foreground">{deterministicExportReadiness.summary}</p>
            <p className="mt-1 text-muted-foreground">{deterministicWorkBlockSourceLabel}</p>
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

        {enableDeterministicAnexa10Docx && deterministicAnexa10Model && (
          <div className={`rounded-lg border p-3 text-sm ${anexa10PreflightReport ? preflightClassName : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">Preflight Anexa 10 cu agent AI</p>
                <p className="mt-1 text-muted-foreground">
                  Verifica date obligatorii, responsabilitati, repetitii, persoana I si coerenta narativa inainte de export.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runAnexa10Preflight}
                disabled={isRunningAnexa10Preflight || isLoadingDeterministicWorkBlocks}
              >
                {isRunningAnexa10Preflight ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Ruleaza preflight AI
              </Button>
            </div>

            {anexa10PreflightReport ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">
                    {anexa10PreflightReport.statusLabel}
                  </span>
                  <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">
                    Scor {anexa10PreflightReport.score}/100
                  </span>
                  {anexa10PreflightReport.auditId ? (
                    <span className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                      Audit AI {anexa10PreflightReport.auditId}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground">{anexa10PreflightReport.summary}</p>
                {anexa10PreflightReport.aiSummary ? (
                  <p className="text-muted-foreground">Agent AI: {anexa10PreflightReport.aiSummary}</p>
                ) : null}
                {anexa10PreflightReport.findings.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {anexa10PreflightReport.findings.map((finding) => (
                      <li key={finding.id}>
                        <span className="font-medium">
                          [{finding.severity}] {finding.title}:
                        </span>{' '}
                        {finding.detail}
                        {finding.suggestion ? <span className="text-muted-foreground"> Recomandare: {finding.suggestion}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {enableDeterministicAnexa10Docx && isLoadingDeterministicWorkBlocks && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-medium">Raport de Activitate: se incarca work block-urile persistate</p>
            <p className="mt-1 text-muted-foreground">
              Exportul Anexa 10 este blocat temporar pentru a evita generarea fallback din activitati.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {enableDeterministicAnexa10Docx && (
            <Button
              onClick={exportDeterministicAnexa10Docx}
              title={deterministicExportButtonTitle}
              aria-label={deterministicExportButtonTitle}
              disabled={
                activities.length === 0
                || isLoadingDeterministicWorkBlocks
                || isExportingDeterministicDocx
                || !deterministicExportReadiness?.canExport
                || anexa10PreflightReport?.canExport === false
              }
            >
              {isExportingDeterministicDocx ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Export RA...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exporta Raport de Activitate DOCX
                </>
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
        )}

        {hasLocalFallbackReport && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            Draft local generat dupa esecul AI. Documentul nu poate fi exportat ca Anexa 10.
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
      summary: activity.activitySummary,
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
