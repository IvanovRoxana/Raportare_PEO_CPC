export type DashboardRole = 'expert' | 'pm' | 'admin';

export type DashboardDestination = {
  role: DashboardRole;
  path: '/expert' | '/pm' | '/admin';
};

export function getDashboardDestinationsForRoles(roles: readonly DashboardRole[]): DashboardDestination[] {
  return [
    roles.includes('expert') ? { role: 'expert', path: '/expert' as const } : null,
    roles.includes('pm') ? { role: 'pm', path: '/pm' as const } : null,
    roles.includes('admin') ? { role: 'admin', path: '/admin' as const } : null,
  ].filter((destination): destination is DashboardDestination => Boolean(destination));
}

export function getDashboardPathForRoleSet(roles: readonly DashboardRole[]) {
  const destinations = getDashboardDestinationsForRoles(roles);

  if (destinations.length > 1) return '/auth/select-dashboard';
  return destinations[0]?.path ?? '/expert';
}
