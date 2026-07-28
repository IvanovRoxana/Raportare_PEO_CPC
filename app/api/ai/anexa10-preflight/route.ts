import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import type { Anexa10ReportModel } from '@/lib/activity-report/build-report-model';
import {
  buildDeterministicAnexa10Preflight,
  mergeAnexa10PreflightFindings,
  type Anexa10PreflightFinding,
} from '@/lib/activity-report/preflight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `Esti agent reviewer pentru Raport de Activitate PEO - Anexa 10.
Verifici calitatea narativa, auditabilitatea, tonul tehnic-administrativ si persoana I singular.
Nu inventezi date si nu ceri informatii care nu rezulta din model.
Raspunzi doar cu JSON valid.`;

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = await req.json();
    const model = normalizeModel(body?.model);
    const deterministic = buildDeterministicAnexa10Preflight(model);

    const result = await governedGenerateText({
      endpoint: '/api/ai/anexa10-preflight',
      operation: 'anexa10-preflight-ai-review',
      request: {
        expertName: model.header.expertName,
        month: model.header.month,
        year: model.header.year,
        projectCode: model.header.projectCode,
        rowCount: model.tableRows.length,
      },
      actorName: model.header.expertName,
      month: model.header.month,
      year: model.header.year,
      projectCode: model.header.projectCode || '302141',
      model: openaiModel(),
      system: SYSTEM_PROMPT,
      prompt: buildPreflightPrompt(model, deterministic.findings),
      maxOutputTokens: 1200,
    });

    const aiReview = normalizeAiReview(parseJsonObject(result.text));
    const report = mergeAnexa10PreflightFindings(
      deterministic.deterministicFindings,
      aiReview.findings,
      {
        aiSummary: aiReview.summary,
        auditId: result.auditId,
        modelUsed: String(result.modelId || ''),
      },
    );

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error running Anexa 10 preflight:', error);
    return aiErrorResponse(error, 'Eroare la verificarea preflight Anexa 10.');
  }
}

function buildPreflightPrompt(model: Anexa10ReportModel, deterministicFindings: Anexa10PreflightFinding[]) {
  const tableRows = model.tableRows.map((row, index) => ({
    row: index + 1,
    title: row.officialActivityTitle,
    responsibilities: row.responsibilities,
    activity: row.performedActivity.slice(0, 1200),
    deliverables: row.resultsAndDeliverables,
    hours: row.hours,
  }));
  const narrativeItems = model.saSections.flatMap((section) => section.items.map((item) => ({
    saCode: section.saCode,
    heading: item.heading,
    body: item.body.slice(0, 1600),
  })));

  return `Verifica acest model Anexa 10 si intoarce JSON strict:
{
  "summary": "max 280 caractere",
  "findings": [
    {
      "severity": "critical|warning|info",
      "area": "ai_review|header|table|narrative|deliverables|hours",
      "title": "scurt",
      "detail": "concret",
      "suggestion": "actiune recomandata"
    }
  ]
}

Reguli:
- Marcheaza critical doar daca exportul ar fi greu de validat administrativ.
- Nu dubla finding-urile deterministe deja listate.
- Verifica persoana I singular, ton tehnic-administrativ, coerenta dintre activitate si livrabil, formulari vagi sau prea generice.
- Nu cere linkuri, fisiere sau date noi daca problema poate fi formulata ca recomandare de redactare.
- Maximum 6 findings.

Header:
${JSON.stringify(model.header)}

Finding-uri deterministe deja detectate:
${JSON.stringify(deterministicFindings.map((finding) => ({ title: finding.title, detail: finding.detail })))}

Tabel:
${JSON.stringify(tableRows)}

Narativ:
${JSON.stringify(narrativeItems)}`;
}

function normalizeModel(value: unknown): Anexa10ReportModel {
  const model = typeof value === 'object' && value ? value as Anexa10ReportModel : null;
  if (!model?.header || !Array.isArray(model.tableRows) || !Array.isArray(model.saSections)) {
    throw new Error('Modelul Anexa 10 lipseste sau este invalid.');
  }
  return model;
}

function parseJsonObject(value: string) {
  try {
    const cleaned = value.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeAiReview(value: Record<string, unknown>) {
  const findings = Array.isArray(value.findings)
    ? value.findings.map(normalizeFinding).filter((item): item is Anexa10PreflightFinding => Boolean(item)).slice(0, 6)
    : [];
  return {
    summary: typeof value.summary === 'string' ? value.summary.trim().slice(0, 320) : undefined,
    findings,
  };
}

function normalizeFinding(value: unknown): Anexa10PreflightFinding | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const severity = record.severity === 'critical' || record.severity === 'warning' || record.severity === 'info'
    ? record.severity
    : 'warning';
  const area = ['header', 'table', 'narrative', 'deliverables', 'hours', 'ai_review'].includes(String(record.area))
    ? String(record.area) as Anexa10PreflightFinding['area']
    : 'ai_review';
  const title = stringValue(record.title, 'Observatie AI');
  const detail = stringValue(record.detail, '');
  if (!detail) return null;
  return {
    id: `ai-${hashText(`${title}:${detail}`).slice(0, 10)}`,
    severity,
    area,
    title,
    detail,
    suggestion: stringValue(record.suggestion, undefined),
  };
}

function stringValue(value: unknown, fallback: string): string;
function stringValue(value: unknown, fallback?: undefined): string | undefined;
function stringValue(value: unknown, fallback?: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
