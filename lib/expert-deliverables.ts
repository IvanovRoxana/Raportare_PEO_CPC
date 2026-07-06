import { getDocumentAuditTitle } from './document-sharing.ts';
import type { Activity, Deliverable } from './types';

export interface ExpertDeliverableRow {
  id: string;
  activityId: string;
  activityDate: string;
  activityTitle: string;
  activityType: string;
  saCode?: string;
  deliverable: Deliverable;
  title: string;
  fileName: string;
  auditReference: string;
}

export function isUploadedDeliverable(deliverable: Deliverable) {
  return Boolean(
    deliverable.uploaded
    || deliverable.fileName
    || deliverable.filePath
    || deliverable.s3Key
    || deliverable.documentId,
  );
}

export function buildExpertDeliverableRows(activities: Activity[]): ExpertDeliverableRow[] {
  return activities
    .flatMap((activity) =>
      (activity.deliverables ?? [])
        .filter(isUploadedDeliverable)
        .map((deliverable, index) => {
          const fileName = deliverable.fileName || deliverable.originalFileName || deliverable.documentId || 'Document fara nume';
          const auditReference = deliverable.documentId || deliverable.s3Key || deliverable.filePath || fileName;

          return {
            id: `${activity.id}:${deliverable.id || deliverable.documentId || index}`,
            activityId: activity.id,
            activityDate: activity.date,
            activityTitle: activity.title || activity.activityType || 'Activitate fara titlu',
            activityType: activity.activityType,
            saCode: deliverable.saCode || activity.saCode,
            deliverable,
            title: getDocumentAuditTitle(deliverable),
            fileName,
            auditReference,
          };
        }),
    )
    .sort((a, b) => (
      a.activityDate.localeCompare(b.activityDate)
      || a.activityTitle.localeCompare(b.activityTitle)
      || a.title.localeCompare(b.title)
    ));
}
