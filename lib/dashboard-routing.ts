export type DashboardRole = 'expert' | 'pm' | 'admin';

export type DashboardDestination = {
  role: DashboardRole | 'achizitii' | 'financiar';
  path: '/expert' | '/pm' | '/admin' | '/achizitii' | '/financiar';
};

export function getDashboardDestinationsForRoles(roles: readonly DashboardRole[]): DashboardDestination[] {
  const hasPmOrAdmin = roles.includes('pm') || roles.includes('admin');

  return [
    roles.includes('expert') ? { role: 'expert', path: '/expert' as const } : null,
    roles.includes('pm') ? { role: 'pm', path: '/pm' as const } : null,
    hasPmOrAdmin ? { role: 'achizitii', path: '/achizitii' as const } : null,
    hasPmOrAdmin ? { role: 'financiar', path: '/financiar' as const } : null,
    roles.includes('admin') ? { role: 'admin', path: '/admin' as const } : null,
  ].filter((destination): destination is DashboardDestination => Boolean(destination));
}

export function getDashboardPathForRoleSet(roles: readonly DashboardRole[]) {
  const destinations = getDashboardDestinationsForRoles(roles);

  if (destinations.length > 1) return '/auth/select-dashboard';
  return destinations[0]?.path ?? '/expert';
}
