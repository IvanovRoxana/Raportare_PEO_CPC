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
export const reportStatusService = awsStore.reportStatusService;
export const grupTintaService = awsStore.grupTintaService;

export const activeBackendProvider = 'aws';

export {
  calculateWorkingDays,
  formatDate,
  formatDateRo,
  generateId,
  getMonthName,
} from './app-utils';
