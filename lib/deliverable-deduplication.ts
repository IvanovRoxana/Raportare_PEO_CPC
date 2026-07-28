import type { Activity, Deliverable } from './types';
import { areComCommunicationMultiGroupActivities } from './activity-multigroup-rules.ts';

type ActivityWithDeliverables = Pick<
  Activity,
  'date' | 'expertId' | 'deliverables' | 'periodGroupId' | 'workingGroupId'
  | 'saCode' | 'catalogActivityId' | 'activityType' | 'title'
> & { id?: string };

function normalizeSignaturePart(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function isPresent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

function isActivityInMonth(date: string, month: number, year: number) {
  const parsed = new Date(`${date}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getMonth() === month && parsed.getFullYear() === year;
}

export function areActivitiesCompatibleForDeliverableGroup(
  activity: Pick<Activity, 'expertId' | 'saCode' | 'catalogActivityId' | 'activityType' | 'title'>,
  candidate: Pick<Activity, 'expertId' | 'saCode' | 'catalogActivityId' | 'activityType' | 'title'>,
) {
  if (activity.expertId && candidate.expertId && activity.expertId !== candidate.expertId) return false;

  if (areComCommunicationMultiGroupActivities(activity, candidate)) return true;

  if (activity.catalogActivityId || candidate.catalogActivityId) {
    return Boolean(activity.catalogActivityId && activity.catalogActivityId === candidate.catalogActivityId);
  }

  const activitySaCode = normalizeSignaturePart(activity.saCode);
  const candidateSaCode = normalizeSignaturePart(candidate.saCode);
  const activityLabel = normalizeSignaturePart(activity.activityType || activity.title);
  const candidateLabel = normalizeSignaturePart(candidate.activityType || candidate.title);

  return Boolean(
    activitySaCode
    && candidateSaCode
    && activitySaCode === candidateSaCode
    && activityLabel
    && candidateLabel
    && activityLabel === candidateLabel,
  );
}

export function getDeliverableDocumentSignature(deliverable: Pick<
  Deliverable,
  'documentId' | 'fileHash' | 'firstPageTextHash' | 'contentFingerprint' | 'fileName' | 'originalFileName' | 'fileSize' | 'fileType' | 'fileData'
>) {
  const hasFreshFileUpload = isPresent(deliverable.fileData);
  const documentId = hasFreshFileUpload ? '' : normalizeSignaturePart(deliverable.documentId);
  if (documentId) return `document:${documentId}`;

  const fileHash = normalizeSignaturePart(deliverable.fileHash);
  if (fileHash) return `file_hash:${fileHash}`;

  const firstPageTextHash = normalizeSignaturePart(deliverable.firstPageTextHash);
  if (firstPageTextHash) return `first_page:${firstPageTextHash}`;

  const contentFingerprint = normalizeSignaturePart(deliverable.contentFingerprint);
  if (contentFingerprint) return `content:${contentFingerprint}`;

  const fileName = normalizeSignaturePart(deliverable.originalFileName || deliverable.fileName);
  const fileType = normalizeSignaturePart(deliverable.fileType);
  const fileSize = Number(deliverable.fileSize) || 0;
  if (fileName && fileType && fileSize > 0) {
    return `file_meta:${fileName}:${fileSize}:${fileType}`;
  }

  return null;
}

export function mergeDeliverableMetadata<T extends Deliverable>(primary: T, duplicate: T): T {
  const merged = { ...primary } as Record<string, unknown>;

  Object.entries(duplicate).forEach(([key, value]) => {
    if (!isPresent(merged[key]) && isPresent(value)) {
      merged[key] = value;
    }
  });

  return merged as T;
}

export function dedupeDeliverablesBySignature<T extends Deliverable>(deliverables: T[]) {
  const bySignature = new Map<string, T>();
  const result: T[] = [];

  deliverables.forEach((deliverable) => {
    const signature = getDeliverableDocumentSignature(deliverable);
    if (!signature) {
      result.push(deliverable);
      return;
    }

    const existing = bySignature.get(signature);
    if (existing) {
      const merged = mergeDeliverableMetadata(existing, deliverable);
      const index = result.indexOf(existing);
      if (index >= 0) result[index] = merged;
      bySignature.set(signature, merged);
      return;
    }

    bySignature.set(signature, deliverable);
    result.push(deliverable);
  });

  return result;
}

export function findActivityOwningDeliverableSignature<T extends ActivityWithDeliverables>(
  activities: T[],
  signature: string | null,
  preferredActivityId?: string,
) {
  if (!signature) return undefined;

  const ownsDeliverable = (activity: T) => activity.deliverables?.some((deliverable) => (
    getDeliverableDocumentSignature(deliverable) === signature
  ));
  const preferredActivity = preferredActivityId
    ? activities.find((activity) => activity.id === preferredActivityId && ownsDeliverable(activity))
    : undefined;

  return preferredActivity ?? activities.find(ownsDeliverable);
}

export function findMonthlyDeliverableDuplicate(args: {
  existingActivities: ActivityWithDeliverables[];
  nextActivities: ActivityWithDeliverables[];
  expertId: string;
  month: number;
  year: number;
  excludedActivityIds?: string[];
}) {
  const excluded = new Set(args.excludedActivityIds ?? []);
  const seen = new Map<string, { deliverable: Deliverable; activity: ActivityWithDeliverables }>();
  const existingActivities = args.existingActivities.filter((activity) => !activity.id || !excluded.has(activity.id));

  for (const activity of existingActivities) {
    if (activity.expertId !== args.expertId || !isActivityInMonth(activity.date, args.month, args.year)) continue;

    for (const deliverable of activity.deliverables ?? []) {
      const signature = getDeliverableDocumentSignature(deliverable);
      if (!signature) continue;
      if (!seen.has(signature)) seen.set(signature, { deliverable, activity });
    }
  }

  for (const activity of args.nextActivities) {
    if (activity.expertId !== args.expertId || !isActivityInMonth(activity.date, args.month, args.year)) continue;

    for (const deliverable of activity.deliverables ?? []) {
      const signature = getDeliverableDocumentSignature(deliverable);
      if (!signature) continue;

      const existing = seen.get(signature);
      if (existing) {
        return {
          signature,
          deliverable,
          existingDeliverable: existing.deliverable,
          activity,
          existingActivity: existing.activity,
        };
      }

      seen.set(signature, { deliverable, activity });
    }
  }

  return null;
}
