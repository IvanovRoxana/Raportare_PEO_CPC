import { isEventActivityCatalogItem } from './activity-catalog-merge.ts';
import type { Activity, ActivityCatalog } from './types.ts';

export interface EventDocumentationDeliverable {
  uploaded?: boolean;
  filePath?: string;
  s3Key?: string;
  fileName?: string;
  filename?: string;
  documentId?: string;
  category?: string;
  deliverableType?: string;
  slotType?: string;
  type?: string;
  isPendingConfirm?: boolean;
  isCommonDeliverable?: boolean;
  uploadedByExpertId?: string;
  requiresEventProof?: boolean;
}

export interface EventDocumentationStatus {
  complete: boolean;
  hasMomOrReport: boolean;
  requiresProof: boolean;
  hasProof: boolean;
  missing: Array<'mom_or_report' | 'proof'>;
}

export interface EventDateConflictGroup {
  eventKey: string;
  title: string;
  dates: string[];
  activities: Activity[];
}

function getEventDeliverableKind(deliverable: EventDocumentationDeliverable) {
  return deliverable.category || deliverable.deliverableType || deliverable.slotType || deliverable.type || '';
}

export function hasEventDocumentationSlots(
  deliverables: EventDocumentationDeliverable[] = [],
) {
  return deliverables.some((deliverable) => {
    const kind = getEventDeliverableKind(deliverable);
    return kind === 'event_mom' || kind === 'event_proof';
  });
}

function isLegacyEventActivity(activityType: string) {
  const eventKeywords = [
    'eveniment', 'atelier', 'workshop', 'conferinta', 'seminar',
    'intalnire', 'reuniune', 'sesiune', 'forum', 'dezbatere',
    'training', 'formare', 'instruire', 'webinar',
  ];
  const normalizedActivityType = activityType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return eventKeywords.some((keyword) => normalizedActivityType.includes(keyword));
}

export function isActivityEventForDocumentation(
  activity: Pick<Activity, 'catalogActivityId' | 'activityType' | 'title'>,
  catalog: ActivityCatalog[],
) {
  if (activity.catalogActivityId) {
    const catalogItem = catalog.find((item) => item.id === activity.catalogActivityId);
    return catalogItem ? isEventActivityCatalogItem(catalogItem) : false;
  }

  return isLegacyEventActivity(activity.activityType || activity.title || '');
}

function normalizeEventTitleKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(participare|participat|prezenta|la|in|online|offline|eveniment|conferinta|workshop|atelier|webinar|forum|seminar)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getEventTitleCandidate(activity: Activity) {
  if (activity.businessHubMetaJson) {
    try {
      const meta = JSON.parse(activity.businessHubMetaJson) as { eventTitle?: string };
      if (typeof meta.eventTitle === 'string' && meta.eventTitle.trim()) return meta.eventTitle;
    } catch {
      // Invalid legacy metadata should not hide an otherwise usable activity title.
    }
  }
  return activity.title || activity.activityType || activity.description || '';
}

export function groupEventActivitiesWithDateConflicts(
  activities: Activity[],
  catalog: ActivityCatalog[],
): EventDateConflictGroup[] {
  const groups = new Map<string, EventDateConflictGroup>();

  activities
    .filter((activity) => isActivityEventForDocumentation(activity, catalog))
    .forEach((activity) => {
      const title = getEventTitleCandidate(activity);
      const key = normalizeEventTitleKey(title);
      if (!key || key.length < 4) return;
      const date = activity.date?.slice(0, 10) || '';
      if (!date) return;
      const existing = groups.get(key);
      if (existing) {
        existing.activities.push(activity);
        if (!existing.dates.includes(date)) existing.dates.push(date);
        return;
      }
      groups.set(key, {
        eventKey: key,
        title,
        dates: [date],
        activities: [activity],
      });
    });

  return Array.from(groups.values())
    .filter((group) => group.dates.length > 1)
    .sort((a, b) => b.activities.length - a.activities.length || a.title.localeCompare(b.title));
}

export function getEventDateConflictActivities(
  activities: Activity[],
  catalog: ActivityCatalog[],
) {
  return groupEventActivitiesWithDateConflicts(activities, catalog)
    .flatMap((group) => group.activities);
}

function isEventDeliverableUploaded(deliverable: EventDocumentationDeliverable) {
  return Boolean(
    deliverable.uploaded
    || deliverable.filePath
    || deliverable.s3Key
    || deliverable.fileName
    || deliverable.filename
    || deliverable.documentId
  );
}

export function getEventDocumentationStatus(
  deliverables: EventDocumentationDeliverable[] = [],
): EventDocumentationStatus {
  const uploadedMomOrReport = deliverables.filter((deliverable) => {
    const kind = getEventDeliverableKind(deliverable);
    return kind === 'event_mom' && isEventDeliverableUploaded(deliverable) && !deliverable.isPendingConfirm;
  });
  const hasMomOrReport = uploadedMomOrReport.length > 0;
  const requiresProof = uploadedMomOrReport.some((deliverable) => deliverable.requiresEventProof);
  const hasProof = deliverables.some((deliverable) => {
    const kind = getEventDeliverableKind(deliverable);
    return (
      kind === 'event_proof'
      && (
        isEventDeliverableUploaded(deliverable)
        || Boolean(deliverable.isCommonDeliverable && deliverable.uploadedByExpertId)
      )
    );
  });

  const proofRequired = !hasMomOrReport || requiresProof;
  const complete = hasMomOrReport && (!proofRequired || hasProof);
  const missing: EventDocumentationStatus['missing'] = [];
  if (!hasMomOrReport) missing.push('mom_or_report');
  if (proofRequired && !hasProof) missing.push('proof');

  return {
    complete,
    hasMomOrReport,
    requiresProof,
    hasProof,
    missing,
  };
}
