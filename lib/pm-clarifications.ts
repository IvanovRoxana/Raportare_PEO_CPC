import type { Activity, AuditLog } from './types';

export const PM_CLARIFICATION_AUDIT_ACTION = 'pm_clarification_requested';
export const PM_CLARIFICATION_REALERT_AUDIT_ACTION = 'pm_clarification_realerted';

export function getActivitiesWithPmClarifications(activities: Activity[]) {
  return activities.filter((activity) => Boolean(activity.pmNotes?.trim()));
}

export function isCurrentOrPreviousMonth(month: number, year: number, baseDate = new Date()) {
  const current = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const previous = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
  const target = new Date(year, month, 1);

  return target.getTime() === current.getTime() || target.getTime() === previous.getTime();
}

export function buildClarificationEditHref(activity: Activity, month: number, year: number) {
  const params = new URLSearchParams({
    month: month.toString(),
    year: year.toString(),
    activityId: activity.id,
    mode: 'clarificari',
  });

  return `/expert/peo?${params.toString()}`;
}

export function findLatestClarificationAudit(auditLogs: AuditLog[], activityId?: string) {
  return auditLogs.find((audit) => {
    if (audit.actionType !== PM_CLARIFICATION_AUDIT_ACTION) return false;
    if (!activityId) return true;
    return [audit.fieldName, audit.newValue, audit.oldValue]
      .filter(Boolean)
      .some((value) => String(value).includes(activityId));
  });
}

function auditReferencesTarget(audit: AuditLog, targetKey?: string) {
  if (!targetKey) return true;
  return [audit.fieldName, audit.newValue, audit.oldValue, audit.justification]
    .filter(Boolean)
    .some((value) => String(value).includes(targetKey));
}

export function findClarificationRealertAudits(auditLogs: AuditLog[], targetKey?: string) {
  return auditLogs
    .filter((audit) => audit.actionType === PM_CLARIFICATION_REALERT_AUDIT_ACTION && auditReferencesTarget(audit, targetKey))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function findLatestClarificationRealertAudit(auditLogs: AuditLog[], targetKey?: string) {
  return findClarificationRealertAudits(auditLogs, targetKey)[0];
}
