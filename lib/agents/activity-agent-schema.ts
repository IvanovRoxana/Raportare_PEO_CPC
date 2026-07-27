import { z } from 'zod';

export const activityAgentDeliverableSchema = z.object({
  id: z.string().optional(),
  documentTitle: z.string().min(1),
  deliverableType: z.string().optional(),
  extractedText: z.string().optional(),
  eligibilitySummary: z.string().optional(),
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

export const activityAgentResponseSchema = z.object({
  description: z.string().min(20),
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
  checks: z.object({
    jobDescriptionAligned: z.boolean().nullable(),
    saPurposeFound: z.boolean().nullable().optional(),
    subactivityAligned: z.boolean().nullable(),
    deliverableSupported: z.boolean().nullable(),
    hoursPlausible: z.boolean().nullable(),
    targetGroupImpactSupported: z.boolean().nullable(),
  }),
  auditId: z.string().optional(),
});

export type ActivityAgentRequest = z.infer<typeof activityAgentRequestSchema>;
export type ActivityAgentResponse = z.infer<typeof activityAgentResponseSchema>;
export type ActivityAgentDeliverable = z.infer<typeof activityAgentDeliverableSchema>;
export type ActivityAgentCatalogCandidate = z.infer<typeof activityAgentCatalogCandidateSchema>;
