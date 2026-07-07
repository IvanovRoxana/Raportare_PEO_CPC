import { z } from 'zod';

export const deliverableEligibilityCheckSchema = z.object({
  criterion: z.string(),
  status: z.enum(['pass', 'warning', 'fail', 'unknown']),
  explanation: z.string(),
});

export const deliverableEligibilitySchema = z.object({
  status: z.enum(['eligibil', 'eligibil_cu_observatii', 'neeligibil', 'neconcludent']),
  score: z.number().min(0).max(100),
  summary: z.string(),
  checks: z.array(deliverableEligibilityCheckSchema),
  missingElements: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
  suggestedSettings: z.object({
    saCode: z.string().nullable(),
    activityName: z.string().nullable(),
    selectedActivityId: z.string().nullable(),
    deliverableType: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
    changes: z.array(z.enum(['activity', 'deliverableType'])),
  }).nullable(),
});

export const deliverableEligibilityActivityCandidateSchema = z.object({
  id: z.string(),
  saCode: z.string(),
  activityName: z.string(),
  serviceCategory: z.string().optional(),
  description: z.string().optional(),
  objectives: z.string().optional(),
  serviceComponent: z.string().optional(),
  beneficiaries: z.string().optional(),
  expectedResults: z.string().optional(),
  deliverables: z.string().optional(),
  indicators: z.string().optional(),
});

export function normalizeDeliverableEligibilityStringList(value: unknown, maxItems = 80) {
  const parsed = z.array(z.string()).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

export function normalizeDeliverableEligibilityActivityCandidates(value: unknown) {
  const parsed = z.array(deliverableEligibilityActivityCandidateSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.slice(0, 80);
}

export function validateEligibilitySuggestedSettings(input: {
  suggestedSettings: z.infer<typeof deliverableEligibilitySchema>['suggestedSettings'];
  activityCatalogCandidates: Array<z.infer<typeof deliverableEligibilityActivityCandidateSchema>>;
  deliverableOptions: string[];
  currentSaCode?: string;
  currentActivityName?: string;
  currentDeliverableType?: string;
}) {
  const suggestion = input.suggestedSettings;
  if (!suggestion) return undefined;

  const requestedChanges = new Set(suggestion.changes);
  const output: NonNullable<z.infer<typeof deliverableEligibilitySchema>['suggestedSettings']> = {
    saCode: null,
    activityName: null,
    selectedActivityId: null,
    deliverableType: null,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    changes: [],
  };

  if (requestedChanges.has('activity')) {
    const activityMatch = input.activityCatalogCandidates.find((candidate) => (
      (suggestion.selectedActivityId && candidate.id === suggestion.selectedActivityId)
      || (
        candidate.saCode === suggestion.saCode
        && candidate.activityName === suggestion.activityName
      )
    ));
    const isDifferentActivity = activityMatch
      && (
        activityMatch.saCode !== input.currentSaCode
        || activityMatch.activityName !== input.currentActivityName
      );

    if (activityMatch && isDifferentActivity) {
      output.selectedActivityId = activityMatch.id;
      output.saCode = activityMatch.saCode;
      output.activityName = activityMatch.activityName;
      output.changes.push('activity');
    }
  }

  if (requestedChanges.has('deliverableType') && suggestion.deliverableType) {
    const deliverableTypeMatch = input.deliverableOptions.find((option) => option === suggestion.deliverableType);
    if (deliverableTypeMatch && deliverableTypeMatch !== input.currentDeliverableType) {
      output.deliverableType = deliverableTypeMatch;
      output.changes.push('deliverableType');
    }
  }

  return output.changes.length > 0 ? output : undefined;
}

export function buildNonConclusiveAiFailure(reason: string) {
  return {
    status: 'neconcludent' as const,
    score: 0,
    summary: 'Verificarea AI nu a putut fi finalizata automat. Reincearca verificarea sau valideaza manual livrabilul.',
    checks: [
      {
        criterion: 'Verificare AI',
        status: 'unknown' as const,
        explanation: reason,
      },
    ],
    missingElements: [],
    recommendations: ['Reincearca verificarea eligibilitatii dupa cateva momente sau valideaza manual livrabilul.'],
    riskFlags: [`Verificarea AI a esuat: ${reason}`],
    suggestedSettings: null,
  };
}
