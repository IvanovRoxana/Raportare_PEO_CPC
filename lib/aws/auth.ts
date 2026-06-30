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
import { peoUsersAsExperts } from '@/lib/peo-users';
import { mergeRolesWithExpertProfile } from '@/lib/pm-dashboard';
import { buildViewAsUser, getAdminViewAsSession } from '@/lib/admin-view-as';
import { getDashboardPathForRoleSet } from '@/lib/dashboard-routing';

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

export async function getSignedInUser(options: { ignoreViewAs?: boolean } = {}): Promise<AppUser | null> {
  configureAmplify();
  try {
    const user = await getCurrentUser();
    const attrs = await fetchUserAttributes();
    const email = attrs.email ?? user.signInDetails?.loginId;
    const expertProfile = peoUsersAsExperts().find(
      (expert) => expert.email?.toLowerCase() === String(email || '').toLowerCase()
    );
    const roles = mergeRolesWithExpertProfile(await getCurrentUserRoles(), expertProfile);
    const realUser = {
      id: user.userId,
      email,
      displayName: attrs.name ?? attrs.email ?? user.username,
      roles,
    };

    if (!options.ignoreViewAs) {
      const viewAsUser = buildViewAsUser({
        realUserRoles: realUser.roles,
        realUserId: realUser.id,
        realUserEmail: realUser.email,
        session: getAdminViewAsSession(),
      });

      if (viewAsUser) return viewAsUser;
    }

    return realUser;
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
  return getDashboardPathForRoleSet(roles);
}

export async function signOutCurrentUser() {
  configureAmplify();
  await signOut();
}
