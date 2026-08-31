import { normalizeActivityCatalogSaCode } from './activity-catalog-merge.ts';
import type { Activity, ActivityCatalog, Expert } from './types.ts';

export type PmSubactivityReportRow = {
  id: string;
  saCode: string;
  activityId: string;
  activityDate: string;
  expertId: string;
  expertName: string;
  hours: number;
  activityTitle: string;
  reportedText: string;
  catalogActivityName?: string;
  catalogDescription?: string;
  expectedDeliverables?: string;
  deliverableCount: number;
};

export type PmSubactivityReportGroup = {
  saCode: string;
  rows: PmSubactivityReportRow[];
  totalHours: number;
  expertCount: number;
  deliverableCount: number;
};

function findCatalogActivity(activity: Activity, catalog: ActivityCatalog[]) {
  if (activity.catalogActivityId) {
    const byId = catalog.find((item) => item.id === activity.catalogActivityId);
    if (byId) return byId;
  }

  const saCode = normalizeActivityCatalogSaCode(activity.saCode);
  const title = (activity.title || activity.activityType || '').trim().toLowerCase();
  return catalog.find((item) =>
    normalizeActivityCatalogSaCode(item.saCode) === saCode
    && item.activityName.trim().toLowerCase() === title
  );
}

export function buildPmSubactivityReportGroups({
  activities,
  experts,
  catalog,
}: {
  activities: Activity[];
  experts: Expert[];
  catalog: ActivityCatalog[];
}): PmSubactivityReportGroup[] {
  const expertById = new Map(experts.map((expert) => [expert.id, expert]));
  const rows = activities.map((activity): PmSubactivityReportRow => {
    const expert = expertById.get(activity.expertId);
    const catalogActivity = findCatalogActivity(activity, catalog);
    return {
      id: activity.id,
      saCode: normalizeActivityCatalogSaCode(activity.saCode) || 'FARA-SA',
      activityId: activity.id,
      activityDate: activity.date,
      expertId: activity.expertId,
      expertName: expert?.name || activity.expertName || activity.expertId,
      hours: activity.hours || 0,
      activityTitle: activity.title || activity.activityType || catalogActivity?.activityName || 'Activitate',
      reportedText: activity.description || activity.activitySummary || activity.title || '',
      catalogActivityName: catalogActivity?.activityName,
      catalogDescription: catalogActivity?.description || catalogActivity?.objectives || catalogActivity?.expectedResults,
      expectedDeliverables: catalogActivity?.deliverables,
      deliverableCount: activity.deliverables?.length || 0,
    };
  });

  const groups = new Map<string, PmSubactivityReportRow[]>();
  rows.forEach((row) => {
    groups.set(row.saCode, [...(groups.get(row.saCode) || []), row]);
  });

  return Array.from(groups.entries())
    .map(([saCode, groupRows]) => ({
      saCode,
      rows: groupRows.sort((a, b) => a.activityDate.localeCompare(b.activityDate) || a.expertName.localeCompare(b.expertName)),
      totalHours: groupRows.reduce((sum, row) => sum + row.hours, 0),
      expertCount: new Set(groupRows.map((row) => row.expertId)).size,
      deliverableCount: groupRows.reduce((sum, row) => sum + row.deliverableCount, 0),
    }))
    .sort((a, b) => a.saCode.localeCompare(b.saCode, undefined, { numeric: true }));
}
