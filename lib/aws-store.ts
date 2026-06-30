'use client';

import { getAwsDataClient, isAwsAvailable } from '@/lib/aws/client';
import { getSignedInUser } from '@/lib/aws/auth';
import outputs from '@/amplify_outputs.json';
import { peoUsersAsExperts } from '@/lib/peo-users';
import { mergeExpertLists, mergeExpertWithFallback } from '@/lib/expert-merge';
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
import type {
  Activity,
  ActivityCatalog,
  ActivityAutofillAudit,
  AdminInterventionRequest,
  AppSettings,
  AuditLog,
  ConcurrentProject,
  ConcurrentProjectTimesheetEntry,
  Deliverable,
  DocumentMetadata,
  Expert,
  GrupTintaEntry,
  HistoricalImportBatch,
  HistoricalTimesheetDayEntry,
  MonthlyActivityItem,
  MonthlyExpertReport,
  Neconformitate,
  ReportStatus,
  SharedActivityRegistrationContext,
  SharedDeliverable,
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

async function getCurrentDataAccessScope(client: any): Promise<DataAccessScope> {
  const user = await getSignedInUser();
  const initialScope = resolveDataAccessScope({ user, experts: [] });
  if (initialScope.canAccessAllExperts) return initialScope;

  const currentExpert = await findCurrentExpertFromBackend(client, user);
  return resolveDataAccessScope({ user, experts: currentExpert ? [currentExpert] : [] });
}

async function assertCanAccessExpert(client: any, expertId?: string | null) {
  const scope = await getCurrentDataAccessScope(client);
  if (!canAccessExpertId(scope, expertId)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
  return scope;
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
    positionInProject: expert.positionInProject,
    projectCode: expert.projectCode,
    projectTitle: expert.projectTitle,
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
    eligibilityCheck: serializeAwsJsonField(deliverable.eligibilityCheck),
  };

  Object.entries(extendedFields).forEach(([field, value]) => {
    if (modelHasField('Deliverable', field)) {
      payload[field] = value;
    }
  });

  return payload;
}

function withSupportedActivityShareFields(payload: Record<string, unknown>, activity: Partial<Activity>) {
  const shareFields: Record<string, unknown> = {
    shareStatus: activity.shareStatus,
    originActivityId: activity.originActivityId,
    takenByExperts: activity.takenByExperts,
    gdprTemplateCode: activity.gdprTemplateCode,
    gdprMetaJson: activity.gdprMetaJson,
    gdprGeneratedText: activity.gdprGeneratedText,
    gdprConclusionCode: activity.gdprConclusionCode,
    businessHubMetaJson: activity.businessHubMetaJson,
  };

  Object.entries(shareFields).forEach(([field, value]) => {
    if (modelHasField('Activity', field)) {
      payload[field] = value;
    }
  });

  return payload;
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
    category: item.category ?? undefined,
    norma: item.norma ?? 8,
    normType: item.normType ?? undefined,
    oreZi: item.oreZi ?? item.dailyHours ?? item.norma ?? 8,
    dailyHours: item.dailyHours ?? item.oreZi ?? item.norma ?? 8,
    manualMonthlyNorm: item.manualMonthlyNorm ?? undefined,
    projectMonthlyNorm: item.projectMonthlyNorm ?? undefined,
    positionInProject: item.positionInProject ?? undefined,
    projectCode: item.projectCode ?? undefined,
    projectTitle: item.projectTitle ?? undefined,
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
    titleSuggestionConfidence: item.titleSuggestionConfidence ?? undefined,
    titleSuggestionAlternatives: item.titleSuggestionAlternatives ?? undefined,
    titleSuggestionReason: item.titleSuggestionReason ?? undefined,
    extractedTitle: item.extractedTitle ?? undefined,
    extractedTitleNormalized: item.extractedTitleNormalized ?? undefined,
    titleMatch: item.titleMatch ?? null,
    titleCheckStatus: item.titleCheckStatus ?? undefined,
    eligibilityCheck: parseAwsJsonField<DocumentMetadata['eligibilityCheck']>(item.eligibilityCheck),
    isCommonDeliverable: item.isCommonDeliverable ?? false,
    possibleDuplicateOfDocumentId: item.possibleDuplicateOfDocumentId ?? undefined,
    duplicateStatus: item.duplicateStatus ?? undefined,
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
  const duplicateStatus = duplicate
    ? duplicate.issues.includes('same_file_hash')
      ? 'same_file_hash'
      : duplicate.issues.includes('same_first_page_hash')
        ? 'same_first_page_hash'
        : 'possible_common_unmarked'
    : deliverable.duplicateStatus;

  const payload = {
    id: deliverable.documentId,
    s3Bucket: deliverable.s3Bucket,
    s3Key: deliverable.s3Key || deliverable.filePath || '',
    originalFileName: deliverable.originalFileName || deliverable.fileName,
    mimeType: deliverable.fileType,
    fileSize: deliverable.fileSize,
    fileHash: deliverable.fileHash,
    firstPageTextHash: deliverable.firstPageTextHash,
    contentFingerprint: deliverable.contentFingerprint,
    uploadedByExpertId: deliverable.uploadedByExpertId || activity.expertId || '',
    uploadedByExpertName: deliverable.uploadedByExpertName || activity.expertName,
    uploadDate: deliverable.uploadedAt || new Date().toISOString(),
    projectId: deliverable.projectId || activity.projectCode,
    projectName: deliverable.projectName,
    sourceActivityId: activityId,
    activityDate: deliverable.activityDate || activity.date,
    saCode: deliverable.saCode || activity.saCode,
    deliverableType: deliverable.deliverableType,
    declaredTitle: deliverable.declaredTitle,
    suggestedTitle: deliverable.suggestedTitle,
    extractedTitle: deliverable.docTitle,
    extractedTitleNormalized: normalizeTitleForMatch(getDocumentAuditTitle(deliverable)),
    titleMatch: deliverable.titleMatch ?? undefined,
    titleCheckStatus: deliverable.titleCheckStatus,
    titleSuggestionConfidence: deliverable.titleSuggestionConfidence,
    titleSuggestionAlternatives: deliverable.titleSuggestionAlternatives,
    titleSuggestionReason: deliverable.titleSuggestionReason,
    eligibilityCheck: serializeAwsJsonField(deliverable.eligibilityCheck),
    isCommonDeliverable: deliverable.isCommonDeliverable ?? false,
    possibleDuplicateOfDocumentId: duplicate?.document.id || deliverable.possibleDuplicateOfDocumentId,
    duplicateStatus,
  };

  const result = await client.models.Document.create(payload);
  assertNoErrors(result, 'AWS create document metadata');

  if (duplicate && client.models.AuditLog) {
    await auditLogsService.create({
      actionType: 'document_duplicate_detected',
      actorId: payload.uploadedByExpertId,
      actorName: payload.uploadedByExpertName,
      actorRole: 'admin',
      affectedExpertId: payload.uploadedByExpertId,
      affectedExpertName: payload.uploadedByExpertName,
      projectCode: payload.projectId,
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

  const existingDeliverables = await listModel<any>(client.models.Deliverable, { activityId: { eq: targetActivity.id } });
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
    suggestedTitle: document.suggestedTitle,
    titleSuggestionConfidence: document.titleSuggestionConfidence,
    titleSuggestionAlternatives: document.titleSuggestionAlternatives,
    titleSuggestionReason: document.titleSuggestionReason,
    titleMatch: document.titleMatch,
    titleCheckStatus: document.titleCheckStatus,
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

async function attachActivityChildren(activity: any): Promise<Activity> {
  const client = getAwsDataClient() as any;
  const [deliverables, grupTinta] = await Promise.all([
    listModel<any>(client.models.Deliverable, { activityId: { eq: activity.id } }),
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
    location: activity.location ?? undefined,
    dayType: activity.dayType ?? undefined,
    workingGroupId: activity.workingGroupId ?? undefined,
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
  };
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
    });

    if (!validation.ok) {
      throw new Error(validation.message ?? 'Activitatea nu a fost creată: regula de pontaj ar fi depășită.');
    }
  }
}

async function createActivityUnchecked(
  client: any,
  activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Activity> {
  const created = await client.models.Activity.create(withSupportedActivityShareFields({
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
  }, {
    shareStatus: activity.shareStatus ?? 'private',
    originActivityId: activity.originActivityId,
    takenByExperts: activity.takenByExperts ?? [],
  }));
  assertNoErrors(created, 'AWS create activity');

  const activityId = created.data.id;
  await syncSharedActivitySuggestions(client, activity, activityId);
  await Promise.all([
    ...(activity.deliverables ?? []).map(async (deliverable) => {
      await createDocumentMetadataForDeliverable(client, activity, activityId, deliverable);
      await createRecoveredSharedDeliverableAudit(client, activity, activityId, deliverable);
      await createSharedDeliverablesForDocument(client, activity, activityId, deliverable);
      return client.models.Deliverable.create(withSupportedDeliverableFields({
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
        sourceActivityId: deliverable.sourceActivityId || activityId,
      }));
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
    const scope = await getCurrentDataAccessScope(client);
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
    const scope = await getCurrentDataAccessScope(client);
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
      return filterSharedDeliverablesForScope(Array.from(deduped.values()).map(mapSharedDeliverable), scope);
    }

    const data = await listModel<any>(client.models.SharedDeliverable);
    return filterSharedDeliverablesForScope(data.map(mapSharedDeliverable), scope);
  },

  async getPendingForExpert(expertId: string): Promise<SharedDeliverable[]> {
    const client = getAwsDataClient() as any;
    if (!client.models.SharedDeliverable) return [];
    await assertCanAccessExpert(client, expertId);
    const data = await listModel<any>(client.models.SharedDeliverable, {
      targetExpertId: { eq: expertId },
      status: { eq: 'pending_registration' },
    });
    return data.map(mapSharedDeliverable);
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
    await validateActivityBatchForWrite(client, [activity]);
    return createActivityUnchecked(client, activity);
  },

  async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]> {
    if (activities.length === 0) return [];
    const client = getAwsDataClient() as any;
    await Promise.all(activities.map((activity) => assertCanAccessExpert(client, activity.expertId)));
    await validateActivityBatchForWrite(client, activities);

    const created: Activity[] = [];
    for (const activity of activities) {
      created.push(await createActivityUnchecked(client, activity));
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

      await validateActivityBatchForWrite(client, [candidate], [id]);
    }

    const result = await client.models.Activity.update(withSupportedActivityShareFields({
      id,
      hours: updates.hours,
      activityType: updates.activityType,
      saCode: updates.saCode,
      title: updates.title,
      description: updates.description,
      location: updates.location,
      dayType: updates.dayType,
      status: updates.status,
      pmNotes: updates.pmNotes,
      gdprTemplateCode: updates.gdprTemplateCode,
      gdprMetaJson: updates.gdprMetaJson,
      gdprGeneratedText: updates.gdprGeneratedText,
      gdprConclusionCode: updates.gdprConclusionCode,
      businessHubMetaJson: updates.businessHubMetaJson,
    }, updates));
    assertNoErrors(result, 'AWS update activity');

    if (existing.data) {
      await syncSharedActivitySuggestions(client, {
        expertId: updates.expertId ?? existing.data.expertId,
        shareStatus: updates.shareStatus ?? existing.data.shareStatus,
        takenByExperts: updates.takenByExperts ?? existing.data.takenByExperts ?? [],
        projectCode: updates.projectCode ?? existing.data.projectCode ?? undefined,
      }, id);
    }

    if (updates.deliverables) {
      const existingDeliverables = await listModel<any>(client.models.Deliverable, { activityId: { eq: id } });
      await Promise.all(existingDeliverables.map((deliverable) => client.models.Deliverable.delete({ id: deliverable.id })));
      await Promise.all(
        updates.deliverables.map(async (deliverable) => {
          await createDocumentMetadataForDeliverable(client, updates, id, deliverable);
          await createRecoveredSharedDeliverableAudit(client, updates, id, deliverable);
          await createSharedDeliverablesForDocument(client, updates, id, deliverable);
          return client.models.Deliverable.create(withSupportedDeliverableFields({
            activityId: id,
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
            sourceActivityId: deliverable.sourceActivityId || id,
          }));
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
      serviceCategory: input.serviceCategory,
      activityNumber: input.activityNumber,
      activityName: input.activityName,
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
      serviceCategory: updates.serviceCategory,
      activityNumber: updates.activityNumber,
      activityName: updates.activityName,
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
    serviceCategory: item.serviceCategory ?? '',
    activityNumber: item.activityNumber ?? 0,
    activityName: item.activityName,
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
      dailyHours: project.dailyHours,
      startDate: project.startDate,
      endDate: project.endDate,
      isActive: project.isActive ?? true,
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
      dailyHours: updates.dailyHours,
      startDate: updates.startDate,
      endDate: updates.endDate,
      isActive: updates.isActive,
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
    dailyHours: item.dailyHours,
    startDate: item.startDate,
    endDate: item.endDate ?? undefined,
    isActive: item.isActive ?? true,
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
