import Link from 'next/link';
import { DashboardShell, adminNavItems } from '@/components/layout/dashboard-shell';
import { AdminStatCards } from '@/components/admin/admin-stat-cards';
import { AdminWorkspace } from '@/components/admin/data-sources-workspace';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { AdminAccessGuard } from '@/components/admin/admin-access-guard';
import { Button } from '@/components/ui/button';
import { resolveAdminLocation } from '@/lib/workspace-navigation';

const initialAdminStats = { activeUsers: 0, rolesDefined: 0, activeExperts: 0, activeProjects: 0 };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

export default async function AdminPage({ searchParams }: {
  searchParams?: Promise<{ tab?: string | string[]; section?: string | string[] }>;
}) {
  const params = await searchParams;
  const location = resolveAdminLocation(first(params?.tab), first(params?.section));
  return <AdminAccessGuard>
    <DashboardShell activeHref="/admin" navItems={adminNavItems} eyebrow="Modul Admin" title="Administrare"
      description="Un singur centru pentru sursele de date și configurarea aplicației."
      actions={<Button asChild variant="outline"><Link href="/pm?tab=knowledge">AI + RAG / Knowledge în PM</Link></Button>}
      aside={<ViewAsExpertPanel />}>
      <AdminStatCards initialStats={initialAdminStats} />
      <AdminWorkspace key={location.tab + location.section} initialTab={location.tab} initialSection={location.section} />
    </DashboardShell>
  </AdminAccessGuard>;
}
