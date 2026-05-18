import type { Expert } from './types';

export const ADMIN_VIEW_AS_STORAGE_KEY = 'peo_admin_view_as_expert';

export type ViewAsRole = 'expert' | 'pm' | 'admin';

export type AdminViewAsSession = {
  expertId: string;
  expertName: string;
  expertEmail?: string;
  roles: ViewAsRole[];
  startedAt: string;
  returnPath: string;
};

export type ViewAsUser = {
  id: string;
  email?: string;
  displayName?: string;
  roles: ViewAsRole[];
};

const VIEW_AS_ALLOWED_ROLES: readonly ViewAsRole[] = ['expert', 'pm', 'admin'];

function normalizeViewAsRoles(roles?: readonly string[] | null): ViewAsRole[] {
  const normalized = (roles ?? [])
    .map((role) => role.toLowerCase())
    .filter((role): role is ViewAsRole => VIEW_AS_ALLOWED_ROLES.includes(role as ViewAsRole));

  return normalized.includes('expert') ? normalized : ['expert', ...normalized];
}

export function createAdminViewAsSession(expert: Pick<Expert, 'id' | 'name' | 'email' | 'cognitoGroups'>): AdminViewAsSession {
  return {
    expertId: expert.id,
    expertName: expert.name,
    expertEmail: expert.email,
    roles: normalizeViewAsRoles(expert.cognitoGroups),
    startedAt: new Date().toISOString(),
    returnPath: '/admin',
  };
}

export function buildViewAsUser(args: {
  realUserRoles: readonly string[];
  session: AdminViewAsSession | null;
}): ViewAsUser | null {
  const isRealAdmin = args.realUserRoles.map((role) => role.toLowerCase()).includes('admin');
  if (!isRealAdmin || !args.session?.expertId) return null;

  return {
    id: args.session.expertId,
    email: args.session.expertEmail,
    displayName: args.session.expertName,
    roles: normalizeViewAsRoles(args.session.roles),
  };
}

export function getAdminViewAsSession(): AdminViewAsSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(ADMIN_VIEW_AS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AdminViewAsSession>;
    if (!parsed.expertId || !parsed.expertName) return null;

    return {
      expertId: parsed.expertId,
      expertName: parsed.expertName,
      expertEmail: parsed.expertEmail,
      roles: normalizeViewAsRoles(parsed.roles),
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      returnPath: parsed.returnPath ?? '/admin',
    };
  } catch {
    return null;
  }
}

export function setAdminViewAsSession(session: AdminViewAsSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_VIEW_AS_STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminViewAsSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_VIEW_AS_STORAGE_KEY);
}
