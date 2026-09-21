import 'server-only';
import { AdminGetUserCommand, AdminListGroupsForUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { eligibilityRegion, eligibilityUserPool } from './eligibility-environment.ts';
import { EligibilityAccessError, type EligibilityActor } from './eligibility-authorization.ts';

const client = new CognitoIdentityProviderClient({ region: eligibilityRegion, maxAttempts: 2 });
/** Re-read current account status and groups, never trust queued role claims. */
export async function readEligibilityWorkerActor(identity: { id: string; username: string }): Promise<EligibilityActor> {
  const input = { UserPoolId: eligibilityUserPool, Username: identity.username };
  const user = await client.send(new AdminGetUserCommand(input));
  const attrs = Object.fromEntries((user.UserAttributes || []).map((a) => [a.Name!, a.Value]));
  if (!user.Enabled || attrs.sub !== identity.id || !['CONFIRMED', 'EXTERNAL_PROVIDER'].includes(user.UserStatus || '')) throw new EligibilityAccessError('Accesul initiatorului evaluarii a fost revocat.');
  const roles: string[] = [];
  let NextToken: string | undefined;
  do {
    const page = await client.send(new AdminListGroupsForUserCommand({ ...input, NextToken }));
    roles.push(...(page.Groups || []).flatMap((g) => g.GroupName ? [g.GroupName] : []));
    NextToken = page.NextToken;
  } while (NextToken);
  return { ...identity, email: attrs.email_verified === 'true' ? attrs.email : undefined, roles };
}
