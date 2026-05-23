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
  concurrentProjectTimesheetService,
  reportStatusService,
  grupTintaService,
  auditLogsService,
  documentsService,
  historicalImportService,
  procurementChecklistsService,
  procurementContractsService,
  procurementDeliverablesService,
  procurementDocumentsService,
  procurementEvaluationsService,
  procurementInvoicesService,
  procurementLaunchesService,
  procurementOffersService,
  procurementProjectsService,
  procurementReceptionsService,
  procurementStatusHistoryService,
  procurementSuppliersService,
  sharedDeliverablesService,
} from '@/lib/backend-store';
import type { Activity, Expert, VerificationData, Neconformitate, VerificationNote, AppSettings, ActivityCatalog, WorkingGroup, ConcurrentProject, ConcurrentProjectTimesheetEntry, ReportStatus, GrupTintaEntry, AuditLog, AdminInterventionRequest, HistoricalImportBatch, HistoricalTimesheetDayEntry, MonthlyActivityItem, MonthlyExpertReport, UploadedReportingFile } from '@/lib/types';
import { getContractedProcurementProjects, type ProcurementChecklist, type ProcurementContract, type ProcurementDeliverable, type ProcurementDocument, type ProcurementEvaluation, type ProcurementInvoice, type ProcurementLaunch, type ProcurementOffer, type ProcurementProject, type ProcurementReception, type ProcurementStatusHistory, type ProcurementSupplier } from '@/lib/procurement';

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

export function useCollaborationExperts() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'collaboration-experts' : null,
    safeFetcher(expertsService.getCollaborationOptions)
  );

  return {
    experts: stableList(data),
    isLoading,
    error,
    mutate: () => mutate('collaboration-experts'),
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

export function useSharedActivityRegistrationContext(relationId?: string | null) {
  const key = relationId ? `shared-activity-registration-${relationId}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => sharedDeliverablesService.getActivityRegistrationContext(relationId!))
  );

  return {
    context: data ?? null,
    isLoading,
    error,
    mutate: () => (key ? mutate(key) : undefined),
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

export function useProcurementProjects() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'procurement-projects' : null,
    safeFetcher(procurementProjectsService.getAll)
  );

  return {
    procurementProjects: data ?? getContractedProcurementProjects(),
    isLoading: isBackendAvailable() ? isLoading : false,
    error,
    mutate: () => mutate('procurement-projects'),
  };
}

export function useProcurementProject(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id && isBackendAvailable() ? `procurement-project-${id}` : null,
    safeFetcher(() => procurementProjectsService.getById(id!))
  );

  return {
    procurementProject: data ?? (id ? getContractedProcurementProjects().find((project) => project.id === id) ?? null : null),
    isLoading: isBackendAvailable() ? isLoading : false,
    error,
  };
}

export function useProcurementProjectMutations() {
  const create = async (project: Omit<ProcurementProject, 'id'>) => {
    const created = await procurementProjectsService.create(project);
    mutate('procurement-projects');
    return created;
  };

  const update = async (id: string, updates: Partial<ProcurementProject>) => {
    const updated = await procurementProjectsService.update(id, updates);
    mutate('procurement-projects');
    mutate(`procurement-project-${id}`);
    return updated;
  };

  return { create, update };
}

function useProcurementChildRecords<T>(keyPrefix: string, service: { getByProject: (projectId: string) => Promise<T[]> }, procurementProjectId?: string) {
  const key = procurementProjectId ? `${keyPrefix}-${procurementProjectId}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => service.getByProject(procurementProjectId!))
  );

  return {
    records: stableList(data),
    isLoading: isBackendAvailable() ? isLoading : false,
    error,
    mutate: () => key ? mutate(key) : undefined,
  };
}

export const useProcurementDocuments = (projectId?: string) =>
  useProcurementChildRecords<ProcurementDocument>('procurement-documents', procurementDocumentsService, projectId);
export const useProcurementLaunches = (projectId?: string) =>
  useProcurementChildRecords<ProcurementLaunch>('procurement-launches', procurementLaunchesService, projectId);
export const useProcurementOffers = (projectId?: string) =>
  useProcurementChildRecords<ProcurementOffer>('procurement-offers', procurementOffersService, projectId);
export const useProcurementEvaluations = (projectId?: string) =>
  useProcurementChildRecords<ProcurementEvaluation>('procurement-evaluations', procurementEvaluationsService, projectId);
export const useProcurementContracts = (projectId?: string) =>
  useProcurementChildRecords<ProcurementContract>('procurement-contracts', procurementContractsService, projectId);
export const useProcurementDeliverables = (projectId?: string) =>
  useProcurementChildRecords<ProcurementDeliverable>('procurement-deliverables', procurementDeliverablesService, projectId);
export const useProcurementReceptions = (projectId?: string) =>
  useProcurementChildRecords<ProcurementReception>('procurement-receptions', procurementReceptionsService, projectId);
export const useProcurementInvoices = (projectId?: string) =>
  useProcurementChildRecords<ProcurementInvoice>('procurement-invoices', procurementInvoicesService, projectId);
export const useProcurementStatusHistory = (projectId?: string) =>
  useProcurementChildRecords<ProcurementStatusHistory>('procurement-status-history', procurementStatusHistoryService, projectId);
export const useProcurementChecklists = (projectId?: string) =>
  useProcurementChildRecords<ProcurementChecklist>('procurement-checklists', procurementChecklistsService, projectId);

export function useProcurementReferenceData() {
  const suppliers = useSWR(
    isBackendAvailable() ? 'procurement-suppliers' : null,
    safeFetcher(procurementSuppliersService.getAll)
  );

  return {
    suppliers: stableList(suppliers.data as ProcurementSupplier[] | null | undefined),
    isLoading: isBackendAvailable() ? suppliers.isLoading : false,
    error: suppliers.error,
    mutate: () => mutate('procurement-suppliers'),
  };
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
    const created = await concurrentProjectsService.create(project);
    mutate(key);
    mutate('concurrent-projects-all');
    return created;
  };

  const updateProject = async (id: string, updates: Partial<ConcurrentProject>) => {
    const updated = await concurrentProjectsService.update(id, updates);
    mutate(key);
    mutate('concurrent-projects-all');
    return updated;
  };
  
  const removeProject = async (id: string) => {
    await concurrentProjectsService.delete(id);
    mutate(key);
    mutate('concurrent-projects-all');
  };
  
  return {
    projects: stableList(data),
    isLoading,
    error,
    addProject,
    updateProject,
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
    mutate: () => mutate('concurrent-projects-all'),
  };
}

export function useConcurrentProjectTimesheet(projectId: string | null, month: number, year: number) {
  const key = projectId ? `concurrent-project-timesheet-${projectId}-${month}-${year}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => concurrentProjectTimesheetService.getByProjectMonth(projectId!, month, year))
  );

  return {
    entries: stableList(data),
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

export function useConcurrentProjectTimesheetByMonth(month: number, year: number) {
  const key = `concurrent-project-timesheet-month-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => concurrentProjectTimesheetService.getAllByMonth(month, year))
  );

  return {
    entries: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useConcurrentProjectTimesheetMutations(month?: number, year?: number) {
  const refresh = (entry?: Pick<ConcurrentProjectTimesheetEntry, 'concurrentProjectId' | 'month' | 'year'>) => {
    const targetMonth = entry?.month ?? month;
    const targetYear = entry?.year ?? year;
    if (entry?.concurrentProjectId && targetMonth !== undefined && targetYear !== undefined) {
      mutate(`concurrent-project-timesheet-${entry.concurrentProjectId}-${targetMonth}-${targetYear}`);
    }
    if (targetMonth !== undefined && targetYear !== undefined) {
      mutate(`concurrent-project-timesheet-month-${targetMonth}-${targetYear}`);
    }
  };

  const upsertEntry = async (entry: Omit<ConcurrentProjectTimesheetEntry, 'id'> & { id?: string }) => {
    const saved = await concurrentProjectTimesheetService.upsert(entry);
    refresh(saved);
    return saved;
  };

  const deleteEntry = async (id: string, entry?: Pick<ConcurrentProjectTimesheetEntry, 'concurrentProjectId' | 'month' | 'year'>) => {
    await concurrentProjectTimesheetService.delete(id);
    refresh(entry);
  };

  return { upsertEntry, deleteEntry };
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

// ============================================
// HISTORICAL REPORTING IMPORT HOOKS
// ============================================
export function useHistoricalImportBatches() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'historical-import-batches' : null,
    safeFetcher(historicalImportService.getBatches)
  );

  return {
    batches: stableList(data),
    isLoading,
    error,
    mutate: () => mutate('historical-import-batches'),
  };
}

export function useHistoricalReports(filters?: { expertId?: string; month?: number; year?: number; status?: string }) {
  const key = filters
    ? `historical-reports-${filters.expertId ?? 'all'}-${filters.year ?? 'all'}-${filters.month ?? 'all'}-${filters.status ?? 'all'}`
    : 'historical-reports';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => historicalImportService.getReports(filters))
  );

  return {
    reports: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useHistoricalReportFiles(monthlyReportId?: string) {
  const key = monthlyReportId ? `historical-report-files-${monthlyReportId}` : 'historical-report-files';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => historicalImportService.getFiles(monthlyReportId))
  );

  return {
    files: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useHistoricalReportDetails(monthlyReportId: string | null) {
  const activityKey = monthlyReportId ? `historical-activity-items-${monthlyReportId}` : null;
  const daysKey = monthlyReportId ? `historical-timesheet-days-${monthlyReportId}` : null;
  const { data: activityData, error: activityError, isLoading: isLoadingActivities } = useSWR(
    activityKey && isBackendAvailable() ? activityKey : null,
    safeFetcher(() => historicalImportService.getActivityItems(monthlyReportId!))
  );
  const { data: daysData, error: daysError, isLoading: isLoadingDays } = useSWR(
    daysKey && isBackendAvailable() ? daysKey : null,
    safeFetcher(() => historicalImportService.getTimesheetDays(monthlyReportId!))
  );

  return {
    activityItems: stableList(activityData),
    timesheetDays: stableList(daysData),
    isLoading: isLoadingActivities || isLoadingDays,
    error: activityError ?? daysError,
    mutate: () => {
      if (activityKey) mutate(activityKey);
      if (daysKey) mutate(daysKey);
    },
  };
}

export function useHistoricalImportMutations() {
  const createBatch = async (batch: Omit<HistoricalImportBatch, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await historicalImportService.createBatch(batch);
    mutate('historical-import-batches');
    return created;
  };

  const createReport = async (report: Omit<MonthlyExpertReport, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await historicalImportService.createReport(report);
    mutate((key: string) => typeof key === 'string' && key.startsWith('historical-reports'), undefined, { revalidate: true });
    return created;
  };

  const updateReport = async (id: string, updates: Partial<MonthlyExpertReport>) => {
    const updated = await historicalImportService.updateReport(id, updates);
    mutate((key: string) => typeof key === 'string' && key.startsWith('historical-reports'), undefined, { revalidate: true });
    return updated;
  };

  const createFile = async (file: Omit<UploadedReportingFile, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await historicalImportService.createFile(file);
    mutate((key: string) => typeof key === 'string' && key.startsWith('historical-report-files'), undefined, { revalidate: true });
    return created;
  };

  const createActivityItem = async (item: Omit<MonthlyActivityItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await historicalImportService.createActivityItem(item);
    mutate(`historical-activity-items-${item.monthlyReportId}`);
    return created;
  };

  const createTimesheetDay = async (day: Omit<HistoricalTimesheetDayEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await historicalImportService.createTimesheetDay(day);
    mutate(`historical-timesheet-days-${day.monthlyReportId}`);
    return created;
  };

  return { createBatch, createReport, updateReport, createFile, createActivityItem, createTimesheetDay };
}
