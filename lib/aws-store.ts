'use client';

import { getAwsDataClient, isAwsAvailable } from '@/lib/aws/client';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getSignedInUser } from '@/lib/aws/auth';
import outputs from '@/amplify_outputs.json';
import { peoUsersAsExperts } from '@/lib/peo-users';
import { mergeExpertLists, mergeExpertWithFallback } from '@/lib/expert-merge';
import { listDeliverablesByActivityId } from '@/lib/aws-pagination';
import {
  buildCollaborationExpertOptions,
  canAccessExpertId,
  filterActivitiesForScope,
  filterAuditLogsForScope,
  filterConcurrentProjectsForScope,
  filterConcurrentProjectTimesheetEntriesForScope,
  filterDocumentsForScope,
  filterGrupTintaForScope,
  filterReportStatusesForScope,
  filterSharedDeliverablesForScope,
  filterVerificationsForScope,
  findExpertForUser,
  normalizeIdentity,
  resolveDataAccessScope,
  type AccessUser,
  type DataAccessScope,
} from '@/lib/access-control';
import {
  validateActivitiesBeforeCreate,
  type ActivityDraftForValidation,
} from '@/lib/pontaj-rules';
import { assertCanLogHoursOnDate, getNonWorkingDayInfo } from '@/lib/non-working-days';
import { allocateLeaveEntries, assertCapacity, calculateCapacitySnapshot, resolveNormContract } from './time-capacity';
import { applyFinancialReferenceNorms } from './financial-norm-contracts';
import type {
  Activity,
  ActivityCatalog,
  ActivityAutofillAudit,
  AiEligibilityRuleset,
  AiEligibilityRuleVersion,
  AdminInterventionRequest,
  AppSettings,
  AuditLog,
  ConcurrentProject,
  ConcurrentProjectTimesheetEntry,
  Deliverable,
  DeliverableEligibilityCheck,
  ExpertNormContract,
  FinancialPersonLink,
  LeaveEntry,

  DocumentMetadata,
  Expert,
  BusinessHubEntityDirectoryEntry,
  GrupTintaEntry,
  HistoricalImportBatch,
  IndexedDeliverableCandidate,
  HistoricalTimesheetDayEntry,
  MonthlyActivityItem,
  MonthlyExpertReport,
  MonthAccessRequest,
  Neconformitate,
  NotificationLog,
  NotificationLogCreateInput,
  PersistedReportingWorkBlock,
  PersistedWorkBlockActivityLink,
  PersistedWorkBlockDeliverableLink,
  PmReviewCase,
  PmReviewCaseCreateInput,
  PmReviewCaseUpdateInput,
  ReportingPeriod,
  ReportingPeriodCreateInput,
  ReportingPeriodUpdateInput,
  ReportStatus,
  SharedActivityRegistrationContext,
  SharedDeliverable,
  SupportTicket,
  SupportTicketCreateInput,
  SupportTicketUpdateInput,
  UploadedReportingFile,
  VerificationData,
  VerificationNote,
  WorkingGroup,
} from './types';
import { createAuditLog, prepareAdminActivityOverride } from './audit-trail';
import { buildSharedActivitySnapshot, buildSharedActivitySuggestions, buildSharedDeliverables, findDuplicateCandidates, getDocumentAuditTitle, isActivitySuggestionRelation, markSharedDeliverableRegistered } from './document-sharing';
import { buildDefaultConcurrentProjects, mergeConcurrentProjectsWithDefaults } from './default-concurrent-projects';
import { normalizeTitleForMatch } from './title-suggestion';
import { parseAwsJsonField, serializeAwsJsonField } from './aws-json';
import { planDeliverableSync } from './activity-deliverable-sync';
import { areActivitiesCompatibleForDeliverableGroup, dedupeDeliverablesBySignature, findMonthlyDeliverableDuplicate, getDeliverableDocumentSignature } from './deliverable-deduplication';
import { buildPersistedWorkBlockBundles } from './activity-report/persisted-work-blocks';
import {
  prepareDraftWorkBlockBundle,
  prepareDraftWorkBlockSave,
  type DraftWorkBlockInput,
  type PreparedDraftWorkBlock,
  type PreparedDraftWorkBlockSave,
} from './activity-report/draft-work-blocks';
import type { ReportingWorkBlockBundle } from './activity-report/work-blocks';
import {
  createProcurementStatusHistoryEntry,
  getContractedProcurementProjects,
  getProcurementAttentionLevel,
  PROCUREMENT_ATTENTION_LABELS,
  type ProcurementAttentionLevel,
  type ProcurementChecklist,
  type ProcurementContract,
  type ProcurementDeliverable,
  type ProcurementDocument,
  type ProcurementEvaluation,
  type ProcurementInvoice,
  type ProcurementLaunch,
  type ProcurementOffer,
  type ProcurementProject,
  type ProcurementReception,
  type ProcurementStatus,
  type ProcurementStatusHistory,
  type ProcurementSupplier,
} from './procurement';
import type {
  GTDocument,
  GTEntity,
  GTImportBatch,
  GTMonitoringRecord,
  GTPerson,
  Organization,
} from './grup-tinta/types';

export { isAwsAvailable };
export {
  calculateWorkingDays,
  formatDate,
  formatDateRo,
  generateId,
  getMonthName,
} from './app-utils';

type ModelResult<T> = { data?: T | null; errors?: unknown };
type ModelListResult<T> = { data?: T[] | null; errors?: unknown; nextToken?: string | null };

function assertNoErrors<T>(result: ModelResult<T> | ModelListResult<T>, action: string) {
  if (result.errors) {
    throw new Error(`${action} failed: ${JSON.stringify(result.errors)}`);
  }
}

function isAwsThrottlingError(error: unknown) {
  const serialized = error instanceof Error
    ? `${error.name} ${error.message}`
    : JSON.stringify(error);
  return /ThrottlingException|ThroughputExceeded|ThrottleEvents|ProvisionedThroughput/i.test(serialized);
}

function buildActivityBatchThrottleError(createdCount: number, totalCount: number) {
  if (createdCount === 0) {
    return new Error(
      'Salvarea a fost oprita de limitarea temporara DynamoDB inainte de prima scriere. Reincearca dupa cateva secunde.',
    );
  }

  return new Error(
    `Salvarea a fost oprita de limitarea temporara DynamoDB dupa ${createdCount}/${totalCount} activitati create. Reincarca activitatile inainte de reîncercare pentru a evita duplicatele.`,
  );
}

function hasConditionalCheckFailedError(errors: unknown) {
  return String(JSON.stringify(errors) ?? '').includes('ConditionalCheckFailedException');
}

async function listAll<T>(
  listFn: (args?: { filter?: Record<string, unknown>; limit?: number; nextToken?: string | null }) => Promise<ModelListResult<T>>,
  filter?: Record<string, unknown>,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | null | undefined = null;

  do {
    const result = await listFn({ filter, limit: 1000, nextToken });
    assertNoErrors(result, 'AWS list');
    items.push(...(result.data ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  return items;
}

function listModel<T>(
  model: { list: (args?: { filter?: Record<string, unknown>; limit?: number; nextToken?: string | null }) => Promise<ModelListResult<T>> },
  filter?: Record<string, unknown>,
) {
  return listAll<T>((args) => model.list(args), filter);
}


async function createConcurrentProjectAudit(client: any, input: {
  actionType: string;
  affectedExpertId?: string;
  affectedExpertName?: string;
  projectCode?: string;
  month?: number;
  year?: number;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  justification: string;
  source?: string;
}) {
  if (!client.models.AuditLog) return;
  const user = await getSignedInUser();
  const result = await client.models.AuditLog.create({
    actionType: input.actionType,
    actorId: user?.id || 'system',
    actorName: user?.displayName || user?.email || 'Utilizator aplicație',
    actorRole: (user?.roles || []).join(',') || 'unknown',
    affectedExpertId: input.affectedExpertId,
    affectedExpertName: input.affectedExpertName,
    projectCode: input.projectCode,
    month: input.month,
    year: input.year,
    fieldName: input.fieldName,
    oldValue: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValue: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    justification: input.justification,
    source: input.source || 'manual',
  });
  assertNoErrors(result, 'AWS audit concurrent project change');
}

function monthFromDate(date: string) {
  return new Date(`${date}T00:00:00`).getMonth();
}

function yearFromDate(date: string) {
  return new Date(`${date}T00:00:00`).getFullYear();
}

function modelHasField(modelName: string, fieldName: string) {
  const fields = (outputs as any)?.data?.model_introspection?.models?.[modelName]?.fields;
  return Boolean(fields?.[fieldName]);
}

const ACCESS_DENIED_MESSAGE = 'Acces interzis: nu ai drepturi pentru raportarea acestui expert.';

async function listActiveExpertsFromBackend(client: any) {
  const data = await listModel<any>(client.models.Expert, { isActive: { ne: false } });
  return data.map(mapExpert);
}

async function listAllExpertsFromBackend(client: any) {
  const data = await listModel<any>(client.models.Expert);
  return data.map(mapExpert);
}

async function findCurrentExpertFromBackend(client: any, user: AccessUser | null) {
  if (!user) return undefined;

  const fallbackExpert = findExpertForUser(peoUsersAsExperts(), user);
  const email = normalizeIdentity(user.email);
  const candidates: Expert[] = [];

  if (email) {
    const data = await listModel<any>(client.models.Expert, { email: { eq: email } });
    candidates.push(...data.map(mapExpert));
  }

  const userId = normalizeIdentity(user.id);
  if (userId) {
    try {
      const result = await client.models.Expert.get({ id: user.id });
      assertNoErrors(result, 'AWS get current expert');
      if (result.data) candidates.push(mapExpert(result.data));
    } catch {
      // Cognito ids usually do not match Expert ids; email matching and fallback handle the normal case.
    }
  }

  const backendExpert = findExpertForUser(candidates, user);
  return backendExpert ? mergeExpertWithFallback(backendExpert, fallbackExpert) : fallbackExpert;
}

async function getCurrentDataAccessScope(
  client: any,
  options: { ignoreViewAs?: boolean } = {},
): Promise<DataAccessScope> {
  const user = await getSignedInUser({ ignoreViewAs: options.ignoreViewAs });
  const initialScope = resolveDataAccessScope({ user, experts: [] });
  if (initialScope.canAccessAllExperts) return initialScope;

  const currentExpert = await findCurrentExpertFromBackend(client, user);
  return resolveDataAccessScope({ user, experts: currentExpert ? [currentExpert] : [] });
}

async function assertCanAccessExpert(client: any, expertId?: string | null) {
  const scope = await getCurrentDataAccessScope(client);
  if (!canAccessExpertId(scope, expertId)) {
    if (scope.currentExpert && expertId) {
      const result = await client.models.Expert.get({ id: expertId });
      assertNoErrors(result, 'AWS get expert for access check');
      if (result.data) {
        const targetExpert = mapExpert(result.data);
        const currentEmail = normalizeIdentity(scope.currentExpert.email);
        const targetEmail = normalizeIdentity(targetExpert.email);
        if (currentEmail && currentEmail === targetEmail) {
          return scope;
        }
      }
    }
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
  return scope;
}

async function getGTRegistryAccess(client: any) {
  const user = await getSignedInUser();
  if (!user) return { canRead: false, canManage: false };

  const scope = await getCurrentDataAccessScope(client);
  const roles = user.roles ?? [];
  const isPmOrAdmin = roles.includes('pm') || roles.includes('admin') || scope.canAccessAllExperts;
  const isGtProfile = user.category === 'gt' || scope.currentExpert?.category === 'gt';

  return {
    canRead: true,
    canManage: isPmOrAdmin || isGtProfile,
  };
}

function isGTRegistryAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return /unauthorized|not authorized|forbidden|401|403|acces interzis/i.test(message || '');
}

async function callGTRegistryWrite<T>(
  modelName: string,
  action: 'create' | 'update' | 'delete',
  payload: { id?: string; input?: Record<string, unknown> },
) {
  const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  if (!token) {
    throw new Error('Nu am gasit sesiunea Cognito pentru modificarea registrului GT.');
  }

  const response = await fetch('/api/gt/registry', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      modelName,
      action,
      id: payload.id,
      input: payload.input,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || 'Modificarea registrului GT a esuat.');
  }

  return body?.data as T;
}

async function getAllowedExpertId(client: any, requestedExpertId?: string | null) {
  const scope = await getCurrentDataAccessScope(client);
  if (scope.canAccessAllExperts) return requestedExpertId ?? null;
  return scope.currentExpertId ?? null;
}

async function assertCanAccessVerification(client: any, verificationId?: string | null) {
  if (!verificationId) throw new Error(ACCESS_DENIED_MESSAGE);
  const result = await client.models.Verification.get({ id: verificationId });
  assertNoErrors(result, 'AWS get verification for access check');
  if (!result.data) throw new Error(ACCESS_DENIED_MESSAGE);
  await assertCanAccessExpert(client, result.data.expertId);
  return result.data;
}

function withSupportedExpertFields(payload: Record<string, unknown>, expert: Partial<Expert>) {
  const extendedFields: Record<string, unknown> = {
    normType: expert.normType,
    oreZi: expert.oreZi ?? expert.dailyHours ?? expert.norma,
    manualMonthlyNorm: expert.manualMonthlyNorm,
    projectMonthlyNorm: expert.projectMonthlyNorm,
    basePositionConcordia: expert.basePositionConcordia,
    positionInProject: expert.positionInProject,
    goodworksPosition: expert.goodworksPosition,
    projectCode: expert.projectCode,
    projectTitle: expert.projectTitle,
    contractNumber: expert.contractNumber,
    contractType: expert.contractType,
    expertExperienceCategory: expert.expertExperienceCategory,
    hourlyRate: expert.hourlyRate,
    jobDescriptionText: expert.jobDescriptionText,
    aiReportingInstructions: expert.aiReportingInstructions,
    beneficiary: expert.beneficiary,
    avatarUrl: expert.avatarUrl,
  };

  Object.entries(extendedFields).forEach(([field, value]) => {
    if (modelHasField('Expert', field)) {
      payload[field] = value;
    }
  });

  return payload;
}

function withSupportedDeliverableFields(payload: Record<string, unknown>, deliverable: Partial<Deliverable>) {
  const extendedFields: Record<string, unknown> = {
    docText: deliverable.docText,
    suggestedTitle: deliverable.suggestedTitle,
    titleSuggestionConfidence: deliverable.titleSuggestionConfidence,
    titleSuggestionAlternatives: deliverable.titleSuggestionAlternatives,
    titleSuggestionReason: deliverable.titleSuggestionReason,
    firstPageText: deliverable.firstPageText,
    titleSource: deliverable.titleSource,
    titleConfirmed: deliverable.titleConfirmed,
    titleCheckStatus: deliverable.titleCheckStatus,
    titleCheckMessage: deliverable.titleCheckMessage,
    documentId: deliverable.documentId,
    s3Bucket: deliverable.s3Bucket,
    s3Key: deliverable.s3Key,
    originalFileName: deliverable.originalFileName,
    fileHash: deliverable.fileHash,
    firstPageTextHash: deliverable.firstPageTextHash,
    contentFingerprint: deliverable.contentFingerprint,
    uploadedByExpertId: deliverable.uploadedByExpertId,
    uploadedByExpertName: deliverable.uploadedByExpertName,
    projectId: deliverable.projectId,
    projectName: deliverable.projectName,
    sourceActivityId: deliverable.sourceActivityId,
    activityDate: deliverable.activityDate,
    saCode: deliverable.saCode,
    deliverableType: deliverable.deliverableType,
    isCommonDeliverable: deliverable.isCommonDeliverable,
    sharedWithExpertIds: deliverable.sharedWithExpertIds,
    possibleDuplicateOfDocumentId: deliverable.possibleDuplicateOfDocumentId,
    duplicateStatus: deliverable.duplicateStatus,
    uploadError: deliverable.uploadError,
    eligibilityCheck: serializeAwsJsonField(deliverable.eligibilityCheck),
  };

  Object.entries(extendedFields).forEach(([field, value]) => {
    if (value !== undefined && modelHasField('Deliverable', field)) {
      payload[field] = value;
    }
  });

  return payload;
}

function buildDeliverableWritePayload(activityId: string, deliverable: Deliverable, includeId = false) {
  return omitUndefinedFields(withSupportedDeliverableFields({
    ...(includeId ? { id: deliverable.id } : {}),
    activityId,
    fileName: deliverable.fileName,
    fileType: deliverable.fileType,
    fileSize: deliverable.fileSize,
    filePath: deliverable.filePath,
    uploadedAt: deliverable.uploadedAt ?? new Date().toISOString(),
    declaredTitle: deliverable.declaredTitle,
    docTitle: deliverable.docTitle,
    titleMatch: deliverable.titleMatch ?? undefined,
    aiStatus: deliverable.aiStatus,
    aiReason: deliverable.aiReason,
  }, {
    ...deliverable,
    activityId,
    sourceActivityId: deliverable.sourceActivityId || activityId,
  }));
}

function withSupportedActivityShareFields(payload: Record<string, unknown>, activity: Partial<Activity>) {
  const shareFields: Record<string, unknown> = {
    shareStatus: activity.shareStatus,
    originActivityId: activity.originActivityId,
    takenByExperts: activity.takenByExperts,
    periodGroupId: activity.periodGroupId,
    activitySummary: activity.activitySummary,
    activitySummaryGeneratedAt: activity.activitySummaryGeneratedAt,
    activitySummaryAuditId: activity.activitySummaryAuditId,
    activityKeywords: activity.activityKeywords,
    gdprTemplateCode: activity.gdprTemplateCode,
    gdprMetaJson: activity.gdprMetaJson,
    gdprGeneratedText: activity.gdprGeneratedText,
    gdprConclusionCode: activity.gdprConclusionCode,
    businessHubMetaJson: activity.businessHubMetaJson,
    eventDurationHours: activity.eventDurationHours,
    eventExtendedDescription: activity.eventExtendedDescription,
  };

  Object.entries(shareFields).forEach(([field, value]) => {
    if (modelHasField('Activity', field)) {
      payload[field] = value;
    }
  });

  return payload;
}

function omitUndefinedFields<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function withSupportedSharedDeliverableFields(payload: Record<string, unknown>, relation: Partial<SharedDeliverable>) {
  const extendedFields: Record<string, unknown> = {
    sourceExpertName: relation.sourceExpertName,
    sourceActivityDate: relation.sourceActivityDate,
    sourceActivityHours: relation.sourceActivityHours,
    sourceActivityType: relation.sourceActivityType,
    sourceActivityTitle: relation.sourceActivityTitle,
    sourceActivityDescription: relation.sourceActivityDescription,
    sourceActivityLocation: relation.sourceActivityLocation,
    sourceActivityDayType: relation.sourceActivityDayType,
    sourceActivitySaCode: relation.sourceActivitySaCode,
    sourceActivityCatalogActivityId: relation.sourceActivityCatalogActivityId,
    sourceActivityProjectCode: relation.sourceActivityProjectCode,
    sourceActivityEventDurationHours: relation.sourceActivityEventDurationHours,
    sourceActivityEventExtendedDescription: relation.sourceActivityEventExtendedDescription,
  };

  Object.entries(extendedFields).forEach(([field, value]) => {
    if (value !== undefined && modelHasField('SharedDeliverable', field)) {
      payload[field] = value;
    }
  });

  return payload;
}

function mapExpert(item: any): Expert {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    email: item.email ?? undefined,
    phone: item.phone ?? undefined,
    avatarUrl: item.avatarUrl ?? undefined,
    category: item.category ?? undefined,
    norma: item.norma ?? 8,
    normType: item.normType ?? undefined,
    oreZi: item.oreZi ?? item.dailyHours ?? item.norma ?? 8,
    dailyHours: item.dailyHours ?? item.oreZi ?? item.norma ?? 8,
    manualMonthlyNorm: item.manualMonthlyNorm ?? undefined,
    projectMonthlyNorm: item.projectMonthlyNorm ?? undefined,
    basePositionConcordia: item.basePositionConcordia ?? undefined,
    positionInProject: item.positionInProject ?? undefined,
    goodworksPosition: item.goodworksPosition ?? undefined,
    projectCode: item.projectCode ?? undefined,
    projectTitle: item.projectTitle ?? undefined,
    contractNumber: item.contractNumber ?? undefined,
    contractType: item.contractType ?? undefined,
    expertExperienceCategory: item.expertExperienceCategory ?? undefined,
    jobDescriptionText: item.jobDescriptionText ?? undefined,
    aiReportingInstructions: item.aiReportingInstructions ?? undefined,
    beneficiary: item.beneficiary ?? undefined,
    saCodes: item.saCodes ?? [],
    hasPmAccess: item.hasPmAccess ?? false,
    isActive: item.isActive ?? true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapAuditLog(item: any): AuditLog {
  return {
    id: item.id,
    actionType: item.actionType,
    actorId: item.actorId,
    actorName: item.actorName ?? undefined,
    actorRole: item.actorRole,
    createdAt: item.createdAt,
    affectedExpertId: item.affectedExpertId ?? undefined,
    affectedExpertName: item.affectedExpertName ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: item.month ?? undefined,
    year: item.year ?? undefined,
    fieldName: item.fieldName ?? undefined,
    oldValue: item.oldValue ?? undefined,
    newValue: item.newValue ?? undefined,
    justification: item.justification ?? undefined,
    source: item.source,
  };
}

function mapNotificationLog(item: any): NotificationLog {
  return {
    id: item.id,
    kind: item.kind,
    recipientEmail: item.recipientEmail,
    subject: item.subject,
    body: item.body,
    status: item.status ?? 'pending',
    metadata: item.metadata ?? null,
    sentAt: item.sentAt ?? undefined,
    errorMessage: item.errorMessage ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapPmReviewCase(item: any): PmReviewCase {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: Number(item.month),
    year: Number(item.year),
    subjectType: item.subjectType ?? 'other',
    subjectId: item.subjectId ?? undefined,
    sourceActivityId: item.sourceActivityId ?? undefined,
    documentId: item.documentId ?? undefined,
    subjectLabel: item.subjectLabel ?? undefined,
    title: item.title,
    description: item.description,
    priority: item.priority ?? 'medium',
    status: item.status ?? 'open',
    pmOwnerId: item.pmOwnerId ?? undefined,
    pmOwnerName: item.pmOwnerName ?? undefined,
    expertResponse: item.expertResponse ?? undefined,
    notificationRequested: item.notificationRequested ?? false,
    notificationSentAt: item.notificationSentAt ?? undefined,
    notificationSentBy: item.notificationSentBy ?? undefined,
    lastNotificationAt: item.lastNotificationAt ?? undefined,
    notificationCount: item.notificationCount ?? 0,
    resolvedBy: item.resolvedBy ?? undefined,
    resolvedAt: item.resolvedAt ?? undefined,
    resolution: item.resolution ?? undefined,
    createdBy: item.createdBy ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapSupportTicket(item: any): SupportTicket {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    module: item.module,
    severity: item.severity,
    status: item.status ?? 'new',
    expectedResult: item.expectedResult ?? undefined,
    actualResult: item.actualResult ?? undefined,
    reproductionSteps: item.reproductionSteps ?? undefined,
    affectsMonthlyReporting: item.affectsMonthlyReporting ?? false,
    canReproduce: item.canReproduce ?? undefined,
    userId: item.userId ?? undefined,
    userEmail: item.userEmail ?? undefined,
    userName: item.userName ?? undefined,
    userRole: item.userRole ?? undefined,
    currentPath: item.currentPath ?? undefined,
    selectedMonth: item.selectedMonth ?? undefined,
    selectedYear: item.selectedYear ?? undefined,
    selectedExpertId: item.selectedExpertId ?? undefined,
    relatedActivityId: item.relatedActivityId ?? undefined,
    relatedDocumentId: item.relatedDocumentId ?? undefined,
    browserInfo: item.browserInfo ?? undefined,
    appVersion: item.appVersion ?? undefined,
    environment: item.environment ?? undefined,
    screenshotFileName: item.screenshotFileName ?? undefined,
    lastClientError: item.lastClientError ?? undefined,
    lastApiError: item.lastApiError ?? undefined,
    networkStatus: item.networkStatus ?? undefined,
    linearIssueId: item.linearIssueId ?? undefined,
    linearIssueUrl: item.linearIssueUrl ?? undefined,
    linearLabels: item.linearLabels ?? [],
    linearPriority: item.linearPriority ?? undefined,
    createdBy: item.createdBy ?? undefined,
    updatedBy: item.updatedBy ?? undefined,
    resolvedBy: item.resolvedBy ?? undefined,
    resolvedAt: item.resolvedAt ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapReportingPeriod(item: any): ReportingPeriod {
  return {
    id: item.id,
    projectCode: item.projectCode,
    code: item.code,
    startMonth: item.startMonth,
    startYear: item.startYear,
    monthCount: item.monthCount,
    endMonth: item.endMonth,
    endYear: item.endYear,
    status: item.status ?? 'draft',
    notes: item.notes ?? undefined,
    createdBy: item.createdBy ?? undefined,
    updatedBy: item.updatedBy ?? undefined,
    publishedAt: item.publishedAt ?? undefined,
    closedAt: item.closedAt ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapActivityAutofillAudit(item: any): ActivityAutofillAudit {
  return {
    id: item.id,
    expertId: item.expertId ?? undefined,
    expertName: item.expertName ?? undefined,
    expertRole: item.expertRole ?? undefined,
    category: item.category ?? undefined,
    projectCode: item.projectCode ?? undefined,
    month: item.month ?? undefined,
    year: item.year ?? undefined,
    activityId: item.activityId ?? undefined,
    deliverableIds: item.deliverableIds ?? [],
    suggestedSaCode: item.suggestedSaCode ?? undefined,
    suggestedActivityName: item.suggestedActivityName ?? undefined,
    suggestedDescriptionPreview: item.suggestedDescriptionPreview ?? undefined,
    confidence: item.confidence ?? undefined,
    modelAuditId: item.modelAuditId ?? undefined,
    retrievalJson: item.retrievalJson ?? undefined,
    candidateJson: item.candidateJson ?? undefined,
    warningsJson: item.warningsJson ?? undefined,
    applied: item.applied ?? false,
    appliedAt: item.appliedAt ?? undefined,
    finalSaCode: item.finalSaCode ?? undefined,
    finalActivityName: item.finalActivityName ?? undefined,
    finalDescriptionPreview: item.finalDescriptionPreview ?? undefined,
    createdAt: item.createdAt ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
  };
}

function mapHistoricalImportBatch(item: any): HistoricalImportBatch {
  return {
    id: item.id,
    projectCode: item.projectCode,
    label: item.label,
    reportingYear: item.reportingYear,
    monthsIncluded: item.monthsIncluded ?? [],
    importedBy: item.importedBy,
    importedAt: item.importedAt,
    totalExperts: item.totalExperts ?? undefined,
    totalTimesheets: item.totalTimesheets ?? undefined,
    totalActivityReports: item.totalActivityReports ?? undefined,
    totalFiles: item.totalFiles ?? undefined,
    status: item.status,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapMonthlyExpertReport(item: any): MonthlyExpertReport {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName,
    projectCode: item.projectCode,
    projectTitle: item.projectTitle ?? undefined,
    positionInProject: item.positionInProject ?? undefined,
    reportingYear: item.reportingYear,
    reportingMonth: item.reportingMonth,
    reportingMonthLabel: item.reportingMonthLabel ?? undefined,
    sourceType: item.sourceType,
    importBatchId: item.importBatchId ?? undefined,
    activityReportFileId: item.activityReportFileId ?? undefined,
    timesheetWorkbookFileId: item.timesheetWorkbookFileId ?? undefined,
    totalPeoHours: item.totalPeoHours ?? undefined,
    totalOtherHours: item.totalOtherHours ?? undefined,
    leaveHours: item.leaveHours ?? undefined,
    subactivities: item.subactivities ?? [],
    status: item.status,
    pmReviewStatus: item.pmReviewStatus ?? undefined,
    pmReviewedBy: item.pmReviewedBy ?? undefined,
    pmReviewedAt: item.pmReviewedAt ?? undefined,
    pmObservations: item.pmObservations ?? [],
    validationIssues: item.validationIssues ?? undefined,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapUploadedReportingFile(item: any): UploadedReportingFile {
  return {
    id: item.id,
    expertId: item.expertId ?? undefined,
    monthlyReportId: item.monthlyReportId ?? undefined,
    importBatchId: item.importBatchId ?? undefined,
    originalFileName: item.originalFileName,
    storagePath: item.storagePath,
    s3Bucket: item.s3Bucket ?? undefined,
    s3Key: item.s3Key ?? undefined,
    fileType: item.fileType,
    extension: item.extension,
    mimeType: item.mimeType ?? undefined,
    fileSize: item.fileSize ?? undefined,
    reportingYear: item.reportingYear ?? undefined,
    reportingMonth: item.reportingMonth ?? undefined,
    detectedExpertName: item.detectedExpertName ?? undefined,
    detectedProjectCode: item.detectedProjectCode ?? undefined,
    uploadStatus: item.uploadStatus ?? undefined,
    parsingStatus: item.parsingStatus ?? undefined,
    extractedMetadata: item.extractedMetadata ?? undefined,
    checksum: item.checksum ?? undefined,
    uploadedAt: item.uploadedAt,
    uploadedBy: item.uploadedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapMonthlyActivityItem(item: any): MonthlyActivityItem {
  return {
    id: item.id,
    monthlyReportId: item.monthlyReportId,
    expertId: item.expertId,
    activityNumber: item.activityNumber ?? undefined,
    subactivityCode: item.subactivityCode ?? undefined,
    subactivityTitle: item.subactivityTitle ?? undefined,
    activityTitle: item.activityTitle,
    activityDescription: item.activityDescription ?? undefined,
    resultDescription: item.resultDescription ?? undefined,
    deliverableTitle: item.deliverableTitle ?? undefined,
    isCommonDeliverable: item.isCommonDeliverable ?? undefined,
    collaborators: item.collaborators ?? [],
    hours: item.hours ?? undefined,
    sourcePage: item.sourcePage ?? undefined,
    sourceFileId: item.sourceFileId ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapHistoricalTimesheetDayEntry(item: any): HistoricalTimesheetDayEntry {
  return {
    id: item.id,
    monthlyReportId: item.monthlyReportId,
    expertId: item.expertId,
    date: item.date,
    day: item.day,
    reportingMonth: item.reportingMonth,
    reportingYear: item.reportingYear,
    hourlyRate: item.hourlyRate ?? undefined,
    peoHours: item.peoHours ?? undefined,
    otherHours: item.otherHours ?? undefined,
    leaveCode: item.leaveCode ?? undefined,
    activityCode: item.activityCode ?? undefined,
    subactivityCode: item.subactivityCode ?? undefined,
    activityTitle: item.activityTitle ?? undefined,
    activityDescription: item.activityDescription ?? undefined,
    source: item.source ?? undefined,
    sourceFileId: item.sourceFileId ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapDeliverable(item: any): Deliverable {
  return {
    id: item.id,
    activityId: item.activityId,
    fileName: item.fileName,
    fileType: item.fileType,
    fileSize: item.fileSize,
    filePath: item.filePath ?? undefined,
    documentId: item.documentId ?? undefined,
    s3Bucket: item.s3Bucket ?? undefined,
    s3Key: item.s3Key ?? item.filePath ?? undefined,
    originalFileName: item.originalFileName ?? item.fileName ?? undefined,
    fileHash: item.fileHash ?? undefined,
    firstPageTextHash: item.firstPageTextHash ?? undefined,
    contentFingerprint: item.contentFingerprint ?? undefined,
    uploadedByExpertId: item.uploadedByExpertId ?? undefined,
    uploadedByExpertName: item.uploadedByExpertName ?? undefined,
    projectId: item.projectId ?? undefined,
    projectName: item.projectName ?? undefined,
    sourceActivityId: item.sourceActivityId ?? undefined,
    activityDate: item.activityDate ?? undefined,
    saCode: item.saCode ?? undefined,
    deliverableType: item.deliverableType ?? undefined,
    isCommonDeliverable: item.isCommonDeliverable ?? false,
    sharedWithExpertIds: item.sharedWithExpertIds ?? [],
    possibleDuplicateOfDocumentId: item.possibleDuplicateOfDocumentId ?? undefined,
    duplicateStatus: item.duplicateStatus ?? undefined,
    uploadError: item.uploadError ?? undefined,
    uploadedAt: item.uploadedAt ?? undefined,
    declaredTitle: item.declaredTitle ?? undefined,
    docTitle: item.docTitle ?? undefined,
    docText: item.docText ?? undefined,
    suggestedTitle: item.suggestedTitle ?? undefined,
    titleSuggestionConfidence: item.titleSuggestionConfidence ?? undefined,
    titleSuggestionAlternatives: item.titleSuggestionAlternatives ?? undefined,
    titleSuggestionReason: item.titleSuggestionReason ?? undefined,
    firstPageText: item.firstPageText ?? undefined,
    titleSource: item.titleSource ?? undefined,
    titleMatch: item.titleMatch ?? null,
    titleConfirmed: item.titleConfirmed ?? undefined,
    titleCheckStatus: item.titleCheckStatus ?? undefined,
    titleCheckMessage: item.titleCheckMessage ?? undefined,
    aiStatus: item.aiStatus ?? undefined,
    aiReason: item.aiReason ?? undefined,
    eligibilityCheck: parseAwsJsonField<Deliverable['eligibilityCheck']>(item.eligibilityCheck),
  };
}

function mapDocument(item: any): DocumentMetadata {
  return {
    id: item.id,
    s3Bucket: item.s3Bucket ?? undefined,
    s3Key: item.s3Key,
    originalFileName: item.originalFileName,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    fileHash: item.fileHash ?? undefined,
    firstPageTextHash: item.firstPageTextHash ?? undefined,
    contentFingerprint: item.contentFingerprint ?? undefined,
    uploadedByExpertId: item.uploadedByExpertId,
    uploadedByExpertName: item.uploadedByExpertName ?? undefined,
    uploadDate: item.uploadDate,
    projectId: item.projectId ?? undefined,
    projectName: item.projectName ?? undefined,
    sourceActivityId: item.sourceActivityId ?? undefined,
    activityDate: item.activityDate ?? undefined,
    saCode: item.saCode ?? undefined,
    deliverableType: item.deliverableType ?? undefined,
    declaredTitle: item.declaredTitle ?? undefined,
    suggestedTitle: item.suggestedTitle ?? undefined,
    docText: item.docText ?? undefined,
    firstPageText: item.firstPageText ?? undefined,
    titleSuggestionConfidence: item.titleSuggestionConfidence ?? undefined,
    titleSuggestionAlternatives: item.titleSuggestionAlternatives ?? undefined,
    titleSuggestionReason: item.titleSuggestionReason ?? undefined,
    extractedTitle: item.extractedTitle ?? undefined,
    extractedTitleNormalized: item.extractedTitleNormalized ?? undefined,
    titleSource: item.titleSource ?? undefined,
    titleMatch: item.titleMatch ?? null,
    titleCheckStatus: item.titleCheckStatus ?? undefined,
    titleCheckMessage: item.titleCheckMessage ?? undefined,
    eligibilityCheck: parseAwsJsonField<DocumentMetadata['eligibilityCheck']>(item.eligibilityCheck),
    isCommonDeliverable: item.isCommonDeliverable ?? false,
    possibleDuplicateOfDocumentId: item.possibleDuplicateOfDocumentId ?? undefined,
    duplicateStatus: item.duplicateStatus ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapIndexedDeliverableCandidate(item: any): IndexedDeliverableCandidate {
  return {
    id: item.id,
    owner: item.owner ?? undefined,
    expertId: item.expertId,
    uploadedBy: item.uploadedBy ?? undefined,
    uploadedByName: item.uploadedByName ?? undefined,
    reportingMonth: item.reportingMonth,
    reportingYear: item.reportingYear,
    projectCode: item.projectCode ?? undefined,
    fileName: item.fileName,
    originalFileName: item.originalFileName ?? undefined,
    storagePath: item.storagePath,
    s3Key: item.s3Key ?? undefined,
    mimeType: item.mimeType,
    fileType: item.fileType ?? undefined,
    fileSize: item.fileSize,
    fileHash: item.fileHash ?? undefined,
    firstPageTextHash: item.firstPageTextHash ?? undefined,
    contentFingerprint: item.contentFingerprint ?? undefined,
    extractedText: item.extractedText ?? undefined,
    extractedTextPreview: item.extractedTextPreview ?? undefined,
    detectedDate: item.detectedDate ?? undefined,
    suggestedTitle: item.suggestedTitle ?? undefined,
    suggestedType: item.suggestedType ?? undefined,
    suggestedSaCode: item.suggestedSaCode ?? undefined,
    suggestedActivityCatalogId: item.suggestedActivityCatalogId ?? undefined,
    suggestedActivityName: item.suggestedActivityName ?? undefined,
    suggestedDescription: item.suggestedDescription ?? undefined,
    suggestedResult: item.suggestedResult ?? undefined,
    eligibilityStatus: item.eligibilityStatus,
    eligibilityReason: item.eligibilityReason ?? undefined,
    eligibilityScore: item.eligibilityScore ?? undefined,
    confidence: item.confidence ?? undefined,
    alternativeMatches: parseAwsJsonField<IndexedDeliverableCandidate['alternativeMatches']>(item.alternativeMatches) ?? [],
    keywords: item.keywords ?? [],
    warnings: item.warnings ?? [],
    notes: item.notes ?? undefined,
    ragUsed: item.ragUsed ?? false,
    ragSummary: item.ragSummary ?? undefined,
    modelAuditId: item.modelAuditId ?? undefined,
    status: item.status,
    approvedAt: item.approvedAt ?? undefined,
    approvedBy: item.approvedBy ?? undefined,
    createdActivityId: item.createdActivityId ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapSharedDeliverable(item: any): SharedDeliverable {
  return {
    id: item.id,
    documentId: item.documentId,
    sourceExpertId: item.sourceExpertId,
    targetExpertId: item.targetExpertId,
    projectId: item.projectId ?? undefined,
    sourceActivityId: item.sourceActivityId ?? undefined,
    targetActivityId: item.targetActivityId ?? undefined,
    sourceExpertName: item.sourceExpertName ?? undefined,
    sourceActivityDate: item.sourceActivityDate ?? undefined,
    sourceActivityHours: item.sourceActivityHours ?? undefined,
    sourceActivityType: item.sourceActivityType ?? undefined,
    sourceActivityTitle: item.sourceActivityTitle ?? undefined,
    sourceActivityDescription: item.sourceActivityDescription ?? undefined,
    sourceActivityLocation: item.sourceActivityLocation ?? undefined,
    sourceActivityDayType: item.sourceActivityDayType ?? undefined,
    sourceActivitySaCode: item.sourceActivitySaCode ?? undefined,
    sourceActivityCatalogActivityId: item.sourceActivityCatalogActivityId ?? undefined,
    sourceActivityProjectCode: item.sourceActivityProjectCode ?? undefined,
    sourceActivityEventDurationHours: item.sourceActivityEventDurationHours ?? undefined,
    sourceActivityEventExtendedDescription: item.sourceActivityEventExtendedDescription ?? undefined,
    status: item.status,
    notifiedAt: item.notifiedAt ?? undefined,
    registeredAt: item.registeredAt ?? undefined,
    ignoredAt: item.ignoredAt ?? undefined,
    removedAt: item.removedAt ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGrupTinta(item: any): GrupTintaEntry {
  return {
    id: item.id,
    expertId: item.expertId,
    activityId: item.activityId ?? undefined,
    date: item.date,
    year: item.year,
    month: item.month,
    activityType: item.activityType,
    organizations: item.organizations ?? [],
    participantsCount: item.participantsCount ?? 0,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
  };
}

async function findExistingDocumentDuplicates(client: any, deliverable: Deliverable) {
  if (!client.models.Document) return [];
  const filters: Record<string, unknown>[] = [];
  if (deliverable.fileHash) filters.push({ fileHash: { eq: deliverable.fileHash } });
  if (deliverable.firstPageTextHash) filters.push({ firstPageTextHash: { eq: deliverable.firstPageTextHash } });

  const candidates: DocumentMetadata[] = [];
  for (const filter of filters) {
    const items = await listModel<any>(client.models.Document, filter);
    candidates.push(...items.map(mapDocument));
  }

  const unique = new Map(candidates.map((document) => [document.id, document]));
  return findDuplicateCandidates([...unique.values()], {
    id: deliverable.documentId || '',
    fileHash: deliverable.fileHash,
    firstPageTextHash: deliverable.firstPageTextHash,
    extractedTitleNormalized: normalizeTitleForMatch(getDocumentAuditTitle(deliverable)),
    contentFingerprint: deliverable.contentFingerprint,
    fileSize: deliverable.fileSize,
    mimeType: deliverable.fileType,
  });
}

async function createDocumentMetadataForDeliverable(
  client: any,
  activity: Partial<Activity>,
  activityId: string,
  deliverable: Deliverable,
) {
  if (!client.models.Document || !deliverable.documentId || !(deliverable.s3Key || deliverable.filePath)) return;

  const existingDocument = await client.models.Document.get({ id: deliverable.documentId });
  assertNoErrors(existingDocument, 'AWS get existing document metadata');
  if (existingDocument.data) return;

  const duplicateMatches = await findExistingDocumentDuplicates(client, deliverable);
  const duplicate = duplicateMatches[0];
  const duplicateIssues = Array.isArray(duplicate?.issues) ? duplicate.issues : [];
  const duplicateStatus = duplicate
    ? duplicateIssues.includes('same_file_hash')
      ? 'same_file_hash'
      : duplicateIssues.includes('same_first_page_hash')
        ? 'same_first_page_hash'
        : deliverable.duplicateStatus ?? 'possible_common_unmarked'
    : deliverable.duplicateStatus;
  const uploadedByExpertId = deliverable.uploadedByExpertId || activity.expertId || '';
  const uploadedByExpertName = deliverable.uploadedByExpertName || activity.expertName || uploadedByExpertId;

  const payload = omitUndefinedFields({
    id: deliverable.documentId,
    s3Bucket: deliverable.s3Bucket,
    s3Key: deliverable.s3Key || deliverable.filePath || '',
    originalFileName: deliverable.originalFileName || deliverable.fileName,
    mimeType: deliverable.fileType,
    fileSize: deliverable.fileSize,
    fileHash: deliverable.fileHash,
    firstPageTextHash: deliverable.firstPageTextHash,
    contentFingerprint: deliverable.contentFingerprint,
    uploadedByExpertId,
    uploadedByExpertName,
    uploadDate: deliverable.uploadedAt || new Date().toISOString(),
    projectId: deliverable.projectId || activity.projectCode,
    projectName: deliverable.projectName,
    sourceActivityId: activityId,
    activityDate: deliverable.activityDate || activity.date,
    saCode: deliverable.saCode || activity.saCode,
    deliverableType: deliverable.deliverableType,
    declaredTitle: deliverable.declaredTitle,
    suggestedTitle: deliverable.suggestedTitle,
    docText: deliverable.docText,
    firstPageText: deliverable.firstPageText,
    extractedTitle: deliverable.docTitle,
    extractedTitleNormalized: normalizeTitleForMatch(getDocumentAuditTitle(deliverable)),
    titleSource: deliverable.titleSource,
    titleMatch: deliverable.titleMatch ?? undefined,
    titleCheckStatus: deliverable.titleCheckStatus,
    titleCheckMessage: deliverable.titleCheckMessage,
    titleSuggestionConfidence: deliverable.titleSuggestionConfidence,
    titleSuggestionAlternatives: deliverable.titleSuggestionAlternatives,
    titleSuggestionReason: deliverable.titleSuggestionReason,
    eligibilityCheck: serializeAwsJsonField(deliverable.eligibilityCheck),
    isCommonDeliverable: deliverable.isCommonDeliverable ?? false,
    possibleDuplicateOfDocumentId: duplicate?.document.id || deliverable.possibleDuplicateOfDocumentId,
    duplicateStatus,
  });

  const result = await client.models.Document.create(payload);
  if (hasConditionalCheckFailedError(result.errors)) return;
  assertNoErrors(result, 'AWS create document metadata');

  if (duplicate && client.models.AuditLog) {
    await auditLogsService.create({
      actionType: 'document_duplicate_detected',
      actorId: uploadedByExpertId,
      actorName: uploadedByExpertName,
      actorRole: 'admin',
      affectedExpertId: uploadedByExpertId,
      affectedExpertName: uploadedByExpertName,
      projectCode: deliverable.projectId || activity.projectCode,
      month: activity.date ? monthFromDate(activity.date) : undefined,
      year: activity.date ? yearFromDate(activity.date) : undefined,
      fieldName: 'document',
      oldValue: duplicate.document.id,
      newValue: deliverable.documentId,
      justification: 'Audit automat: document identic sau posibil comun detectat la upload.',
      source: 'automatic',
    });
  }
}

function mapBusinessHubEntityDirectoryEntry(item: any): BusinessHubEntityDirectoryEntry {
  return {
    id: item.id,
    directoryType: item.directoryType,
    acronym: item.acronym,
    legalName: item.legalName,
    displayName: item.displayName ?? undefined,
    registeredAddress: item.registeredAddress ?? undefined,
    cuiOrCif: item.cuiOrCif ?? undefined,
    phone: item.phone ?? undefined,
    email: item.email ?? undefined,
    legalRepresentativeName: item.legalRepresentativeName ?? undefined,
    legalRepresentativeRole: item.legalRepresentativeRole ?? undefined,
    designatedPersonName: item.designatedPersonName ?? undefined,
    status: item.status ?? 'active',
    source: item.source ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapOrganization(item: any): Organization {
  return {
    id: item.id,
    name: item.name,
    normalizedName: item.normalizedName,
    kind: item.kind,
    legalForm: item.legalForm ?? undefined,
    cui: item.cui ?? undefined,
    parentOrganizationId: item.parentOrganizationId ?? undefined,
    federationName: item.federationName ?? undefined,
    patronalOrganizationName: item.patronalOrganizationName ?? undefined,
    employeeCount: item.employeeCount ?? undefined,
    status: item.status ?? 'active',
    sourceSheet: item.sourceSheet ?? undefined,
    sourceRowNumber: item.sourceRowNumber ?? undefined,
    importBatchId: item.importBatchId ?? undefined,
    gtNotes: item.gtNotes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGTEntity(item: any): GTEntity {
  return {
    id: item.id,
    organizationId: item.organizationId,
    organizationName: item.organizationName ?? undefined,
    status: item.status ?? 'draft',
    dataIntrareOperatiune: item.dataIntrareOperatiune ?? undefined,
    dataIesireOperatiune: item.dataIesireOperatiune ?? undefined,
    indicator5SO04: item.indicator5SO04 ?? false,
    indicator5SR04: item.indicator5SR04 ?? false,
    region: item.region ?? undefined,
    expertResponsabilId: item.expertResponsabilId ?? undefined,
    notes: item.notes ?? undefined,
    sourceStatusText: item.sourceStatusText ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGTPerson(item: any): GTPerson {
  return {
    id: item.id,
    gtEntityId: item.gtEntityId,
    nume: item.nume,
    prenume: item.prenume,
    cnpHash: item.cnpHash ?? undefined,
    email: item.email ?? undefined,
    telefon: item.telefon ?? undefined,
    functie: item.functie ?? undefined,
    status: item.status ?? 'draft',
    dataIntrareOperatiune: item.dataIntrareOperatiune ?? undefined,
    dataIesireOperatiune: item.dataIesireOperatiune ?? undefined,
    indicator5SO01: item.indicator5SO01 ?? false,
    indicator5SR01: item.indicator5SR01 ?? false,
    consimtamantGDPRAt: item.consimtamantGDPRAt ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGTDocument(item: any): GTDocument {
  return {
    id: item.id,
    subjectType: item.subjectType,
    gtEntityId: item.gtEntityId ?? undefined,
    gtPersonId: item.gtPersonId ?? undefined,
    documentType: item.documentType,
    s3Key: item.s3Key ?? undefined,
    fileName: item.fileName ?? undefined,
    status: item.status ?? 'lipsa',
    validatedByExpertId: item.validatedByExpertId ?? undefined,
    validatedAt: item.validatedAt ?? undefined,
    expiryDate: item.expiryDate ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGTMonitoringRecord(item: any): GTMonitoringRecord {
  return {
    id: item.id,
    subjectType: item.subjectType,
    gtEntityId: item.gtEntityId ?? undefined,
    gtPersonId: item.gtPersonId ?? undefined,
    date: item.date,
    year: item.year,
    month: item.month,
    expertId: item.expertId ?? undefined,
    linkedActivityId: item.linkedActivityId ?? undefined,
    saCode: item.saCode ?? undefined,
    indicatorCode: item.indicatorCode ?? undefined,
    obiectivSpecific: item.obiectivSpecific ?? undefined,
    descriere: item.descriere ?? undefined,
    rezultat: item.rezultat ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapGTImportBatch(item: any): GTImportBatch {
  return {
    id: item.id,
    sourceFileName: item.sourceFileName,
    importedBy: item.importedBy ?? undefined,
    importedAt: item.importedAt,
    status: item.status,
    totalRows: item.totalRows ?? undefined,
    createdOrganizations: item.createdOrganizations ?? undefined,
    duplicateRows: item.duplicateRows ?? undefined,
    warningsJson: item.warningsJson ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function createRecoveredSharedDeliverableAudit(
  client: any,
  activity: Partial<Activity>,
  activityId: string,
  deliverable: Deliverable,
) {
  if (!client.models.AuditLog || !deliverable.documentId) return;
  if (!activity.expertId) return;
  if (!deliverable.uploadedByExpertId || deliverable.uploadedByExpertId === activity.expertId) return;

  const createdAt = new Date().toISOString();
  await auditLogsService.create({
    id: `audit_shared_recovered_${activityId}_${deliverable.documentId}`.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 80),
    actionType: 'shared_deliverable_recovered',
    actorId: activity.expertId,
    actorName: activity.expertName,
    actorRole: 'expert',
    affectedExpertId: activity.expertId,
    affectedExpertName: activity.expertName,
    projectCode: activity.projectCode || deliverable.projectId,
    month: activity.date ? monthFromDate(activity.date) : undefined,
    year: activity.date ? yearFromDate(activity.date) : undefined,
    fieldName: 'document',
    oldValue: deliverable.uploadedByExpertId,
    newValue: deliverable.documentId,
    justification: `Audit automat: livrabil existent al colegului atasat direct la activitatea ${activityId}.`,
    source: 'automatic',
    createdAt,
  });
}

async function syncSharedActivitySuggestions(
  client: any,
  activity: Partial<Activity> & Pick<Activity, 'expertId' | 'shareStatus' | 'takenByExperts' | 'projectCode'>,
  activityId: string,
) {
  if (!client.models.SharedDeliverable) return;

  const existing = await listModel<any>(client.models.SharedDeliverable, {
    documentId: { eq: `activity:${activityId}` },
  });
  const selectedTargets = new Set(activity.shareStatus === 'shared' ? activity.takenByExperts ?? [] : []);
  const sourceSnapshot = buildSharedActivitySnapshot(activity);

  await Promise.all(existing.map((relation) => {
    if (selectedTargets.has(relation.targetExpertId)) {
      selectedTargets.delete(relation.targetExpertId);
      if (relation.status === 'removed') {
        return client.models.SharedDeliverable.update(withSupportedSharedDeliverableFields({
          id: relation.id,
          status: 'pending_registration',
          notifiedAt: new Date().toISOString(),
          removedAt: null,
        }, sourceSnapshot));
      }

      const updatePayload = withSupportedSharedDeliverableFields({
        id: relation.id,
        projectId: activity.projectCode,
        sourceActivityId: activityId,
      }, sourceSnapshot);
      return Object.keys(updatePayload).length > 1
        ? client.models.SharedDeliverable.update(updatePayload)
        : Promise.resolve(null);
    }

    if (relation.status === 'pending_registration') {
      return client.models.SharedDeliverable.update({
        id: relation.id,
        status: 'removed',
        removedAt: new Date().toISOString(),
      });
    }

    return Promise.resolve(null);
  }));

  const suggestions = buildSharedActivitySuggestions({
    sourceActivityId: activityId,
    sourceExpertId: activity.expertId,
    targetExpertIds: Array.from(selectedTargets),
    projectId: activity.projectCode,
    sourceActivity: activity,
  });

  await Promise.all(suggestions.map((relation) =>
    client.models.SharedDeliverable.create(withSupportedSharedDeliverableFields({
      id: relation.id,
      documentId: relation.documentId,
      sourceExpertId: relation.sourceExpertId,
      targetExpertId: relation.targetExpertId,
      projectId: relation.projectId,
      sourceActivityId: relation.sourceActivityId,
      status: relation.status,
      notifiedAt: relation.notifiedAt,
    }, relation)),
  ));
}

async function createSharedDeliverablesForDocument(
  client: any,
  activity: Partial<Activity>,
  activityId: string,
  deliverable: Deliverable,
) {
  if (!client.models.SharedDeliverable || !deliverable.documentId || !deliverable.isCommonDeliverable) return;

  const relations = buildSharedDeliverables({
    documentId: deliverable.documentId,
    sourceExpertId: deliverable.uploadedByExpertId || activity.expertId || '',
    targetExpertIds: deliverable.sharedWithExpertIds || [],
    projectId: deliverable.projectId || activity.projectCode,
    sourceActivityId: activityId,
    sourceActivity: activity,
  });

  await Promise.all(relations.map((relation) =>
    client.models.SharedDeliverable.create(withSupportedSharedDeliverableFields({
      id: relation.id,
      documentId: relation.documentId,
      sourceExpertId: relation.sourceExpertId,
      targetExpertId: relation.targetExpertId,
      projectId: relation.projectId,
      sourceActivityId: relation.sourceActivityId,
      status: relation.status,
    }, relation)),
  ));
}

async function listSharedDocumentIdsForExpert(client: any, expertId: string) {
  if (!client.models.SharedDeliverable) return [];

  const [targetRelations, sourceRelations] = await Promise.all([
    listModel<any>(client.models.SharedDeliverable, { targetExpertId: { eq: expertId } }),
    listModel<any>(client.models.SharedDeliverable, { sourceExpertId: { eq: expertId } }),
  ]);

  return [...new Set([...targetRelations, ...sourceRelations]
    .filter((relation) => relation.documentId && !isActivitySuggestionRelation(relation))
    .map((relation) => relation.documentId))];
}

async function listDocumentsByIds(client: any, documentIds: string[]) {
  if (!client.models.Document || documentIds.length === 0) return [];

  const documents = await Promise.all(documentIds.map(async (documentId) => {
    const result = await client.models.Document.get({ id: documentId });
    assertNoErrors(result, 'AWS get shared document');
    return result.data ? mapDocument(result.data) : null;
  }));

  return documents.filter((document): document is DocumentMetadata => Boolean(document));
}

async function attachSharedDocumentToTargetActivity(
  client: any,
  relation: SharedDeliverable,
  targetActivity: any,
) {
  if (!client.models.Deliverable || !client.models.Document) return;

  const existingDeliverables = await listDeliverablesByActivityId<any>(client.models.Deliverable, targetActivity.id);
  if (existingDeliverables.some((deliverable) => deliverable.documentId === relation.documentId)) return;

  const documentResult = await client.models.Document.get({ id: relation.documentId });
  assertNoErrors(documentResult, 'AWS get shared document for registration');
  if (!documentResult.data) {
    throw new Error('Nu am gasit metadata livrabilului comun pentru asociere.');
  }

  const document = mapDocument(documentResult.data);
  const result = await client.models.Deliverable.create(withSupportedDeliverableFields({
    activityId: targetActivity.id,
    fileName: document.originalFileName,
    fileType: document.mimeType,
    fileSize: document.fileSize,
    filePath: document.s3Key,
    uploadedAt: new Date().toISOString(),
    declaredTitle: document.declaredTitle,
    docTitle: document.extractedTitle,
    titleMatch: document.titleMatch ?? undefined,
  }, {
    documentId: document.id,
    s3Bucket: document.s3Bucket,
    s3Key: document.s3Key,
    originalFileName: document.originalFileName,
    fileHash: document.fileHash,
    firstPageTextHash: document.firstPageTextHash,
    contentFingerprint: document.contentFingerprint,
    uploadedByExpertId: document.uploadedByExpertId,
    uploadedByExpertName: document.uploadedByExpertName,
    projectId: document.projectId,
    projectName: document.projectName,
    sourceActivityId: document.sourceActivityId || relation.sourceActivityId,
    activityDate: document.activityDate || targetActivity.date,
    saCode: document.saCode || targetActivity.saCode,
    deliverableType: document.deliverableType,
    isCommonDeliverable: true,
    declaredTitle: document.declaredTitle,
    docTitle: document.extractedTitle,
    docText: document.docText,
    firstPageText: document.firstPageText,
    suggestedTitle: document.suggestedTitle,
    titleSuggestionConfidence: document.titleSuggestionConfidence,
    titleSuggestionAlternatives: document.titleSuggestionAlternatives,
    titleSuggestionReason: document.titleSuggestionReason,
    titleSource: document.titleSource,
    titleMatch: document.titleMatch,
    titleCheckStatus: document.titleCheckStatus,
    titleCheckMessage: document.titleCheckMessage,
    eligibilityCheck: document.eligibilityCheck,
  }));
  assertNoErrors(result, 'AWS attach shared deliverable to target activity');
}

function getSourceActivityIdFromRelation(relation: SharedDeliverable) {
  return relation.sourceActivityId || (isActivitySuggestionRelation(relation)
    ? relation.documentId.replace(/^activity:/, '')
    : undefined);
}

function buildSourceActivityFromSharedSnapshot(
  relation: SharedDeliverable,
  sourceExpert?: Expert,
  relatedDocuments: DocumentMetadata[] = [],
): Activity | undefined {
  const document = relatedDocuments[0];
  const date = relation.sourceActivityDate || document?.activityDate;
  const title =
    relation.sourceActivityTitle
    || relation.sourceActivityType
    || document?.declaredTitle
    || document?.suggestedTitle
    || document?.extractedTitle
    || document?.originalFileName;
  const activityType = relation.sourceActivityType || title;

  if (!date || !title || !activityType) return undefined;

  return {
    id: getSourceActivityIdFromRelation(relation) || relation.id,
    expertId: relation.sourceExpertId,
    expertName: relation.sourceExpertName || sourceExpert?.name,
    date,
    hours: relation.sourceActivityHours ?? 0,
    activityType,
    saCode: relation.sourceActivitySaCode || document?.saCode,
    catalogActivityId: relation.sourceActivityCatalogActivityId,
    title,
    description: relation.sourceActivityDescription,
    location: relation.sourceActivityLocation,
    dayType: relation.sourceActivityDayType,
    shareStatus: 'shared',
    projectCode: relation.sourceActivityProjectCode || relation.projectId || document?.projectId,
    eventDurationHours: relation.sourceActivityEventDurationHours,
    eventExtendedDescription: relation.sourceActivityEventExtendedDescription,
  };
}

async function tryGetSharedSourceActivity(client: any, sourceActivityId?: string) {
  if (!client.models.Activity || !sourceActivityId) return null;

  try {
    const result = await client.models.Activity.get({ id: sourceActivityId });
    if (result.errors || !result.data) return null;
    return attachActivityChildren(result.data);
  } catch {
    return null;
  }
}

function mergeMissingSharedActivitySnapshot(
  relation: SharedDeliverable,
  sourceActivity?: Activity | null,
) {
  if (!sourceActivity || !isActivitySuggestionRelation(relation)) return relation;

  const snapshot = buildSharedActivitySnapshot(sourceActivity);
  return {
    ...relation,
    sourceExpertName: relation.sourceExpertName || snapshot.sourceExpertName,
    sourceActivityDate: relation.sourceActivityDate || snapshot.sourceActivityDate,
    sourceActivityHours: relation.sourceActivityHours ?? snapshot.sourceActivityHours,
    sourceActivityType: relation.sourceActivityType || snapshot.sourceActivityType,
    sourceActivityTitle: relation.sourceActivityTitle || snapshot.sourceActivityTitle,
    sourceActivityDescription: relation.sourceActivityDescription || snapshot.sourceActivityDescription,
    sourceActivityLocation: relation.sourceActivityLocation || snapshot.sourceActivityLocation,
    sourceActivityDayType: relation.sourceActivityDayType || snapshot.sourceActivityDayType,
    sourceActivitySaCode: relation.sourceActivitySaCode || snapshot.sourceActivitySaCode,
    sourceActivityCatalogActivityId: relation.sourceActivityCatalogActivityId || snapshot.sourceActivityCatalogActivityId,
    sourceActivityProjectCode: relation.sourceActivityProjectCode || snapshot.sourceActivityProjectCode,
    sourceActivityEventDurationHours: relation.sourceActivityEventDurationHours ?? snapshot.sourceActivityEventDurationHours,
    sourceActivityEventExtendedDescription: relation.sourceActivityEventExtendedDescription || snapshot.sourceActivityEventExtendedDescription,
    projectId: relation.projectId || snapshot.sourceActivityProjectCode,
  };
}

function shouldHydrateSharedActivitySnapshot(relation: SharedDeliverable) {
  return isActivitySuggestionRelation(relation)
    && Boolean(getSourceActivityIdFromRelation(relation))
    && (
      !relation.sourceActivityTitle
      || !relation.sourceActivityDate
      || relation.sourceActivityHours === undefined
      || !relation.sourceActivityDescription
      || !relation.sourceActivitySaCode
      || !relation.sourceActivityProjectCode
    );
}

async function hydrateSharedActivitySnapshots(
  client: any,
  relations: SharedDeliverable[],
) {
  const sourceActivityIds = [...new Set(relations
    .filter(shouldHydrateSharedActivitySnapshot)
    .map(getSourceActivityIdFromRelation)
    .filter((activityId): activityId is string => Boolean(activityId)))];

  if (sourceActivityIds.length === 0) return relations;

  const sourceActivities = new Map<string, Activity>();
  await Promise.all(sourceActivityIds.map(async (activityId) => {
    const sourceActivity = await tryGetSharedSourceActivity(client, activityId);
    if (sourceActivity) sourceActivities.set(activityId, sourceActivity);
  }));

  return relations.map((relation) =>
    mergeMissingSharedActivitySnapshot(
      relation,
      sourceActivities.get(getSourceActivityIdFromRelation(relation) || ''),
    ),
  );
}

async function attachActivityChildren(activity: any): Promise<Activity> {
  const client = getAwsDataClient() as any;
  const [deliverables, grupTinta] = await Promise.all([
    listDeliverablesByActivityId<any>(client.models.Deliverable, activity.id),
    listModel<any>(client.models.GrupTintaEntry, { activityId: { eq: activity.id } }),
  ]);

  return {
    id: activity.id,
    expertId: activity.expertId,
    expertName: activity.expertName ?? undefined,
    date: activity.date,
    hours: activity.hours ?? 0,
    activityType: activity.activityType,
    saCode: activity.saCode ?? undefined,
    catalogActivityId: activity.catalogActivityId ?? undefined,
    title: activity.title,
    description: activity.description ?? undefined,
    activitySummary: activity.activitySummary ?? undefined,
    activitySummaryGeneratedAt: activity.activitySummaryGeneratedAt ?? undefined,
    activitySummaryAuditId: activity.activitySummaryAuditId ?? undefined,
    activityKeywords: activity.activityKeywords ?? undefined,
    location: activity.location ?? undefined,
    dayType: activity.dayType ?? undefined,
    workingGroupId: activity.workingGroupId ?? undefined,
    periodGroupId: activity.periodGroupId ?? undefined,
    status: activity.status ?? 'draft',
    shareStatus: activity.shareStatus ?? 'private',
    originActivityId: activity.originActivityId ?? undefined,
    takenByExperts: activity.takenByExperts ?? [],
    projectCode: activity.projectCode ?? undefined,
    autoGenerated: activity.autoGenerated ?? false,
    generatedAt: activity.generatedAt ?? undefined,
    generatedBy: activity.generatedBy ?? undefined,
    pmNotes: activity.pmNotes ?? undefined,
    gdprTemplateCode: activity.gdprTemplateCode ?? undefined,
    gdprMetaJson: activity.gdprMetaJson ?? undefined,
    gdprGeneratedText: activity.gdprGeneratedText ?? undefined,
    gdprConclusionCode: activity.gdprConclusionCode ?? undefined,
    businessHubMetaJson: activity.businessHubMetaJson ?? undefined,
    eventDurationHours: activity.eventDurationHours ?? undefined,
    eventExtendedDescription: activity.eventExtendedDescription ?? undefined,
    deliverables: deliverables.map(mapDeliverable),
    grupTinta: grupTinta.map(mapGrupTinta),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

function activityToValidationDraft(activity: any): ActivityDraftForValidation {
  return {
    id: activity.id,
    expertId: activity.expertId,
    date: activity.date,
    hours: Number(activity.hours) || 0,
    status: activity.status,
    projectCode: activity.projectCode ?? undefined,
    saCode: activity.saCode ?? undefined,
    catalogActivityId: activity.catalogActivityId ?? undefined,
    activityType: activity.activityType ?? undefined,
    title: activity.title ?? undefined,
    description: activity.description ?? undefined,
    businessHubMetaJson: activity.businessHubMetaJson ?? undefined,
  };
}

function getActivityPeriodGroupId(activity: Pick<Activity, 'periodGroupId' | 'workingGroupId'>) {
  return activity.periodGroupId
    || (activity.workingGroupId?.startsWith('activity-period:') ? activity.workingGroupId : undefined);
}

async function listActivitiesForValidation(
  client: any,
  expertId: string,
  month: number,
  year: number,
  excludedIds: string[] = [],
) {
  const data = await listModel<any>(client.models.Activity, {
    expertId: { eq: expertId },
    month: { eq: month },
    year: { eq: year },
  });
  const excluded = new Set(excludedIds);
  return data.filter((activity) => !excluded.has(activity.id)).map(activityToValidationDraft);
}

async function listActivitiesWithDeliverablesForValidation(
  client: any,
  expertId: string,
  month: number,
  year: number,
  excludedIds: string[] = [],
) {
  const data = await listModel<any>(client.models.Activity, {
    expertId: { eq: expertId },
    month: { eq: month },
    year: { eq: year },
  });
  const excluded = new Set(excludedIds);
  const activities = data.filter((activity) => !excluded.has(activity.id));

  return Promise.all(activities.map(async (activity) => {
    const deliverables = await listDeliverablesByActivityId<any>(client.models.Deliverable, activity.id);

    return {
      id: activity.id,
      expertId: activity.expertId,
      date: activity.date,
      periodGroupId: activity.periodGroupId,
      workingGroupId: activity.workingGroupId,
      saCode: activity.saCode,
      catalogActivityId: activity.catalogActivityId,
      activityType: activity.activityType,
      title: activity.title,
      deliverables: deliverables.map(mapDeliverable),
    };
  }));
}

type ActivityWithDeliverablesForValidation = Pick<
  Activity,
  'id' | 'expertId' | 'date' | 'periodGroupId' | 'workingGroupId' | 'saCode' | 'catalogActivityId' | 'activityType' | 'title'
> & {
  deliverables?: Deliverable[];
};

function dedupeExistingDeliverablesForValidation(
  activities: ActivityWithDeliverablesForValidation[],
) {
  const seenSignatures = new Set<string>();

  return activities.map((activity) => ({
    ...activity,
    deliverables: (activity.deliverables ?? []).filter((deliverable) => {
      const signature = getDeliverableDocumentSignature(deliverable);
      if (!signature) return true;
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
      return true;
    }),
  }));
}

async function assertReportMonthIsMutable(
  client: any,
  expertId: string,
  month: number,
  year: number,
) {
  const statuses = await listModel<any>(client.models.ReportStatus, {
    expertId: { eq: expertId },
    month: { eq: month },
    year: { eq: year },
  });

  if (statuses.some((status) => status.status === 'approved')) {
    throw new Error('Luna este aprobata si nu mai permite modificari de activitati. Solicita redeschiderea raportarii de la PM/Admin.');
  }
}

async function validateActivityBatchForWrite(
  client: any,
  activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[],
  excludedIds: string[] = [],
) {
  const groups = new Map<string, Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]>();

  activities.forEach((activity) => {
    const month = monthFromDate(activity.date);
    const year = yearFromDate(activity.date);
    const key = `${activity.expertId}:${year}:${month}`;
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  });

  for (const groupActivities of groups.values()) {
    const sample = groupActivities[0];
    const expert = await expertsService.getById(sample.expertId);
    if (!expert) {
      throw new Error('Activitatea nu a fost creată: expertul nu există în baza de date.');
    }

    const month = monthFromDate(sample.date);
    const year = yearFromDate(sample.date);
    await assertReportMonthIsMutable(client, sample.expertId, month, year);

    const existingActivities = await listActivitiesForValidation(client, sample.expertId, month, year, excludedIds);
    const validation = validateActivitiesBeforeCreate({
      expert,
      existingActivities,
      newActivities: groupActivities.map(activityToValidationDraft),
      month,
      year,
      affectedDates: groupActivities.map((activity) => activity.date),
    });

    if (!validation.ok) {
      throw new Error(validation.message ?? 'Activitatea nu a fost creată: regula de pontaj ar fi depășită.');
    }

    const [normContracts, concurrentProjects, concurrentEntries, leaveEntries] = await Promise.all([
      expertNormContractsService.getByExpert(sample.expertId),
      concurrentProjectsService.getByExpert(sample.expertId),
      concurrentProjectTimesheetService.getAllByMonth(month, year),
      leaveEntriesService.getByMonth(month, year),
    ]);
    const effectiveNormContracts = applyFinancialReferenceNorms(expert, normContracts, month, year);
    assertCapacity(calculateCapacitySnapshot({
      expert,
      contracts: effectiveNormContracts,
      activities: [...existingActivities, ...groupActivities],
      concurrentProjects,
      concurrentEntries: concurrentEntries.filter((entry) => entry.expertId === sample.expertId),
      leaveEntries: leaveEntries.filter((entry) => entry.expertId === sample.expertId),
      month,
      year,
    }));
    const existingActivitiesWithDeliverables = await listActivitiesWithDeliverablesForValidation(
      client,
      sample.expertId,
      month,
      year,
      excludedIds,
    );
    const existingActivitiesForDeliverableValidation = dedupeExistingDeliverablesForValidation(
      existingActivitiesWithDeliverables,
    );
    let monthlyDuplicate = findMonthlyDeliverableDuplicate({
      existingActivities: existingActivitiesForDeliverableValidation,
      nextActivities: groupActivities,
      expertId: sample.expertId,
      month,
      year,
      excludedActivityIds: excludedIds,
    });

    while (monthlyDuplicate) {
      const duplicate = monthlyDuplicate;
      const duplicateGroupId = getActivityPeriodGroupId(duplicate.activity);
      const existingGroupId = getActivityPeriodGroupId(duplicate.existingActivity);
      const duplicateMatchesExistingActivity = areActivitiesCompatibleForDeliverableGroup(
        duplicate.activity,
        duplicate.existingActivity,
      );
      if (duplicateGroupId && duplicateGroupId === existingGroupId && duplicateMatchesExistingActivity) {
        const duplicateActivity = groupActivities.find((activity) => activity === duplicate.activity);
        if (!duplicateActivity) break;
        duplicateActivity.deliverables = (duplicateActivity.deliverables ?? []).filter((deliverable) => (
          getDeliverableDocumentSignature(deliverable) !== duplicate.signature
        ));
        monthlyDuplicate = findMonthlyDeliverableDuplicate({
          existingActivities: existingActivitiesForDeliverableValidation,
          nextActivities: groupActivities,
          expertId: sample.expertId,
          month,
          year,
          excludedActivityIds: excludedIds,
        });
        continue;
      }

      const duplicateActivity = groupActivities.find((activity) => activity === duplicate.activity);
      const periodGroupId = existingGroupId
        ?? duplicateGroupId
        ?? (duplicate.existingActivity.id ? `activity-period:${duplicate.existingActivity.id}` : undefined);

      if (duplicateActivity && periodGroupId && duplicateMatchesExistingActivity) {
        if (
          duplicate.existingActivity.id
          && (
            duplicate.existingActivity.periodGroupId !== periodGroupId
            || !duplicate.existingActivity.workingGroupId
          )
        ) {
          await client.models.Activity.update(omitUndefinedFields(withSupportedActivityShareFields({
            id: duplicate.existingActivity.id,
            workingGroupId: duplicate.existingActivity.workingGroupId ?? periodGroupId,
          }, {
            periodGroupId,
          })));
          duplicate.existingActivity.periodGroupId = periodGroupId;
          duplicate.existingActivity.workingGroupId = duplicate.existingActivity.workingGroupId ?? periodGroupId;
        }

        duplicateActivity.periodGroupId = periodGroupId;
        duplicateActivity.workingGroupId = periodGroupId;
        duplicateActivity.deliverables = (duplicateActivity.deliverables ?? []).filter((deliverable) => (
          getDeliverableDocumentSignature(deliverable) !== duplicate.signature
        ));
        monthlyDuplicate = findMonthlyDeliverableDuplicate({
          existingActivities: existingActivitiesForDeliverableValidation,
          nextActivities: groupActivities,
          expertId: sample.expertId,
          month,
          year,
          excludedActivityIds: excludedIds,
        });
        continue;
      }

      const duplicateName = duplicate.deliverable.originalFileName
        || duplicate.deliverable.fileName
        || duplicate.existingDeliverable.originalFileName
        || duplicate.existingDeliverable.fileName
        || 'Acest livrabil';
      throw new Error(`${duplicateName} este deja incarcat pentru luna selectata. Selecteaza livrabilul existent si confirma adaugarea la activitatea existenta sau incarca un livrabil diferit.`);
    }
  }
}

async function attachActivitiesToExistingDeliverableGroups(
  client: any,
  activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[],
  excludedIds: string[] = [],
) {
  const sourceActivities = new Map<string, ActivityWithDeliverablesForValidation | null>();
  const existingActivitiesByMonth = new Map<string, ActivityWithDeliverablesForValidation[]>();

  const getSourceActivity = async (sourceActivityId: string) => {
    if (sourceActivities.has(sourceActivityId)) {
      return sourceActivities.get(sourceActivityId) ?? null;
    }

    const source = await client.models.Activity.get({ id: sourceActivityId });
    assertNoErrors(source, 'AWS get source activity');
    const sourceActivity = source.data ? await attachActivityChildren(source.data) : null;
    sourceActivities.set(sourceActivityId, sourceActivity);
    return sourceActivity;
  };

  const getExistingActivitiesForMonth = async (activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => {
    const month = monthFromDate(activity.date);
    const year = yearFromDate(activity.date);
    const key = `${activity.expertId}:${year}:${month}`;
    if (existingActivitiesByMonth.has(key)) {
      return existingActivitiesByMonth.get(key) ?? [];
    }

    const existingActivities = await listActivitiesWithDeliverablesForValidation(
      client,
      activity.expertId,
      month,
      year,
      excludedIds,
    );
    existingActivitiesByMonth.set(key, existingActivities);
    return existingActivities;
  };

  const findExistingActivityByDeliverableSignature = async (
    activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>,
    signature: string,
  ) => {
    const existingActivities = await getExistingActivitiesForMonth(activity);
    return existingActivities.find((existingActivity) => (
      existingActivity.deliverables?.some((deliverable) => (
        getDeliverableDocumentSignature(deliverable) === signature
      ))
    )) ?? null;
  };

  const attachToSourceActivity = async (
    activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>,
    sourceActivity: ActivityWithDeliverablesForValidation,
  ) => {
    const periodGroupId = getActivityPeriodGroupId(sourceActivity)
      ?? `activity-period:${sourceActivity.id}`;
    if (
      sourceActivity.periodGroupId !== periodGroupId
      || !sourceActivity.workingGroupId
    ) {
      await client.models.Activity.update(omitUndefinedFields(withSupportedActivityShareFields({
        id: sourceActivity.id,
        workingGroupId: sourceActivity.workingGroupId ?? periodGroupId,
      }, {
        periodGroupId,
      })));
      sourceActivity.periodGroupId = periodGroupId;
      sourceActivity.workingGroupId = sourceActivity.workingGroupId ?? periodGroupId;
    }

    return {
      ...activity,
      periodGroupId,
      workingGroupId: periodGroupId,
    };
  };

  return Promise.all(activities.map(async (activity) => {
    const deliverables = dedupeDeliverablesBySignature(activity.deliverables ?? []);
    if (deliverables.length === 0) return activity;

    let nextActivity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'> = {
      ...activity,
      deliverables,
    };
    const signaturesToSkip = new Set<string>();

    for (const deliverable of deliverables) {
      const signature = getDeliverableDocumentSignature(deliverable);
      if (!signature) continue;

      const sourceActivity = deliverable.sourceActivityId
        ? await getSourceActivity(deliverable.sourceActivityId)
        : await findExistingActivityByDeliverableSignature(nextActivity, signature);
      const sourceWasExplicitlySelected = Boolean(deliverable.sourceActivityId);
      const sourceHasDeliverable = sourceActivity?.deliverables?.some((sourceDeliverable) => (
        getDeliverableDocumentSignature(sourceDeliverable) === signature
      ));
      if (!sourceActivity || !sourceHasDeliverable) continue;
      if (
        sourceWasExplicitlySelected
        && (
          sourceActivity.expertId !== nextActivity.expertId
          || Boolean(getActivityPeriodGroupId(nextActivity))
        )
      ) {
        continue;
      }
      if (!areActivitiesCompatibleForDeliverableGroup(nextActivity, sourceActivity)) {
        continue;
      }

      nextActivity = await attachToSourceActivity(nextActivity, sourceActivity);
      signaturesToSkip.add(signature);
    }

    if (signaturesToSkip.size === 0) return nextActivity;

    return {
      ...nextActivity,
      deliverables: deliverables.filter((deliverable) => {
        const signature = getDeliverableDocumentSignature(deliverable);
        return !signature || !signaturesToSkip.has(signature);
      }),
    };
  }));
}

async function createActivityUnchecked(
  client: any,
  activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Activity> {
  const created = await client.models.Activity.create(omitUndefinedFields(withSupportedActivityShareFields({
    expertId: activity.expertId,
    expertName: activity.expertName,
    date: activity.date,
    year: yearFromDate(activity.date),
    month: monthFromDate(activity.date),
    hours: activity.hours,
    activityType: activity.activityType,
    saCode: activity.saCode,
    catalogActivityId: activity.catalogActivityId,
    title: activity.title,
    description: activity.description,
    activitySummary: activity.activitySummary,
    activitySummaryGeneratedAt: activity.activitySummaryGeneratedAt,
    activitySummaryAuditId: activity.activitySummaryAuditId,
    activityKeywords: activity.activityKeywords,
    location: activity.location,
    dayType: activity.dayType,
    workingGroupId: activity.workingGroupId,
    status: activity.status ?? 'draft',
    pmNotes: activity.pmNotes,
    gdprTemplateCode: activity.gdprTemplateCode,
    gdprMetaJson: activity.gdprMetaJson,
    gdprGeneratedText: activity.gdprGeneratedText,
    gdprConclusionCode: activity.gdprConclusionCode,
    businessHubMetaJson: activity.businessHubMetaJson,
    eventDurationHours: activity.eventDurationHours,
    eventExtendedDescription: activity.eventExtendedDescription,
  }, {
    shareStatus: activity.shareStatus ?? 'private',
    originActivityId: activity.originActivityId,
    takenByExperts: activity.takenByExperts ?? [],
    periodGroupId: activity.periodGroupId,
  })));
  assertNoErrors(created, 'AWS create activity');

  const activityId = created.data.id;
  await syncSharedActivitySuggestions(client, activity, activityId);
  await Promise.all([
    ...(activity.deliverables ?? []).map(async (deliverable) => {
      await createDocumentMetadataForDeliverable(client, activity, activityId, deliverable);
      await createRecoveredSharedDeliverableAudit(client, activity, activityId, deliverable);
      await createSharedDeliverablesForDocument(client, activity, activityId, deliverable);
      const result = await client.models.Deliverable.create(buildDeliverableWritePayload(activityId, deliverable));
      assertNoErrors(result, 'AWS create deliverable');
      return result;
    }),
    ...(activity.grupTinta ?? []).map((entry) =>
      client.models.GrupTintaEntry.create({
        expertId: activity.expertId,
        activityId,
        date: entry.date,
        year: entry.year,
        month: entry.month,
        activityType: entry.activityType,
        organizations: entry.organizations ?? [],
        participantsCount: entry.participantsCount ?? 0,
        notes: entry.notes,
      }),
    ),
  ]);

  return attachActivityChildren(created.data);
}

export const expertsService = {
  async getCollaborationOptions(): Promise<Expert[]> {
    const client = getAwsDataClient() as any;
    await getCurrentDataAccessScope(client);
    const experts = await listAllExpertsFromBackend(client);
    const activeExperts = mergeExpertLists(experts, peoUsersAsExperts()).filter((expert) => expert.isActive !== false);
    return buildCollaborationExpertOptions(activeExperts);
  },

  async getAll(options?: { includeInactive?: boolean; includeFallback?: boolean }): Promise<Expert[]> {
    const client = getAwsDataClient() as any;
    const fallbackExperts = options?.includeFallback === false ? [] : peoUsersAsExperts();
    const scope = await getCurrentDataAccessScope(client);
    const includeInactive = options?.includeInactive === true;

    if (scope.canAccessAllExperts) {
      const experts = (includeInactive || fallbackExperts.length > 0)
        ? await listAllExpertsFromBackend(client)
        : await listActiveExpertsFromBackend(client);
      const mergedExperts = fallbackExperts.length > 0 ? mergeExpertLists(experts, fallbackExperts) : experts;
      const visibleExperts = includeInactive ? mergedExperts : mergedExperts.filter((expert) => expert.isActive !== false);
      return visibleExperts.sort((a, b) => a.name.localeCompare(b.name));
    }

    return scope.currentExpert ? [scope.currentExpert] : [];
  },

  async getById(id: string): Promise<Expert | null> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!canAccessExpertId(scope, id)) return null;

    const result = await client.models.Expert.get({ id });
    assertNoErrors(result, 'AWS get expert');
    return result.data ? mapExpert(result.data) : peoUsersAsExperts().find((expert) => expert.id === id) ?? null;
  },

  async create(expert: Omit<Expert, 'id'>): Promise<Expert> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client, { ignoreViewAs: true });
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);

    const result = await client.models.Expert.create(withSupportedExpertFields({
      name: expert.name,
      role: expert.role,
      email: expert.email,
      phone: expert.phone,
      category: expert.category,
      norma: expert.norma ?? 8,
      saCodes: expert.saCodes ?? [],
      hasPmAccess: expert.hasPmAccess ?? false,
      isActive: expert.isActive ?? true,
    }, expert));
    assertNoErrors(result, 'AWS create expert');
    return mapExpert(result.data);
  },

  async update(id: string, updates: Partial<Expert>): Promise<void> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client, { ignoreViewAs: true });
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);

    const result = await client.models.Expert.update(withSupportedExpertFields({
      id,
      name: updates.name,
      role: updates.role,
      email: updates.email,
      phone: updates.phone,
      category: updates.category,
      norma: updates.norma,
      saCodes: updates.saCodes,
      hasPmAccess: updates.hasPmAccess,
      isActive: updates.isActive,
    }, updates));
    assertNoErrors(result, 'AWS update expert');
  },

  async delete(id: string): Promise<void> {
    await expertsService.update(id, { isActive: false });
  },
};

export const auditLogsService = {
  async getAll(): Promise<AuditLog[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.AuditLog) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];

    const data = await listModel<any>(client.models.AuditLog);
    return filterAuditLogsForScope(data.map(mapAuditLog), scope).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<AuditLog[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.AuditLog) return [];
    const allowedExpertId = await getAllowedExpertId(client, expertId);
    if (!allowedExpertId || allowedExpertId !== expertId) return [];

    const data = await listModel<any>(client.models.AuditLog, {
      affectedExpertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapAuditLog).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: AdminInterventionRequest | AuditLog): Promise<AuditLog> {
    const client = getAwsDataClient() as any;
    const audit = 'createdAt' in input ? input : createAuditLog(input);
    const scope = await getCurrentDataAccessScope(client);

    if (!scope.canAccessAllExperts && !canAccessExpertId(scope, audit.affectedExpertId ?? audit.actorId)) {
      throw new Error(ACCESS_DENIED_MESSAGE);
    }

    if (!client.models.AuditLog) {
      return audit;
    }

    const result = await client.models.AuditLog.create({
      actionType: audit.actionType,
      actorId: audit.actorId,
      actorName: audit.actorName,
      actorRole: audit.actorRole,
      affectedExpertId: audit.affectedExpertId,
      affectedExpertName: audit.affectedExpertName,
      projectCode: audit.projectCode,
      month: audit.month,
      year: audit.year,
      fieldName: audit.fieldName,
      oldValue: audit.oldValue,
      newValue: audit.newValue,
      justification: audit.justification,
      source: audit.source,
    });

    const unauthorizedError = result.errors?.some((error: any) =>
      error?.errorType === 'Unauthorized'
      || String(error?.message || '').toLowerCase().includes('not authorized'),
    );
    if (unauthorizedError) {
      const allowUnauthorizedAuditFallback =
        process.env.NODE_ENV !== 'production'
        || process.env.NEXT_PUBLIC_ALLOW_UNAUTHORIZED_AUDITLOG_FALLBACK === 'true';

      if (allowUnauthorizedAuditFallback) {
        console.warn('Skipping audit log persistence due to Unauthorized on createAuditLog.');
        return audit;
      }
    }

    assertNoErrors(result, 'AWS create audit log');
    return mapAuditLog(result.data);
  },
};

export const notificationLogsService = {
  async create(input: NotificationLogCreateInput): Promise<NotificationLog> {
    const client = getAwsDataClient() as any;
    const fallback: NotificationLog = {
      id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      status: input.status || 'pending',
      metadata: input.metadata ?? null,
      sentAt: input.sentAt,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
    };

    if (!client.models.NotificationLog) {
      return fallback;
    }

    const result = await client.models.NotificationLog.create({
      kind: input.kind,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      status: input.status || 'pending',
      metadata: input.metadata ?? undefined,
      sentAt: input.sentAt,
      errorMessage: input.errorMessage,
    });

    const unauthorizedError = result.errors?.some((error: any) =>
      error?.errorType === 'Unauthorized'
      || String(error?.message || '').toLowerCase().includes('not authorized'),
    );
    if (unauthorizedError && process.env.NODE_ENV !== 'production') {
      console.warn('Skipping notification log persistence due to Unauthorized on create NotificationLog.');
      return fallback;
    }

    assertNoErrors(result, 'AWS create notification log');
    return mapNotificationLog(result.data);
  },

  async createMany(inputs: NotificationLogCreateInput[]): Promise<NotificationLog[]> {
    const results: NotificationLog[] = [];
    for (const input of inputs) {
      results.push(await notificationLogsService.create(input));
    }
    return results;
  },
};

export const reportingPeriodsService = {
  async getAll(): Promise<ReportingPeriod[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.ReportingPeriod;
    if (!model) return [];

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard && !scope.canAccessAllExperts) return [];

    const data = await listModel<any>(model);
    return data.map(mapReportingPeriod).sort((a, b) => {
      const startA = a.startYear * 12 + a.startMonth;
      const startB = b.startYear * 12 + b.startMonth;
      if (startA !== startB) return startA - startB;
      return a.code.localeCompare(b.code);
    });
  },

  async create(input: ReportingPeriodCreateInput): Promise<ReportingPeriod> {
    const client = getAwsDataClient() as any;
    const model = client.models.ReportingPeriod;
    if (!model) {
      throw new Error('Modelul ReportingPeriod nu este disponibil in backend.');
    }

    const result = await model.create(input);
    assertNoErrors(result, 'AWS create reporting period');
    return mapReportingPeriod(result.data);
  },

  async update(id: string, updates: ReportingPeriodUpdateInput): Promise<ReportingPeriod> {
    const client = getAwsDataClient() as any;
    const model = client.models.ReportingPeriod;
    if (!model) {
      throw new Error('Modelul ReportingPeriod nu este disponibil in backend.');
    }

    const result = await model.update({ id, ...updates });
    assertNoErrors(result, 'AWS update reporting period');
    return mapReportingPeriod(result.data);
  },
};

export const activityAutofillAuditsService = {
  async getAll(month?: number, year?: number): Promise<ActivityAutofillAudit[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.ActivityAutofillAudit;
    if (!model) return [];

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard) return [];

    const filter: Record<string, unknown> = {
      ...(month !== undefined ? { month: { eq: month } } : {}),
      ...(year !== undefined ? { year: { eq: year } } : {}),
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
    };
    const data = await listModel<any>(model, Object.keys(filter).length ? filter : undefined);
    return data.map(mapActivityAutofillAudit).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  },

  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<ActivityAutofillAudit[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.ActivityAutofillAudit;
    if (!model) return [];

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard) return [];
    if (!scope.canAccessAllExperts && scope.currentExpertId !== expertId) return [];

    const data = await listModel<any>(model, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapActivityAutofillAudit).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  },
};

export const documentsService = {
  async getAll(): Promise<DocumentMetadata[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];

    if (!scope.canAccessAllExperts && scope.currentExpertId) {
      const [ownDocuments, sharedDocumentIds] = await Promise.all([
        listModel<any>(client.models.Document, { uploadedByExpertId: { eq: scope.currentExpertId } }),
        listSharedDocumentIdsForExpert(client, scope.currentExpertId),
      ]);
      const ownDocumentIds = new Set(ownDocuments.map((document) => document.id));
      const sharedDocuments = await listDocumentsByIds(
        client,
        sharedDocumentIds.filter((documentId) => !ownDocumentIds.has(documentId)),
      );
      const deduped = new Map([
        ...ownDocuments.map(mapDocument),
        ...sharedDocuments,
      ].map((document) => [document.id, document]));
      return Array.from(deduped.values()).sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
    }

    const filter = scope.canAccessAllExperts ? undefined : { uploadedByExpertId: { eq: scope.currentExpertId } };
    const data = await listModel<any>(client.models.Document, filter);
    return filterDocumentsForScope(data.map(mapDocument), scope).sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
  },

  async getColleagueDocumentsByMonth(month: number, year: number): Promise<DocumentMetadata[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none' || !scope.currentExpertId) return [];

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const data = await listModel<any>(client.models.Document);
    return data
      .map(mapDocument)
      .filter((document) => {
        if (document.uploadedByExpertId === scope.currentExpertId) return false;
        const documentMonthKey = (document.activityDate || document.uploadDate || '').slice(0, 7);
        if (documentMonthKey !== monthKey) return false;
        if (scope.canAccessAllExperts) return true;
        const currentProjectCode = scope.currentExpert?.projectCode;
        return !currentProjectCode || !document.projectId || document.projectId === currentProjectCode;
      })
      .sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
  },

  async getById(id: string): Promise<DocumentMetadata | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return null;
    const result = await client.models.Document.get({ id });
    assertNoErrors(result, 'AWS get document');
    if (!result.data) return null;
    const document = mapDocument(result.data);
    const scope = await getCurrentDataAccessScope(client);
    const directlyVisible = filterDocumentsForScope([document], scope)[0];
    if (directlyVisible) return directlyVisible;

    if (!scope.canAccessAllExperts && scope.currentExpertId && client.models.SharedDeliverable) {
      const relations = await listModel<any>(client.models.SharedDeliverable, { documentId: { eq: id } });
      const canAccessSharedDocument = relations.some((relation) =>
        relation.sourceExpertId === scope.currentExpertId || relation.targetExpertId === scope.currentExpertId,
      );
      if (canAccessSharedDocument) return document;
    }

    return null;
  },

  async getByProject(projectId: string): Promise<DocumentMetadata[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.Document, { projectId: { eq: projectId } });
    return filterDocumentsForScope(data.map(mapDocument), scope);
  },

  async findByHash(fileHash: string): Promise<DocumentMetadata[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.Document, { fileHash: { eq: fileHash } });
    return filterDocumentsForScope(data.map(mapDocument), scope);
  },

  async update(id: string, updates: Partial<Pick<
    DocumentMetadata,
    'sourceActivityId' | 'activityDate' | 'saCode' | 'deliverableType' | 'stadiu' | 'eligibilityCheck'
  >>): Promise<DocumentMetadata | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return null;
    const result = await client.models.Document.update({
      id,
      sourceActivityId: updates.sourceActivityId,
      activityDate: updates.activityDate,
      saCode: updates.saCode,
      deliverableType: updates.deliverableType,
      stadiu: updates.stadiu,
      eligibilityCheck: updates.eligibilityCheck === undefined
        ? undefined
        : serializeAwsJsonField(updates.eligibilityCheck),
    });
    assertNoErrors(result, 'AWS update document metadata');
    return result.data ? mapDocument(result.data) : null;
  },

  async updateEligibilityCheck(id: string, eligibilityCheck: DeliverableEligibilityCheck | null): Promise<DocumentMetadata | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.Document) return null;
    const result = await client.models.Document.update({
      id,
      eligibilityCheck: serializeAwsJsonField(eligibilityCheck),
    });
    assertNoErrors(result, 'AWS update document eligibility check');
    return result.data ? mapDocument(result.data) : null;
  },
};

export const indexedDeliverableCandidatesService = {
  async getByMonth(expertId: string, reportingMonth: number, reportingYear: number): Promise<IndexedDeliverableCandidate[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.IndexedDeliverableCandidate) return [];
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.IndexedDeliverableCandidate, {
      expertId: { eq: expertId },
      reportingMonth: { eq: reportingMonth },
      reportingYear: { eq: reportingYear },
    });
    return data.map(mapIndexedDeliverableCandidate).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getById(id: string): Promise<IndexedDeliverableCandidate | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.IndexedDeliverableCandidate) return null;
    const result = await client.models.IndexedDeliverableCandidate.get({ id });
    assertNoErrors(result, 'AWS get indexed deliverable candidate');
    if (!result.data) return null;
    const candidate = mapIndexedDeliverableCandidate(result.data);
    await assertCanAccessExpert(client, candidate.expertId);
    return candidate;
  },

  async create(input: Omit<IndexedDeliverableCandidate, 'id' | 'createdAt' | 'updatedAt'>): Promise<IndexedDeliverableCandidate> {
    const client = getAwsDataClient() as any;
    if (!client.models.IndexedDeliverableCandidate) {
      throw new Error('Modelul IndexedDeliverableCandidate nu este disponibil in backend. Ruleaza deploy-ul Amplify pentru schema noua.');
    }
    const user = await getSignedInUser();
    await assertCanAccessExpert(client, input.expertId);
    const result = await client.models.IndexedDeliverableCandidate.create({
      ...input,
      owner: input.owner ?? user?.id ?? input.uploadedBy ?? input.expertId,
      alternativeMatches: serializeAwsJsonField(input.alternativeMatches ?? []),
    });
    assertNoErrors(result, 'AWS create indexed deliverable candidate');
    if (!result.data) throw new Error('AWS create indexed deliverable candidate returned no data');
    return mapIndexedDeliverableCandidate(result.data);
  },

  async update(id: string, updates: Partial<IndexedDeliverableCandidate>): Promise<IndexedDeliverableCandidate> {
    const client = getAwsDataClient() as any;
    if (!client.models.IndexedDeliverableCandidate) {
      throw new Error('Modelul IndexedDeliverableCandidate nu este disponibil in backend. Ruleaza deploy-ul Amplify pentru schema noua.');
    }
    const existing = await this.getById(id);
    if (!existing) throw new Error('Candidatul de livrabil nu a fost gasit.');
    const result = await client.models.IndexedDeliverableCandidate.update({
      id,
      ...updates,
      alternativeMatches: updates.alternativeMatches === undefined
        ? undefined
        : serializeAwsJsonField(updates.alternativeMatches),
    });
    assertNoErrors(result, 'AWS update indexed deliverable candidate');
    if (!result.data) throw new Error('AWS update indexed deliverable candidate returned no data');
    return mapIndexedDeliverableCandidate(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    if (!client.models.IndexedDeliverableCandidate) return;
    const existing = await this.getById(id);
    if (!existing) return;
    const result = await client.models.IndexedDeliverableCandidate.delete({ id });
    assertNoErrors(result, 'AWS delete indexed deliverable candidate');
  },
};

export const sharedDeliverablesService = {
  async getAll(): Promise<SharedDeliverable[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return [];
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];

    if (!scope.canAccessAllExperts && scope.currentExpertId) {
      const [targetData, sourceData] = await Promise.all([
        listModel<any>(client.models.SharedDeliverable, { targetExpertId: { eq: scope.currentExpertId } }),
        listModel<any>(client.models.SharedDeliverable, { sourceExpertId: { eq: scope.currentExpertId } }),
      ]);
      const deduped = new Map([...targetData, ...sourceData].map((relation) => [relation.id, relation]));
      const relations = filterSharedDeliverablesForScope(Array.from(deduped.values()).map(mapSharedDeliverable), scope);
      return hydrateSharedActivitySnapshots(client, relations);
    }

    const data = await listModel<any>(client.models.SharedDeliverable);
    const relations = filterSharedDeliverablesForScope(data.map(mapSharedDeliverable), scope);
    return hydrateSharedActivitySnapshots(client, relations);
  },

  async getPendingForExpert(expertId: string): Promise<SharedDeliverable[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return [];
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.SharedDeliverable, {
      targetExpertId: { eq: expertId },
      status: { eq: 'pending_registration' },
    });
    return hydrateSharedActivitySnapshots(client, data.map(mapSharedDeliverable));
  },

  async getActivityRegistrationContext(relationId: string): Promise<SharedActivityRegistrationContext | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return null;

    const existing = await client.models.SharedDeliverable.get({ id: relationId });
    assertNoErrors(existing, 'AWS get shared activity registration context');
    if (!existing.data) return null;

    const activityRelation = mapSharedDeliverable(existing.data);
    if (!isActivitySuggestionRelation(activityRelation)) return null;

    await assertCanAccessExpert(client, activityRelation.targetExpertId);

    const sourceActivityId = getSourceActivityIdFromRelation(activityRelation);
    const relatedRawRelations = await listModel<any>(client.models.SharedDeliverable, {
      targetExpertId: { eq: activityRelation.targetExpertId },
      status: { eq: 'pending_registration' },
    });
    const relatedDeliverableRelations = relatedRawRelations
      .map(mapSharedDeliverable)
      .filter((relation) =>
        !isActivitySuggestionRelation(relation)
        && relation.sourceActivityId === sourceActivityId,
      );
    const [sourceExpertResult, relatedDocuments, sourceActivityFromBackend] = await Promise.all([
      client.models.Expert.get({ id: activityRelation.sourceExpertId }).catch(() => ({ data: null })),
      listDocumentsByIds(client, relatedDeliverableRelations.map((relation) => relation.documentId)),
      tryGetSharedSourceActivity(client, sourceActivityId),
    ]);
    const sourceExpert = sourceExpertResult.data ? mapExpert(sourceExpertResult.data) : undefined;

    return {
      activityRelation,
      sourceActivity: sourceActivityFromBackend
        || buildSourceActivityFromSharedSnapshot(activityRelation, sourceExpert, relatedDocuments),
      sourceExpert,
      relatedDeliverableRelations,
      relatedDocuments,
    };
  },

  async ensureActivitySuggestionForTarget(sourceActivityId: string, targetExpertId: string, sourceActivitySnapshot?: Activity): Promise<SharedDeliverable | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return null;
    await assertCanAccessExpert(client, targetExpertId);

    const sourceActivity = sourceActivitySnapshot?.id === sourceActivityId
      ? sourceActivitySnapshot
      : await tryGetSharedSourceActivity(client, sourceActivityId);
    if (!sourceActivity) {
      throw new Error('Activitatea colegului nu a fost gasita.');
    }
    if (sourceActivity.expertId === targetExpertId) {
      throw new Error('Nu poti adauga in pontajul tau propria activitate din modulul colegilor.');
    }

    const existingRelations = await listModel<any>(client.models.SharedDeliverable, {
      targetExpertId: { eq: targetExpertId },
    });
    const existingActivityRelation = existingRelations
      .map(mapSharedDeliverable)
      .find((relation) => (
        isActivitySuggestionRelation(relation)
        && relation.sourceActivityId === sourceActivityId
      ));

    let activityRelation = existingActivityRelation;
    const sourceSnapshot = buildSharedActivitySnapshot(sourceActivity);

    if (activityRelation) {
      if (activityRelation.status === 'removed' || activityRelation.status === 'ignored_by_target' || activityRelation.status === 'confirmed_not_relevant') {
        const result = await client.models.SharedDeliverable.update(withSupportedSharedDeliverableFields({
          id: activityRelation.id,
          status: 'pending_registration',
          notifiedAt: new Date().toISOString(),
          removedAt: null,
          ignoredAt: null,
        }, sourceSnapshot));
        assertNoErrors(result, 'AWS reactivate shared activity suggestion');
        activityRelation = result.data ? mapSharedDeliverable(result.data) : activityRelation;
      }
    } else {
      const [suggestion] = buildSharedActivitySuggestions({
        sourceActivityId,
        sourceExpertId: sourceActivity.expertId,
        targetExpertIds: [targetExpertId],
        projectId: sourceActivity.projectCode,
        sourceActivity,
      });
      if (!suggestion) return null;
      const result = await client.models.SharedDeliverable.create(withSupportedSharedDeliverableFields({
        id: suggestion.id,
        documentId: suggestion.documentId,
        sourceExpertId: suggestion.sourceExpertId,
        targetExpertId: suggestion.targetExpertId,
        projectId: suggestion.projectId,
        sourceActivityId: suggestion.sourceActivityId,
        status: suggestion.status,
        notifiedAt: suggestion.notifiedAt,
      }, suggestion));
      assertNoErrors(result, 'AWS create shared activity suggestion from colleague overview');
      activityRelation = result.data ? mapSharedDeliverable(result.data) : suggestion;
    }

    const deliverablesWithDocuments = (sourceActivity.deliverables ?? [])
      .filter((deliverable) => Boolean(deliverable.documentId));
    await Promise.all(deliverablesWithDocuments.map(async (deliverable) => {
      if (!deliverable.documentId) return;
      const existingDocumentRelation = existingRelations
        .map(mapSharedDeliverable)
        .find((relation) => (
          !isActivitySuggestionRelation(relation)
          && relation.documentId === deliverable.documentId
          && relation.sourceActivityId === sourceActivityId
        ));

      if (existingDocumentRelation) {
        if (existingDocumentRelation.status === 'removed' || existingDocumentRelation.status === 'ignored_by_target' || existingDocumentRelation.status === 'confirmed_not_relevant') {
          const result = await client.models.SharedDeliverable.update(withSupportedSharedDeliverableFields({
            id: existingDocumentRelation.id,
            status: 'pending_registration',
            removedAt: null,
            ignoredAt: null,
          }, sourceSnapshot));
          assertNoErrors(result, 'AWS reactivate shared deliverable relation from colleague overview');
        }
        return;
      }

      const [relation] = buildSharedDeliverables({
        documentId: deliverable.documentId,
        sourceExpertId: sourceActivity.expertId,
        targetExpertIds: [targetExpertId],
        projectId: deliverable.projectId || sourceActivity.projectCode,
        sourceActivityId,
        sourceActivity,
      });
      if (!relation) return;
      const result = await client.models.SharedDeliverable.create(withSupportedSharedDeliverableFields({
        id: relation.id,
        documentId: relation.documentId,
        sourceExpertId: relation.sourceExpertId,
        targetExpertId: relation.targetExpertId,
        projectId: relation.projectId,
        sourceActivityId: relation.sourceActivityId,
        status: relation.status,
      }, relation));
      assertNoErrors(result, 'AWS create shared deliverable relation from colleague overview');
    }));

    return activityRelation ?? null;
  },

  async registerForActivity(relationId: string, targetActivityId: string): Promise<SharedDeliverable | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return null;
    const existing = await client.models.SharedDeliverable.get({ id: relationId });
    assertNoErrors(existing, 'AWS get shared deliverable');
    if (!existing.data) return null;
    await assertCanAccessExpert(client, existing.data.targetExpertId);

    const targetActivity = await client.models.Activity.get({ id: targetActivityId });
    assertNoErrors(targetActivity, 'AWS get target activity');
    if (!targetActivity.data || targetActivity.data.expertId !== existing.data.targetExpertId) {
      throw new Error(ACCESS_DENIED_MESSAGE);
    }

    if (existing.data.status !== 'pending_registration') {
      throw new Error('Livrabilul comun poate fi asociat doar din status pending_registration.');
    }
    const registered = markSharedDeliverableRegistered({
      relation: mapSharedDeliverable(existing.data),
      targetActivityId,
    });
    if (!isActivitySuggestionRelation(registered)) {
      await attachSharedDocumentToTargetActivity(client, registered, targetActivity.data);
    }
    const result = await client.models.SharedDeliverable.update({
      id: relationId,
      status: registered.status,
      targetActivityId: registered.targetActivityId,
      registeredAt: registered.registeredAt,
    });
    assertNoErrors(result, 'AWS register shared deliverable');
    return result.data ? mapSharedDeliverable(result.data) : null;
  },

  async ignore(relationId: string): Promise<SharedDeliverable | null> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return null;
    const existing = await client.models.SharedDeliverable.get({ id: relationId });
    assertNoErrors(existing, 'AWS get shared activity suggestion');
    if (!existing.data) return null;
    await assertCanAccessExpert(client, existing.data.targetExpertId);

    if (existing.data.status !== 'pending_registration') {
      throw new Error('Sugestia de activitate comuna poate fi ignorata doar cat timp este in asteptare.');
    }

    const result = await client.models.SharedDeliverable.update({
      id: relationId,
      status: 'ignored_by_target',
      ignoredAt: new Date().toISOString(),
    });
    assertNoErrors(result, 'AWS ignore shared activity suggestion');
    return result.data ? mapSharedDeliverable(result.data) : null;
  },
};

export const activitiesService = {
  async getAll(): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const filter = scope.canAccessAllExperts ? undefined : { expertId: { eq: scope.currentExpertId } };
    const data = await listModel<any>(client.models.Activity, filter);
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return filterActivitiesForScope(mapped, scope).sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByExpert(expertId: string): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.Activity, { expertId: { eq: expertId } });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return mapped.sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByMonth(month: number, year: number): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.Activity, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return filterActivitiesForScope(mapped, scope).sort((a, b) => a.date.localeCompare(b.date));
  },

  async getColleagueOverviewByMonth(month: number, year: number): Promise<Activity[]> {
    const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
    if (!token) return [];

    const response = await fetch(`/api/activities/colleague-overview?month=${month}&year=${year}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || 'Newsletterul colegilor nu a putut fi incarcat.');
    }
    return Array.isArray(body?.activities) ? body.activities : [];
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Activity[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.Activity, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      date: { between: [startDate, endDate] },
    });
    const mapped = await Promise.all(data.map(attachActivityChildren));
    return filterActivitiesForScope(mapped, scope).sort((a, b) => a.date.localeCompare(b.date));
  },

  async create(activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Activity> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, activity.expertId);
    const [preparedActivity] = await attachActivitiesToExistingDeliverableGroups(client, [activity]);
    await validateActivityBatchForWrite(client, [preparedActivity]);
    return createActivityUnchecked(client, preparedActivity);
  },

  async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]> {
    if (activities.length === 0) return [];
    const client = getAwsDataClient() as any;
    await Promise.all(activities.map((activity) => assertCanAccessExpert(client, activity.expertId)));
    const preparedActivities = await attachActivitiesToExistingDeliverableGroups(client, activities);
    await validateActivityBatchForWrite(client, preparedActivities);

    const created: Activity[] = [];
    for (const activity of preparedActivities) {
      try {
        created.push(await createActivityUnchecked(client, activity));
      } catch (error) {
        if (isAwsThrottlingError(error)) {
          throw buildActivityBatchThrottleError(created.length, preparedActivities.length);
        }
        throw error;
      }
    }
    return created;
  },

  async createWithAdminOverride(
    activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>,
    admin: {
      actorId: string;
      actorName?: string;
      actorRole: string;
      justification: string;
    },
  ): Promise<Activity> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);

    const nonWorkingInfo = getNonWorkingDayInfo(activity.date);
    if (nonWorkingInfo.isNonWorkingDay) {
      assertCanLogHoursOnDate(activity.date, {
        actorRole: admin.actorRole,
        force: true,
        justification: admin.justification,
      });
    }

    const prepared = prepareAdminActivityOverride({
      activity,
      actorId: admin.actorId,
      actorName: admin.actorName,
      actorRole: admin.actorRole,
      justification: admin.justification,
      actionType: nonWorkingInfo.isNonWorkingDay ? 'non_working_day_overridden' : 'activity_admin_created',
    });
    const created = await createActivityUnchecked(client, prepared.activity);
    await auditLogsService.create(prepared.audit);
    return created;
  },

  async update(id: string, updates: Partial<Activity>): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.Activity.get({ id });
    assertNoErrors(existing, 'AWS get activity');
    let preparedUpdates = updates;

    if (existing.data) {
      await assertCanAccessExpert(client, existing.data.expertId);
      if (updates.expertId && updates.expertId !== existing.data.expertId) {
        await assertCanAccessExpert(client, updates.expertId);
      }

      const candidate = {
        ...existing.data,
        ...updates,
        expertId: updates.expertId ?? existing.data.expertId,
        date: updates.date ?? existing.data.date,
        hours: updates.hours ?? existing.data.hours,
        activityType: updates.activityType ?? existing.data.activityType,
        title: updates.title ?? existing.data.title,
      } as Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>;

      const [preparedCandidate] = await attachActivitiesToExistingDeliverableGroups(client, [candidate], [id]);
      await validateActivityBatchForWrite(client, [preparedCandidate], [id]);
      preparedUpdates = {
        ...updates,
        periodGroupId: preparedCandidate.periodGroupId,
        workingGroupId: preparedCandidate.workingGroupId,
        deliverables: preparedCandidate.deliverables,
      };
    }

    const result = await client.models.Activity.update(omitUndefinedFields(withSupportedActivityShareFields({
      id,
      expertId: preparedUpdates.expertId,
      expertName: preparedUpdates.expertName,
      date: preparedUpdates.date,
      year: preparedUpdates.date ? yearFromDate(preparedUpdates.date) : undefined,
      month: preparedUpdates.date ? monthFromDate(preparedUpdates.date) : undefined,
      hours: preparedUpdates.hours,
      activityType: preparedUpdates.activityType,
      saCode: preparedUpdates.saCode,
      catalogActivityId: preparedUpdates.catalogActivityId,
      title: preparedUpdates.title,
      description: preparedUpdates.description,
      activitySummary: preparedUpdates.activitySummary,
      activitySummaryGeneratedAt: preparedUpdates.activitySummaryGeneratedAt,
      activitySummaryAuditId: preparedUpdates.activitySummaryAuditId,
      activityKeywords: preparedUpdates.activityKeywords,
      location: preparedUpdates.location,
      dayType: preparedUpdates.dayType,
      workingGroupId: preparedUpdates.workingGroupId,
      status: preparedUpdates.status,
      projectCode: preparedUpdates.projectCode,
      pmNotes: preparedUpdates.pmNotes,
      gdprTemplateCode: preparedUpdates.gdprTemplateCode,
      gdprMetaJson: preparedUpdates.gdprMetaJson,
      gdprGeneratedText: preparedUpdates.gdprGeneratedText,
      gdprConclusionCode: preparedUpdates.gdprConclusionCode,
      businessHubMetaJson: preparedUpdates.businessHubMetaJson,
      eventDurationHours: preparedUpdates.eventDurationHours,
      eventExtendedDescription: preparedUpdates.eventExtendedDescription,
    }, preparedUpdates)));
    assertNoErrors(result, 'AWS update activity');

    if (existing.data) {
      await syncSharedActivitySuggestions(client, {
        expertId: preparedUpdates.expertId ?? existing.data.expertId,
        shareStatus: preparedUpdates.shareStatus ?? existing.data.shareStatus,
        takenByExperts: preparedUpdates.takenByExperts ?? existing.data.takenByExperts ?? [],
        projectCode: preparedUpdates.projectCode ?? existing.data.projectCode ?? undefined,
      }, id);
    }

    if (preparedUpdates.deliverables) {
      const existingDeliverables = await listDeliverablesByActivityId<any>(client.models.Deliverable, id);
      const deliverablePlan = planDeliverableSync(existingDeliverables.map(mapDeliverable), preparedUpdates.deliverables);

      await Promise.all(
        deliverablePlan.toDelete.map((deliverable) => client.models.Deliverable.delete({ id: deliverable.id })),
      );
      await Promise.all(
        deliverablePlan.toUpdate.map(async (deliverable) => {
          const result = await client.models.Deliverable.update(buildDeliverableWritePayload(id, deliverable, true));
          assertNoErrors(result, 'AWS update deliverable');
          return result;
        }),
      );
      await Promise.all(
        deliverablePlan.toCreate.map(async (deliverable) => {
          await createDocumentMetadataForDeliverable(client, updates, id, deliverable);
          await createRecoveredSharedDeliverableAudit(client, updates, id, deliverable);
          await createSharedDeliverablesForDocument(client, updates, id, deliverable);
          const result = await client.models.Deliverable.create(buildDeliverableWritePayload(id, deliverable));
          assertNoErrors(result, 'AWS create deliverable');
          return result;
        }),
      );
    }

    if (updates.grupTinta) {
      const existingEntries = await listModel<any>(client.models.GrupTintaEntry, { activityId: { eq: id } });
      await Promise.all(existingEntries.map((entry) => client.models.GrupTintaEntry.delete({ id: entry.id })));
      await Promise.all(
        updates.grupTinta.map((entry) =>
          client.models.GrupTintaEntry.create({
            expertId: updates.expertId ?? result.data?.expertId,
            activityId: id,
            date: entry.date,
            year: entry.year,
            month: entry.month,
            activityType: entry.activityType,
            organizations: entry.organizations ?? [],
            participantsCount: entry.participantsCount ?? 0,
            notes: entry.notes,
          }),
        ),
      );
    }
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.Activity.get({ id });
    assertNoErrors(existing, 'AWS get activity');
    if (!existing.data) return;
    await assertCanAccessExpert(client, existing.data.expertId);
    await assertReportMonthIsMutable(
      client,
      existing.data.expertId,
      monthFromDate(existing.data.date),
      yearFromDate(existing.data.date),
    );

    const result = await client.models.Activity.delete({ id });
    assertNoErrors(result, 'AWS delete activity');
  },

  async deleteByDates(expertId: string, dates: string[]): Promise<void> {
    const entries = await activitiesService.getByExpert(expertId);
    await Promise.all(entries.filter((entry) => dates.includes(entry.date)).map((entry) => activitiesService.delete(entry.id)));
  },
};

export const reportingWorkBlocksService = {
  prepareDraft(input: DraftWorkBlockInput, activities: Activity[]): PreparedDraftWorkBlock {
    return prepareDraftWorkBlockBundle(input, activities);
  },

  prepareSaveDraft(input: DraftWorkBlockInput, activities: Activity[]): PreparedDraftWorkBlockSave {
    return prepareDraftWorkBlockSave(input, activities);
  },

  async saveDraft(input: DraftWorkBlockInput, activities: Activity[]): Promise<ReportingWorkBlockBundle> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, input.expertId);
    await assertReportMonthIsMutable(client, input.expertId, input.month, input.year);

    if (
      !client.models.ReportingWorkBlock
      || !client.models.WorkBlockActivityLink
      || !client.models.WorkBlockDeliverableLink
    ) {
      throw new Error('Work block persistence is not available in the configured backend.');
    }

    const preparedDraft = prepareDraftWorkBlockSave(input, activities);
    if (!preparedDraft.canSave || !preparedDraft.bundle) {
      throw new Error('Draftul work block nu este pregatit pentru salvare.');
    }

    const { bundle } = preparedDraft;
    const existing = await client.models.ReportingWorkBlock.get({ id: bundle.workBlock.id });
    assertNoErrors(existing, 'AWS get reporting work block before save');
    const workBlockPayload = {
      id: bundle.workBlock.id,
      expertId: bundle.workBlock.expertId,
      projectCode: bundle.workBlock.projectCode,
      month: bundle.workBlock.month,
      year: bundle.workBlock.year,
      title: bundle.workBlock.title,
      saCode: bundle.workBlock.saCode,
      activityCode: bundle.workBlock.activityCode,
      activityCategory: bundle.workBlock.activityCategory,
      reportingFlowType: bundle.workBlock.reportingFlowType,
      expertContribution: bundle.workBlock.expertContribution,
      beneficiaries: bundle.workBlock.beneficiaries,
      indicatorContribution: bundle.workBlock.indicatorContribution,
      cleanedActivitySummary: bundle.workBlock.cleanedActivitySummary,
      generatedTableSummary: bundle.workBlock.generatedTableSummary,
      generatedNarrative: bundle.workBlock.generatedNarrative,
      generationInputsHash: bundle.workBlock.generationInputsHash,
      aiConsolidationStatus: bundle.workBlock.aiConsolidationStatus,
      aiConsolidationUpdatedAt: bundle.workBlock.aiConsolidationUpdatedAt,
      status: bundle.workBlock.status,
    };
    const savedWorkBlock = existing.data
      ? await client.models.ReportingWorkBlock.update(workBlockPayload)
      : await client.models.ReportingWorkBlock.create(workBlockPayload);
    assertNoErrors(savedWorkBlock, 'AWS save reporting work block');

    const existingActivityLinks = await listModel<PersistedWorkBlockActivityLink>(
      client.models.WorkBlockActivityLink,
      { workBlockId: { eq: bundle.workBlock.id } },
    );
    const existingDeliverableLinks = await listModel<PersistedWorkBlockDeliverableLink>(
      client.models.WorkBlockDeliverableLink,
      { workBlockId: { eq: bundle.workBlock.id } },
    );

    await Promise.all([
      ...existingActivityLinks.map(async (link) => {
        const result = await client.models.WorkBlockActivityLink.delete({ id: link.id });
        assertNoErrors(result, 'AWS delete work block activity link');
      }),
      ...existingDeliverableLinks.map(async (link) => {
        const result = await client.models.WorkBlockDeliverableLink.delete({ id: link.id });
        assertNoErrors(result, 'AWS delete work block deliverable link');
      }),
    ]);

    await Promise.all([
      ...bundle.activityLinks.map(async (link) => {
        const result = await client.models.WorkBlockActivityLink.create({
          id: link.id,
          workBlockId: link.workBlockId,
          activityId: link.activityId,
          allocatedHours: link.allocatedHours,
        });
        assertNoErrors(result, 'AWS create work block activity link');
      }),
      ...bundle.deliverableLinks.map(async (link) => {
        const result = await client.models.WorkBlockDeliverableLink.create({
          id: link.id,
          workBlockId: link.workBlockId,
          deliverableId: link.deliverableId,
          isPrimary: link.isPrimary,
          contributionType: link.contributionType,
        });
        assertNoErrors(result, 'AWS create work block deliverable link');
      }),
    ]);

    return bundle;
  },

  async getBundlesByExpertAndMonth(expertId: string, month: number, year: number): Promise<ReportingWorkBlockBundle[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, expertId);

    if (
      !client.models.ReportingWorkBlock
      || !client.models.WorkBlockActivityLink
      || !client.models.WorkBlockDeliverableLink
    ) {
      return [];
    }

    const workBlocks = await listModel<PersistedReportingWorkBlock>(client.models.ReportingWorkBlock, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    if (workBlocks.length === 0) return [];

    const workBlockIds = new Set(workBlocks.map((workBlock) => workBlock.id));
    const [activities, activityLinks, deliverableLinks] = await Promise.all([
      activitiesService.getByExpert(expertId),
      Promise.all([...workBlockIds].map((workBlockId) => (
        listModel<PersistedWorkBlockActivityLink>(client.models.WorkBlockActivityLink, { workBlockId: { eq: workBlockId } })
      ))).then((items) => items.flat()),
      Promise.all([...workBlockIds].map((workBlockId) => (
        listModel<PersistedWorkBlockDeliverableLink>(client.models.WorkBlockDeliverableLink, { workBlockId: { eq: workBlockId } })
      ))).then((items) => items.flat()),
    ]);

    return buildPersistedWorkBlockBundles({
      workBlocks,
      activityLinks,
      deliverableLinks,
      activities: activities.filter((activity) => monthFromDate(activity.date) === month && yearFromDate(activity.date) === year),
    });
  },
};

export const verificationsService = {
  async getAll(): Promise<VerificationData[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const filter = scope.canAccessAllExperts ? undefined : { expertId: { eq: scope.currentExpertId } };
    const data = await listModel<any>(client.models.Verification, filter);
    return filterVerificationsForScope(data.map(mapVerification), scope);
  },

  async getByExpertAndMonth(expertId: string, month: string, year: string): Promise<VerificationData | null> {
    const client = getAwsDataClient() as any;
    const allowedExpertId = await getAllowedExpertId(client, expertId);
    if (!allowedExpertId || allowedExpertId !== expertId) return null;

    const data = await listModel<any>(client.models.Verification, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data[0] ? mapVerification(data[0]) : null;
  },

  async create(verification: Omit<VerificationData, 'id'>): Promise<VerificationData> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, verification.expertId);
    const result = await client.models.Verification.create({
      expertId: verification.expertId,
      expertName: verification.expertName,
      month: verification.month,
      year: verification.year,
      status: verification.status,
      notes: verification.notes,
    });
    assertNoErrors(result, 'AWS create verification');
    return mapVerification(result.data);
  },

  async update(id: string, updates: Partial<VerificationData>): Promise<void> {
    const client = getAwsDataClient() as any;
    await assertCanAccessVerification(client, id);
    const result = await client.models.Verification.update({
      id,
      status: updates.status,
      notes: updates.notes,
    });
    assertNoErrors(result, 'AWS update verification');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    await assertCanAccessVerification(client, id);
    const result = await client.models.Verification.delete({ id });
    assertNoErrors(result, 'AWS delete verification');
  },
};

function mapVerification(item: any): VerificationData {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName ?? undefined,
    month: item.month,
    year: item.year,
    status: item.status ?? 'pending',
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const neconformitatiService = {
  async getByVerification(verificationId: string): Promise<Neconformitate[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessVerification(client, verificationId);
    const data = await listModel<any>(client.models.Neconformitate, { verificationId: { eq: verificationId } });
    return data.map(mapNeconformitate);
  },

  async getByVerifications(verificationIds: string[]): Promise<Neconformitate[]> {
    const uniqueIds = Array.from(new Set(verificationIds.filter(Boolean)));
    const batches = await Promise.all(uniqueIds.map((verificationId) => this.getByVerification(verificationId)));
    return batches.flat();
  },

  async create(neconformitate: Omit<Neconformitate, 'id' | 'createdAt'>): Promise<Neconformitate> {
    const client = getAwsDataClient() as any;
    if (neconformitate.verificationId) {
      await assertCanAccessVerification(client, neconformitate.verificationId);
    } else {
      await assertCanAccessExpert(client, neconformitate.affectedExpertId);
    }

    const result = await client.models.Neconformitate.create({
      verificationId: neconformitate.verificationId,
      type: neconformitate.type,
      severity: neconformitate.severity,
      description: neconformitate.description,
      affectedDate: neconformitate.affectedDate,
      affectedExpertId: neconformitate.affectedExpertId,
      resolved: false,
    });
    assertNoErrors(result, 'AWS create neconformitate');
    return mapNeconformitate(result.data);
  },

  async update(id: string, updates: Partial<Omit<Neconformitate, 'id' | 'createdAt'>>): Promise<Neconformitate | null> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.Neconformitate.get({ id });
    assertNoErrors(existing, 'AWS get neconformitate');
    if (!existing.data) return null;
    if (existing.data.verificationId) {
      await assertCanAccessVerification(client, existing.data.verificationId);
    } else {
      await assertCanAccessExpert(client, existing.data.affectedExpertId);
    }

    const result = await client.models.Neconformitate.update({
      id,
      type: updates.type,
      severity: updates.severity,
      description: updates.description,
      affectedDate: updates.affectedDate,
      affectedExpertId: updates.affectedExpertId,
      resolved: updates.resolved,
      resolution: updates.resolution,
    });
    assertNoErrors(result, 'AWS update neconformitate');
    return result.data ? mapNeconformitate(result.data) : null;
  },

  async resolve(id: string, resolution: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.Neconformitate.get({ id });
    assertNoErrors(existing, 'AWS get neconformitate');
    if (!existing.data) return;
    if (existing.data.verificationId) {
      await assertCanAccessVerification(client, existing.data.verificationId);
    } else {
      await assertCanAccessExpert(client, existing.data.affectedExpertId);
    }

    const result = await client.models.Neconformitate.update({
      id,
      resolved: true,
      resolution,
      resolvedAt: new Date().toISOString(),
    });
    assertNoErrors(result, 'AWS resolve neconformitate');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.Neconformitate.get({ id });
    assertNoErrors(existing, 'AWS get neconformitate');
    if (!existing.data) return;
    if (existing.data.verificationId) {
      await assertCanAccessVerification(client, existing.data.verificationId);
    } else {
      await assertCanAccessExpert(client, existing.data.affectedExpertId);
    }

    const result = await client.models.Neconformitate.delete({ id });
    assertNoErrors(result, 'AWS delete neconformitate');
  },
};

function mapNeconformitate(item: any): Neconformitate {
  return {
    id: item.id,
    verificationId: item.verificationId ?? undefined,
    type: item.type,
    severity: item.severity,
    description: item.description,
    affectedDate: item.affectedDate ?? undefined,
    affectedExpertId: item.affectedExpertId ?? undefined,
    resolved: item.resolved ?? false,
    resolution: item.resolution ?? undefined,
    resolvedAt: item.resolvedAt ?? undefined,
    createdAt: item.createdAt,
  };
}

export const pmReviewCasesService = {
  async getByMonth(month: number, year: number): Promise<PmReviewCase[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.PmReviewCase;
    if (!model) return [];

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard && !scope.canAccessAllExperts && !scope.currentExpertId) return [];

    const filter: Record<string, unknown> = {
      month: { eq: month },
      year: { eq: year },
    };
    if (!scope.canUsePmDashboard && !scope.canAccessAllExperts && scope.currentExpertId) {
      filter.expertId = { eq: scope.currentExpertId };
    }

    const data = await listModel<any>(model, filter);
    return data.map(mapPmReviewCase).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<PmReviewCase[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.PmReviewCase;
    if (!model) return [];

    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(model, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapPmReviewCase).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async create(input: PmReviewCaseCreateInput): Promise<PmReviewCase> {
    const client = getAwsDataClient() as any;
    const model = client.models.PmReviewCase;
    if (!model) {
      throw new Error('Registrul Cazuri PM nu este disponibil inca in backend. Fluxul legacy ramane disponibil.');
    }

    await assertCanAccessExpert(client, input.expertId);
    const result = await model.create(omitUndefinedFields({
      expertId: input.expertId,
      expertName: input.expertName,
      projectCode: input.projectCode,
      month: input.month,
      year: input.year,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sourceActivityId: input.sourceActivityId,
      documentId: input.documentId,
      subjectLabel: input.subjectLabel,
      title: input.title,
      description: input.description,
      priority: input.priority || 'medium',
      status: input.status || 'open',
      pmOwnerId: input.pmOwnerId,
      pmOwnerName: input.pmOwnerName,
      expertResponse: input.expertResponse,
      notificationRequested: input.notificationRequested ?? false,
      notificationSentAt: input.notificationSentAt,
      notificationSentBy: input.notificationSentBy,
      lastNotificationAt: input.lastNotificationAt,
      notificationCount: input.notificationCount ?? 0,
      resolvedBy: input.resolvedBy,
      resolvedAt: input.resolvedAt,
      resolution: input.resolution,
      createdBy: input.createdBy,
    }));
    assertNoErrors(result, 'AWS create PM review case');
    return mapPmReviewCase(result.data);
  },

  async update(id: string, updates: PmReviewCaseUpdateInput): Promise<PmReviewCase | null> {
    const client = getAwsDataClient() as any;
    const model = client.models.PmReviewCase;
    if (!model) {
      throw new Error('Registrul Cazuri PM nu este disponibil inca in backend. Fluxul legacy ramane disponibil.');
    }

    const existing = await model.get({ id });
    assertNoErrors(existing, 'AWS get PM review case');
    if (!existing.data) return null;

    await assertCanAccessExpert(client, existing.data.expertId);
    if (updates.expertId && updates.expertId !== existing.data.expertId) {
      await assertCanAccessExpert(client, updates.expertId);
    }

    const result = await model.update(omitUndefinedFields({
      id,
      expertId: updates.expertId,
      expertName: updates.expertName,
      projectCode: updates.projectCode,
      month: updates.month,
      year: updates.year,
      subjectType: updates.subjectType,
      subjectId: updates.subjectId,
      sourceActivityId: updates.sourceActivityId,
      documentId: updates.documentId,
      subjectLabel: updates.subjectLabel,
      title: updates.title,
      description: updates.description,
      priority: updates.priority,
      status: updates.status,
      pmOwnerId: updates.pmOwnerId,
      pmOwnerName: updates.pmOwnerName,
      expertResponse: updates.expertResponse,
      notificationRequested: updates.notificationRequested,
      notificationSentAt: updates.notificationSentAt,
      notificationSentBy: updates.notificationSentBy,
      lastNotificationAt: updates.lastNotificationAt,
      notificationCount: updates.notificationCount,
      resolvedBy: updates.resolvedBy,
      resolvedAt: updates.resolvedAt,
      resolution: updates.resolution,
      createdBy: updates.createdBy,
    }));
    assertNoErrors(result, 'AWS update PM review case');
    return result.data ? mapPmReviewCase(result.data) : null;
  },
};

export const notesService = {
  async getByVerification(verificationId: string): Promise<VerificationNote[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessVerification(client, verificationId);
    const data = await listModel<any>(client.models.VerificationNote, { verificationId: { eq: verificationId } });
    return data.map(mapVerificationNote);
  },

  async create(note: Omit<VerificationNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<VerificationNote> {
    const client = getAwsDataClient() as any;
    if (note.verificationId) await assertCanAccessVerification(client, note.verificationId);
    const result = await client.models.VerificationNote.create({
      verificationId: note.verificationId,
      content: note.content,
      category: note.category,
      authorId: note.authorId,
      authorName: note.authorName,
    });
    assertNoErrors(result, 'AWS create note');
    return mapVerificationNote(result.data);
  },

  async update(id: string, content: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.VerificationNote.get({ id });
    assertNoErrors(existing, 'AWS get verification note');
    if (!existing.data) return;
    if (existing.data.verificationId) await assertCanAccessVerification(client, existing.data.verificationId);
    const result = await client.models.VerificationNote.update({ id, content });
    assertNoErrors(result, 'AWS update note');
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.VerificationNote.get({ id });
    assertNoErrors(existing, 'AWS get verification note');
    if (!existing.data) return;
    if (existing.data.verificationId) await assertCanAccessVerification(client, existing.data.verificationId);
    const result = await client.models.VerificationNote.delete({ id });
    assertNoErrors(result, 'AWS delete note');
  },
};

function mapVerificationNote(item: any): VerificationNote {
  return {
    id: item.id,
    verificationId: item.verificationId ?? undefined,
    content: item.content,
    category: item.category ?? '',
    authorId: item.authorId ?? undefined,
    authorName: item.authorName ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const localSettings = {
  get(key: string) {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(`peo_setting_${key}`) ?? '';
  },
  set(key: string, value: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`peo_setting_${key}`, value);
    }
  },
};

const SUPPORT_TICKETS_LOCAL_STORAGE_KEY = 'peo-support-tickets';

function readLocalSupportTickets(): SupportTicket[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SUPPORT_TICKETS_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(mapSupportTicket) : [];
  } catch {
    return [];
  }
}

function writeLocalSupportTickets(tickets: SupportTicket[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SUPPORT_TICKETS_LOCAL_STORAGE_KEY, JSON.stringify(tickets));
}

function supportTicketFallbackId() {
  return `support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSupportTicket(input: SupportTicketCreateInput): SupportTicket {
  const createdAt = new Date().toISOString();
  return {
    id: supportTicketFallbackId(),
    ...input,
    status: input.status || 'new',
    linearLabels: input.linearLabels ?? [],
    createdAt,
    updatedAt: createdAt,
  };
}

export const supportTicketsService = {
  async getAll(): Promise<SupportTicket[]> {
    const client = getAwsDataClient() as any;
    const model = client.models.SupportTicket;

    if (!model) {
      return readLocalSupportTickets().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard && !scope.canAccessAllExperts) return [];

    const data = await listModel<any>(model);
    return data.map(mapSupportTicket).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async create(input: SupportTicketCreateInput): Promise<SupportTicket> {
    const client = getAwsDataClient() as any;
    const ticket = buildSupportTicket(input);
    const model = client.models.SupportTicket;

    if (!model) {
      const tickets = readLocalSupportTickets();
      writeLocalSupportTickets([ticket, ...tickets]);
      return ticket;
    }

    const result = await model.create(omitUndefinedFields({
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      module: ticket.module,
      severity: ticket.severity,
      status: ticket.status,
      expectedResult: ticket.expectedResult,
      actualResult: ticket.actualResult,
      reproductionSteps: ticket.reproductionSteps,
      affectsMonthlyReporting: ticket.affectsMonthlyReporting ?? false,
      canReproduce: ticket.canReproduce,
      userId: ticket.userId,
      userEmail: ticket.userEmail,
      userName: ticket.userName,
      userRole: ticket.userRole,
      currentPath: ticket.currentPath,
      selectedMonth: ticket.selectedMonth,
      selectedYear: ticket.selectedYear,
      selectedExpertId: ticket.selectedExpertId,
      relatedActivityId: ticket.relatedActivityId,
      relatedDocumentId: ticket.relatedDocumentId,
      browserInfo: ticket.browserInfo,
      appVersion: ticket.appVersion,
      environment: ticket.environment,
      screenshotFileName: ticket.screenshotFileName,
      lastClientError: ticket.lastClientError,
      lastApiError: ticket.lastApiError,
      networkStatus: ticket.networkStatus,
      linearIssueId: ticket.linearIssueId,
      linearIssueUrl: ticket.linearIssueUrl,
      linearLabels: ticket.linearLabels,
      linearPriority: ticket.linearPriority,
      createdBy: ticket.createdBy,
      updatedBy: ticket.updatedBy,
      resolvedBy: ticket.resolvedBy,
      resolvedAt: ticket.resolvedAt,
    }));
    assertNoErrors(result, 'AWS create support ticket');
    return mapSupportTicket(result.data);
  },

  async update(id: string, updates: SupportTicketUpdateInput): Promise<SupportTicket | null> {
    const client = getAwsDataClient() as any;
    const model = client.models.SupportTicket;
    const updatedAt = new Date().toISOString();

    if (!model) {
      const tickets = readLocalSupportTickets();
      const nextTickets = tickets.map((ticket) => (
        ticket.id === id ? { ...ticket, ...updates, updatedAt } : ticket
      ));
      writeLocalSupportTickets(nextTickets);
      return nextTickets.find((ticket) => ticket.id === id) ?? null;
    }

    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canUsePmDashboard && !scope.canAccessAllExperts) {
      throw new Error(ACCESS_DENIED_MESSAGE);
    }

    const result = await model.update(omitUndefinedFields({
      id,
      title: updates.title,
      description: updates.description,
      type: updates.type,
      module: updates.module,
      severity: updates.severity,
      status: updates.status,
      expectedResult: updates.expectedResult,
      actualResult: updates.actualResult,
      reproductionSteps: updates.reproductionSteps,
      affectsMonthlyReporting: updates.affectsMonthlyReporting,
      canReproduce: updates.canReproduce,
      linearIssueId: updates.linearIssueId,
      linearIssueUrl: updates.linearIssueUrl,
      linearLabels: updates.linearLabels,
      linearPriority: updates.linearPriority,
      updatedBy: updates.updatedBy,
      resolvedBy: updates.resolvedBy,
      resolvedAt: updates.resolvedAt,
    }));
    assertNoErrors(result, 'AWS update support ticket');
    return result.data ? mapSupportTicket(result.data) : null;
  },
};

export const settingsService = {
  async get(): Promise<AppSettings> {
    return {
      claudeApiKey: '',
      projectCode: localSettings.get('project_code') || '302141',
      projectTitle: localSettings.get('project_title') || 'Proiect PEO',
      contractNumber: localSettings.get('contract_number'),
      experts: [],
    };
  },

  async save(key: string, value: string): Promise<void> {
    localSettings.set(key, value);
  },

  async setApiKey(): Promise<void> {
    throw new Error('OpenAI API keys must be configured server-side with OPENAI_API_KEY.');
  },

  async getApiKey(): Promise<string> {
    return '';
  },
};

export const activityCatalogService = {
  async getAll(): Promise<ActivityCatalog[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ActivityCatalog);
    return data.map(mapActivityCatalog).sort((a, b) => `${a.saCode}-${a.activityNumber}`.localeCompare(`${b.saCode}-${b.activityNumber}`));
  },

  async getBySaCode(saCode: string): Promise<ActivityCatalog[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.ActivityCatalog, { saCode: { eq: saCode } });
    return data.map(mapActivityCatalog).sort((a, b) => (a.activityNumber ?? 0) - (b.activityNumber ?? 0));
  },

  async create(input: Omit<ActivityCatalog, 'id' | 'createdAt'>): Promise<ActivityCatalog> {
    const client = getAwsDataClient() as any;
    const result = await client.models.ActivityCatalog.create({
      category: input.category,
      saCode: input.saCode,
      gdprTemplateCode: input.gdprTemplateCode,
      serviceCategory: input.serviceCategory,
      activityNumber: input.activityNumber,
      activityName: input.activityName,
      isActive: input.isActive ?? true,
      requiresSameDayForSharedDeliverable: input.requiresSameDayForSharedDeliverable,
      description: input.description,
      objectives: input.objectives,
      serviceComponent: input.serviceComponent,
      beneficiaries: input.beneficiaries,
      expectedResults: input.expectedResults,
      deliverables: input.deliverables,
      indicators: input.indicators,
    });
    assertNoErrors(result, 'AWS create activity catalog item');
    return mapActivityCatalog(result.data);
  },

  async update(id: string, updates: Partial<Omit<ActivityCatalog, 'id' | 'createdAt'>>): Promise<ActivityCatalog> {
    const client = getAwsDataClient() as any;
    const result = await client.models.ActivityCatalog.update({
      id,
      category: updates.category,
      saCode: updates.saCode,
      gdprTemplateCode: updates.gdprTemplateCode,
      serviceCategory: updates.serviceCategory,
      activityNumber: updates.activityNumber,
      activityName: updates.activityName,
      isActive: updates.isActive,
      requiresSameDayForSharedDeliverable: updates.requiresSameDayForSharedDeliverable,
      description: updates.description,
      objectives: updates.objectives,
      serviceComponent: updates.serviceComponent,
      beneficiaries: updates.beneficiaries,
      expectedResults: updates.expectedResults,
      deliverables: updates.deliverables,
      indicators: updates.indicators,
    });
    assertNoErrors(result, 'AWS update activity catalog item');
    return mapActivityCatalog(result.data);
  },

  async updateDescription(id: string, description: string): Promise<ActivityCatalog> {
    return activityCatalogService.update(id, { description });
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const result = await client.models.ActivityCatalog.delete({ id });
    assertNoErrors(result, 'AWS delete activity catalog item');
  },
};

function mapActivityCatalog(item: any): ActivityCatalog {
  return {
    id: item.id,
    category: item.category,
    saCode: item.saCode,
    gdprTemplateCode: item.gdprTemplateCode ?? undefined,
    serviceCategory: item.serviceCategory ?? '',
    activityNumber: item.activityNumber ?? 0,
    activityName: item.activityName,
    isActive: item.isActive ?? true,
    requiresSameDayForSharedDeliverable: item.requiresSameDayForSharedDeliverable ?? undefined,
    description: item.description ?? undefined,
    objectives: item.objectives ?? undefined,
    serviceComponent: item.serviceComponent ?? undefined,
    beneficiaries: item.beneficiaries ?? undefined,
    expectedResults: item.expectedResults ?? undefined,
    deliverables: item.deliverables ?? undefined,
    indicators: item.indicators ?? undefined,
    createdAt: item.createdAt,
  };
}

function mapAiEligibilityRuleset(item: any): AiEligibilityRuleset {
  return {
    id: item.id,
    title: item.title,
    status: item.status ?? 'draft',
    version: item.version ?? 1,
    rulesJson: item.rulesJson,
    schemaVersion: item.schemaVersion ?? 'eligibility-rules-v1',
    activeFrom: item.activeFrom ?? undefined,
    publishedAt: item.publishedAt ?? undefined,
    publishedBy: item.publishedBy ?? undefined,
    createdBy: item.createdBy ?? undefined,
    updatedBy: item.updatedBy ?? undefined,
    changeReason: item.changeReason ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapAiEligibilityRuleVersion(item: any): AiEligibilityRuleVersion {
  return {
    id: item.id,
    rulesetId: item.rulesetId,
    version: item.version,
    status: item.status,
    previousRulesJson: item.previousRulesJson,
    newRulesJson: item.newRulesJson,
    changedBy: item.changedBy ?? undefined,
    changeReason: item.changeReason ?? undefined,
    publishedAt: item.publishedAt ?? undefined,
    archivedAt: item.archivedAt ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const aiEligibilityRulesetsService = {
  async getAll(): Promise<AiEligibilityRuleset[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.AiEligibilityRuleset);
    return data.map(mapAiEligibilityRuleset).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  },

  async getActive(): Promise<AiEligibilityRuleset | null> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.AiEligibilityRuleset, { status: { eq: 'active' } });
    return data.map(mapAiEligibilityRuleset).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
  },

  async create(input: Omit<AiEligibilityRuleset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AiEligibilityRuleset> {
    const client = getAwsDataClient() as any;
    const result = await client.models.AiEligibilityRuleset.create({
      title: input.title,
      status: input.status ?? 'draft',
      version: input.version ?? 1,
      rulesJson: input.rulesJson,
      schemaVersion: input.schemaVersion ?? 'eligibility-rules-v1',
      activeFrom: input.activeFrom,
      publishedAt: input.publishedAt,
      publishedBy: input.publishedBy,
      createdBy: input.createdBy,
      updatedBy: input.updatedBy,
      changeReason: input.changeReason,
    });
    assertNoErrors(result, 'AWS create AI eligibility ruleset');
    return mapAiEligibilityRuleset(result.data);
  },

  async update(id: string, updates: Partial<Omit<AiEligibilityRuleset, 'id' | 'createdAt' | 'updatedAt'>>): Promise<AiEligibilityRuleset> {
    const client = getAwsDataClient() as any;
    const result = await client.models.AiEligibilityRuleset.update({
      id,
      title: updates.title,
      status: updates.status,
      version: updates.version,
      rulesJson: updates.rulesJson,
      schemaVersion: updates.schemaVersion,
      activeFrom: updates.activeFrom,
      publishedAt: updates.publishedAt,
      publishedBy: updates.publishedBy,
      createdBy: updates.createdBy,
      updatedBy: updates.updatedBy,
      changeReason: updates.changeReason,
    });
    assertNoErrors(result, 'AWS update AI eligibility ruleset');
    return mapAiEligibilityRuleset(result.data);
  },
};

export const aiEligibilityRuleVersionsService = {
  async getByRuleset(rulesetId: string): Promise<AiEligibilityRuleVersion[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.AiEligibilityRuleVersion, { rulesetId: { eq: rulesetId } });
    return data.map(mapAiEligibilityRuleVersion).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  },

  async create(input: Omit<AiEligibilityRuleVersion, 'id' | 'createdAt' | 'updatedAt'>): Promise<AiEligibilityRuleVersion> {
    const client = getAwsDataClient() as any;
    const result = await client.models.AiEligibilityRuleVersion.create({
      rulesetId: input.rulesetId,
      version: input.version,
      status: input.status,
      previousRulesJson: input.previousRulesJson,
      newRulesJson: input.newRulesJson,
      changedBy: input.changedBy,
      changeReason: input.changeReason,
      publishedAt: input.publishedAt,
      archivedAt: input.archivedAt,
    });
    assertNoErrors(result, 'AWS create AI eligibility rule version');
    return mapAiEligibilityRuleVersion(result.data);
  },

  async update(id: string, updates: Partial<Omit<AiEligibilityRuleVersion, 'id' | 'createdAt' | 'updatedAt'>>): Promise<AiEligibilityRuleVersion> {
    const client = getAwsDataClient() as any;
    const result = await client.models.AiEligibilityRuleVersion.update({
      id,
      rulesetId: updates.rulesetId,
      version: updates.version,
      status: updates.status,
      previousRulesJson: updates.previousRulesJson,
      newRulesJson: updates.newRulesJson,
      changedBy: updates.changedBy,
      changeReason: updates.changeReason,
      publishedAt: updates.publishedAt,
      archivedAt: updates.archivedAt,
    });
    assertNoErrors(result, 'AWS update AI eligibility rule version');
    return mapAiEligibilityRuleVersion(result.data);
  },
};

export const workingGroupsService = {
  async getAll(): Promise<WorkingGroup[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.WorkingGroup, { isActive: { ne: false } });
    return data.map(mapWorkingGroup).sort((a, b) => `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`));
  },

  async getByType(type: string): Promise<WorkingGroup[]> {
    const client = getAwsDataClient() as any;
    const data = await listModel<any>(client.models.WorkingGroup, {
      type: { eq: type },
      isActive: { ne: false },
    });
    return data.map(mapWorkingGroup).sort((a, b) => a.name.localeCompare(b.name));
  },
};

function mapWorkingGroup(item: any): WorkingGroup {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    email: item.email ?? undefined,
    isActive: item.isActive ?? true,
    saCode: item.saCode ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
  };
}

export const concurrentProjectsService = {
  async getAll(): Promise<ConcurrentProject[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.ConcurrentProject, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
    });
    const projects = mergeConcurrentProjectsWithDefaults(
      data.map(mapConcurrentProject),
      buildDefaultConcurrentProjects(peoUsersAsExperts())
    );
    return filterConcurrentProjectsForScope(projects, scope);
  },

  async getByExpert(expertId: string): Promise<ConcurrentProject[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.ConcurrentProject, {
      expertId: { eq: expertId },
    });
    return mergeConcurrentProjectsWithDefaults(
      data.map(mapConcurrentProject),
      buildDefaultConcurrentProjects(peoUsersAsExperts()).filter((project) => project.expertId === expertId)
    );
  },

  async create(project: Omit<ConcurrentProject, 'id'>): Promise<ConcurrentProject> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, project.expertId);
    const result = await client.models.ConcurrentProject.create({
      expertId: project.expertId,
      expertName: project.expertName,
      projectName: project.projectName,
      projectCode: project.projectCode,
      expertProjectRole: project.expertProjectRole,
      fundingSource: project.fundingSource,
      timesheetBucket: project.timesheetBucket,
      dailyHours: project.dailyHours,
      startDate: project.startDate,
      endDate: project.endDate,
      isActive: project.isActive ?? true,
      status: project.status,
      validatedAt: project.validatedAt,
      validatedBy: project.validatedBy,
      assignmentSource: project.assignmentSource,
      expertFunction: project.expertFunction,
      deliverableOptions: project.deliverableOptions,
      notes: project.notes,
    });
    assertNoErrors(result, 'AWS create concurrent project');
    await createConcurrentProjectAudit(client, { actionType: 'concurrent_project_created', affectedExpertId: project.expertId, affectedExpertName: project.expertName, projectCode: project.projectCode, newValue: project, justification: 'Proiect paralel creat pentru verificarea dublei finanțări.' });
    return mapConcurrentProject(result.data);
  },

  async update(id: string, updates: Partial<ConcurrentProject>): Promise<ConcurrentProject> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.ConcurrentProject.get({ id });
    assertNoErrors(existing, 'AWS get concurrent project');
    if (!existing.data) throw new Error('Proiectul paralel nu a fost găsit.');
    await assertCanAccessExpert(client, existing.data.expertId);
    if (updates.expertId && updates.expertId !== existing.data.expertId) await assertCanAccessExpert(client, updates.expertId);
    const result = await client.models.ConcurrentProject.update({
      id,
      expertId: updates.expertId ?? existing.data.expertId,
      expertName: updates.expertName,
      projectName: updates.projectName,
      projectCode: updates.projectCode,
      expertProjectRole: updates.expertProjectRole,
      fundingSource: updates.fundingSource,
      timesheetBucket: updates.timesheetBucket,
      dailyHours: updates.dailyHours,
      startDate: updates.startDate,
      endDate: updates.endDate,
      isActive: updates.isActive,
      status: updates.status,
      validatedAt: updates.validatedAt,
      validatedBy: updates.validatedBy,
      assignmentSource: updates.assignmentSource,
      expertFunction: updates.expertFunction,
      deliverableOptions: updates.deliverableOptions,
      notes: updates.notes,
    });
    assertNoErrors(result, 'AWS update concurrent project');
    await createConcurrentProjectAudit(client, { actionType: updates.isActive === false ? 'concurrent_project_archived' : 'concurrent_project_updated', affectedExpertId: updates.expertId ?? existing.data.expertId, affectedExpertName: updates.expertName ?? existing.data.expertName, projectCode: updates.projectCode ?? existing.data.projectCode, oldValue: existing.data, newValue: updates, justification: updates.isActive === false ? 'Proiect paralel dezactivat/arhivat fără ștergere definitivă.' : 'Date proiect paralel actualizate.' });
    return mapConcurrentProject(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.ConcurrentProject.get({ id });
    assertNoErrors(existing, 'AWS get concurrent project');
    if (!existing.data) return;
    await assertCanAccessExpert(client, existing.data.expertId);

    const result = await client.models.ConcurrentProject.update({ id, isActive: false });
    assertNoErrors(result, 'AWS archive concurrent project');
    await createConcurrentProjectAudit(client, { actionType: 'concurrent_project_archived', affectedExpertId: existing.data.expertId, affectedExpertName: existing.data.expertName, projectCode: existing.data.projectCode, oldValue: existing.data, newValue: { isActive: false }, justification: 'Proiect paralel arhivat fără ștergere definitivă.' });
  },
};

function mapConcurrentProject(item: any): ConcurrentProject {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName ?? undefined,
    projectName: item.projectName,
    projectCode: item.projectCode ?? undefined,
    expertProjectRole: item.expertProjectRole ?? undefined,
    fundingSource: item.fundingSource ?? undefined,
    timesheetBucket: item.timesheetBucket ?? undefined,
    dailyHours: item.dailyHours,
    startDate: item.startDate,
    endDate: item.endDate ?? undefined,
    isActive: item.isActive ?? true,
    status: item.status ?? undefined,
    validatedAt: item.validatedAt ?? undefined,
    validatedBy: item.validatedBy ?? undefined,
    assignmentSource: item.assignmentSource ?? undefined,
    expertFunction: item.expertFunction ?? undefined,
    deliverableOptions: item.deliverableOptions ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const concurrentProjectTimesheetService = {
  async getAllByMonth(month: number, year: number): Promise<ConcurrentProjectTimesheetEntry[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none' || !client.models.ConcurrentProjectTimesheetEntry) return [];
    const data = await listModel<any>(client.models.ConcurrentProjectTimesheetEntry, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    return filterConcurrentProjectTimesheetEntriesForScope(data.map(mapConcurrentProjectTimesheetEntry), scope);
  },

  async getByProjectMonth(concurrentProjectId: string, month: number, year: number): Promise<ConcurrentProjectTimesheetEntry[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.ConcurrentProjectTimesheetEntry) return [];
    const project = await client.models.ConcurrentProject.get({ id: concurrentProjectId });
    assertNoErrors(project, 'AWS get concurrent project');
    if (project.data) await assertCanAccessExpert(client, project.data.expertId);
    const data = await listModel<any>(client.models.ConcurrentProjectTimesheetEntry, {
      concurrentProjectId: { eq: concurrentProjectId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapConcurrentProjectTimesheetEntry);
  },

  async upsert(entry: Omit<ConcurrentProjectTimesheetEntry, 'id'> & { id?: string }): Promise<ConcurrentProjectTimesheetEntry> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, entry.expertId);
    if (!client.models.ConcurrentProjectTimesheetEntry) throw new Error('Modelul ConcurrentProjectTimesheetEntry nu este disponibil in backend.');
    const expert = await expertsService.getById(entry.expertId);
    if (!expert) throw new Error('Expertul nu exista.');
    const [normContracts, activities, projects, monthEntries, leaveEntries] = await Promise.all([
      expertNormContractsService.getByExpert(entry.expertId),
      activitiesService.getByMonth(entry.month, entry.year),
      concurrentProjectsService.getByExpert(entry.expertId),
      concurrentProjectTimesheetService.getAllByMonth(entry.month, entry.year),
      leaveEntriesService.getByMonth(entry.month, entry.year),
    ]);
    const effectiveNormContracts = applyFinancialReferenceNorms(expert, normContracts, entry.month, entry.year);
    assertCapacity(calculateCapacitySnapshot({
      expert,
      contracts: effectiveNormContracts,
      activities: activities.filter((item) => item.expertId === entry.expertId),
      concurrentProjects: projects,
      concurrentEntries: [...monthEntries.filter((item) => item.expertId === entry.expertId && item.id !== entry.id), entry],
      leaveEntries: leaveEntries.filter((item) => item.expertId === entry.expertId),
      month: entry.month,
      year: entry.year,
    }));
    const payload = {
      concurrentProjectId: entry.concurrentProjectId,
      expertId: entry.expertId,
      date: entry.date,
      month: entry.month,
      year: entry.year,
      wp: entry.wp,
      hours: entry.hours,
      taskName: entry.taskName,
      relevantDeliverable: entry.relevantDeliverable,
      dayType: entry.dayType || 'lucratoare',
      notes: entry.notes,
      status: entry.status || 'draft',
      source: entry.source || 'expert_manual',
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy,
    };
    const result = entry.id
      ? await client.models.ConcurrentProjectTimesheetEntry.update({ id: entry.id, ...payload })
      : await client.models.ConcurrentProjectTimesheetEntry.create(payload);
    assertNoErrors(result, 'AWS upsert concurrent project timesheet entry');
    await createConcurrentProjectAudit(client, { actionType: entry.status === 'submitted' ? 'concurrent_project_timesheet_submitted' : entry.status === 'verified' ? 'concurrent_project_timesheet_verified' : 'concurrent_project_timesheet_updated', affectedExpertId: entry.expertId, projectCode: entry.concurrentProjectId, month: entry.month, year: entry.year, fieldName: entry.date, newValue: entry, justification: 'Pontaj proiect paralel creat sau actualizat.', source: entry.source?.includes('import') ? 'import' : 'manual' });
    return mapConcurrentProjectTimesheetEntry(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.ConcurrentProjectTimesheetEntry.get({ id });
    assertNoErrors(existing, 'AWS get concurrent project timesheet entry');
    if (!existing.data) return;
    await assertCanAccessExpert(client, existing.data.expertId);
    const result = await client.models.ConcurrentProjectTimesheetEntry.delete({ id });
    assertNoErrors(result, 'AWS delete concurrent project timesheet entry');
  },
};

function mapConcurrentProjectTimesheetEntry(item: any): ConcurrentProjectTimesheetEntry {
  return {
    id: item.id,
    concurrentProjectId: item.concurrentProjectId,
    expertId: item.expertId,
    date: item.date,
    month: item.month,
    year: item.year,
    wp: item.wp ?? undefined,
    hours: item.hours,
    taskName: item.taskName ?? undefined,
    relevantDeliverable: item.relevantDeliverable ?? undefined,
    dayType: item.dayType ?? 'lucratoare',
    notes: item.notes ?? undefined,
    status: item.status ?? 'draft',
    source: item.source ?? 'expert_manual',
    createdBy: item.createdBy ?? undefined,
    updatedBy: item.updatedBy ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function assertCanAccessProcurement(client: any) {
  const scope = await getCurrentDataAccessScope(client);
  if (!scope.canUsePmDashboard) {
    throw new Error('Acces interzis: modulul Achiziții este disponibil pentru PM și Admin.');
  }
  return scope;
}

function mapProcurementProject(item: any): ProcurementProject {
  const currentStatus = (item.currentStatus ?? 'PLANIFICATA') as ProcurementStatus;
  const plannedEndYear = item.plannedEndYear ?? undefined;
  const attentionLevel = (item.attentionLevel ?? getProcurementAttentionLevel({ plannedEndYear, currentStatus })) as ProcurementAttentionLevel;

  return {
    id: item.id,
    code: item.code,
    title: item.title,
    description: item.description ?? undefined,
    category: item.category ?? '',
    projectId: item.projectId ?? undefined,
    projectCode: item.projectCode ?? undefined,
    mysmisCode: item.mysmisCode ?? undefined,
    subactivity: item.subactivity ?? undefined,
    procurementType: item.procurementType,
    procedureType: item.procedureType,
    responsibleUserId: item.responsibleUserId ?? undefined,
    department: item.department ?? undefined,
    currentStatus,
    estimatedValueWithoutVat: item.estimatedValueWithoutVat ?? 0,
    estimatedVatValue: item.estimatedVatValue ?? 0,
    estimatedValueWithVat: item.estimatedValueWithVat ?? 0,
    currency: item.currency ?? 'RON',
    budgetLine: item.budgetLine ?? undefined,
    fundingSource: item.fundingSource ?? undefined,
    plannedPeriod: item.plannedPeriod ?? '',
    plannedStartYear: item.plannedStartYear ?? undefined,
    plannedEndYear,
    attentionLevel,
    attentionLabel: item.attentionLabel ?? PROCUREMENT_ATTENTION_LABELS[attentionLevel],
    sourceRowNumber: item.sourceRowNumber ?? undefined,
    sourceFileName: item.sourceFileName ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProcurementDocument(item: any): ProcurementDocument {
  return {
    id: item.id,
    procurementProjectId: item.procurementProjectId,
    documentType: item.documentType,
    title: item.title,
    visibilityType: item.visibilityType,
    stage: item.stage,
    fileUrl: item.fileUrl ?? undefined,
    status: item.status ?? undefined,
    uploadedBy: item.uploadedBy ?? undefined,
    uploadedAt: item.uploadedAt ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProcurementStatusHistory(item: any): ProcurementStatusHistory {
  return {
    id: item.id,
    procurementProjectId: item.procurementProjectId,
    oldStatus: item.oldStatus ?? undefined,
    newStatus: item.newStatus,
    changedBy: item.changedBy ?? undefined,
    changedAt: item.changedAt,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProcurementChecklist(item: any): ProcurementChecklist {
  return {
    id: item.id,
    procurementProjectId: item.procurementProjectId,
    stage: item.stage,
    itemKey: item.itemKey,
    itemLabel: item.itemLabel,
    isRequired: item.isRequired ?? true,
    isCompleted: item.isCompleted ?? false,
    completedBy: item.completedBy ?? undefined,
    completedAt: item.completedAt ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const mapProcurementLaunch = (item: any): ProcurementLaunch => ({ ...item });
const mapProcurementSupplier = (item: any): ProcurementSupplier => ({ ...item });
const mapProcurementOffer = (item: any): ProcurementOffer => ({ ...item });
const mapProcurementEvaluation = (item: any): ProcurementEvaluation => ({ ...item });
const mapProcurementContract = (item: any): ProcurementContract => ({ ...item });
const mapProcurementDeliverable = (item: any): ProcurementDeliverable => ({ ...item });
const mapProcurementReception = (item: any): ProcurementReception => ({ ...item });
const mapProcurementInvoice = (item: any): ProcurementInvoice => ({ ...item });

function sortProcurementProjects(projects: ProcurementProject[]) {
  return [...projects].sort((a, b) => (a.sourceRowNumber ?? 9999) - (b.sourceRowNumber ?? 9999) || a.title.localeCompare(b.title));
}

export const procurementProjectsService = {
  async getAll(): Promise<ProcurementProject[]> {
    const client = getAwsDataClient();
    await assertCanAccessProcurement(client);
    if (!client.models.ProcurementProject) return getContractedProcurementProjects();
    const data = await listModel<any>(client.models.ProcurementProject);
    const projects = data.map(mapProcurementProject);
    return projects.length ? sortProcurementProjects(projects) : getContractedProcurementProjects();
  },

  async getById(id: string): Promise<ProcurementProject | null> {
    const client = getAwsDataClient();
    await assertCanAccessProcurement(client);
    if (!client.models.ProcurementProject) {
      return getContractedProcurementProjects().find((project) => project.id === id) ?? null;
    }
    const result = await client.models.ProcurementProject.get({ id });
    assertNoErrors(result, 'AWS get procurement project');
    return result.data ? mapProcurementProject(result.data) : null;
  },

  async create(project: Omit<ProcurementProject, 'id'>): Promise<ProcurementProject> {
    const client = getAwsDataClient();
    await assertCanAccessProcurement(client);
    const result = await client.models.ProcurementProject.create(project);
    assertNoErrors(result, 'AWS create procurement project');
    const created = mapProcurementProject(result.data);
    if (client.models.ProcurementStatusHistory) {
      await client.models.ProcurementStatusHistory.create(createProcurementStatusHistoryEntry({
        procurementProjectId: created.id,
        newStatus: created.currentStatus,
        notes: 'Proiect de achiziție creat.',
      }));
    }
    return created;
  },

  async update(id: string, updates: Partial<ProcurementProject>): Promise<ProcurementProject> {
    const client = getAwsDataClient();
    await assertCanAccessProcurement(client);
    const existing = await client.models.ProcurementProject.get({ id });
    assertNoErrors(existing, 'AWS get procurement project before update');
    const result = await client.models.ProcurementProject.update({ id, ...updates });
    assertNoErrors(result, 'AWS update procurement project');
    const updated = mapProcurementProject(result.data);

    if (updates.currentStatus && existing.data?.currentStatus !== updates.currentStatus && client.models.ProcurementStatusHistory) {
      await client.models.ProcurementStatusHistory.create(createProcurementStatusHistoryEntry({
        procurementProjectId: id,
        oldStatus: existing.data?.currentStatus ? existing.data.currentStatus as ProcurementStatus : undefined,
        newStatus: updates.currentStatus,
        notes: 'Status actualizat în modulul Achiziții.',
      }));
    }

    return updated;
  },
};

function buildProcurementChildService<T>(modelName: string, mapper: (item: any) => T) {
  return {
    async getAll(): Promise<T[]> {
      const client = getAwsDataClient();
      await assertCanAccessProcurement(client);
      const model = (client.models as Record<string, any>)[modelName];
      if (!model) return [];
      const data = await listModel<any>(model);
      return data.map(mapper);
    },
    async getByProject(procurementProjectId: string): Promise<T[]> {
      const client = getAwsDataClient();
      await assertCanAccessProcurement(client);
      const model = (client.models as Record<string, any>)[modelName];
      if (!model) return [];
      const data = await listModel<any>(model, { procurementProjectId: { eq: procurementProjectId } });
      return data.map(mapper);
    },
    async create(input: Omit<T, 'id'>): Promise<T> {
      const client = getAwsDataClient();
      await assertCanAccessProcurement(client);
      const result = await (client.models as Record<string, any>)[modelName].create(input);
      assertNoErrors(result, `AWS create ${modelName}`);
      return mapper(result.data);
    },
    async update(id: string, updates: Partial<T>): Promise<T> {
      const client = getAwsDataClient();
      await assertCanAccessProcurement(client);
      const result = await (client.models as Record<string, any>)[modelName].update({ id, ...updates });
      assertNoErrors(result, `AWS update ${modelName}`);
      return mapper(result.data);
    },
  };
}

export const procurementDocumentsService = buildProcurementChildService<ProcurementDocument>('ProcurementDocument', mapProcurementDocument);
export const procurementLaunchesService = buildProcurementChildService<ProcurementLaunch>('ProcurementLaunch', mapProcurementLaunch);
export const procurementSuppliersService = buildProcurementChildService<ProcurementSupplier>('ProcurementSupplier', mapProcurementSupplier);
export const procurementOffersService = buildProcurementChildService<ProcurementOffer>('ProcurementOffer', mapProcurementOffer);
export const procurementEvaluationsService = buildProcurementChildService<ProcurementEvaluation>('ProcurementEvaluation', mapProcurementEvaluation);
export const procurementContractsService = buildProcurementChildService<ProcurementContract>('ProcurementContract', mapProcurementContract);
export const procurementDeliverablesService = buildProcurementChildService<ProcurementDeliverable>('ProcurementDeliverable', mapProcurementDeliverable);
export const procurementReceptionsService = buildProcurementChildService<ProcurementReception>('ProcurementReception', mapProcurementReception);
export const procurementInvoicesService = buildProcurementChildService<ProcurementInvoice>('ProcurementInvoice', mapProcurementInvoice);
export const procurementStatusHistoryService = buildProcurementChildService<ProcurementStatusHistory>('ProcurementStatusHistory', mapProcurementStatusHistory);
export const procurementChecklistsService = buildProcurementChildService<ProcurementChecklist>('ProcurementChecklist', mapProcurementChecklist);

export const reportStatusService = {
  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<ReportStatus | null> {
    const client = getAwsDataClient() as any;
    const allowedExpertId = await getAllowedExpertId(client, expertId);
    if (!allowedExpertId || allowedExpertId !== expertId) return null;

    const data = await listModel<any>(client.models.ReportStatus, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data[0] ? mapReportStatus(data[0]) : null;
  },

  async getAllByMonth(month: number, year: number): Promise<ReportStatus[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.ReportStatus, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    return filterReportStatusesForScope(data.map(mapReportStatus), scope);
  },

  async upsert(status: Omit<ReportStatus, 'id'>): Promise<ReportStatus> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, status.expertId);
    if (status.status === 'sent' || status.status === 'approved') {
      const [expert, contracts, activities, projects, entries, leaves] = await Promise.all([
        expertsService.getById(status.expertId),
        expertNormContractsService.getByExpert(status.expertId),
        activitiesService.getByMonth(status.month, status.year),
        concurrentProjectsService.getByExpert(status.expertId),
        concurrentProjectTimesheetService.getAllByMonth(status.month, status.year),
        leaveEntriesService.getByMonth(status.month, status.year),
      ]);
      if (!expert) throw new Error('Expertul nu exista.');
      const expertLeaves = leaves.filter((leave) => leave.expertId === status.expertId);
      if (expertLeaves.some((leave) => leave.status !== 'VALIDATED' && leave.status !== 'REJECTED')) {
        throw new Error('Pontajul nu poate fi trimis sau aprobat cat timp exista CO nevalidat.');
      }
      const effectiveNormContracts = applyFinancialReferenceNorms(expert, contracts, status.month, status.year);
      assertCapacity(calculateCapacitySnapshot({
        expert,
        contracts: effectiveNormContracts,
        activities: activities.filter((activity) => activity.expertId === status.expertId),
        concurrentProjects: projects,
        concurrentEntries: entries.filter((entry) => entry.expertId === status.expertId),
        leaveEntries: expertLeaves,
        month: status.month,
        year: status.year,
      }));
    }
    const existing = await reportStatusService.getByExpertAndMonth(status.expertId, status.month, status.year);
    const payload = {
      expertId: status.expertId,
      year: status.year,
      month: status.month,
      status: status.status,
      sentDate: status.sentDate,
      approvalDate: status.approvalDate,
      expertAccessApproved: status.expertAccessApproved ?? false,
      expertAccessApprovedAt: status.expertAccessApprovedAt,
      pmNotes: status.pmNotes,
    };
    const result = existing
      ? await client.models.ReportStatus.update({ id: existing.id, ...payload })
      : await client.models.ReportStatus.create(payload);
    assertNoErrors(result, 'AWS upsert report status');
    return mapReportStatus(result.data);
  },
};

function mapReportStatus(item: any): ReportStatus {
  return {
    id: item.id,
    expertId: item.expertId,
    year: item.year,
    month: item.month,
    status: item.status,
    sentDate: item.sentDate ?? undefined,
    approvalDate: item.approvalDate ?? undefined,
    expertAccessApproved: item.expertAccessApproved ?? false,
    expertAccessApprovedAt: item.expertAccessApprovedAt ?? undefined,
    pmNotes: item.pmNotes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapMonthAccessRequest(item: any): MonthAccessRequest {
  return {
    id: item.id,
    expertId: item.expertId,
    expertName: item.expertName ?? undefined,
    year: item.year,
    month: item.month,
    status: item.status ?? 'pending',
    requestedAt: item.requestedAt ?? undefined,
    requestedBy: item.requestedBy ?? undefined,
    resolvedAt: item.resolvedAt ?? undefined,
    resolvedBy: item.resolvedBy ?? undefined,
    closedAt: item.closedAt ?? undefined,
    closedBy: item.closedBy ?? undefined,
    notes: item.notes ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function filterMonthAccessRequestsForScope(requests: MonthAccessRequest[], scope: DataAccessScope) {
  if (scope.accessLevel === 'none') return [];
  if (scope.canAccessAllExperts) return requests;
  return scope.currentExpertId ? requests.filter((request) => request.expertId === scope.currentExpertId) : [];
}

export const monthAccessRequestsService = {
  async getByMonth(month: number, year: number): Promise<MonthAccessRequest[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];

    const data = await listModel<any>(client.models.MonthAccessRequest, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });

    return filterMonthAccessRequestsForScope(data.map(mapMonthAccessRequest), scope);
  },

  async getByMonths(monthRefs: Array<{ month: number; year: number }>): Promise<MonthAccessRequest[]> {
    const batches = await Promise.all(monthRefs.map((ref) => monthAccessRequestsService.getByMonth(ref.month, ref.year)));
    const seen = new Set<string>();
    return batches.flat().filter((request) => {
      if (seen.has(request.id)) return false;
      seen.add(request.id);
      return true;
    });
  },

  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<MonthAccessRequest | null> {
    const client = getAwsDataClient() as any;
    const allowedExpertId = await getAllowedExpertId(client, expertId);
    if (!allowedExpertId || allowedExpertId !== expertId) return null;

    const data = await listModel<any>(client.models.MonthAccessRequest, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    const requests = data.map(mapMonthAccessRequest).sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
    return requests[0] ?? null;
  },

  async request(input: {
    expertId: string;
    expertName?: string;
    month: number;
    year: number;
    requestedBy?: string;
    notes?: string;
  }): Promise<MonthAccessRequest> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, input.expertId);

    const existing = await monthAccessRequestsService.getByExpertAndMonth(input.expertId, input.month, input.year);
    const payload = {
      expertId: input.expertId,
      expertName: input.expertName,
      month: input.month,
      year: input.year,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requestedBy: input.requestedBy,
      resolvedAt: undefined,
      resolvedBy: undefined,
      closedAt: undefined,
      closedBy: undefined,
      notes: input.notes,
    };

    const result = existing
      ? await client.models.MonthAccessRequest.update({ id: existing.id, ...payload })
      : await client.models.MonthAccessRequest.create(payload);
    assertNoErrors(result, 'AWS upsert month access request');
    return mapMonthAccessRequest(result.data);
  },

  async update(id: string, updates: Partial<Omit<MonthAccessRequest, 'id' | 'createdAt' | 'updatedAt'>>): Promise<MonthAccessRequest> {
    const client = getAwsDataClient() as any;
    const result = await client.models.MonthAccessRequest.update({ id, ...updates });
    assertNoErrors(result, 'AWS update month access request');
    const updated = mapMonthAccessRequest(result.data);

    if (updates.status === 'approved' || updates.status === 'rejected' || updates.status === 'closed') {
      const existingStatus = await reportStatusService.getByExpertAndMonth(updated.expertId, updated.month, updated.year);
      await reportStatusService.upsert({
        expertId: updated.expertId,
        year: updated.year,
        month: updated.month,
        status: existingStatus?.status ?? 'draft',
        sentDate: existingStatus?.sentDate,
        approvalDate: existingStatus?.approvalDate,
        expertAccessApproved: updates.status === 'approved',
        expertAccessApprovedAt: updates.status === 'approved' ? (updates.resolvedAt || new Date().toISOString()) : undefined,
        pmNotes: existingStatus?.pmNotes,
      });
    }

    return updated;
  },
};

async function assertCanManageHistoricalImport(client: any) {
  const scope = await getCurrentDataAccessScope(client);
  if (!scope.canUsePmDashboard) {
    throw new Error('Acces interzis: doar PM sau admin poate gestiona importul istoric.');
  }
  return scope;
}

export const historicalImportService = {
  async getBatches(): Promise<HistoricalImportBatch[]> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const data = await listModel<any>(client.models.HistoricalImportBatch);
    return data.map(mapHistoricalImportBatch).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  },

  async createBatch(batch: Omit<HistoricalImportBatch, 'id' | 'createdAt' | 'updatedAt'>): Promise<HistoricalImportBatch> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.HistoricalImportBatch.create(batch);
    assertNoErrors(result, 'AWS create historical import batch');
    return mapHistoricalImportBatch(result.data);
  },

  async getReports(filters?: { expertId?: string; month?: number; year?: number; status?: string }): Promise<MonthlyExpertReport[]> {
    const client = getAwsDataClient() as any;
    const scope = await assertCanManageHistoricalImport(client);
    const filter: Record<string, unknown> = {
      ...(filters?.expertId ? { expertId: { eq: filters.expertId } } : {}),
      ...(filters?.year ? { reportingYear: { eq: filters.year } } : {}),
      ...(filters?.month ? { reportingMonth: { eq: filters.month } } : {}),
      ...(filters?.status ? { status: { eq: filters.status } } : {}),
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
    };
    const data = await listModel<any>(client.models.MonthlyExpertReport, filter);
    return data
      .map(mapMonthlyExpertReport)
      .sort((a, b) => b.reportingYear - a.reportingYear || b.reportingMonth - a.reportingMonth || a.expertName.localeCompare(b.expertName));
  },

  async createReport(report: Omit<MonthlyExpertReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonthlyExpertReport> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.MonthlyExpertReport.create(report);
    assertNoErrors(result, 'AWS create monthly expert report');
    return mapMonthlyExpertReport(result.data);
  },

  async updateReport(id: string, updates: Partial<MonthlyExpertReport>): Promise<MonthlyExpertReport> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.MonthlyExpertReport.update({ id, ...updates });
    assertNoErrors(result, 'AWS update monthly expert report');
    return mapMonthlyExpertReport(result.data);
  },

  async getFiles(monthlyReportId?: string): Promise<UploadedReportingFile[]> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const data = await listModel<any>(
      client.models.UploadedReportingFile,
      monthlyReportId ? { monthlyReportId: { eq: monthlyReportId } } : undefined
    );
    return data.map(mapUploadedReportingFile).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  },

  async createFile(file: Omit<UploadedReportingFile, 'id' | 'createdAt' | 'updatedAt'>): Promise<UploadedReportingFile> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.UploadedReportingFile.create(file);
    assertNoErrors(result, 'AWS create uploaded reporting file');
    return mapUploadedReportingFile(result.data);
  },

  async getActivityItems(monthlyReportId: string): Promise<MonthlyActivityItem[]> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const data = await listModel<any>(client.models.MonthlyActivityItem, { monthlyReportId: { eq: monthlyReportId } });
    return data.map(mapMonthlyActivityItem);
  },

  async createActivityItem(item: Omit<MonthlyActivityItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonthlyActivityItem> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.MonthlyActivityItem.create(item);
    assertNoErrors(result, 'AWS create monthly activity item');
    return mapMonthlyActivityItem(result.data);
  },

  async getTimesheetDays(monthlyReportId: string): Promise<HistoricalTimesheetDayEntry[]> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const data = await listModel<any>(client.models.HistoricalTimesheetDayEntry, { monthlyReportId: { eq: monthlyReportId } });
    return data.map(mapHistoricalTimesheetDayEntry).sort((a, b) => a.date.localeCompare(b.date));
  },

  async createTimesheetDay(day: Omit<HistoricalTimesheetDayEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<HistoricalTimesheetDayEntry> {
    const client = getAwsDataClient() as any;
    await assertCanManageHistoricalImport(client);
    const result = await client.models.HistoricalTimesheetDayEntry.create(day);
    assertNoErrors(result, 'AWS create historical timesheet day');
    return mapHistoricalTimesheetDayEntry(result.data);
  },
};

export const grupTintaService = {
  async getAllByMonth(month: number, year: number): Promise<GrupTintaEntry[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.GrupTintaEntry, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    return filterGrupTintaForScope(data.map(mapGrupTinta), scope);
  },

  async getByExpertAndMonth(expertId: string, month: number, year: number): Promise<GrupTintaEntry[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.GrupTintaEntry, {
      expertId: { eq: expertId },
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapGrupTinta);
  },

  async create(entry: Omit<GrupTintaEntry, 'id'>): Promise<GrupTintaEntry> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, entry.expertId);
    const result = await client.models.GrupTintaEntry.create({
      expertId: entry.expertId,
      activityId: entry.activityId,
      date: entry.date,
      year: entry.year,
      month: entry.month,
      activityType: entry.activityType,
      organizations: entry.organizations ?? [],
      participantsCount: entry.participantsCount ?? 0,
      notes: entry.notes,
    });
    assertNoErrors(result, 'AWS create grup tinta entry');
    return mapGrupTinta(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.GrupTintaEntry.get({ id });
    assertNoErrors(existing, 'AWS get grup tinta entry');
    if (!existing.data) return;
    await assertCanAccessExpert(client, existing.data.expertId);

    const result = await client.models.GrupTintaEntry.delete({ id });
    assertNoErrors(result, 'AWS delete grup tinta entry');
  },

  async getMonthlyStats(month: number, year: number): Promise<{ expertId: string; totalParticipants: number; sessionsCount: number }[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    const data = await listModel<any>(client.models.GrupTintaEntry, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    const stats = new Map<string, { totalParticipants: number; sessionsCount: number }>();
    data.forEach((entry) => {
      const existing = stats.get(entry.expertId) ?? { totalParticipants: 0, sessionsCount: 0 };
      existing.totalParticipants += entry.participantsCount ?? 0;
      existing.sessionsCount += 1;
      stats.set(entry.expertId, existing);
    });
    return Array.from(stats.entries()).map(([expertId, stat]) => ({ expertId, ...stat }));
  },
};

function buildGTRegistryService<T>(modelName: string, mapper: (item: any) => T, sortFn?: (a: T, b: T) => number) {
  return {
    async getAll(): Promise<T[]> {
      const client = getAwsDataClient() as any;
      const access = await getGTRegistryAccess(client);
      if (!access.canRead) return [];
      const model = client.models[modelName];
      if (!model) return [];
      const data = await listModel<any>(model);
      const records = data.map(mapper);
      return sortFn ? records.sort(sortFn) : records;
    },

    async create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
      const client = getAwsDataClient() as any;
      const access = await getGTRegistryAccess(client);
      if (!access.canManage) throw new Error(ACCESS_DENIED_MESSAGE);
      const model = client.models[modelName];
      if (!model) throw new Error(`Modelul ${modelName} nu este disponibil in schema curenta.`);
      try {
        const result = await model.create(input);
        assertNoErrors(result, `AWS create ${modelName}`);
        return mapper(result.data);
      } catch (error) {
        if (!isGTRegistryAuthError(error)) throw error;
        const data = await callGTRegistryWrite<any>(modelName, 'create', { input: input as Record<string, unknown> });
        return mapper(data);
      }
    },

    async update(id: string, updates: Partial<T>): Promise<T> {
      const client = getAwsDataClient() as any;
      const access = await getGTRegistryAccess(client);
      if (!access.canManage) throw new Error(ACCESS_DENIED_MESSAGE);
      const model = client.models[modelName];
      if (!model) throw new Error(`Modelul ${modelName} nu este disponibil in schema curenta.`);
      try {
        const result = await model.update({ id, ...updates });
        assertNoErrors(result, `AWS update ${modelName}`);
        return mapper(result.data);
      } catch (error) {
        if (!isGTRegistryAuthError(error)) throw error;
        const data = await callGTRegistryWrite<any>(modelName, 'update', {
          id,
          input: updates as Record<string, unknown>,
        });
        return mapper(data);
      }
    },

    async delete(id: string): Promise<void> {
      const client = getAwsDataClient() as any;
      const access = await getGTRegistryAccess(client);
      if (!access.canManage) throw new Error(ACCESS_DENIED_MESSAGE);
      const model = client.models[modelName];
      if (!model) return;
      try {
        const result = await model.delete({ id });
        assertNoErrors(result, `AWS delete ${modelName}`);
      } catch (error) {
        if (!isGTRegistryAuthError(error)) throw error;
        await callGTRegistryWrite(modelName, 'delete', { id });
      }
    },
  };
}

export const gtOrganizationsService = buildGTRegistryService<Organization>(
  'Organization',
  mapOrganization,
  (a, b) => String(a.kind).localeCompare(String(b.kind)) || a.name.localeCompare(b.name),
);
export const gtEntitiesService = buildGTRegistryService<GTEntity>(
  'GTEntity',
  mapGTEntity,
  (a, b) => a.status.localeCompare(b.status) || String(a.organizationName ?? '').localeCompare(String(b.organizationName ?? '')),
);
export const gtPersonsService = buildGTRegistryService<GTPerson>(
  'GTPerson',
  mapGTPerson,
  (a, b) => a.nume.localeCompare(b.nume) || a.prenume.localeCompare(b.prenume),
);
export const gtDocumentsService = buildGTRegistryService<GTDocument>(
  'GTDocument',
  mapGTDocument,
  (a, b) => a.status.localeCompare(b.status) || a.documentType.localeCompare(b.documentType),
);
export const gtMonitoringRecordsService = buildGTRegistryService<GTMonitoringRecord>(
  'GTMonitoringRecord',
  mapGTMonitoringRecord,
  (a, b) => b.date.localeCompare(a.date),
);
export const gtImportBatchesService = buildGTRegistryService<GTImportBatch>(
  'GTImportBatch',
  mapGTImportBatch,
  (a, b) => b.importedAt.localeCompare(a.importedAt),
);

export const businessHubEntityDirectoryService = {
  async getAll(): Promise<BusinessHubEntityDirectoryEntry[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none') return [];
    if (!client.models.BusinessHubEntityDirectory) return [];
    const data = await listModel<any>(client.models.BusinessHubEntityDirectory);
    return data
      .map(mapBusinessHubEntityDirectoryEntry)
      .sort((a, b) =>
        String(a.directoryType).localeCompare(String(b.directoryType))
        || a.acronym.localeCompare(b.acronym),
      );
  },

  async create(entry: Omit<BusinessHubEntityDirectoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<BusinessHubEntityDirectoryEntry> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!client.models.BusinessHubEntityDirectory) throw new Error('Directorul Business Hub nu este disponibil in schema curenta.');

    const result = await client.models.BusinessHubEntityDirectory.create({
      directoryType: entry.directoryType,
      acronym: entry.acronym,
      legalName: entry.legalName,
      displayName: entry.displayName,
      registeredAddress: entry.registeredAddress,
      cuiOrCif: entry.cuiOrCif,
      phone: entry.phone,
      email: entry.email,
      legalRepresentativeName: entry.legalRepresentativeName,
      legalRepresentativeRole: entry.legalRepresentativeRole,
      designatedPersonName: entry.designatedPersonName,
      status: entry.status ?? 'active',
      source: entry.source,
    });
    assertNoErrors(result, 'AWS create business hub entity directory entry');
    return mapBusinessHubEntityDirectoryEntry(result.data);
  },

  async update(id: string, updates: Partial<BusinessHubEntityDirectoryEntry>): Promise<BusinessHubEntityDirectoryEntry> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!client.models.BusinessHubEntityDirectory) throw new Error('Directorul Business Hub nu este disponibil in schema curenta.');

    const result = await client.models.BusinessHubEntityDirectory.update({
      id,
      directoryType: updates.directoryType,
      acronym: updates.acronym,
      legalName: updates.legalName,
      displayName: updates.displayName,
      registeredAddress: updates.registeredAddress,
      cuiOrCif: updates.cuiOrCif,
      phone: updates.phone,
      email: updates.email,
      legalRepresentativeName: updates.legalRepresentativeName,
      legalRepresentativeRole: updates.legalRepresentativeRole,
      designatedPersonName: updates.designatedPersonName,
      status: updates.status,
      source: updates.source,
    });
    assertNoErrors(result, 'AWS update business hub entity directory entry');
    return mapBusinessHubEntityDirectoryEntry(result.data);
  },

  async delete(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!client.models.BusinessHubEntityDirectory) return;
    const result = await client.models.BusinessHubEntityDirectory.delete({ id });
    assertNoErrors(result, 'AWS delete business hub entity directory entry');
  },
};
function mapExpertNormContract(data: any): ExpertNormContract {
  return {
    id: data.id,
    expertId: data.expertId,
    validFrom: data.validFrom,
    validTo: data.validTo ?? undefined,
    peoNormUnit: data.peoNormUnit,
    peoNormValue: Number(data.peoNormValue) || 0,
    peoDailyCap: Number(data.peoDailyCap) || 0,
    cimNormUnit: data.cimNormUnit,
    cimNormValue: Number(data.cimNormValue) || 0,
    cimDailyCap: Number(data.cimDailyCap) || 8,
    leaveHoursPerDay: Number(data.leaveHoursPerDay) || 8,
    status: data.status ?? 'ACTIVE',
    justification: data.justification ?? '',
    createdBy: data.createdBy ?? undefined,
    updatedBy: data.updatedBy ?? undefined,
    createdAt: data.createdAt ?? undefined,
    updatedAt: data.updatedAt ?? undefined,
  };
}

function mapFinancialPersonLink(data: any): FinancialPersonLink {
  return {
    id: data.id,
    financialPersonName: data.financialPersonName,
    financialPersonKey: data.financialPersonKey,
    expertId: data.expertId ?? undefined,
    status: data.status ?? 'suggested',
    confidence: Number(data.confidence) || 0,
    source: data.source ?? 'automatic',
    createdBy: data.createdBy ?? undefined,
    updatedBy: data.updatedBy ?? undefined,
    createdAt: data.createdAt ?? undefined,
    updatedAt: data.updatedAt ?? undefined,
  };
}

function mapLeaveEntry(data: any): LeaveEntry {
  return {
    id: data.id,
    owner: data.owner ?? undefined,
    expertId: data.expertId,
    date: data.date,
    month: Number(data.month),
    year: Number(data.year),
    type: data.type,
    totalHours: Number(data.totalHours) || 0,
    peoHours: Number(data.peoHours) || 0,
    cpcHours: Number(data.cpcHours) || 0,
    source: data.source,
    status: data.status ?? 'DRAFT',
    lockedForExpert: Boolean(data.lockedForExpert),
    normContractId: data.normContractId ?? undefined,
    automaticSplit: data.automaticSplit !== false,
    peoNormUnit: data.peoNormUnit ?? undefined,
    peoNormValue: data.peoNormValue == null ? undefined : Number(data.peoNormValue),
    peoDailyCap: data.peoDailyCap == null ? undefined : Number(data.peoDailyCap),
    cimNormUnit: data.cimNormUnit ?? undefined,
    cimNormValue: data.cimNormValue == null ? undefined : Number(data.cimNormValue),
    cimDailyCap: data.cimDailyCap == null ? undefined : Number(data.cimDailyCap),
    justification: data.justification ?? undefined,
    rejectionReason: data.rejectionReason ?? undefined,
    createdBy: data.createdBy ?? undefined,
    validatedBy: data.validatedBy ?? undefined,
    validatedAt: data.validatedAt ?? undefined,
    createdAt: data.createdAt ?? undefined,
    updatedAt: data.updatedAt ?? undefined,
  };
}

export const expertNormContractsService = {
  async getAll(): Promise<ExpertNormContract[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.ExpertNormContract) return [];
    return (await listModel<any>(client.models.ExpertNormContract)).map(mapExpertNormContract);
  },

  async getByExpert(expertId: string): Promise<ExpertNormContract[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, expertId);
    if (!client.models.ExpertNormContract) return [];
    return (await listModel<any>(client.models.ExpertNormContract, { expertId: { eq: expertId } }))
      .map(mapExpertNormContract)
      .sort((left, right) => left.validFrom.localeCompare(right.validFrom));
  },

  async create(contract: Omit<ExpertNormContract, 'id'> & { id?: string }): Promise<ExpertNormContract> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if ((contract.peoNormUnit === 'HOURS_PER_MONTH' || contract.cimNormUnit === 'HOURS_PER_MONTH') && !contract.validFrom.endsWith('-01')) {
      throw new Error('O norma lunara poate incepe numai in prima zi a lunii.');
    }
    const result = await client.models.ExpertNormContract.create(contract);
    assertNoErrors(result, 'AWS create expert norm contract');
    return mapExpertNormContract(result.data);
  },

  async update(id: string, updates: Partial<ExpertNormContract>): Promise<ExpertNormContract> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    const result = await client.models.ExpertNormContract.update({ id, ...updates });
    assertNoErrors(result, 'AWS update expert norm contract');
    return mapExpertNormContract(result.data);
  },
};

export const financialPersonLinksService = {
  async getAll(): Promise<FinancialPersonLink[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.FinancialPersonLink) return [];
    return (await listModel<any>(client.models.FinancialPersonLink)).map(mapFinancialPersonLink);
  },

  async create(link: Omit<FinancialPersonLink, 'id'> & { id?: string }): Promise<FinancialPersonLink> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!client.models.FinancialPersonLink) throw new Error('Modelul FinancialPersonLink nu este disponibil in backend.');
    const result = await client.models.FinancialPersonLink.create(link);
    assertNoErrors(result, 'AWS create financial person link');
    return mapFinancialPersonLink(result.data);
  },

  async update(id: string, updates: Partial<FinancialPersonLink>): Promise<FinancialPersonLink> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!client.models.FinancialPersonLink) throw new Error('Modelul FinancialPersonLink nu este disponibil in backend.');
    const result = await client.models.FinancialPersonLink.update({ id, ...updates });
    assertNoErrors(result, 'AWS update financial person link');
    return mapFinancialPersonLink(result.data);
  },
};

export const leaveEntriesService = {
  async getByMonth(month: number, year: number): Promise<LeaveEntry[]> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (scope.accessLevel === 'none' || !client.models.LeaveEntry) return [];
    const data = await listModel<any>(client.models.LeaveEntry, {
      ...(scope.canAccessAllExperts ? {} : { expertId: { eq: scope.currentExpertId } }),
      month: { eq: month },
      year: { eq: year },
    });
    return data.map(mapLeaveEntry);
  },

  async createAutomatic(args: {
    expertId: string;
    dates: string[];
    source: 'EXPERT' | 'FINANCIAL';
    createdBy?: string;
  }): Promise<LeaveEntry[]> {
    const client = getAwsDataClient() as any;
    await assertCanAccessExpert(client, args.expertId);
    if (args.source === 'FINANCIAL') {
      const scope = await getCurrentDataAccessScope(client);
      if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    }
    const expert = await expertsService.getById(args.expertId);
    if (!expert) throw new Error('Expertul nu exista.');
    const month = Number(args.dates[0]?.slice(5, 7)) - 1;
    const year = Number(args.dates[0]?.slice(0, 4));
    if (args.dates.some((date) => Number(date.slice(5, 7)) - 1 !== month || Number(date.slice(0, 4)) !== year)) {
      throw new Error('CO-urile dintr-o operatiune trebuie sa fie in aceeasi luna.');
    }
    const [contracts, activities, projects, entries, leaves] = await Promise.all([
      expertNormContractsService.getByExpert(args.expertId),
      activitiesService.getByMonth(month, year),
      concurrentProjectsService.getByExpert(args.expertId),
      concurrentProjectTimesheetService.getAllByMonth(month, year),
      leaveEntriesService.getByMonth(month, year),
    ]);
    const effectiveNormContracts = applyFinancialReferenceNorms(expert, contracts, month, year);
    const allocations = allocateLeaveEntries({
      expert,
      contracts: effectiveNormContracts,
      activities: activities.filter((item) => item.expertId === args.expertId),
      concurrentProjects: projects,
      concurrentEntries: entries.filter((item) => item.expertId === args.expertId),
      leaveEntries: leaves.filter((item) => item.expertId === args.expertId),
      month,
      year,
      dates: args.dates,
      source: args.source,
      createdBy: args.createdBy,
    });
    const saved: LeaveEntry[] = [];
    for (const allocation of allocations) {
      const result = await client.models.LeaveEntry.create(allocation);
      assertNoErrors(result, 'AWS create leave entry');
      saved.push(mapLeaveEntry(result.data));
    }
    return saved;
  },

  async createManual(entry: Omit<LeaveEntry, 'id'> & { id?: string }): Promise<LeaveEntry> {
    const client = getAwsDataClient() as any;
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    if (!entry.justification?.trim()) throw new Error('Justificarea este obligatorie pentru repartizarea manuala.');
    if (entry.totalHours !== entry.peoHours + entry.cpcHours) throw new Error('CO total trebuie sa fie egal cu PEO + CPC.');
    const expert = await expertsService.getById(entry.expertId);
    if (!expert) throw new Error('Expertul nu exista.');
    const [contracts, activities, projects, entries, leaves] = await Promise.all([
      expertNormContractsService.getByExpert(entry.expertId),
      activitiesService.getByMonth(entry.month, entry.year),
      concurrentProjectsService.getByExpert(entry.expertId),
      concurrentProjectTimesheetService.getAllByMonth(entry.month, entry.year),
      leaveEntriesService.getByMonth(entry.month, entry.year),
    ]);
    const effectiveNormContracts = applyFinancialReferenceNorms(expert, contracts, entry.month, entry.year);
    const contract = resolveNormContract(expert, effectiveNormContracts, entry.date);
    const candidate = {
      ...entry,
      source: 'FINANCIAL' as const,
      lockedForExpert: true,
      automaticSplit: false,
      normContractId: contract.id,
      peoNormUnit: contract.peoNormUnit,
      peoNormValue: contract.peoNormValue,
      peoDailyCap: contract.peoDailyCap,
      cimNormUnit: contract.cimNormUnit,
      cimNormValue: contract.cimNormValue,
      cimDailyCap: contract.cimDailyCap,
    };
    assertCapacity(calculateCapacitySnapshot({
      expert,
      contracts: effectiveNormContracts,
      activities: activities.filter((item) => item.expertId === entry.expertId),
      concurrentProjects: projects,
      concurrentEntries: entries.filter((item) => item.expertId === entry.expertId),
      leaveEntries: [...leaves.filter((item) => item.expertId === entry.expertId), candidate],
      month: entry.month,
      year: entry.year,
    }));
    const result = await client.models.LeaveEntry.create(candidate);
    assertNoErrors(result, 'AWS create manual leave entry');
    return mapLeaveEntry(result.data);
  },

  async remove(id: string): Promise<void> {
    const client = getAwsDataClient() as any;
    const existing = await client.models.LeaveEntry.get({ id });
    assertNoErrors(existing, 'AWS get leave entry');
    const leave = existing.data ? mapLeaveEntry(existing.data) : undefined;
    if (!leave) return;
    await assertCanAccessExpert(client, leave.expertId);
    const scope = await getCurrentDataAccessScope(client);
    if (leave.lockedForExpert && !scope.canAccessAllExperts) throw new Error('CO introdus de Financiar nu poate fi sters de expert.');
    if (leave.status === 'VALIDATED' && !scope.canAccessAllExperts) throw new Error('CO validat nu poate fi sters de expert.');
    const result = await client.models.LeaveEntry.delete({ id });
    assertNoErrors(result, 'AWS delete leave entry');
  },
  async updateStatus(id: string, status: LeaveEntry['status'], actorId: string, reason?: string): Promise<LeaveEntry> {
    const client = getAwsDataClient() as any;
    if (status !== 'VALIDATED' && status !== 'REJECTED') throw new Error('Financiarul poate doar valida sau respinge CO.');
    const scope = await getCurrentDataAccessScope(client);
    if (!scope.canAccessAllExperts) throw new Error(ACCESS_DENIED_MESSAGE);
    const result = await client.models.LeaveEntry.update({
      id,
      status,
      rejectionReason: status === 'REJECTED' ? reason : undefined,
      validatedBy: status === 'VALIDATED' ? actorId : undefined,
      validatedAt: status === 'VALIDATED' ? new Date().toISOString() : undefined,
    });
    assertNoErrors(result, 'AWS update leave status');
    return mapLeaveEntry(result.data);
  },
};
