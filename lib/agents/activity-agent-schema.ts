import { z } from 'zod';
import { activityAutofillDeliverableSchema, getActivityAutofillVerifiedAnalysisEvidence } from '../activity-autofill.ts';

export const activityAgentDeliverableSchema = activityAutofillDeliverableSchema.extend({
  documentTitle: z.string().min(1),
  extractedText: z.string().optional(),
}).transform((deliverable) => {
  const evidence = getActivityAutofillVerifiedAnalysisEvidence({ ...deliverable, extractedText: deliverable.extractedText || '' });
  const normalized = { ...deliverable };
  if (evidence.length) {
    normalized.analysisEvidence = evidence;
  } else {
    delete normalized.analysisVersion;
    delete normalized.analysisFileHash;
    delete normalized.analysisSummary;
    delete normalized.analysisEvidence;
  }
  return normalized;
});

export const activityAgentCatalogCandidateSchema = z.object({
  id: z.string().optional(),
  category: z.string().optional(),
  saCode: z.string().optional(),
  serviceCategory: z.string().optional(),
  activityNumber: z.number().optional(),
  activityName: z.string().min(1),
  description: z.string().optional(),
  objectives: z.string().optional(),
  serviceComponent: z.string().optional(),
  beneficiaries: z.string().optional(),
  expectedResults: z.string().optional(),
  deliverables: z.string().optional(),
  indicators: z.string().optional(),
});

export const activityAgentCollaboratorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  positionInProject: z.string().optional(),
});

export const activityAgentRequestSchema = z.object({
  expertId: z.string().optional(),
  expertName: z.string().min(1),
  expertRole: z.string().optional(),
  expertReportingInstructions: z.string().optional(),
  expertReportingInstructionsUpdatedAt: z.string().optional(),
  projectCode: z.string().optional().default('302141'),
  category: z.string().optional(),
  date: z.string().optional(),
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  hours: z.union([z.number(), z.string()]).optional(),
  selectedDates: z.array(z.string()).optional(),
  selectedActivityId: z.string().optional(),
  saCode: z.string().optional(),
  activityName: z.string().optional(),
  title: z.string().optional(),
  currentDescription: z.string().optional().default(''),
  deliverables: z.array(activityAgentDeliverableSchema).default([]),
  catalogCandidates: z.array(activityAgentCatalogCandidateSchema).default([]),
  collaborationContext: z.object({
    isCommonActivity: z.boolean().default(false),
    collaborators: z.array(activityAgentCollaboratorSchema).default([]),
  }).optional(),
});

export const activityAgentEvidenceSchema = z.object({
  sourceType: z.string(),
  title: z.string().optional(),
  chunkId: z.string().optional(),
  score: z.number().optional(),
  relevantExcerpt: z.string().optional(),
});

export const activityAgentDeliverableInterpretationSchema = z.object({
  summary: z.string(),
  workPerformed: z.array(z.string()).default([]),
  keyFacts: z.array(z.string()).default([]),
  documentSignals: z.array(z.string()).default([]),
  unsupportedGaps: z.array(z.string()).default([]),
});

export const activityAgentExplainableScoreSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string(),
  evidence: z.array(z.string()).default([]),
});

export const activityAgentFormReviewStepSchema = z.object({
  id: z.enum(['type', 'time', 'deliverables', 'description', 'collaboration', 'review']),
  label: z.string(),
  status: z.enum(['ok', 'attention', 'missing', 'needs_review']),
  message: z.string(),
  actions: z.array(z.string()).default([]),
});

export const activityAgentFormReviewSchema = z.object({
  status: z.enum(['ready', 'needs_input', 'needs_review']),
  summary: z.string(),
  steps: z.array(activityAgentFormReviewStepSchema),
  recommendedActions: z.array(z.string()).default([]),
});

export const activityAgentGenerationSchema = z.object({
  description: z.string().min(80),
  warnings: z.array(z.string()),
  usedFacts: z.array(z.string()),
});

export const activityAgentFactSheetSchema = z.object({
  dateRows: z.array(z.object({
    date: z.string(),
    hours: z.union([z.number(), z.string()]).optional(),
    deliverables: z.array(z.string()).default([]),
  })).default([]),
  factualEvidence: z.array(z.string()).default([]),
  taxonomyContext: z.array(z.string()).default([]),
  demonstratedActions: z.array(z.string()).default([]),
  taxonomyOnlyActions: z.array(z.string()).default([]),
  unsupportedRiskyActions: z.array(z.string()).default([]),
  deliverableNames: z.array(z.string()).default([]),
});

export const activityAgentValidationSchema = z.object({
  hoursOk: z.boolean().nullable(),
  datesOk: z.boolean().nullable(),
  saOk: z.boolean().nullable(),
  deliverablesOk: z.boolean().nullable(),
  unsupportedClaims: z.array(z.string()).default([]),
  administrativeIssues: z.array(z.string()).default([]),
  canUseDescription: z.boolean(),
  warnings: z.array(z.string()).default([]),
});

export const activityAgentResponseSchema = z.object({
  description: z.string().min(20),
  usedFacts: z.array(z.string()).default([]),
  shortSummary: z.string().min(20).max(360),
  proposedSaCode: z.string().optional(),
  proposedActivityName: z.string().optional(),
  deliverableSummary: z.string(),
  deliverableInterpretation: activityAgentDeliverableInterpretationSchema,
  resultSummary: z.string(),
  beneficiaries: z.array(z.string()),
  targetGroupImpact: z.object({
    type: z.enum(['direct', 'indirect', 'unclear', 'none']),
    justification: z.string(),
  }),
  evidenceUsed: z.array(activityAgentEvidenceSchema),
  explainableScores: z.array(activityAgentExplainableScoreSchema).default([]),
  warnings: z.array(z.string()),
  expertInstructionAudit: z.object({
    found: z.boolean(),
    active: z.boolean(),
    updatedAt: z.string().optional(),
    conflicts: z.array(z.string()).default([]),
  }).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  requiresPmReview: z.boolean(),
  formReview: activityAgentFormReviewSchema.optional(),
  checks: z.object({
    jobDescriptionAligned: z.boolean().nullable(),
    saPurposeFound: z.boolean().nullable().optional(),
    subactivityAligned: z.boolean().nullable(),
    deliverableSupported: z.boolean().nullable(),
    hoursPlausible: z.boolean().nullable(),
    targetGroupImpactSupported: z.boolean().nullable(),
  }),
  auditId: z.string().optional(),
  factSheet: activityAgentFactSheetSchema.optional(),
  validation: activityAgentValidationSchema.optional(),
});

export type ActivityAgentRequest = z.infer<typeof activityAgentRequestSchema>;
export type ActivityAgentResponse = z.infer<typeof activityAgentResponseSchema>;
export type ActivityAgentGeneration = z.infer<typeof activityAgentGenerationSchema>;
export type ActivityAgentFactSheet = z.infer<typeof activityAgentFactSheetSchema>;
export type ActivityAgentValidation = z.infer<typeof activityAgentValidationSchema>;
export type ActivityAgentDeliverable = z.infer<typeof activityAgentDeliverableSchema>;
export type ActivityAgentCatalogCandidate = z.infer<typeof activityAgentCatalogCandidateSchema>;
export type ActivityAgentFormReview = z.infer<typeof activityAgentFormReviewSchema>;
