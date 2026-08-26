'use client';

import { Users } from 'lucide-react';
import { WorkingGroupsTab } from '@/components/pm/working-groups-tab';
import { DashboardShell, expertNavItems } from '@/components/layout/dashboard-shell';
import { UserMenu } from '@/components/user-menu';
import { useWorkingGroups } from '@/hooks/use-backend-data';

export default function WorkingGroupsPage() {
  const { groups, isLoading, error } = useWorkingGroups();

  return (
    <DashboardShell
      activeHref="/grupuri-lucru"
      navItems={expertNavItems}
      eyebrow="Modul PEO"
      title="Grupuri de lucru"
      description="Lista grupurilor de lucru folosite in raportarea activitatilor PEO."
      actions={<UserMenu />}
      quickTabs={[
        { label: 'Grupuri de lucru', href: '/grupuri-lucru', icon: Users, active: true },
      ]}
    >
      <WorkingGroupsTab groups={groups} isLoading={isLoading} error={error} />
    </DashboardShell>
  );
}
