import { authenticateEligibilityRequest } from '../eligibility-resolver';
import { EligibilityAccessError, normalizeEligibilityExperts } from '../eligibility-authorization';
import { getCognitoAccessTokenFromRequest } from './cognito-auth';
import { canManageKnowledge } from './knowledge-access';
import { eligibilityStore } from '../eligibility-server-store';
import { peoUsersAsExperts } from '../peo-users';
import { hasSamePublicRequestOrigin } from './request-origin';
import type { Expert } from '../types';

export async function assertKnowledgeRequest(request: Request) {
  if (!hasSamePublicRequestOrigin(request)) {
    throw new EligibilityAccessError('Cerere respinsă.');
  }
  const actor = await authenticateEligibilityRequest(request);
  if (!canManageKnowledge(actor)) throw new EligibilityAccessError('Biblioteca de cunoștințe necesită acces PM extins sau Admin.');
  if (!actor.roles.includes('admin')) {
    const experts = normalizeEligibilityExperts(await eligibilityStore.list<Expert>('Expert'), peoUsersAsExperts());
    if (!canManageKnowledge(actor, experts)) throw new EligibilityAccessError('Profilul PM are acces doar la datele proprii.');
  }
  return getCognitoAccessTokenFromRequest(request, { allowAuthorizationHeader: true });
}

export function knowledgeAuthErrorResponse(error: unknown) {
  return error instanceof EligibilityAccessError
    ? Response.json({ error: error.message }, { status: error.status })
    : null;
}
