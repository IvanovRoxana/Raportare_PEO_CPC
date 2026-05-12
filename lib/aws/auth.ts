'use client';

import {
  fetchAuthSession,
  confirmResetPassword,
  fetchUserAttributes,
  getCurrentUser,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import { configureAmplify } from './client';

export type AppRole = 'expert' | 'pm' | 'admin';

export type AppUser = {
  id: string;
  email?: string;
  displayName?: string;
  roles: AppRole[];
};

export async function signInWithEmail(email: string, password: string) {
  configureAmplify();
  const result = await signIn({ username: email, password });
  return result;
}

export async function signUpWithEmail(email: string, password: string, fullName?: string) {
  configureAmplify();
  return signUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
        ...(fullName ? { name: fullName } : {}),
      },
    },
  });
}

export async function requestPasswordReset(email: string) {
  configureAmplify();
  return resetPassword({ username: email });
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  configureAmplify();
  return confirmResetPassword({
    username: email,
    confirmationCode: code,
    newPassword,
  });
}

export async function getSignedInUser(): Promise<AppUser | null> {
  configureAmplify();
  try {
    const user = await getCurrentUser();
    const attrs = await fetchUserAttributes();
    const roles = await getCurrentUserRoles();

    return {
      id: user.userId,
      email: attrs.email ?? user.signInDetails?.loginId,
      displayName: attrs.name ?? attrs.email ?? user.username,
      roles,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUserRoles(): Promise<AppRole[]> {
  configureAmplify();

  try {
    const session = await fetchAuthSession();
    const groups = session.tokens?.accessToken.payload['cognito:groups'];
    const normalizedGroups = Array.isArray(groups) ? groups : groups ? [groups] : [];

    return normalizedGroups
      .map((group) => String(group).toLowerCase())
      .filter((group): group is AppRole => group === 'expert' || group === 'pm' || group === 'admin');
  } catch {
    return [];
  }
}

export function getDashboardPathForRoles(roles: AppRole[]) {
  const canUseExpert = roles.includes('expert');
  const canUsePm = roles.includes('pm') || roles.includes('admin');

  if (canUseExpert && canUsePm) {
    return '/auth/select-dashboard';
  }

  if (canUsePm) {
    return '/pm';
  }

  return '/expert';
}

export async function signOutCurrentUser() {
  configureAmplify();
  await signOut();
}
