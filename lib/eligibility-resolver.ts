import 'server-only';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import outputs from '../amplify_outputs.json';
import { getCognitoAccessTokenFromRequest } from './rag/cognito-auth.ts';
import { EligibilityAccessError, authorizeEligibilityExpert, authorizeEligibilityDocument, normalizeEligibilityExperts, type EligibilityActor } from './eligibility-authorization.ts';
import { peoUsersAsExperts } from './peo-users.ts';
import { eligibilityStore } from './eligibility-server-store.ts';
import { appliesToEligibilityScope } from './eligibility-scope.ts';
import { onlyPublishedChunks } from './rag/index-generation.ts';
import { readEligibilityOriginal } from './eligibility-originals.ts';
import type { Deliverable, Expert, KnowledgeChunk, KnowledgeDocument } from './types.ts';

const verifier = CognitoJwtVerifier.create({ userPoolId: outputs.auth.user_pool_id, clientId: outputs.auth.user_pool_client_id, tokenUse: 'access' });
export async function authenticateEligibilityRequest(request: Request): Promise<EligibilityActor> {
  const token = getCognitoAccessTokenFromRequest(request, { allowAuthorizationHeader: true });
  if (!token) throw new EligibilityAccessError('Sesiunea Cognito lipseste.', 401);
  try {
    const payload = await verifier.verify(token);
    const response = await fetch(`https://cognito-idp.${outputs.auth.aws_region}.amazonaws.com/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser' },
      body: JSON.stringify({ AccessToken: token }), signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Cognito session rejected');
    const user = await response.json() as { UserAttributes?: Array<{ Name: string; Value: string }> };
    const attrs = Object.fromEntries((user.UserAttributes || []).map((item) => [item.Name, item.Value]));
    return { id: payload.sub, email: attrs.email_verified === 'true' ? attrs.email : undefined, roles: payload['cognito:groups'] || [] };
  } catch { throw new EligibilityAccessError('Sesiunea Cognito nu este valida sau a expirat.', 401); }
}

export async function resolveEligibilityContext(request: Request, input: { expertId: string; projectCode?: string; saCode: string; documentIds: string[]; historical?: boolean }, authenticatedActor?: EligibilityActor) {
  const actor = authenticatedActor || await authenticateEligibilityRequest(request);
  const experts = normalizeEligibilityExperts(await eligibilityStore.list<Expert>('Expert'), peoUsersAsExperts());
  const { expert, roleId, scope } = authorizeEligibilityExpert(actor, experts, input.expertId, input.projectCode);
  if (!input.historical && !expert.saCodes?.includes(input.saCode)) throw new EligibilityAccessError('Subactivitatea nu este atribuita expertului.');
  if (new Set(input.documentIds).size !== input.documentIds.length) throw new EligibilityAccessError('Documente duplicate in cerere.', 422);
  const documents = await Promise.all(input.documentIds.map(async (id) => {
    const document = await eligibilityStore.get<Deliverable>('Deliverable', id)
      || await eligibilityStore.get<Deliverable>('Document', id);
    if (document) {
      document.projectCode ||= document.projectId;
      authorizeEligibilityDocument(document, expert);
      if (document.activityId) {
        const activity = await eligibilityStore.get<{ expertId?: string }>('Activity', document.activityId);
        if (!activity || activity.expertId !== expert.id) throw new EligibilityAccessError('Activitatea livrabilului nu apartine expertului.');
      }
    }
    return document ? readEligibilityOriginal(document) : null;
  }));
  const target = { projectCode: expert.projectCode, category: expert.category, expertId: expert.id, expertName: expert.name, roleId, saCode: input.saCode };
  const parents = (await eligibilityStore.list<KnowledgeDocument>('KnowledgeDocument', { field: 'projectCode', value: expert.projectCode! }))
    .filter((doc) => doc.status === 'active' && appliesToEligibilityScope(doc, target));
  const chunks = await eligibilityStore.list<KnowledgeChunk>('KnowledgeChunk', { field: 'projectCode', value: expert.projectCode! });
  return { actor, expert, roleId, scope, documents, chunks: onlyPublishedChunks(chunks, parents).filter((chunk) => appliesToEligibilityScope(chunk, target)), parents };
}
