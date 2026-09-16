'use client';

import useSWR, { mutate } from 'swr';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  expertsService,
  activitiesService,
  verificationsService,
  neconformitatiService,
  pmReviewCasesService,
  notesService,
  settingsService,
  isBackendAvailable,
  activityCatalogService,
  aiEligibilityRuleVersionsService,
  aiEligibilityRulesetsService,
  workingGroupsService,
  concurrentProjectsService,
  concurrentProjectTimesheetService,
  expertNormContractsService,
  financialPersonLinksService,
  leaveEntriesService,
  reportStatusService,
  monthAccessRequestsService,
  grupTintaService,
  gtDocumentsService,
  gtEntitiesService,
  gtImportBatchesService,
  gtMonitoringRecordsService,
  gtOrganizationsService,
  gtPersonsService,
  businessHubEntityDirectoryService,
  auditLogsService,
  notificationLogsService,
  reportingPeriodsService,
  documentsService,
  indexedDeliverableCandidatesService,
  historicalImportService,
  activityAutofillAuditsService,
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
  supportTicketsService,
  reportingWorkBlocksService,
} from '@/lib/backend-store';
import type { Activity, Expert, ExpertNormContract, FinancialPersonLink, LeaveEntry, VerificationData, Neconformitate, PmReviewCase, PmReviewCaseCreateInput, PmReviewCaseUpdateInput, VerificationNote, AppSettings, ActivityCatalog, AiEligibilityRuleset, AiEligibilityRuleVersion, WorkingGroup, ConcurrentProject, ConcurrentProjectTimesheetEntry, ReportStatus, MonthAccessRequest, GrupTintaEntry, BusinessHubEntityDirectoryEntry, AuditLog, ActivityAutofillAudit, AdminInterventionRequest, HistoricalImportBatch, HistoricalTimesheetDayEntry, IndexedDeliverableCandidate, MonthlyActivityItem, MonthlyExpertReport, UploadedReportingFile, DocumentMetadata, SharedDeliverable, SupportTicket, SupportTicketCreateInput, SupportTicketUpdateInput, NotificationLogCreateInput, ReportingPeriodCreateInput, ReportingPeriodUpdateInput } from '@/lib/types';
import { getContractedProcurementProjects, type ProcurementChecklist, type ProcurementContract, type ProcurementDeliverable, type ProcurementDocument, type ProcurementEvaluation, type ProcurementInvoice, type ProcurementLaunch, type ProcurementOffer, type ProcurementProject, type ProcurementReception, type ProcurementStatusHistory, type ProcurementSupplier } from '@/lib/procurement';
import {
  buildDeterministicWorkBlockConsolidation,
  buildWorkBlockConsolidationRequest,
  type WorkBlockConsolidationResult,
} from '@/lib/activity-report/work-block-consolidation';
import type { GTDocument, GTEntity, GTImportBatch, GTMonitoringRecord, GTPerson, Organization } from '@/lib/grup-tinta/types';
import type { ReportingWorkBlockBundle } from '@/lib/activity-report/work-blocks';
import type { DraftWorkBlockInput } from '@/lib/activity-report/draft-work-blocks';
import {
  buildDraftWorkBlockActivityOptions,
  getUnallocatedActivityCount,
  getUnallocatedHoursTotal,
} from '@/lib/activity-report/draft-work-block-options';
import {
  buildDraftWorkBlockDeliverableOptions,
  getUnassociatedDeliverableCount,
} from '@/lib/activity-report/draft-work-block-deliverable-options';
import {
  resolveDataStatus,
  type DataAvailabilityStatus,
} from '@/lib/data-availability';
import { isReportingWorkBlocksEnabledClient } from '@/lib/feature-flags';

export { resolveDataStatus };
export type { DataAvailabilityStatus };

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
export function useExperts(options?: { includeInactive?: boolean; includeFallback?: boolean }) {
  const key = options
    ? `experts-${options.includeInactive ? 'with-inactive' : 'active'}-${options.includeFallback === false ? 'backend-only' : 'with-fallback'}`
    : 'experts';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => expertsService.getAll(options))
  );

  return {
    experts: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
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
  const enabled = isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled ? key : null,
    safeFetcher(() => activitiesService.getByMonth(month, year))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    activities: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useColleagueActivitiesByMonth(month: number, year: number) {
  const key = `colleague-activities-month-${month}-${year}`;
  const enabled = isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled ? key : null,
    safeFetcher(() => activitiesService.getColleagueOverviewByMonth(month, year))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    activities: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
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

export function useReportingWorkBlockBundles(expertId: string | null, month: number, year: number) {
  const enabled = Boolean(expertId) && isBackendAvailable() && isReportingWorkBlocksEnabledClient();
  const key = expertId ? `reporting-work-block-bundles-${expertId}-${month}-${year}` : null;
  const { data, error, isLoading, isValidating } = useSWR<ReportingWorkBlockBundle[] | null>(
    enabled && key ? key : null,
    safeFetcher(() => reportingWorkBlocksService.getBundlesByExpertAndMonth(expertId!, month, year))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    bundles: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate: () => key && mutate(key),
  };
}

export function useReportingWorkBlockDraft() {
  const prepareDraft = (input: DraftWorkBlockInput, activities: Activity[]) => (
    reportingWorkBlocksService.prepareDraft(input, activities)
  );
  const prepareSaveDraft = (input: DraftWorkBlockInput, activities: Activity[]) => (
    reportingWorkBlocksService.prepareSaveDraft(input, activities)
  );
  const saveDraft = async (input: DraftWorkBlockInput, activities: Activity[]) => {
    const preparedDraft = reportingWorkBlocksService.prepareSaveDraft(input, activities);
    const consolidation = preparedDraft.bundle
      ? await consolidateWorkBlockBeforeSave(preparedDraft.bundle, activities)
      : null;
    const bundle = await reportingWorkBlocksService.saveDraft({
      ...input,
      ...(consolidation ? {
        cleanedActivitySummary: consolidation.cleanedActivitySummary,
        generatedTableSummary: consolidation.generatedTableSummary,
        generatedNarrative: consolidation.generatedNarrative,
        generationInputsHash: consolidation.generationInputsHash,
        aiConsolidationStatus: consolidation.aiConsolidationStatus,
        aiConsolidationUpdatedAt: consolidation.aiConsolidationUpdatedAt,
      } : {}),
    }, activities);
    mutate(`reporting-work-block-bundles-${input.expertId}-${input.month}-${input.year}`);
    return bundle;
  };

  return { prepareDraft, prepareSaveDraft, saveDraft };
}

async function consolidateWorkBlockBeforeSave(
  bundle: ReportingWorkBlockBundle,
  activities: Activity[],
): Promise<WorkBlockConsolidationResult> {
  const request = buildWorkBlockConsolidationRequest(bundle, activities);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/ai/consolidate-work-block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Consolidarea AI a esuat. Status HTTP: ${response.status}`);
    }
    return await response.json() as WorkBlockConsolidationResult;
  } catch {
    return buildDeterministicWorkBlockConsolidation(request, 'failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useReportingWorkBlockActivityOptions(
  activities: Activity[],
  existingBundles: ReportingWorkBlockBundle[] = [],
  editingWorkBlockId?: string,
) {
  const options = buildDraftWorkBlockActivityOptions({ activities, existingBundles, editingWorkBlockId });

  return {
    options,
    unallocatedActivityCount: getUnallocatedActivityCount(options),
    unallocatedHoursTotal: getUnallocatedHoursTotal(options),
  };
}

export function useReportingWorkBlockDeliverableOptions(
  activities: Activity[],
  existingBundles: ReportingWorkBlockBundle[] = [],
  editingWorkBlockId?: string,
) {
  const options = buildDraftWorkBlockDeliverableOptions({ activities, existingBundles, editingWorkBlockId });

  return {
    options,
    unassociatedDeliverableCount: getUnassociatedDeliverableCount(options),
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
    try {
      await activitiesService.update(id, updates);
    } finally {
      // A partial write must also refresh the dossier and expose any stale report guard.
      mutate((key: string) => typeof key === 'string' && (key.startsWith('activities') || key.startsWith('reporting-work-block-bundles-')), undefined, { revalidate: true });
    }
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

export function useBusinessHubEntityDirectory() {
  const key = 'business-hub-entity-directory';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(businessHubEntityDirectoryService.getAll)
  );

  return {
    entries: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useBusinessHubEntityDirectoryMutations() {
  const create = async (entry: Omit<BusinessHubEntityDirectoryEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await businessHubEntityDirectoryService.create(entry);
    mutate('business-hub-entity-directory');
    return created;
  };

  const update = async (id: string, updates: Partial<BusinessHubEntityDirectoryEntry>) => {
    const updated = await businessHubEntityDirectoryService.update(id, updates);
    mutate('business-hub-entity-directory');
    return updated;
  };

  const remove = async (id: string) => {
    await businessHubEntityDirectoryService.delete(id);
    mutate('business-hub-entity-directory');
  };

  return { create, update, remove };
}

export function useDocuments() {
  const enabled = isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled ? 'documents' : null,
    safeFetcher(documentsService.getAll)
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    documents: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
    isLoading,
    error,
    mutate: () => mutate('documents'),
  };
}

export function useDocumentMutations() {
  const update = async (
    id: string,
    updates: Partial<Pick<
      DocumentMetadata,
      'sourceActivityId' | 'activityDate' | 'saCode' | 'deliverableType' | 'stadiu' | 'eligibilityCheck'
    >>,
  ) => {
    const updated = await documentsService.update(id, updates);
    mutate('documents');
    return updated;
  };

  const updateEligibilityCheck = async (
    id: string,
    eligibilityCheck: DocumentMetadata['eligibilityCheck'],
  ) => {
    const updated = await documentsService.updateEligibilityCheck(id, eligibilityCheck ?? null);
    mutate('documents');
    return updated;
  };

  return { update, updateEligibilityCheck };
}

export function useIndexedDeliverableCandidates(expertId: string | null, reportingMonth: number, reportingYear: number) {
  const key = expertId ? `indexed-deliverable-candidates-${expertId}-${reportingYear}-${reportingMonth}` : null;
  const enabled = Boolean(expertId) && isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled && key ? key : null,
    safeFetcher(() => indexedDeliverableCandidatesService.getByMonth(expertId!, reportingMonth, reportingYear)),
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    candidates: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
    isLoading,
    error,
    mutate: () => (key ? mutate(key) : undefined),
  };
}

export function useIndexedDeliverableCandidateMutations() {
  const refresh = (candidate?: Pick<IndexedDeliverableCandidate, 'expertId' | 'reportingMonth' | 'reportingYear'>) => {
    if (!candidate) {
      mutate((key: string) => typeof key === 'string' && key.startsWith('indexed-deliverable-candidates'), undefined, { revalidate: true });
      return;
    }
    mutate(`indexed-deliverable-candidates-${candidate.expertId}-${candidate.reportingYear}-${candidate.reportingMonth}`);
  };

  const create = async (candidate: Omit<IndexedDeliverableCandidate, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await indexedDeliverableCandidatesService.create(candidate);
    refresh(created);
    return created;
  };

  const update = async (id: string, updates: Partial<IndexedDeliverableCandidate>) => {
    const updated = await indexedDeliverableCandidatesService.update(id, updates);
    refresh(updated);
    return updated;
  };

  const remove = async (candidate: IndexedDeliverableCandidate) => {
    await indexedDeliverableCandidatesService.delete(candidate.id);
    refresh(candidate);
  };

  return { create, update, remove };
}

export function useColleagueDocumentsByMonth(month: number, year: number) {
  const key = `colleague-documents-month-${month}-${year}`;
  const enabled = isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled ? key : null,
    safeFetcher(() => documentsService.getColleagueDocumentsByMonth(month, year))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    documents: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
    isLoading,
    error,
    mutate: () => mutate(key),
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
  const ensureActivitySuggestion = async (sourceActivityId: string, targetExpertId: string, sourceActivitySnapshot?: Activity): Promise<SharedDeliverable | null> => {
    const relation = await sharedDeliverablesService.ensureActivitySuggestionForTarget(sourceActivityId, targetExpertId, sourceActivitySnapshot);
    mutate((key: string) => typeof key === 'string' && key.startsWith('shared-deliverables'), undefined, { revalidate: true });
    return relation;
  };

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

  return { ensureActivitySuggestion, registerForActivity, ignore };
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

export function useNeconformitatiByVerificationIds(verificationIds: string[]) {
  const uniqueIds = Array.from(new Set(verificationIds.filter(Boolean))).sort();
  const key = uniqueIds.length > 0 ? `neconformitati-batch-${uniqueIds.join('-')}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => neconformitatiService.getByVerifications(uniqueIds))
  );

  return {
    neconformitati: stableList(data),
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

function refreshNeconformitatiCaches(verificationId?: string) {
  if (verificationId) mutate(`neconformitati-${verificationId}`);
  mutate((key: string) => typeof key === 'string' && key.startsWith('neconformitati-batch-'), undefined, { revalidate: true });
}

export function useNeconformitateMutations() {
  const create = async (neconformitate: Omit<Neconformitate, 'id' | 'createdAt'>) => {
    const created = await neconformitatiService.create(neconformitate);
    refreshNeconformitatiCaches(neconformitate.verificationId);
    return created;
  };

  const update = async (id: string, verificationId: string | undefined, updates: Partial<Omit<Neconformitate, 'id' | 'createdAt'>>) => {
    const updated = await neconformitatiService.update(id, updates);
    refreshNeconformitatiCaches(verificationId);
    return updated;
  };

  const resolve = async (id: string, verificationId: string, resolution: string) => {
    await neconformitatiService.resolve(id, resolution);
    refreshNeconformitatiCaches(verificationId);
  };

  const remove = async (id: string, verificationId: string) => {
    await neconformitatiService.delete(id);
    refreshNeconformitatiCaches(verificationId);
  };

  return { create, update, resolve, remove };
}

// ============================================
// PM REVIEW CASES HOOKS
// ============================================
function refreshPmReviewCaseCaches(reviewCase: Pick<PmReviewCase, 'expertId' | 'month' | 'year'>) {
  mutate(`pm-review-cases-${reviewCase.year}-${reviewCase.month}`);
  mutate(`pm-review-cases-expert-${reviewCase.expertId}-${reviewCase.year}-${reviewCase.month}`);
  mutate(`report-status-${reviewCase.expertId}-${reviewCase.month}-${reviewCase.year}`);
  mutate(`report-status-month-${reviewCase.month}-${reviewCase.year}`);
}

export function usePmReviewCasesByMonth(month: number, year: number) {
  const key = `pm-review-cases-${year}-${month}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => pmReviewCasesService.getByMonth(month, year))
  );

  return {
    cases: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function usePmReviewCasesForExpert(expertId: string | null, month: number, year: number) {
  const key = expertId ? `pm-review-cases-expert-${expertId}-${year}-${month}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => pmReviewCasesService.getByExpertAndMonth(expertId!, month, year))
  );

  return {
    cases: stableList(data),
    isLoading,
    error,
    mutate: () => key && mutate(key),
  };
}

export function usePmReviewCaseMutations() {
  const create = async (input: PmReviewCaseCreateInput) => {
    const created = await pmReviewCasesService.create(input);
    refreshPmReviewCaseCaches(created);
    return created;
  };

  const update = async (reviewCase: PmReviewCase, updates: PmReviewCaseUpdateInput) => {
    const updated = await pmReviewCasesService.update(reviewCase.id, updates);
    refreshPmReviewCaseCaches(updated || reviewCase);
    return updated;
  };

  return { create, update };
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
  const setApiKey = async () => {
    throw new Error('OpenAI API keys must be configured server-side with OPENAI_API_KEY.');
  };
  
  return {
    apiKey: '',
    isLoading: false,
    error: null,
    setApiKey,
  };
}

export function useSettingsMutations() {
  const save = async (key: string, value: string) => {
    await settingsService.save(key, value);
    mutate('settings');
  };

  const setApiKey = async () => {
    throw new Error('OpenAI API keys must be configured server-side with OPENAI_API_KEY.');
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

export function useActivityCatalogMutations() {
  const refreshCatalog = (saCode?: string, previousSaCode?: string) => {
    mutate('activity-catalog');
    if (saCode) mutate(`activity-catalog-${saCode}`);
    if (previousSaCode && previousSaCode !== saCode) mutate(`activity-catalog-${previousSaCode}`);
  };

  const create = async (activity: Omit<ActivityCatalog, 'id' | 'createdAt'>) => {
    const created = await activityCatalogService.create(activity);
    refreshCatalog(created.saCode);
    return created;
  };

  const update = async (
    id: string,
    updates: Partial<Omit<ActivityCatalog, 'id' | 'createdAt'>>,
    previousSaCode?: string,
  ) => {
    const updated = await activityCatalogService.update(id, updates);
    refreshCatalog(updated.saCode, previousSaCode);
    return updated;
  };

  const updateDescription = async (id: string, description: string) => {
    const updated = await activityCatalogService.updateDescription(id, description);
    refreshCatalog(updated.saCode);
    return updated;
  };

  const remove = async (id: string, previousSaCode?: string) => {
    await activityCatalogService.delete(id);
    refreshCatalog(previousSaCode);
  };

  return { create, update, updateDescription, remove };
}

export function useAiEligibilityRulesets() {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? 'ai-eligibility-rulesets' : null,
    safeFetcher(aiEligibilityRulesetsService.getAll)
  );

  return {
    rulesets: stableList(data),
    activeRuleset: stableList(data).filter((ruleset) => ruleset.status === 'active'
      && (!ruleset.publishedAt || Date.parse(ruleset.publishedAt) <= Date.now())
      && (!ruleset.activeFrom || Date.parse(ruleset.activeFrom) <= Date.now())
      && (!ruleset.activeTo || Date.parse(ruleset.activeTo) > Date.now()))
      .sort((a, b) => b.version - a.version)[0] ?? null,
    isLoading,
    error,
  };
}

export function useAiEligibilityRuleVersions(rulesetId: string | null) {
  const { data, error, isLoading } = useSWR(
    rulesetId && isBackendAvailable() ? `ai-eligibility-rule-versions-${rulesetId}` : null,
    safeFetcher(() => aiEligibilityRuleVersionsService.getByRuleset(rulesetId!))
  );

  return {
    versions: stableList(data).filter((version) => version.status !== 'head'),
    isLoading,
    error,
  };
}

export function useAiEligibilityRulesetMutations() {
  const refreshRulesets = (rulesetId?: string) => {
    mutate('ai-eligibility-rulesets');
    if (rulesetId) mutate(`ai-eligibility-rule-versions-${rulesetId}`);
  };

  const createDraft = async (input: {
    title: string;
    rulesJson: unknown;
    version?: number;
    actorName?: string;
    changeReason?: string;
  }) => {
    const created = await aiEligibilityRulesetsService.create({
      title: input.title,
      status: 'draft',
      version: input.version ?? 1,
      rulesJson: input.rulesJson,
      schemaVersion: 'eligibility-rules-v2',
      createdBy: input.actorName,
      updatedBy: input.actorName,
      changeReason: input.changeReason,
    });
    refreshRulesets(created.id);
    return created;
  };

  const updateDraft = async (
    id: string,
    updates: Partial<Pick<AiEligibilityRuleset, 'title' | 'rulesJson' | 'changeReason' | 'updatedBy'>>,
  ) => {
    const updated = await aiEligibilityRulesetsService.update(id, updates);
    refreshRulesets(updated.id);
    return updated;
  };

  const publishRequest = async (rulesetId: string, restoreVersionId?: string) => {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (!token) throw new Error('Sesiunea Cognito lipseste.');
    const response = await fetch('/api/eligibility/rulesets/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rulesetId, restoreVersionId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Publicarea a esuat.');
    refreshRulesets(rulesetId);
    return result as AiEligibilityRuleset;
  };
  const publish = async (ruleset: AiEligibilityRuleset, _activeRuleset: AiEligibilityRuleset | null, _actorName?: string) =>
    publishRequest(ruleset.id);
  const rollbackToVersion = async (ruleset: AiEligibilityRuleset, version: AiEligibilityRuleVersion, _actorName?: string) =>
    publishRequest(ruleset.id, version.id);

  return { createDraft, updateDraft, publish, rollbackToVersion };
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
  const enabled = Boolean(expertId) && isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled && key ? key : null,
    safeFetcher(() => concurrentProjectsService.getByExpert(expertId!))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });
  
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
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
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

export function useConcurrentProjectMutations() {
  const refresh = (project?: Pick<ConcurrentProject, 'expertId'>) => {
    mutate('concurrent-projects-all');
    if (project?.expertId) mutate(`concurrent-projects-${project.expertId}`);
  };

  const createProject = async (project: Omit<ConcurrentProject, 'id'>) => {
    const created = await concurrentProjectsService.create(project);
    refresh(created);
    return created;
  };

  const updateProject = async (id: string, updates: Partial<ConcurrentProject>) => {
    const updated = await concurrentProjectsService.update(id, updates);
    refresh(updated);
    return updated;
  };

  const archiveProject = async (id: string) => {
    await concurrentProjectsService.delete(id);
    mutate('concurrent-projects-all');
  };

  return { createProject, updateProject, archiveProject };
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
  const enabled = isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled ? key : null,
    safeFetcher(() => concurrentProjectTimesheetService.getAllByMonth(month, year))
  );
  const status = resolveDataStatus({ data, error, isLoading, enabled });

  return {
    entries: stableList(data),
    status,
    isReady: status === 'success' || status === 'empty',
    isEmpty: status === 'empty',
    isUnavailable: status === 'disabled' || status === 'error',
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
  const enabled = Boolean(expertId) && isBackendAvailable();
  const { data, error, isLoading } = useSWR(
    enabled && key ? key : null,
    safeFetcher(() => reportStatusService.getByExpertAndMonth(expertId!, month, year))
  );
  const availabilityStatus = resolveDataStatus({
    data: data ? [data] : [],
    error,
    isLoading,
    enabled,
  });
  
  const updateStatus = async (status: Omit<ReportStatus, 'id'>) => {
    await reportStatusService.upsert(status);
    const targetKey = `report-status-${status.expertId}-${status.month}-${status.year}`;
    mutate(targetKey);
    if (targetKey !== key) mutate(key);
    mutate(`report-status-month-${status.month}-${status.year}`);
  };
  
  return {
    status: data,
    availabilityStatus,
    isReady: availabilityStatus === 'success' || availabilityStatus === 'empty',
    isEmpty: availabilityStatus === 'empty',
    isUnavailable: availabilityStatus === 'disabled' || availabilityStatus === 'error',
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

export function useReportStatusesForMonths(monthRefs: Array<{ month: number; year: number }>) {
  const key = `report-status-months-${monthRefs.map((ref) => `${ref.year}-${ref.month}`).join('|')}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() && monthRefs.length > 0 ? key : null,
    safeFetcher(async () => {
      const batches = await Promise.all(
        monthRefs.map((ref) => reportStatusService.getAllByMonth(ref.month, ref.year))
      );
      return batches.flat();
    })
  );

  return {
    statuses: stableList(data),
    isLoading,
    error,
  };
}

export function useReportingPeriods() {
  const key = 'reporting-periods';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(reportingPeriodsService.getAll)
  );

  return {
    reportingPeriods: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useReportingPeriodMutations() {
  const create = async (input: ReportingPeriodCreateInput) => {
    const created = await reportingPeriodsService.create(input);
    mutate('reporting-periods');
    return created;
  };

  const update = async (id: string, updates: ReportingPeriodUpdateInput) => {
    const updated = await reportingPeriodsService.update(id, updates);
    mutate('reporting-periods');
    return updated;
  };

  return { create, update };
}

export function useMonthAccessRequestsByMonth(month: number, year: number) {
  const key = `month-access-requests-${year}-${month}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => monthAccessRequestsService.getByMonth(month, year))
  );

  return {
    requests: stableList(data),
    isLoading,
    error,
  };
}

export function useMonthAccessRequestsForMonths(monthRefs: Array<{ month: number; year: number }>) {
  const key = `month-access-requests-months-${monthRefs.map((ref) => `${ref.year}-${ref.month}`).join('|')}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() && monthRefs.length > 0 ? key : null,
    safeFetcher(() => monthAccessRequestsService.getByMonths(monthRefs))
  );

  return {
    requests: stableList(data),
    isLoading,
    error,
  };
}

export function useMonthAccessRequest(expertId: string | null, month: number, year: number) {
  const key = expertId ? `month-access-request-${expertId}-${year}-${month}` : null;
  const { data, error, isLoading } = useSWR(
    key && isBackendAvailable() ? key : null,
    safeFetcher(() => monthAccessRequestsService.getByExpertAndMonth(expertId!, month, year))
  );

  return {
    request: data ?? null,
    isLoading,
    error,
  };
}

function refreshMonthAccessRequestCaches(request: Pick<MonthAccessRequest, 'expertId' | 'month' | 'year'>) {
  mutate(`month-access-requests-${request.year}-${request.month}`);
  mutate(`month-access-request-${request.expertId}-${request.year}-${request.month}`);
  mutate(`report-status-${request.expertId}-${request.month}-${request.year}`);
  mutate(`report-status-month-${request.month}-${request.year}`);
}

export function useMonthAccessRequestMutations() {
  const requestAccess = async (input: {
    expertId: string;
    expertName?: string;
    month: number;
    year: number;
    requestedBy?: string;
    notes?: string;
  }) => {
    const request = await monthAccessRequestsService.request(input);
    refreshMonthAccessRequestCaches(request);
    return request;
  };

  const updateRequest = async (
    request: MonthAccessRequest,
    updates: Partial<Omit<MonthAccessRequest, 'id' | 'createdAt' | 'updatedAt'>>,
  ) => {
    const updated = await monthAccessRequestsService.update(request.id, updates);
    refreshMonthAccessRequestCaches(updated);
    return updated;
  };

  return { requestAccess, updateRequest };
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

function useGTRegistryRecords<T>(key: string, service: { getAll: () => Promise<T[]> }) {
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(service.getAll)
  );

  return {
    records: stableList(data),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

function useGTRegistryMutations<T>(key: string, service: {
  create: (input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => Promise<T>;
  update: (id: string, updates: Partial<T>) => Promise<T>;
  delete: (id: string) => Promise<void>;
}) {
  const create = async (input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await service.create(input);
    mutate(key);
    return created;
  };
  const update = async (id: string, updates: Partial<T>) => {
    const updated = await service.update(id, updates);
    mutate(key);
    return updated;
  };
  const remove = async (id: string) => {
    await service.delete(id);
    mutate(key);
  };
  return { create, update, remove };
}

export const useGTOrganizations = () => useGTRegistryRecords<Organization>('gt-organizations', gtOrganizationsService);
export const useGTEntities = () => useGTRegistryRecords<GTEntity>('gt-entities', gtEntitiesService);
export const useGTPersons = () => useGTRegistryRecords<GTPerson>('gt-persons', gtPersonsService);
export const useGTDocuments = () => useGTRegistryRecords<GTDocument>('gt-documents', gtDocumentsService);
export const useGTMonitoringRecords = () => useGTRegistryRecords<GTMonitoringRecord>('gt-monitoring-records', gtMonitoringRecordsService);
export const useGTImportBatches = () => useGTRegistryRecords<GTImportBatch>('gt-import-batches', gtImportBatchesService);

export const useGTOrganizationMutations = () => useGTRegistryMutations<Organization>('gt-organizations', gtOrganizationsService);
export const useGTEntityMutations = () => useGTRegistryMutations<GTEntity>('gt-entities', gtEntitiesService);
export const useGTPersonMutations = () => useGTRegistryMutations<GTPerson>('gt-persons', gtPersonsService);
export const useGTDocumentMutations = () => useGTRegistryMutations<GTDocument>('gt-documents', gtDocumentsService);
export const useGTMonitoringRecordMutations = () => useGTRegistryMutations<GTMonitoringRecord>('gt-monitoring-records', gtMonitoringRecordsService);
export const useGTImportBatchMutations = () => useGTRegistryMutations<GTImportBatch>('gt-import-batches', gtImportBatchesService);

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

export function useSupportTickets() {
  const key = 'support-tickets';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(supportTicketsService.getAll)
  );

  return {
    tickets: stableList(data as SupportTicket[] | null | undefined),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}

export function useSupportTicketMutations() {
  const refresh = () => mutate('support-tickets');

  const create = async (input: SupportTicketCreateInput) => {
    const created = await supportTicketsService.create(input);
    refresh();
    return created;
  };

  const update = async (ticket: SupportTicket, updates: SupportTicketUpdateInput) => {
    const updated = await supportTicketsService.update(ticket.id, updates);
    refresh();
    return updated;
  };

  return { create, update };
}

export function useNotificationLogMutations() {
  type NotificationDelivery = Pick<NotificationLogCreateInput, 'status' | 'sentAt' | 'errorMessage'>;
  const pendingDeliveries = (inputs: NotificationLogCreateInput[], errorMessage: string): NotificationDelivery[] =>
    inputs.map(() => ({ status: 'pending', errorMessage }));
  const sendForDelivery = async (inputs: NotificationLogCreateInput[]) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (!token) {
        return pendingDeliveries(inputs, 'Lipseste tokenul Cognito pentru trimiterea emailului.');
      }

      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ notifications: inputs }),
      });
      const body = await response.json().catch(() => null) as {
        deliveries?: NotificationDelivery[];
        error?: string;
      } | null;

      if (!response.ok) {
        return pendingDeliveries(inputs, body?.error || 'Trimiterea emailului nu a putut fi pornita.');
      }

      return inputs.map((_, index) => body?.deliveries?.[index] ?? { status: 'pending' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Trimiterea emailului nu a putut fi pornita.';
      return pendingDeliveries(inputs, errorMessage);
    }
  };

  const create = async (input: NotificationLogCreateInput) => {
    const [delivery] = await sendForDelivery([input]);
    return notificationLogsService.create({
      ...input,
      status: delivery?.status || input.status || 'pending',
      sentAt: delivery?.sentAt || input.sentAt,
      errorMessage: delivery?.errorMessage || input.errorMessage,
    });
  };
  const createMany = async (inputs: NotificationLogCreateInput[]) => {
    if (inputs.length === 0) return [];
    const deliveries = await sendForDelivery(inputs);
    return notificationLogsService.createMany(inputs.map((input, index) => ({
      ...input,
      status: deliveries[index]?.status || input.status || 'pending',
      sentAt: deliveries[index]?.sentAt || input.sentAt,
      errorMessage: deliveries[index]?.errorMessage || input.errorMessage,
    })));
  };

  return { create, createMany };
}

export function useActivityAutofillAudits(month?: number, year?: number, expertId?: string | null) {
  const key = expertId && month !== undefined && year !== undefined
    ? `activity-autofill-audits-${expertId}-${month}-${year}`
    : month !== undefined && year !== undefined
      ? `activity-autofill-audits-${month}-${year}`
      : 'activity-autofill-audits';
  const fetcher = expertId && month !== undefined && year !== undefined
    ? () => activityAutofillAuditsService.getByExpertAndMonth(expertId, month, year)
    : () => activityAutofillAuditsService.getAll(month, year);

  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(fetcher)
  );

  return {
    audits: stableList(data as ActivityAutofillAudit[] | null | undefined),
    isLoading,
    error,
    mutate: () => mutate(key),
  };
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

export function useAllExpertNormContracts() {
  const key = 'expert-norm-contracts-all';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(expertNormContractsService.getAll),
  );
  return { contracts: stableList(data), error, isLoading, mutate: () => mutate(key) };
}

export function useExpertNormContracts(expertId: string | null) {
  const { data, error, isLoading } = useSWR(
    expertId && isBackendAvailable() ? `expert-norm-contracts-${expertId}` : null,
    safeFetcher(() => expertNormContractsService.getByExpert(expertId!)),
  );
  return { contracts: stableList(data), error, isLoading };
}

export function useExpertNormContractMutations() {
  const refresh = (expertId?: string) => {
    mutate('expert-norm-contracts-all');
    if (expertId) mutate(`expert-norm-contracts-${expertId}`);
  };

  const create = async (contract: Parameters<typeof expertNormContractsService.create>[0]) => {
    const saved = await expertNormContractsService.create(contract);
    refresh(saved.expertId);
    return saved;
  };

  const update = async (id: string, updates: Parameters<typeof expertNormContractsService.update>[1]) => {
    const saved = await expertNormContractsService.update(id, updates);
    refresh(saved.expertId);
    return saved;
  };

  return { create, update };
}

export function useFinancialPersonLinks() {
  const key = 'financial-person-links-all';
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(financialPersonLinksService.getAll),
  );
  return { links: stableList(data), error, isLoading, mutate: () => mutate(key) };
}

export function useFinancialPersonLinkMutations() {
  const refresh = () => mutate('financial-person-links-all');

  const create = async (link: Omit<FinancialPersonLink, 'id'> & { id?: string }) => {
    const saved = await financialPersonLinksService.create(link);
    refresh();
    return saved;
  };

  const update = async (id: string, updates: Partial<FinancialPersonLink>) => {
    const saved = await financialPersonLinksService.update(id, updates);
    refresh();
    return saved;
  };

  return { create, update };
}

export function useLeaveEntries(month: number, year: number) {
  const key = `leave-entries-${month}-${year}`;
  const { data, error, isLoading } = useSWR(
    isBackendAvailable() ? key : null,
    safeFetcher(() => leaveEntriesService.getByMonth(month, year)),
  );
  return { leaveEntries: stableList(data), error, isLoading, mutate: () => mutate(key) };
}

export function useLeaveEntryMutations(month: number, year: number) {
  const refresh = () => mutate(`leave-entries-${month}-${year}`);

  const createAutomatic = async (input: {
    expertId: string;
    dates: string[];
    source: 'EXPERT' | 'FINANCIAL';
    createdBy?: string;
  }) => {
    const saved = await leaveEntriesService.createAutomatic(input);
    refresh();
    return saved;
  };

  const createManual = async (entry: Omit<LeaveEntry, 'id'> & { id?: string }) => {
    const saved = await leaveEntriesService.createManual(entry);
    refresh();
    return saved;
  };

  const remove = async (id: string) => {
    await leaveEntriesService.remove(id);
    refresh();
  };

  const updateStatus = async (id: string, status: LeaveEntry['status'], actorId: string, reason?: string) => {
    const saved = await leaveEntriesService.updateStatus(id, status, actorId, reason);
    refresh();
    return saved;
  };

  return { createAutomatic, createManual, remove, updateStatus };
}
