import type { ConcurrentProject } from './types.ts';

export type ConcurrentProjectTimesheetBucket = 'peo_pids' | 'outside_peo_pids';

export function classifyConcurrentProjectTimesheetBucket(
  project: Partial<ConcurrentProject> | undefined,
): ConcurrentProjectTimesheetBucket {
  if (project?.timesheetBucket === 'peo_pids') return 'peo_pids';
  if (project?.timesheetBucket === 'outside_peo_pids') return 'outside_peo_pids';

  const label = `${project?.projectName ?? ''} ${project?.projectCode ?? ''} ${project?.fundingSource ?? ''}`.toLowerCase();
  return label.includes('goodworks') || label.includes('gw4all') ? 'peo_pids' : 'outside_peo_pids';
}

export function isPeoPidsTimesheetProject(project: Partial<ConcurrentProject> | undefined) {
  return project?.isActive !== false && classifyConcurrentProjectTimesheetBucket(project) === 'peo_pids';
}
