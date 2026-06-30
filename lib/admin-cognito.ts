'use client';

import { fetchAuthSession } from 'aws-amplify/auth';
import { configureAmplify } from '@/lib/aws/client';
import { requestPasswordReset, signUpWithEmail } from '@/lib/aws/auth';
import type { ManagedCognitoGroup } from '@/lib/cognito-roles';

function generateTemporaryPassword() {
  return `Tmp!${Math.random().toString(36).slice(2, 8)}9Aa`;
}

function isMissingCognitoUserError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /user does not exist|utilizatorul cognito nu exista|not found/i.test(message);
}

async function inviteCognitoUser(email: string, fullName?: string) {
  const tempPassword = generateTemporaryPassword();

  try {
    await signUpWithEmail(email, tempPassword, fullName);
  } catch (signupError) {
    const message = signupError instanceof Error ? signupError.message : String(signupError || '');
    if (!/exists|already|UsernameExistsException/i.test(message)) {
      throw signupError;
    }
  }

  try {
    await requestPasswordReset(email);
  } catch {
    // Some Cognito states cannot receive a reset code immediately after signup.
  }
}

export async function syncCognitoGroupsForUser(email: string | undefined, groups: ManagedCognitoGroup[]) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Utilizatorul nu are email pentru sincronizarea Cognito.');
  }

  configureAmplify();
  const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  if (!token) {
    throw new Error('Nu am gasit sesiunea Cognito a administratorului curent.');
  }

  const response = await fetch('/api/admin/cognito-groups', {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: normalizedEmail, groups }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Sincronizarea grupurilor Cognito a esuat.');
  }

  return response.json() as Promise<{
    email: string;
    username?: string;
    groups: ManagedCognitoGroup[];
    added: ManagedCognitoGroup[];
    removed: ManagedCognitoGroup[];
  }>;
}

export async function syncOrInviteCognitoGroupsForUser(
  email: string | undefined,
  groups: ManagedCognitoGroup[],
  fullName?: string,
) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  try {
    return await syncCognitoGroupsForUser(normalizedEmail, groups);
  } catch (error) {
    if (!isMissingCognitoUserError(error)) {
      throw error;
    }
  }

  await inviteCognitoUser(normalizedEmail, fullName);
  return syncCognitoGroupsForUser(normalizedEmail, groups);
}
