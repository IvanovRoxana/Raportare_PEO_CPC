import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { isWorkBlockAiConsolidationEnabled } from '@/lib/feature-flags';
import { openaiModel } from '@/lib/openai';
import {
  buildDeterministicWorkBlockConsolidation,
  buildWorkBlockConsolidationPrompt,
  normalizeWorkBlockConsolidationResult,
  type WorkBlockConsolidationRequest,
} from '@/lib/activity-report/work-block-consolidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `Esti un asistent de raportare PEO pentru Anexa 10.
Consolidezi descrieri zilnice intr-un text unic, fara repetitii, auditabil si fidel datelor primite.
Raspunzi doar cu JSON valid.`;

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const body = normalizeRequest(await req.json());

    if (!isWorkBlockAiConsolidationEnabled()) {
      return NextResponse.json(buildDeterministicWorkBlockConsolidation(body, 'disabled'));
    }

    const result = await governedGenerateText({
      endpoint: '/api/ai/consolidate-work-block',
      operation: 'consolidate-work-block-anexa-10',
      request: body,
      projectCode: body.workBlock.projectCode || '302141',
      model: openaiModel(),
      system: SYSTEM_PROMPT,
      prompt: buildWorkBlockConsolidationPrompt(body),
      maxOutputTokens: 1600,
    });

    const parsed = parseJsonObject(result.text);
    return NextResponse.json(normalizeWorkBlockConsolidationResult(parsed, body, 'ai_generated'));
  } catch (error) {
    console.error('Error consolidating work block:', error);
    return aiErrorResponse(error, 'Eroare la consolidarea AI a work block-ului.');
  }
}

function normalizeRequest(body: Record<string, unknown>): WorkBlockConsolidationRequest {
  const rawWorkBlock = typeof body.workBlock === 'object' && body.workBlock ? body.workBlock as Record<string, unknown> : {};
  return {
    workBlock: {
      id: optionalString(rawWorkBlock.id),
      projectCode: optionalString(rawWorkBlock.projectCode),
      title: stringOrDefault(rawWorkBlock.title, 'Work block'),
      saCode: stringOrDefault(rawWorkBlock.saCode, 'SA neprecizata'),
      reportingFlowType: stringOrDefault(rawWorkBlock.reportingFlowType, 'other'),
    },
    activities: Array.isArray(body.activities) ? body.activities.map(normalizeActivity) : [],
  };
}

function normalizeActivity(value: unknown) {
  const activity = typeof value === 'object' && value ? value as Record<string, unknown> : {};
  return {
    id: stringOrDefault(activity.id, ''),
    date: stringOrDefault(activity.date, ''),
    hours: Number(activity.hours) || 0,
    title: optionalString(activity.title),
    description: optionalString(activity.description),
    activityType: optionalString(activity.activityType),
    saCode: optionalString(activity.saCode),
    deliverables: Array.isArray(activity.deliverables)
      ? activity.deliverables.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
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

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
