import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import {
  ACTIVITY_REPORT_SYSTEM_PROMPT,
  buildActivityReportPrompt,
  buildActivityReportPromptInput,
} from '@/lib/activity-report/prompt.ts';
import { normalizeAndGroupActivities, selectReportModel } from '@/lib/activity-report/normalize.ts';
import type { ActivityReportRequest } from '@/lib/activity-report/types.ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = normalizeRequest(await req.json());
    const { normalizedActivities, groupedActivities, totals } = normalizeAndGroupActivities(body.activities);
    const promptInput = buildActivityReportPromptInput(body, normalizedActivities, groupedActivities, totals);
    const prompt = buildActivityReportPrompt(promptInput);
    const modelSelection = selectReportModel(body.useFineTunedModel);
    const warnings = [...totals.warnings, ...modelSelection.warnings];

    const result = await governedGenerateText({
      endpoint: '/api/ai/generate-activity-report',
      operation: 'generate-activity-report-annexa-10',
      request: body,
      actorName: body.expertName,
      month: body.month,
      year: body.year,
      projectCode: body.projectCode || '302141',
      model: openaiModel(modelSelection.model.replace(/^openai\//, '')),
      system: ACTIVITY_REPORT_SYSTEM_PROMPT,
      prompt,
    });

    return NextResponse.json({
      report: result.text,
      auditId: result.auditId,
      modelUsed: modelSelection.model,
      usedFineTunedModel: modelSelection.usedFineTunedModel,
      totals,
      warnings,
    });
  } catch (error) {
    console.error('Error generating activity report:', error);
    if (error instanceof Error && /activit/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return aiErrorResponse(error, 'Eroare la generarea Raportului de Activitate Anexa 10. Verificați cheia API.');
  }
}

function normalizeRequest(body: Record<string, unknown>): ActivityReportRequest {
  return {
    expertName: stringOrDefault(body.expertName, 'Expert neprecizat'),
    expertRole: optionalString(body.expertRole),
    month: stringOrDefault(body.month, 'luna neprecizată'),
    year: Number(body.year) || new Date().getFullYear(),
    projectCode: optionalString(body.projectCode) || '302141',
    useFineTunedModel: Boolean(body.useFineTunedModel),
    activities: Array.isArray(body.activities) ? body.activities as ActivityReportRequest['activities'] : [],
    reportingRules: typeof body.reportingRules === 'object' && body.reportingRules ? body.reportingRules as ActivityReportRequest['reportingRules'] : undefined,
    validatedExamples: Array.isArray(body.validatedExamples) ? body.validatedExamples as ActivityReportRequest['validatedExamples'] : undefined,
  };
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
