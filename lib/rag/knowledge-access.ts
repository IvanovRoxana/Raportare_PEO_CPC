import { resolveDataAccessScope } from '../access-control.ts';
import type { Expert } from '../types.ts';

export function canManageKnowledge(actor: { id?: string; roles: string[]; email?: string }, experts: Expert[] = []) {
  return actor.roles.some((role) => role === 'admin' || role === 'pm')
    && resolveDataAccessScope({ user: { ...actor, id: actor.id || '' }, experts }).canAccessAllExperts;
}
