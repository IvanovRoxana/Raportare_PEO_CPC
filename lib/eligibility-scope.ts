import { normalizePeoCategory } from './peo-category.ts';

export function normalizeEligibilityScope(value?: string | null) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Explicit aliases only. Unknown positions keep a stable, distinct identifier.
const ROLE_ALIASES: Record<string, string> = {
  'expert afaceri publice': 'expert-afaceri-publice',
  'coordonator regional': 'coordonator-regional',
  'coordonator centru regional': 'coordonator-regional',
  'coordonator centre regionale': 'coordonator-regional',
  'coordonator business hub': 'coordonator-business-hub',
  'responsabil informare si comunicare': 'responsabil-informare-comunicare',
};

export function canonicalRoleId(profile: { roleId?: string; positionInProject?: string; expertRole?: string }) {
  const value = normalizeEligibilityScope(profile.roleId || profile.positionInProject || profile.expertRole);
  return ROLE_ALIASES[value] || value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export type EligibilityScope = {
  projectCode?: string; category?: string; expertId?: string; expertName?: string;
  roleId?: string; expertRole?: string; positionInProject?: string; saCode?: string;
};

export function readScopeMetadata(source: EligibilityScope & { metadataJson?: string }): EligibilityScope {
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(source.metadataJson || '{}') || {}; } catch { /* Invalid metadata never broadens access. */ }
  return {
    ...source,
    roleId: source.roleId || (typeof metadata.roleId === 'string' ? metadata.roleId : undefined),
    expertRole: source.expertRole || (typeof metadata.expertRole === 'string' ? metadata.expertRole : undefined),
    positionInProject: source.positionInProject || (typeof metadata.positionInProject === 'string' ? metadata.positionInProject
      : typeof metadata.projectPosition === 'string' ? metadata.projectPosition : undefined),
  };
}

/** Shared fail-closed scope check for retrieval, health, imports and migration. */
export function appliesToEligibilityScope(source: EligibilityScope & { sourceType?: string; metadataJson?: string }, target: EligibilityScope) {
  const scope = readScopeMetadata(source);
  if (!scope.projectCode || !target.projectCode || normalizeEligibilityScope(scope.projectCode) !== normalizeEligibilityScope(target.projectCode)) return false;
  if (scope.category && normalizePeoCategory(scope.category) !== normalizePeoCategory(target.category)) return false;
  if (scope.expertId && scope.expertId !== target.expertId) return false;
  if (!scope.expertId && scope.expertName && normalizeEligibilityScope(scope.expertName) !== normalizeEligibilityScope(target.expertName)) return false;
  if (scope.saCode && normalizeEligibilityScope(scope.saCode) !== normalizeEligibilityScope(target.saCode)) return false;
  const role = canonicalRoleId(scope);
  if (role && role !== canonicalRoleId(target)) return false;
  if (source.sourceType === 'fisa_post' && !scope.expertId && !role) return false;
  if (['scop_sa', 'descriere_activitati'].includes(source.sourceType || '') && !scope.saCode) return false;
  return true;
}
