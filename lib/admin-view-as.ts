import type { Expert } from './types';

export const ADMIN_VIEW_AS_STORAGE_KEY = 'peo_admin_view_as_expert';

export type ViewAsRole = 'expert' | 'pm' | 'admin';

export type AdminViewAsSession = {
  expertId: string;
  expertName: string;
  expertEmail?: string;
  actorId?: string;
  actorEmail?: string;
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

export function createAdminViewAsSession(
  expert: Pick<Expert, 'id' | 'name' | 'email' | 'cognitoGroups'>,
  actor?: { id?: string; email?: string },
): AdminViewAsSession {
  return {
    expertId: expert.id,
    expertName: expert.name,
    expertEmail: expert.email,
    actorId: actor?.id,
    actorEmail: actor?.email,
    roles: normalizeViewAsRoles(expert.cognitoGroups),
    startedAt: new Date().toISOString(),
    returnPath: '/admin',
  };
}

export function buildViewAsUser(args: {
  realUserRoles: readonly string[];
  realUserId?: string;
  realUserEmail?: string;
  session: AdminViewAsSession | null;
}): ViewAsUser | null {
  const isRealAdmin = args.realUserRoles.map((role) => role.toLowerCase()).includes('admin');
  if (!isRealAdmin || !args.session?.expertId) return null;
  const sessionHasActor = Boolean(args.session.actorId || args.session.actorEmail);
  const sameActorId = args.session.actorId && args.realUserId && args.session.actorId === args.realUserId;
  const sameActorEmail = args.session.actorEmail && args.realUserEmail
    && args.session.actorEmail.toLowerCase() === args.realUserEmail.toLowerCase();
  if (!sessionHasActor || (!sameActorId && !sameActorEmail)) return null;

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
      actorId: parsed.actorId,
      actorEmail: parsed.actorEmail,
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
