import type { Activity, DocumentMetadata, Expert, ReportStatus, SharedDeliverable } from './types.ts';

export type DashboardAccessInput = {
  roles?: string[];
  projectRole?: string;
  hasPmAccess?: boolean | null;
};

export function normalizeRoleTokens(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

export function roleIncludesPm(value?: string | null) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'pm' || normalized.includes('/pm') || normalizeRoleTokens(normalized).includes('pm');
}

export function roleIncludesExpert(value?: string | null) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'expert' || normalized.includes('expert');
}

export function canAccessExpertModule(input: DashboardAccessInput) {
  return Boolean(input.roles?.includes('expert') || roleIncludesExpert(input.projectRole));
}

export function canAccessPmDashboard(input: DashboardAccessInput) {
  return Boolean(
    input.hasPmAccess ||
      input.roles?.includes('pm') ||
      input.roles?.includes('admin') ||
      roleIncludesPm(input.projectRole)
  );
}

export function resolveDashboardAccess(input: DashboardAccessInput) {
  return {
    canUseExpert: canAccessExpertModule(input),
    canUsePm: canAccessPmDashboard(input),
  };
}

export function mergeRolesWithExpertProfile(
  roles: string[],
  expert?: (Pick<Expert, 'role' | 'hasPmAccess'> & { cognitoGroups?: string[] }) | null,
) {
  const merged = new Set(roles.map((role) => role.toLowerCase()));
  expert?.cognitoGroups?.forEach((group) => merged.add(group.toLowerCase()));
  if (expert && canAccessExpertModule({ projectRole: expert.role })) merged.add('expert');
  if (expert && canAccessPmDashboard({ projectRole: expert.role, hasPmAccess: expert.hasPmAccess })) merged.add('pm');
  return Array.from(merged).filter((role): role is 'expert' | 'pm' | 'admin' =>
    role === 'expert' || role === 'pm' || role === 'admin'
  );
}

export function checkCrossAlignment(activities: Pick<Activity, 'id' | 'expertId' | 'date' | 'title' | 'activityType' | 'description'>[]) {
  const issues: Array<{
    id: string;
    firstActivityId: string;
    secondActivityId: string;
    date: string;
    reason: string;
  }> = [];

  for (let i = 0; i < activities.length; i += 1) {
    for (let j = i + 1; j < activities.length; j += 1) {
      const first = activities[i];
      const second = activities[j];
      if (first.expertId === second.expertId || first.date !== second.date) continue;

      const sameType = first.activityType && first.activityType === second.activityType;
      const sameTitle = normalizeForComparison(first.title) && normalizeForComparison(first.title) === normalizeForComparison(second.title);
      const sameDescription =
        normalizeForComparison(first.description) &&
        normalizeForComparison(first.description) === normalizeForComparison(second.description);

      if (sameType || sameTitle || sameDescription) {
        issues.push({
          id: `cross_${first.id}_${second.id}`,
          firstActivityId: first.id,
          secondActivityId: second.id,
          date: first.date,
          reason: sameTitle ? 'same_title' : sameDescription ? 'same_description' : 'same_activity_type',
        });
      }
    }
  }

  return issues;
}

export function buildPmDashboardSummary(args: {
  experts: Expert[];
  activities: Activity[];
  reportStatuses: ReportStatus[];
  documents: DocumentMetadata[];
  sharedDeliverables: SharedDeliverable[];
}) {
  const statusCounts = {
    draft: 0,
    sent: 0,
    approved: 0,
  };

  args.experts.forEach((expert) => {
    const status = args.reportStatuses.find((item) => item.expertId === expert.id)?.status || 'draft';
    if (status === 'approved') statusCounts.approved += 1;
    else if (status === 'sent' || status === 'in_review') statusCounts.sent += 1;
    else statusCounts.draft += 1;
  });

  return {
    totalExperts: args.experts.length,
    statusCounts,
    totalHours: args.activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0),
    titleIssues: args.documents.filter((document) => document.titleMatch === false || document.titleCheckStatus === 'mismatch').length,
    pendingSharedDeliverables: args.sharedDeliverables.filter((relation) => relation.status === 'pending_registration').length,
    crossAlignmentIssues: checkCrossAlignment(args.activities).length,
  };
}

function normalizeForComparison(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
