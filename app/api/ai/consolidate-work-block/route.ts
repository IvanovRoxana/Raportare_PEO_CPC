import { NextResponse } from 'next/server';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { isWorkBlockAiConsolidationEnabled } from '@/lib/feature-flags';
import { openaiModel } from '@/lib/openai';
import {
  buildDeterministicWorkBlockConsolidation,
  buildWorkBlockConsolidationPrompt,
  normalizeWorkBlockConsolidationResult,
  type WorkBlockConsolidationDeliverable,
  type WorkBlockConsolidationRequest,
} from '@/lib/activity-report/work-block-consolidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `Esti un asistent de raportare PEO pentru Anexa 10.
Consolidezi descrieri zilnice intr-un text unic, fara repetitii, auditabil si fidel datelor primite.
Descrierea expertului este sursa principala. Continutul livrabilelor ofera context si rezultat concret.
Verificarea eligibilitatii controleaza ce livrabile pot fi prezentate ca rezultate valide.
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
      ? activity.deliverables.map(normalizeDeliverable).filter((item): item is WorkBlockConsolidationDeliverable => Boolean(item))
      : [],
  };
}

function normalizeDeliverable(value: unknown): WorkBlockConsolidationDeliverable | null {
  if (typeof value === 'string') {
    const fileName = value.trim();
    return fileName ? { fileName } : null;
  }

  const deliverable = typeof value === 'object' && value ? value as Record<string, unknown> : {};
  const normalized: WorkBlockConsolidationDeliverable = {
    id: optionalString(deliverable.id),
    documentId: optionalString(deliverable.documentId),
    fileName: optionalString(deliverable.fileName),
    documentTitle: optionalString(deliverable.documentTitle),
    deliverableType: optionalString(deliverable.deliverableType),
    extractedText: optionalString(deliverable.extractedText),
    firstPageText: optionalString(deliverable.firstPageText),
    extractedSummary: normalizeJsonLike(deliverable.extractedSummary),
    confirmedReportingData: normalizeJsonLike(deliverable.confirmedReportingData),
    eligibilityCheck: normalizeEligibilityCheck(deliverable.eligibilityCheck),
  };

  return Object.values(normalized).some((item) => item !== undefined && item !== null) ? normalized : null;
}

function normalizeEligibilityCheck(value: unknown) {
  if (typeof value !== 'object' || !value) return null;
  const check = value as Record<string, unknown>;
  return {
    status: stringOrDefault(check.status, 'neconcludent'),
    score: Number(check.score) || 0,
    summary: optionalString(check.summary) || '',
    checks: Array.isArray(check.checks) ? check.checks.slice(0, 12) : [],
    missingElements: Array.isArray(check.missingElements) ? check.missingElements.map(String).slice(0, 12) : [],
    recommendations: Array.isArray(check.recommendations) ? check.recommendations.map(String).slice(0, 12) : [],
    riskFlags: Array.isArray(check.riskFlags) ? check.riskFlags.map(String).slice(0, 12) : [],
    suggestedSettings: normalizeSuggestedSettings(check.suggestedSettings),
    evidenceUsed: Array.isArray(check.evidenceUsed) ? check.evidenceUsed.map(String).slice(0, 12) : undefined,
  };
}

function normalizeSuggestedSettings(value: unknown) {
  if (typeof value !== 'object' || !value) return null;
  const settings = value as Record<string, unknown>;
  return {
    saCode: optionalString(settings.saCode),
    activityName: optionalString(settings.activityName),
    selectedActivityId: optionalString(settings.selectedActivityId),
    deliverableType: optionalString(settings.deliverableType),
    confidence: stringOrDefault(settings.confidence, 'low'),
    reason: optionalString(settings.reason) || '',
    changes: Array.isArray(settings.changes) ? settings.changes.map(String).slice(0, 6) : [],
  };
}

function normalizeJsonLike(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') return value;
  return undefined;
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
