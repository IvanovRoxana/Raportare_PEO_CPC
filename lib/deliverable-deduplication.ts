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

type DeliverableDocumentIdentity = Pick<
  Deliverable,
  'documentId' | 'fileHash' | 'firstPageTextHash' | 'contentFingerprint' | 'fileName' | 'originalFileName' | 'fileSize' | 'fileType' | 'fileData'
>;

export function getDeliverableDocumentSignatures(deliverable: DeliverableDocumentIdentity) {
  const signatures: string[] = [];
  const hasFreshFileUpload = isPresent(deliverable.fileData);
  const documentId = hasFreshFileUpload ? '' : normalizeSignaturePart(deliverable.documentId);
  if (documentId) signatures.push(`document:${documentId}`);

  const fileHash = normalizeSignaturePart(deliverable.fileHash);
  if (fileHash) signatures.push(`file_hash:${fileHash}`);

  // Cover text, extracted content and file metadata are similarity signals, not identity.
  return signatures;
}

export function getDeliverableDocumentSignature(deliverable: DeliverableDocumentIdentity) {
  return getDeliverableDocumentSignatures(deliverable)[0] ?? null;
}

export function hasSameDeliverableDocument(
  deliverable: DeliverableDocumentIdentity,
  candidate: DeliverableDocumentIdentity,
) {
  const signatures = getDeliverableDocumentSignatures(deliverable);
  return getDeliverableDocumentSignatures(candidate).some((signature) => signatures.includes(signature));
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
  const result: T[] = [];

  deliverables.forEach((deliverable) => {
    const existingIndex = result.findIndex((existing) => hasSameDeliverableDocument(existing, deliverable));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeDeliverableMetadata(result[existingIndex], deliverable);
    } else {
      result.push(deliverable);
    }
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
    getDeliverableDocumentSignatures(deliverable).includes(signature)
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
      for (const signature of getDeliverableDocumentSignatures(deliverable)) {
        if (!seen.has(signature)) seen.set(signature, { deliverable, activity });
      }
    }
  }

  for (const activity of args.nextActivities) {
    if (activity.expertId !== args.expertId || !isActivityInMonth(activity.date, args.month, args.year)) continue;

    for (const deliverable of activity.deliverables ?? []) {
      const signatures = getDeliverableDocumentSignatures(deliverable);
      const signature = signatures[0];
      if (!signature) continue;

      const existing = signatures.map((key) => seen.get(key)).find((match) => match !== undefined);
      if (existing) {
        return {
          signature,
          deliverable,
          existingDeliverable: existing.deliverable,
          activity,
          existingActivity: existing.activity,
        };
      }

      signatures.forEach((key) => seen.set(key, { deliverable, activity }));
    }
  }

  return null;
}
