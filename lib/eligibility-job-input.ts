import { z } from 'zod';
import { evaluationHash } from './eligibility-evaluation.ts';

// Persist only evaluator inputs. Browser-extracted text and credentials never enter the job.
export const eligibilityJobInputSchema = z.object({
  clientRequestId: z.string().uuid().optional(),
  expertId: z.string().min(1).max(200), projectCode: z.string().max(100).optional(),
  currentSaCode: z.string().min(1).max(100),
  deliverables: z.array(z.object({ id: z.string().min(1).max(200), serverDocumentId: z.string().min(1).max(200), isPrimary: z.boolean().optional() })).min(1).max(8),
  primaryDeliverableId: z.string().max(200).optional(), selectedActivityId: z.string().max(200).optional(),
  selectedActivityName: z.string().max(2000).optional(), classificationMode: z.enum(['automatic', 'manual']).optional(),
  currentDescription: z.string().max(20_000).optional(),
  workingGroupActivities: z.array(z.unknown()).max(100).optional(),
  deliverableOptions: z.array(z.string().max(500)).max(100).optional(),
  activityCatalogCandidates: z.array(z.object({ id: z.string().max(200) })).max(1000).optional(),
  activityGroupId: z.string().max(200).optional(), workBlockId: z.string().max(200).optional(),
  periodGroupId: z.string().max(200).optional(), workingGroupId: z.string().max(200).optional(),
  activityDates: z.array(z.string().max(10)).max(31).optional(), month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
});
export type EligibilityJobInput = z.infer<typeof eligibilityJobInputSchema>;
export function parseEligibilityJobInput(raw: unknown): EligibilityJobInput {
  if (!raw || typeof raw !== 'object') return eligibilityJobInputSchema.parse(raw);
  const body = raw as Record<string, unknown>;
  const deliverables = Array.isArray(body.deliverables) ? body.deliverables.map((d) => {
    const item = d as Record<string, unknown>;
    return { id: item?.id || item?.serverDocumentId, serverDocumentId: item?.serverDocumentId || item?.id, isPrimary: item?.isPrimary };
  }) : body.deliverables;
  const parsed = eligibilityJobInputSchema.parse({ ...body, deliverables });
  if (new Set(parsed.deliverables.map((d) => d.id)).size !== parsed.deliverables.length
    || new Set(parsed.deliverables.map((d) => d.serverDocumentId)).size !== parsed.deliverables.length) throw new Error('ELIGIBILITY_DUPLICATE_DOCUMENTS');
  if (Buffer.byteLength(JSON.stringify(parsed)) > 100_000) throw new Error('ELIGIBILITY_INPUT_TOO_LARGE');
  return parsed;
}
export function eligibilityRequestKey(actorId: string, input: EligibilityJobInput) {
  const { clientRequestId: _attempt, ...context } = input;
  return evaluationHash({ actorId, input: { ...context,
    primaryDeliverableId: input.deliverables.find((d) => d.id === input.primaryDeliverableId || d.isPrimary)?.serverDocumentId,
    // Form slot IDs may be regenerated on reload; server document identities are stable.
    deliverables: input.deliverables.map((d) => ({ serverDocumentId: d.serverDocumentId,
      isPrimary: d.id === input.primaryDeliverableId || d.isPrimary === true })).sort((a, b) => a.serverDocumentId.localeCompare(b.serverDocumentId)),
    activityDates: [...new Set(input.activityDates || [])].sort(),
    activityCatalogCandidates: input.activityCatalogCandidates?.slice().sort((a, b) => a.id.localeCompare(b.id)),
  } });
}

export function eligibilityDocumentVersions(documents: Array<{ id: string; fileHash?: string; s3Key?: string; s3Bucket?: string; declaredTitle?: string; docTitle?: string; originalFileName?: string; fileName?: string; deliverableType?: string }>) {
  return documents.map((d) => ({ id: d.id, fileHash: d.fileHash, s3Key: d.s3Key, s3Bucket: d.s3Bucket,
    title: d.declaredTitle || d.docTitle || d.originalFileName || d.fileName, deliverableType: d.deliverableType || '' })).sort((a,b) => a.id.localeCompare(b.id));
}
