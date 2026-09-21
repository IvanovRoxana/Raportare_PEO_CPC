import { canAccessExpertId, resolveDataAccessScope } from './access-control.ts';
import { mergeExpertLists } from './expert-merge.ts';
import { canonicalRoleId } from './eligibility-scope.ts';
import type { Expert } from './types.ts';

export class EligibilityAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) { super(message); this.name = 'EligibilityAccessError'; this.status = status; }
}
export type EligibilityActor = { id: string; username?: string; email?: string; roles: string[] };

export function normalizeEligibilityExperts(backendExperts: Expert[], referenceExperts: Expert[]): Expert[] {
  // Use the same trusted server-side reference fallback as the dashboard. Existing
  // backend records retain priority, including explicit deactivation and project changes.
  return mergeExpertLists(backendExperts, referenceExperts.map((expert) => ({
    ...expert,
    // Reference profiles have no persisted timestamps; runtime dates would invalidate snapshots.
    createdAt: '',
    updatedAt: '',
  })));
}

export function authorizeEligibilityExpert(actor: EligibilityActor, experts: Expert[], expertId: string, projectCode?: string) {
  // Never match display names: they are mutable, non-unique user attributes.
  const scope = resolveDataAccessScope({ user: actor, experts });
  const expert = experts.find((item) => item.id === expertId);
  if (!actor.roles.some((role) => ['expert', 'pm', 'admin'].includes(role)) || !expert || expert.isActive === false
    || !canAccessExpertId(scope, expertId) || !expert.projectCode || (projectCode && projectCode !== expert.projectCode)) {
    throw new EligibilityAccessError('Expertul sau proiectul nu este accesibil acestei sesiuni.');
  }
  const roleId = canonicalRoleId({ positionInProject: expert.positionInProject });
  if (!roleId) throw new EligibilityAccessError('Profilul expertului nu are un rol de proiect configurat.', 422);
  return { expert, roleId, scope };
}

export function authorizeEligibilityDocument(document: { expertId?: string; uploadedByExpertId?: string; projectCode?: string; sharedWithExpertIds?: string[] }, expert: { id: string; projectCode?: string }) {
  if (document.projectCode !== expert.projectCode || !document.projectCode
    || !(document.expertId === expert.id || document.uploadedByExpertId === expert.id || document.sharedWithExpertIds?.includes(expert.id))) {
    throw new EligibilityAccessError('Livrabilul nu apartine expertului/proiectului autorizat.');
  }
}
