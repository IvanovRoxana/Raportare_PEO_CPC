import type { Activity, AuditLog } from './types';

export const PM_CLARIFICATION_AUDIT_ACTION = 'pm_clarification_requested';

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
