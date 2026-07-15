import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import {
  ACTIVITY_REPORT_SYSTEM_PROMPT,
  buildActivityReportPromptInput,
  buildActivityReportSectionPrompt,
} from '@/lib/activity-report/prompt.ts';
import { normalizeAndGroupActivities, selectReportModel } from '@/lib/activity-report/normalize.ts';
import type { ActivityReportSectionKind, ActivityReportSectionRequest } from '@/lib/activity-report/types.ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const SECTION_TOKEN_LIMITS: Record<ActivityReportSectionKind, number> = {
  table: 1700,
  'sa-detail': 2200,
  validation: 1100,
};

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = normalizeSectionRequest(await req.json());
    const { normalizedActivities, groupedActivities, totals } = normalizeAndGroupActivities(body.activities);
    const promptInput = buildActivityReportPromptInput(body, normalizedActivities, groupedActivities, totals);
    const prompt = buildActivityReportSectionPrompt(promptInput, {
      kind: body.sectionKind,
      title: body.sectionTitle,
      saCode: body.sectionSaCode,
      index: body.sectionIndex,
      total: body.totalSections,
    });
    const modelSelection = selectReportModel(body.useFineTunedModel);
    const warnings = [...totals.warnings, ...modelSelection.warnings];

    const result = await governedGenerateText({
      endpoint: '/api/ai/generate-activity-report-section',
      operation: `generate-activity-report-${body.sectionKind}`,
      request: body,
      actorName: body.expertName,
      month: body.month,
      year: body.year,
      projectCode: body.projectCode || '302141',
      model: openaiModel(modelSelection.model.replace(/^openai\//, '')),
      system: ACTIVITY_REPORT_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: SECTION_TOKEN_LIMITS[body.sectionKind],
    });

    return NextResponse.json({
      report: result.text,
      auditId: result.auditId,
      modelUsed: modelSelection.model,
      usedFineTunedModel: modelSelection.usedFineTunedModel,
      sectionKind: body.sectionKind,
      sectionTitle: body.sectionTitle,
      totals,
      warnings,
    });
  } catch (error) {
    console.error('Error generating activity report section:', error);
    if (error instanceof Error && /activit/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return aiErrorResponse(error, 'Eroare la generarea sectiunii din Raportul de Activitate Anexa 10. Verificati cheia API.');
  }
}

function normalizeSectionRequest(body: Record<string, unknown>): ActivityReportSectionRequest {
  return {
    expertName: stringOrDefault(body.expertName, 'Expert neprecizat'),
    expertRole: optionalString(body.expertRole),
    month: stringOrDefault(body.month, 'luna neprecizata'),
    year: Number(body.year) || new Date().getFullYear(),
    projectCode: optionalString(body.projectCode) || '302141',
    useFineTunedModel: Boolean(body.useFineTunedModel),
    sectionKind: normalizeSectionKind(body.sectionKind),
    sectionTitle: optionalString(body.sectionTitle),
    sectionSaCode: optionalString(body.sectionSaCode),
    sectionIndex: numberOrUndefined(body.sectionIndex),
    totalSections: numberOrUndefined(body.totalSections),
    activities: Array.isArray(body.activities) ? body.activities as ActivityReportSectionRequest['activities'] : [],
    reportingRules: typeof body.reportingRules === 'object' && body.reportingRules ? body.reportingRules as ActivityReportSectionRequest['reportingRules'] : undefined,
    validatedExamples: Array.isArray(body.validatedExamples) ? body.validatedExamples as ActivityReportSectionRequest['validatedExamples'] : undefined,
  };
}

function normalizeSectionKind(value: unknown): ActivityReportSectionKind {
  if (value === 'table' || value === 'sa-detail' || value === 'validation') return value;
  return 'sa-detail';
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}
