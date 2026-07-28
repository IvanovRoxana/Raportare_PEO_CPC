import { findLatestClarificationAudit, PM_CLARIFICATION_AUDIT_ACTION } from './pm-clarifications.ts';
import type { Activity, AuditLog, DocumentMetadata, Expert, PmClarificationThread, ReportStatus } from './types.ts';

export type PmProblemType =
  | 'daily_limit'
  | 'monthly_norm'
  | 'project_norm'
  | 'missing_days'
  | 'blocked_days'
  | 'admin_interventions'
  | 'title_mismatch'
  | 'event_documents'
  | 'neconformity'
  | 'clarification';

export type PmProblemItem = {
  id: string;
  type: PmProblemType;
  expertId?: string;
  expertName?: string;
  activityId?: string;
  documentId?: string;
  label: string;
  detail: string;
  status: 'open' | 'answered' | 'resolved';
};

export function buildPmClarificationThreads({
  expert,
  activities,
  reportStatus,
  auditLogs,
  month,
  year,
}: {
  expert: Expert;
  activities: Activity[];
  reportStatus?: ReportStatus | null;
  auditLogs: AuditLog[];
  month: number;
  year: number;
}): PmClarificationThread[] {
  const threads: PmClarificationThread[] = [];

  if (reportStatus?.pmNotes?.trim()) {
    const audit = findLatestClarificationAudit(auditLogs);
    threads.push({
      id: `month-${expert.id}-${year}-${month}`,
      targetType: 'month',
      targetId: reportStatus.id || `${expert.id}-${year}-${month}`,
      expertId: expert.id,
      month,
      year,
      status: reportStatus.status === 'approved' ? 'resolved' : 'requested',
      pmMessage: reportStatus.pmNotes,
      requestedAt: audit?.createdAt || reportStatus.updatedAt || reportStatus.sentDate,
      requestedBy: audit?.actorName,
      resolvedAt: reportStatus.status === 'approved' ? reportStatus.approvalDate || reportStatus.updatedAt : undefined,
    });
  }

  activities
    .filter((activity) => activity.pmNotes?.trim())
    .forEach((activity) => {
      const audit = findLatestClarificationAudit(auditLogs, activity.id);
      const answered = Boolean(activity.updatedAt && (!audit?.createdAt || new Date(activity.updatedAt).getTime() > new Date(audit.createdAt).getTime()));
      threads.push({
        id: `activity-${activity.id}`,
        targetType: 'activity',
        targetId: activity.id,
        expertId: activity.expertId,
        month,
        year,
        status: activity.status === 'approved' ? 'resolved' : answered ? 'answered' : 'requested',
        pmMessage: activity.pmNotes || '',
        expertResponse: answered ? activity.description || activity.activitySummary || 'Activitatea a fost actualizata dupa cererea PM.' : undefined,
        requestedAt: audit?.createdAt,
        requestedBy: audit?.actorName,
        answeredAt: answered ? activity.updatedAt : undefined,
        resolvedAt: activity.status === 'approved' ? activity.updatedAt : undefined,
      });
    });

  return threads.sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
}

export function buildDocumentClarificationProblem(document: DocumentMetadata): PmProblemItem {
  return {
    id: `title-${document.id}`,
    type: 'title_mismatch',
    expertId: document.uploadedByExpertId,
    expertName: document.uploadedByExpertName,
    documentId: document.id,
    activityId: document.sourceActivityId,
    label: 'Title mismatch',
    detail: `${document.originalFileName}: ${document.extractedTitle || document.declaredTitle || 'titlu de verificat'}`,
    status: 'open',
  };
}

export function clarificationStatusLabel(status: PmClarificationThread['status']) {
  if (status === 'resolved') return 'Rezolvata';
  if (status === 'answered') return 'Raspuns primit';
  if (status === 'rejected') return 'Necesita revenire';
  return 'Ceruta';
}

export function isClarificationAudit(log: AuditLog) {
  return log.actionType === PM_CLARIFICATION_AUDIT_ACTION;
}
