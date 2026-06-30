export const managedCognitoGroups = ['expert', 'pm', 'admin'] as const;

export type ManagedCognitoGroup = (typeof managedCognitoGroups)[number];

function normalizeRole(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export function cognitoGroupsForRole(role?: string | null, hasPmAccess = false): ManagedCognitoGroup[] {
  const normalized = normalizeRole(role);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const groups = new Set<ManagedCognitoGroup>();

  if (normalized === 'expert' || normalized.includes('expert')) groups.add('expert');
  if (normalized === 'pm' || normalized.includes('/pm') || tokens.includes('pm') || hasPmAccess) groups.add('pm');
  if (normalized === 'admin' || tokens.includes('admin')) {
    groups.add('pm');
    groups.add('admin');
  }

  return managedCognitoGroups.filter((group) => groups.has(group));
}
