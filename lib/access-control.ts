import type { Expert, Activity, AuditLog, ConcurrentProject, DocumentMetadata, GrupTintaEntry, ReportStatus, SharedDeliverable, VerificationData } from './types.ts';

export type AccessUser = {
  id: string;
  email?: string;
  displayName?: string;
  roles?: string[];
};

export type DataAccessScope = {
  accessLevel: 'none' | 'self' | 'all';
  canUsePmDashboard: boolean;
  canAccessAllExperts: boolean;
  currentExpert?: Expert;
  currentExpertId?: string;
  reason: 'anonymous' | 'expert_self' | 'expert_pm_self' | 'explicit_expert_pm' | 'pm' | 'admin' | 'no_expert_match';
};

// Expert/PM users are self-scoped by default. Add an email here only after a documented PM/Admin decision.
export const EXPERT_PM_EXTENDED_ACCESS_EMAILS: readonly string[] = [];

export function normalizeIdentity(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export function roleTokens(roles?: readonly string[]) {
  return new Set((roles || []).map((role) => normalizeIdentity(role)).filter(Boolean));
}

export function roleIncludesPm(value?: string | null) {
  const normalized = normalizeIdentity(value);
  return normalized === 'pm' || normalized.includes('/pm') || normalized.split(/[^a-z0-9]+/).includes('pm');
}

export function roleIncludesExpert(value?: string | null) {
  const normalized = normalizeIdentity(value);
  return normalized === 'expert' || normalized.includes('expert');
}

export function findExpertForUser(experts: Expert[], user: AccessUser | null | undefined) {
  if (!user) return undefined;
  const email = normalizeIdentity(user.email);
  const userId = normalizeIdentity(user.id);
  const displayName = normalizeIdentity(user.displayName);

  return experts.find((expert) => {
    const expertEmail = normalizeIdentity(expert.email);
    const expertId = normalizeIdentity(expert.id);
    const expertName = normalizeIdentity(expert.name);
    return (email && expertEmail === email) || (userId && expertId === userId) || (displayName && expertName === displayName);
  });
}

export function hasExplicitExpertPmExtendedAccess(user: AccessUser | null | undefined) {
  const email = normalizeIdentity(user?.email);
  return Boolean(email && EXPERT_PM_EXTENDED_ACCESS_EMAILS.includes(email));
}

export function resolveDataAccessScope(args: {
  user: AccessUser | null | undefined;
  experts: Expert[];
}): DataAccessScope {
  const { user, experts } = args;
  if (!user) {
    return {
      accessLevel: 'none',
      canUsePmDashboard: false,
      canAccessAllExperts: false,
      reason: 'anonymous',
    };
  }

  const roles = roleTokens(user.roles);
  const currentExpert = findExpertForUser(experts, user);
  const profileSaysPm = roleIncludesPm(currentExpert?.role) || currentExpert?.hasPmAccess === true;
  const profileSaysExpert = roleIncludesExpert(currentExpert?.role);
  const hasAdminRole = roles.has('admin');
  const hasPmRole = roles.has('pm');
  const hasExpertRole = roles.has('expert') || profileSaysExpert;
  const isHybridExpertPm = hasPmRole && hasExpertRole;
  const explicitHybridAccess = isHybridExpertPm && hasExplicitExpertPmExtendedAccess(user);

  if (hasAdminRole) {
    return {
      accessLevel: 'all',
      canUsePmDashboard: true,
      canAccessAllExperts: true,
      currentExpert,
      currentExpertId: currentExpert?.id,
      reason: 'admin',
    };
  }

  if (hasPmRole && !hasExpertRole) {
    return {
      accessLevel: 'all',
      canUsePmDashboard: true,
      canAccessAllExperts: true,
      currentExpert,
      currentExpertId: currentExpert?.id,
      reason: 'pm',
    };
  }

  if (explicitHybridAccess) {
    return {
      accessLevel: 'all',
      canUsePmDashboard: true,
      canAccessAllExperts: true,
      currentExpert,
      currentExpertId: currentExpert?.id,
      reason: 'explicit_expert_pm',
    };
  }

  if (currentExpert) {
    return {
      accessLevel: 'self',
      canUsePmDashboard: hasPmRole || profileSaysPm,
      canAccessAllExperts: false,
      currentExpert,
      currentExpertId: currentExpert.id,
      reason: hasPmRole || profileSaysPm ? 'expert_pm_self' : 'expert_self',
    };
  }

  return {
    accessLevel: 'none',
    canUsePmDashboard: false,
    canAccessAllExperts: false,
    reason: 'no_expert_match',
  };
}

export function canAccessExpertId(scope: DataAccessScope, expertId?: string | null) {
  if (!expertId || scope.accessLevel === 'none') return false;
  return scope.canAccessAllExperts || scope.currentExpertId === expertId;
}

export function filterExpertsForScope(experts: Expert[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return experts;
  return experts.filter((expert) => expert.id === scope.currentExpertId);
}

export function filterActivitiesForScope(activities: Activity[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return activities;
  return activities.filter((activity) => activity.expertId === scope.currentExpertId);
}

export function filterAuditLogsForScope(logs: AuditLog[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return logs;
  return logs.filter((log) => log.affectedExpertId === scope.currentExpertId || log.actorId === scope.currentExpertId);
}

export function filterDocumentsForScope(documents: DocumentMetadata[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return documents;
  return documents.filter((document) => document.uploadedByExpertId === scope.currentExpertId);
}

export function filterSharedDeliverablesForScope(relations: SharedDeliverable[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return relations;
  return relations.filter((relation) => relation.sourceExpertId === scope.currentExpertId || relation.targetExpertId === scope.currentExpertId);
}

export function filterReportStatusesForScope(statuses: ReportStatus[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return statuses;
  return statuses.filter((status) => status.expertId === scope.currentExpertId);
}

export function filterVerificationsForScope(verifications: VerificationData[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return verifications;
  return verifications.filter((verification) => verification.expertId === scope.currentExpertId);
}

export function filterGrupTintaForScope(entries: GrupTintaEntry[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return entries;
  return entries.filter((entry) => entry.expertId === scope.currentExpertId);
}

export function filterConcurrentProjectsForScope(projects: ConcurrentProject[], scope: DataAccessScope) {
  if (scope.canAccessAllExperts) return projects;
  return projects.filter((project) => project.expertId === scope.currentExpertId);
}
