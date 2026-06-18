import type { Expert } from './types.ts';

export function expertIdentityKey(expert: Pick<Expert, 'id' | 'email'>) {
  return expert.email?.trim().toLowerCase() || expert.id;
}

function nonEmptyString(primary?: string, fallback?: string) {
  return primary?.trim() ? primary : fallback;
}

function nonEmptyStringList(primary?: string[], fallback?: string[]) {
  return primary && primary.length > 0 ? primary : fallback;
}

function nonZeroNumber(primary: number | undefined, fallback: number | undefined) {
  return primary !== undefined && primary !== null && Number.isFinite(primary) && primary > 0 ? primary : fallback;
}

export function mergeExpertWithFallback(primary: Expert, fallback?: Expert): Expert {
  if (!fallback) return primary;

  return {
    ...fallback,
    ...primary,
    id: fallback.id || primary.id,
    userId: primary.userId ?? fallback.userId,
    name: nonEmptyString(primary.name, fallback.name) || primary.name || fallback.name,
    email: nonEmptyString(primary.email, fallback.email),
    phone: primary.phone ?? fallback.phone,
    role: nonEmptyString(primary.role, fallback.role) || primary.role || fallback.role,
    category: nonEmptyString(primary.category, fallback.category),
    norma: nonZeroNumber(primary.norma, fallback.norma) ?? 8,
    normType: primary.normType ?? fallback.normType,
    oreZi: nonZeroNumber(primary.oreZi, fallback.oreZi),
    dailyHours: nonZeroNumber(primary.dailyHours, fallback.dailyHours),
    manualMonthlyNorm: primary.manualMonthlyNorm ?? fallback.manualMonthlyNorm,
    projectMonthlyNorm: primary.projectMonthlyNorm ?? fallback.projectMonthlyNorm,
    positionInProject: nonEmptyString(primary.positionInProject, fallback.positionInProject),
    projectCode: nonEmptyString(primary.projectCode, fallback.projectCode),
    projectTitle: nonEmptyString(primary.projectTitle, fallback.projectTitle),
    beneficiary: nonEmptyString(primary.beneficiary, fallback.beneficiary),
    saCodes: nonEmptyStringList(primary.saCodes, fallback.saCodes),
    hasPmAccess: primary.hasPmAccess ?? fallback.hasPmAccess,
    cognitoGroups: nonEmptyStringList(primary.cognitoGroups, fallback.cognitoGroups),
    isActive: primary.isActive ?? fallback.isActive,
    createdAt: primary.createdAt ?? fallback.createdAt,
    updatedAt: primary.updatedAt ?? fallback.updatedAt,
  };
}

export function mergeExpertLists(primary: Expert[], fallback: Expert[]) {
  const merged = new Map(fallback.map((expert) => [expertIdentityKey(expert), expert]));

  primary.forEach((expert) => {
    const key = expertIdentityKey(expert);
    merged.set(key, mergeExpertWithFallback(expert, merged.get(key)));
  });

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}
