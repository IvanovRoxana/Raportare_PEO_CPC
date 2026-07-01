export const GT_STATUSES = [
  'draft',
  'invitat',
  'dosar_depus',
  'in_verificare',
  'completari_solicitate',
  'eligibil_validat',
  'inscris_mysmis',
  'in_operatiune',
  'lista_asteptare',
  'respins',
  'iesit_din_operatiune',
] as const;

export type GTStatus = (typeof GT_STATUSES)[number];
export type GTOrganizationKind = 'cpc' | 'federatie' | 'organizatie_patronala' | 'companie' | 'necunoscut' | string;
export type GTDocumentSubjectType = 'entity' | 'person';
export type GTDocumentStatus = 'lipsa' | 'incarcat' | 'in_verificare' | 'validat' | 'respins';

export interface Organization {
  id: string;
  name: string;
  normalizedName: string;
  kind: GTOrganizationKind;
  legalForm?: string;
  cui?: string;
  parentOrganizationId?: string;
  federationName?: string;
  patronalOrganizationName?: string;
  employeeCount?: number;
  status: 'active' | 'inactive' | 'archived' | string;
  sourceSheet?: string;
  sourceRowNumber?: number;
  importBatchId?: string;
  gtNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTEntity {
  id: string;
  organizationId: string;
  organizationName?: string;
  status: GTStatus;
  dataIntrareOperatiune?: string;
  dataIesireOperatiune?: string;
  indicator5SO04?: boolean;
  indicator5SR04?: boolean;
  region?: string;
  expertResponsabilId?: string;
  notes?: string;
  sourceStatusText?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTPerson {
  id: string;
  gtEntityId: string;
  nume: string;
  prenume: string;
  cnpHash?: string;
  email?: string;
  telefon?: string;
  functie?: string;
  status: GTStatus;
  dataIntrareOperatiune?: string;
  dataIesireOperatiune?: string;
  indicator5SO01?: boolean;
  indicator5SR01?: boolean;
  consimtamantGDPRAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTDocument {
  id: string;
  subjectType: GTDocumentSubjectType;
  gtEntityId?: string;
  gtPersonId?: string;
  documentType: string;
  s3Key?: string;
  fileName?: string;
  status: GTDocumentStatus;
  validatedByExpertId?: string;
  validatedAt?: string;
  expiryDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTMonitoringRecord {
  id: string;
  subjectType: GTDocumentSubjectType;
  gtEntityId?: string;
  gtPersonId?: string;
  date: string;
  year: number;
  month: number;
  expertId?: string;
  linkedActivityId?: string;
  saCode?: string;
  indicatorCode?: '5SO01' | '5SO04' | '5SR01' | '5SR04' | string;
  obiectivSpecific?: string;
  descriere?: string;
  rezultat?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTImportBatch {
  id: string;
  sourceFileName: string;
  importedBy?: string;
  importedAt: string;
  status: 'dry_run' | 'imported' | 'imported_with_warnings' | 'failed' | string;
  totalRows?: number;
  createdOrganizations?: number;
  duplicateRows?: number;
  warningsJson?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GTIndicatorResult {
  code: '5SO04' | '5SR04' | '5SO01' | '5SR01';
  value: number;
  target: number;
  valid: boolean;
}

export interface NormalizedOrganizationImportRow {
  id: string;
  name: string;
  normalizedName: string;
  kind: GTOrganizationKind;
  legalForm?: string;
  cui?: string;
  parentOrganizationId?: string;
  federationName?: string;
  patronalOrganizationName?: string;
  employeeCount?: number;
  sourceSheet: string;
  sourceRowNumber?: number;
  gtSourceStatusText?: string;
  peoOtherProjectsText?: string;
  informationSessionText?: string;
}
