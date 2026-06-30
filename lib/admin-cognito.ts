'use client';

import { fetchAuthSession } from 'aws-amplify/auth';
import { configureAmplify } from '@/lib/aws/client';
import type { ManagedCognitoGroup } from '@/lib/cognito-roles';

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
    groups: ManagedCognitoGroup[];
    added: ManagedCognitoGroup[];
    removed: ManagedCognitoGroup[];
  }>;
}
