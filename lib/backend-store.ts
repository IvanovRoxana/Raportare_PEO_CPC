'use client';

import * as awsStore from './aws-store';

export const isBackendAvailable = () => {
  return awsStore.isAwsAvailable();
};

export const expertsService = awsStore.expertsService;
export const activitiesService = awsStore.activitiesService;
export const verificationsService = awsStore.verificationsService;
export const neconformitatiService = awsStore.neconformitatiService;
export const notesService = awsStore.notesService;
export const settingsService = awsStore.settingsService;
export const activityCatalogService = awsStore.activityCatalogService;
export const workingGroupsService = awsStore.workingGroupsService;
export const concurrentProjectsService = awsStore.concurrentProjectsService;
export const concurrentProjectTimesheetService = awsStore.concurrentProjectTimesheetService;
export const reportStatusService = awsStore.reportStatusService;
export const reportingWorkBlocksService = awsStore.reportingWorkBlocksService;
export const grupTintaService = awsStore.grupTintaService;
export const gtOrganizationsService = awsStore.gtOrganizationsService;
export const gtEntitiesService = awsStore.gtEntitiesService;
export const gtPersonsService = awsStore.gtPersonsService;
export const gtDocumentsService = awsStore.gtDocumentsService;
export const gtMonitoringRecordsService = awsStore.gtMonitoringRecordsService;
export const gtImportBatchesService = awsStore.gtImportBatchesService;
export const businessHubEntityDirectoryService = awsStore.businessHubEntityDirectoryService;
export const historicalImportService = awsStore.historicalImportService;
export const auditLogsService = awsStore.auditLogsService;
export const activityAutofillAuditsService = awsStore.activityAutofillAuditsService;
export const documentsService = awsStore.documentsService;
export const sharedDeliverablesService = awsStore.sharedDeliverablesService;
export const procurementProjectsService = awsStore.procurementProjectsService;
export const procurementDocumentsService = awsStore.procurementDocumentsService;
export const procurementLaunchesService = awsStore.procurementLaunchesService;
export const procurementSuppliersService = awsStore.procurementSuppliersService;
export const procurementOffersService = awsStore.procurementOffersService;
export const procurementEvaluationsService = awsStore.procurementEvaluationsService;
export const procurementContractsService = awsStore.procurementContractsService;
export const procurementDeliverablesService = awsStore.procurementDeliverablesService;
export const procurementReceptionsService = awsStore.procurementReceptionsService;
export const procurementInvoicesService = awsStore.procurementInvoicesService;
export const procurementStatusHistoryService = awsStore.procurementStatusHistoryService;
export const procurementChecklistsService = awsStore.procurementChecklistsService;

export const activeBackendProvider = 'aws';

export {
  calculateWorkingDays,
  formatDate,
  formatDateRo,
  generateId,
  getMonthName,
} from './app-utils';
