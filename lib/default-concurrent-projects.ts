import type { ConcurrentProject, Expert } from './types.ts';
import { peoUsersAsExperts } from './peo-users.ts';

const GOODWORKS4ALL_EXPERT_IDS = new Set(['andreea-cojocaru', 'bianca-toma', 'gabriel-zvinca']);

export const GOODWORKS4ALL_PROJECT = {
  projectName: 'GOODWORKS4ALL',
  projectCode: 'P6-GW4ALL',
  fundingSource: 'GOODWORKS4ALL',
  startDate: '2026-05-01',
  endDate: undefined,
  dailyHours: 0,
  expertProjectRole: 'Project Officer',
  notes: 'Proiect paralel configurat implicit pentru completare pontaj și verificare dublă finanțare.',
} as const;

export function buildDefaultConcurrentProjects(experts: Expert[] = peoUsersAsExperts()): ConcurrentProject[] {
  return experts
    .filter((expert) => GOODWORKS4ALL_EXPERT_IDS.has(expert.id))
    .map((expert) => ({
      id: `goodworks4all-${expert.id}`,
      expertId: expert.id,
      expertName: expert.name,
      projectName: GOODWORKS4ALL_PROJECT.projectName,
      projectCode: GOODWORKS4ALL_PROJECT.projectCode,
      expertProjectRole: GOODWORKS4ALL_PROJECT.expertProjectRole,
      fundingSource: GOODWORKS4ALL_PROJECT.fundingSource,
      dailyHours: GOODWORKS4ALL_PROJECT.dailyHours,
      startDate: GOODWORKS4ALL_PROJECT.startDate,
      endDate: GOODWORKS4ALL_PROJECT.endDate,
      isActive: true,
      notes: GOODWORKS4ALL_PROJECT.notes,
    }));
}

export function mergeConcurrentProjectsWithDefaults(
  backendProjects: ConcurrentProject[],
  defaultProjects: ConcurrentProject[] = buildDefaultConcurrentProjects()
) {
  const backendKeys = new Set(backendProjects.map(projectKey));
  return [
    ...backendProjects.filter((project) => project.isActive !== false),
    ...defaultProjects.filter((project) => !backendKeys.has(projectKey(project))),
  ];
}

function projectKey(project: Pick<ConcurrentProject, 'expertId' | 'projectCode' | 'projectName'>) {
  return `${project.expertId}::${(project.projectCode || project.projectName).trim().toLowerCase()}`;
}
