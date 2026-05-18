'use client';

import useSWR, { mutate } from 'swr';
import {
  expertsService,
  activitiesService,
  verificationsService,
  neconformitatiService,
  notesService,
  settingsService,
  isBackendAvailable,
  activityCatalogService,
  workingGroupsService,
  concurrentProjectsService,
  reportStatusService,
  grupTintaService,
  auditLogsService,
  documentsService,
  sharedDeliverablesService,
} from '@/lib/backend-store';
import type { Activity, Expert, VerificationData, Neconformitate, VerificationNote, AppSettings, ActivityCatalog, WorkingGroup, ConcurrentProject, ReportStatus, GrupTintaEntry, AuditLog, AdminInterventionRequest } from '@/lib/types';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

function stableList<T>(data: T[] | null | undefined): T[] {
  return data ?? ([...EMPTY_LIST] as T[]);
}

// Safe fetcher that returns null if the configured backend is not available
const safeFetcher = <T>(fetcher: () => Promise<T>) => async (): Promise<T | null> => {
  if (!isBackendAvailable()) {
    return null;
  }
  return fetcher();
};

// ============================================
// EXPERTS HOOKS
// ============================================
export function useExperts() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'experts' : null,
    safeFetcher(expertsService.getAll)
  );
  
  return {
    experts: stableList(data),
    isLoading,
    error,
    mutate: () => mutate('experts'),
  };
}

export function useExpert(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id && isBackendAvailable() ? `expert-${id}` : null,
    safeFetcher(() => expertsService.getById(id!))
  );
  
  return {
    expert: data,
    isLoading,
    error,
  };
}

export function useExpertMutations() {
  const create = async (expert: Omit<Expert, 'id'>) => {
    const created = await expertsService.create(expert);
    mutate('experts');
    return created;
  };

  const update = async (id: string, updates: Partial<Expert>) => {
    await expertsService.update(id, updates);
    mutate('experts');
    mutate(`expert-${id}`);
  };

  const remove = async (id: string) => {
    await expertsService.delete(id);
    mutate('experts');
  };

  return { create, update, remove };
}

// ============================================
// ACTIVITIES HOOKS
// ============================================
export function useActivities(expertId?: string) {
  const key = expertId ? `activities-expert-${expertId}` : 'activities';
  const fetcher = expertId 
    ? () => activitiesService.getByExpert(expertId)
    : activitiesService.getAll;
    
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(fetcher)
  );
  
  return {
    activities: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useActivitiesByMonth(month: number, year: number) {
  const key = `activities-month-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => activitiesService.getByMonth(month, year))
  );
  
  return {
    activities: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useActivitiesByDateRange(startDate: string, endDate: string) {
  const key = `activities-range-${startDate}-${endDate}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => activitiesService.getByDateRange(startDate, endDate))
  );
  
  return {
    activities: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useActivityMutations() {
  const create = async (activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await activitiesService.create(activity);
    // Mutate all activity-related keys
    mutate((key: string) => typeof key === 'string' && key.startsWith('activities'), undefined, { revalidate: true });
    return created;
  };

  const createBatch = async (activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const created = await activitiesService.createBatch(activities);
    mutate((key: string) => typeof key === 'string' && key.startsWith('activities'), undefined, { revalidate: true });
    return created;
  };

  const update = async (id: string, updates: Partial<Activity>) => {
    await activitiesService.update(id, updates);
    mutate((key: string) => typeof key === 'string' && key.startsWith('activities'), undefined, { revalidate: true });
  };

  const remove = async (id: string) => {
    await activitiesService.delete(id);
    mutate((key: string) => typeof key === 'string' && key.startsWith('activities'), undefined, { revalidate: true });
  };

  const removeByDates = async (expertId: string, dates: string[]) => {
    await activitiesService.deleteByDates(expertId, dates);
    mutate((key: string) => typeof key === 'string' && key.startsWith('activities'), undefined, { revalidate: true });
  };

  return { create, createBatch, update, remove, removeByDates };
}

export function useDocuments() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'documents' : null,
    safeFetcher(documentsService.getAll)
  );

  return {
    documents: stableList(data),
    isLoading,
    error,
    mutate: () => mutate('documents'),
  };
}

export function useSharedDeliverables(expertId?: string) {
  const key = expertId ? `shared-deliverables-${expertId}` : 'shared-deliverables';
  const fetcher = expertId
    ? () => sharedDeliverablesService.getPendingForExpert(expertId)
    : sharedDeliverablesService.getAll;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(fetcher)
  );

  return {
    sharedDeliverables: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useSharedDeliverableMutations() {
  const registerForActivity = async (relationId: string, targetActivityId: string) => {
    const updated = await sharedDeliverablesService.registerForActivity(relationId, targetActivityId);
    mutate((key: string) => typeof key === 'string' && key.startsWith('shared-deliverables'), undefined, { revalidate: true });
    return updated;
  };

  const ignore = async (relationId: string) => {
    const updated = await sharedDeliverablesService.ignore(relationId);
    mutate((key: string) => typeof key === 'string' && key.startsWith('shared-deliverables'), undefined, { revalidate: true });
    return updated;
  };

  return { registerForActivity, ignore };
}

// ============================================
// VERIFICATIONS HOOKS
// ============================================
export function useVerifications() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'verifications' : null,
    safeFetcher(verificationsService.getAll)
  );
  
  return {
    verifications: stableList(data),
    isLoading,
    error,
    mutate: () => mutate('verifications'),
  };
}

export function useVerification(expertId: string | null, month: string | null, year: string | null) {
  const key = expertId && month && year ? `verification-${expertId}-${month}-${year}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => verificationsService.getByExpertAndMonth(expertId!, month!, year!))
  );
  
  return {
    verification: data,
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

export function useVerificationMutations() {
  const create = async (verification: Omit<VerificationData, 'id'>) => {
    const created = await verificationsService.create(verification);
    mutate('verifications');
    mutate(`verification-${verification.expertId}-${verification.month}-${verification.year}`);
    return created;
  };

  const update = async (id: string, updates: Partial<VerificationData>) => {
    await verificationsService.update(id, updates);
    mutate('verifications');
  };

  const remove = async (id: string) => {
    await verificationsService.delete(id);
    mutate('verifications');
  };

  return { create, update, remove };
}

// ============================================
// NECONFORMITATI HOOKS
// ============================================
export function useNeconformitati(verificationId: string | null) {
  const key = verificationId ? `neconformitati-${verificationId}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => neconformitatiService.getByVerification(verificationId!))
  );
  
  return {
    neconformitati: stableList(data),
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

export function useNeconformitateMutations() {
  const create = async (neconformitate: Omit<Neconformitate, 'id' | 'createdAt'>) => {
    const created = await neconformitatiService.create(neconformitate);
    mutate(`neconformitati-${neconformitate.verificationId}`);
    return created;
  };

  const resolve = async (id: string, verificationId: string, resolution: string) => {
    await neconformitatiService.resolve(id, resolution);
    mutate(`neconformitati-${verificationId}`);
  };

  const remove = async (id: string, verificationId: string) => {
    await neconformitatiService.delete(id);
    mutate(`neconformitati-${verificationId}`);
  };

  return { create, resolve, remove };
}

// ============================================
// NOTES HOOKS
// ============================================
export function useNotes(verificationId: string | null) {
  const key = verificationId ? `notes-${verificationId}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => notesService.getByVerification(verificationId!))
  );
  
  return {
    notes: stableList(data),
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

export function useNoteMutations() {
  const create = async (note: Omit<VerificationNote, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await notesService.create(note);
    mutate(`notes-${note.verificationId}`);
    return created;
  };

  const update = async (id: string, verificationId: string, content: string) => {
    await notesService.update(id, content);
    mutate(`notes-${verificationId}`);
  };

  const remove = async (id: string, verificationId: string) => {
    await notesService.delete(id);
    mutate(`notes-${verificationId}`);
  };

  return { create, update, remove };
}

// ============================================
// SETTINGS HOOKS
// ============================================
export function useSettings() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'settings' : null,
    safeFetcher(settingsService.get)
  );
  
  return {
    settings: data || {
      claudeApiKey: '',
      projectCode: '302141',
      projectTitle: 'Proiect PEO',
      contractNumber: '',
      experts: [],
    },
    isLoading,
    error,
    mutate: () => mutate('settings'),
  };
}

export function useApiKey() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'api-key' : null,
    safeFetcher(settingsService.getApiKey)
  );
  
  const setApiKey = async (apiKey: string) => {
    await settingsService.setApiKey(apiKey);
    mutate('api-key');
    mutate('settings');
  };
  
  return {
    apiKey: data || '',
    isLoading,
    error,
    setApiKey,
  };
}

export function useSettingsMutations() {
  const save = async (key: string, value: string) => {
    await settingsService.save(key, value);
    mutate('settings');
  };

  const setApiKey = async (apiKey: string) => {
    await settingsService.setApiKey(apiKey);
    mutate('api-key');
    mutate('settings');
  };

  return { save, setApiKey };
}

// ============================================
// ACTIVITY CATALOG HOOKS
// ============================================

export function useActivityCatalog() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'activity-catalog' : null,
    safeFetcher(activityCatalogService.getAll)
  );
  
  return {
    catalog: stableList(data),
    isLoading,
    error,
  };
}

export function useActivityCatalogBySa(saCode: string | null) {
  const { data, error, isLoading } = useSWR(
    saCode && isBackendAvailable() ? `activity-catalog-${saCode}` : null,
    safeFetcher(() => activityCatalogService.getBySaCode(saCode!))
  );
  
  return {
    activities: stableList(data),
    isLoading,
    error,
  };
}

// ============================================
// WORKING GROUPS HOOKS
// ============================================

export function useWorkingGroups() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'working-groups' : null,
    safeFetcher(workingGroupsService.getAll)
  );
  
  return {
    groups: stableList(data),
    isLoading,
    error,
  };
}

export function useWorkingGroupsByType(type: string | null) {
  const { data, error, isLoading } = useSWR(
    type && isBackendAvailable() ? `working-groups-${type}` : null,
    safeFetcher(() => workingGroupsService.getByType(type!))
  );
  
  return {
    groups: stableList(data),
    isLoading,
    error,
  };
}

// ============================================
// CONCURRENT PROJECTS HOOKS
// ============================================

export function useConcurrentProjects(expertId: string | null) {
  const key = expertId ? `concurrent-projects-${expertId}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => concurrentProjectsService.getByExpert(expertId!))
  );
  
  const addProject = async (project: Omit<ConcurrentProject, 'id'>) => {
    await concurrentProjectsService.create(project);
    mutate(key);
  };
  
  const removeProject = async (id: string) => {
    await concurrentProjectsService.delete(id);
    mutate(key);
  };
  
  return {
    projects: stableList(data),
    isLoading,
    error,
    addProject,
    removeProject,
  };
}

export function useAllConcurrentProjects() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'concurrent-projects-all' : null,
    safeFetcher(concurrentProjectsService.getAll)
  );

  return {
    projects: stableList(data),
    isLoading,
    error,
  };
}

// ============================================
// REPORT STATUS HOOKS
// ============================================

export function useReportStatus(expertId: string | null, month: number, year: number) {
  const key = expertId ? `report-status-${expertId}-${month}-${year}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => reportStatusService.getByExpertAndMonth(expertId!, month, year))
  );
  
  const updateStatus = async (status: Omit<ReportStatus, 'id'>) => {
    await reportStatusService.upsert(status);
    mutate(key);
    mutate(`report-status-month-${month}-${year}`);
  };
  
  return {
    status: data,
    isLoading,
    error,
    updateStatus,
  };
}

export function useReportStatusByMonth(month: number, year: number) {
  const key = `report-status-month-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => reportStatusService.getAllByMonth(month, year))
  );
  
  return {
    statuses: stableList(data),
    isLoading,
    error,
  };
}

// ============================================
// GRUP TINTA HOOKS
// ============================================

export function useGrupTinta(expertId: string | null, month: number, year: number) {
  const key = expertId ? `grup-tinta-${expertId}-${month}-${year}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => grupTintaService.getByExpertAndMonth(expertId!, month, year))
  );
  
  const addEntry = async (entry: Omit<GrupTintaEntry, 'id'>) => {
    await grupTintaService.create(entry);
    mutate(key);
    mutate(`grup-tinta-stats-${month}-${year}`);
  };
  
  const removeEntry = async (id: string) => {
    await grupTintaService.delete(id);
    mutate(key);
    mutate(`grup-tinta-stats-${month}-${year}`);
  };
  
  return {
    entries: stableList(data),
    isLoading,
    error,
    addEntry,
    removeEntry,
  };
}

export function useGrupTintaStats(month: number, year: number) {
  const key = `grup-tinta-stats-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => grupTintaService.getMonthlyStats(month, year))
  );
  
  return {
    stats: stableList(data),
    isLoading,
    error,
  };
}

export function useGrupTintaByMonth(month: number, year: number) {
  const key = `grup-tinta-month-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => grupTintaService.getAllByMonth(month, year))
  );

  return {
    entries: stableList(data),
    isLoading,
    error,
  };
}

// ============================================
// AUDIT TRAIL HOOKS
// ============================================

export function useAuditLogs(expertId?: string | null, month?: number, year?: number) {
  const key =
    expertId && month !== undefined && year !== undefined
      ? `audit-${expertId}-${month}-${year}`
      : 'audit-all';
  const fetcher =
    expertId && month !== undefined && year !== undefined
      ? () => auditLogsService.getByExpertAndMonth(expertId, month, year)
      : auditLogsService.getAll;

  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(fetcher)
  );

  return {
    auditLogs: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useAuditLogMutations() {
  const create = async (input: AdminInterventionRequest | AuditLog) => {
    const created = await auditLogsService.create(input);
    mutate((key: string) => typeof key === 'string' && key.startsWith('audit'), undefined, { revalidate: true });
    return created;
  };

  return { create };
}
