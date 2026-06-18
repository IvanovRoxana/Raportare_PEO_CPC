'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, ShieldCheck, Users, UsersRound } from 'lucide-react';
import { StatCard } from '@/components/layout/dashboard-primitives';
import { concurrentProjectsService, expertsService } from '@/lib/backend-store';
import type { ConcurrentProject, Expert } from '@/lib/types';

type AdminStats = {
  activeUsers: number;
  rolesDefined: number;
  activeExperts: number;
  activeProjects: number;
};

const roleLabels = ['Expert', 'PM', 'Expert/PM', 'Admin'];

function normalizeRole(value?: string) {
  const role = value?.trim();
  if (!role) return 'Utilizator';
  if (/expert\s*\/\s*pm/i.test(role)) return 'Expert/PM';
  if (/admin/i.test(role)) return 'Admin';
  if (/pm/i.test(role)) return 'PM';
  if (/expert/i.test(role)) return 'Expert';
  return role;
}

function projectKey(project: ConcurrentProject) {
  return (project.projectCode || project.projectName || project.id).trim().toLowerCase();
}

function buildStats(experts: Expert[], projects: ConcurrentProject[]): AdminStats {
  const activeProfiles = experts.filter((expert) => expert.isActive !== false);
  const roles = new Set(roleLabels);
  activeProfiles.forEach((expert) => roles.add(normalizeRole(expert.role)));

  const activeProjectKeys = new Set(
    projects
      .filter((project) => project.isActive !== false)
      .map(projectKey)
      .filter(Boolean),
  );

  return {
    activeUsers: activeProfiles.length,
    rolesDefined: roles.size,
    activeExperts: activeProfiles.filter((expert) => normalizeRole(expert.role).includes('Expert')).length,
    activeProjects: 1 + activeProjectKeys.size,
  };
}

export function AdminStatCards({ initialStats }: { initialStats: AdminStats }) {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    let ignore = false;

    async function loadStats() {
      try {
        const [experts, projects] = await Promise.all([
          expertsService.getAll({ includeInactive: true }),
          concurrentProjectsService.getAll(),
        ]);

        if (!ignore) {
          setStats(buildStats(experts, projects));
        }
      } catch {
        if (!ignore) {
          setStats(initialStats);
        }
      }
    }

    loadStats();

    return () => {
      ignore = true;
    };
  }, [initialStats]);

  const statCards = useMemo(
    () => [
      {
        label: 'Utilizatori activi',
        value: stats.activeUsers,
        description: 'profiluri active in administrare',
        icon: UsersRound,
        tone: 'blue' as const,
        href: '/admin?tab=utilizatori',
      },
      {
        label: 'Roluri definite',
        value: stats.rolesDefined,
        description: 'roluri configurabile',
        icon: ShieldCheck,
        tone: 'navy' as const,
        href: '/admin?tab=roluri',
      },
      {
        label: 'Experti activi',
        value: stats.activeExperts,
        description: 'profiluri cu rol Expert',
        icon: Users,
        tone: 'blue' as const,
        href: '/admin/users#utilizatori',
      },
      {
        label: 'Proiecte active',
        value: stats.activeProjects,
        description: 'PEO si proiecte paralele active',
        icon: Building2,
        tone: 'success' as const,
        href: '/admin?tab=proiecte',
      },
    ],
    [stats],
  );

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {statCards.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </section>
  );
}
