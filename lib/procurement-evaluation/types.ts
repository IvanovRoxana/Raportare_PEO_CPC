export type ProcurementEvaluationSeverity = 'Blocant' | 'Major' | 'Informativ';
export type ProcurementEvaluationStatus = 'Conform' | 'Neconform' | 'Review' | 'Neverificat';
export type ProcurementAiReviewStatus = 'not_needed' | 'suggested' | 'required';
export type ProcurementDocumentClassificationSource = 'deterministic' | 'openai' | 'manual';
export type ExpertRole = 'COORDONATOR' | 'FORMATOR' | 'ALT_ROL';
export type RelevanceLevel = 'ridicata' | 'medie' | 'scazuta' | 'review';
export type TextExtractionStatus = 'not_started' | 'text_extracted' | 'ocr_extracted' | 'failed';
export type QualifiedSignatureStatus = 'valid' | 'invalid' | 'review' | 'not_configured' | 'not_signed';

export type StandardDocumentType =
  | 'OPIS'
  | 'FORMULAR_1'
  | 'FORMULAR_1A'
  | 'FORMULAR_1B'
  | 'FORMULAR_2'
  | 'FORMULAR_3'
  | 'FORMULAR_4'
  | 'FORMULAR_5'
  | 'FORMULAR_6'
  | 'FORMULAR_7'
  | 'FORMULAR_8'
  | 'FORMULAR_9'
  | 'FORMULAR_10'
  | 'FORMULAR_11'
  | 'FORMULAR_12'
  | 'FORMULAR_12_ANEXA'
  | 'FORMULAR_13'
  | 'OFERTA_TEHNICA'
  | 'OFERTA_FINANCIARA'
  | 'ANEXA_FINANCIARA'
  | 'CV'
  | 'DIPLOMA'
  | 'CERTIFICAT_FORMATOR'
  | 'RECOMANDARE'
  | 'ADEVERINTA'
  | 'CONTRACT_SIMILAR'
  | 'PROCES_VERBAL_RECEPTIE'
  | 'CALENDAR_IMPLEMENTARE'
  | 'DOCUMENT_PLATFORMA_ELEARNING'
  | 'CERTIFICAT_CONSTATATOR'
  | 'NECLASIFICAT';

export type CourseProfile = {
  courseId: string;
  courseName: string;
  deliveryFormat: string;
  coreKeywords: string[];
  strongEvidenceTerms: string[];
  relevanceCriteria: string[];
  thresholds: {
    high: number;
    medium: number;
    minimumEvidenceKeywordHits: number;
  };
};

export type OfferPackageDocumentInput = {
  id: string;
  procurementProjectId: string;
  supplierId: string;
  supplierName: string;
  packageId: string;
  originalPath: string;
  normalizedFilename: string;
  extension: string;
  sizeBytes?: number;
  hash?: string;
  storagePath?: string;
  mimeType?: string;
  importedAt: string;
  extractedText?: string;
  extractionStatus?: TextExtractionStatus;
  extractionWarnings?: string[];
  ocrUsed?: boolean;
  pageCount?: number;
  signaturePresent?: boolean;
  qualifiedSignatureStatus?: QualifiedSignatureStatus;
  signatureValidationProvider?: string;
  signatureValidatedAt?: string;
  signatureValidationNotes?: string;
};

export type ProcurementOfferPackage = {
  id: string;
  procurementProjectId: string;
  supplierId: string;
  supplierName: string;
  originalRootName?: string;
  importedAt: string;
  documentCount: number;
  status: ProcurementEvaluationStatus;
  notes?: string;
};

export type DocumentClassification = {
  documentId: string;
  docType: StandardDocumentType;
  confidence: number;
  source: ProcurementDocumentClassificationSource;
  signals: string[];
  reviewRequired: boolean;
  aiReason?: string;
};

export type ExtractedField = {
  documentId: string;
  field: string;
  label: string;
  value: string | number | boolean | string[] | null;
  confidence: number;
  source: 'text' | 'table' | 'openai' | 'manual';
  reviewRequired: boolean;
};

export type DateInterval = {
  startDate: string;
  endDate: string;
  sourceDocumentId?: string;
  onlineDelivery?: boolean;
  description?: string;
};

export type ProcurementExpert = {
  id: string;
  supplierId: string;
  supplierName: string;
  expertName: string;
  role: ExpertRole;
  cvDocumentId?: string;
  diplomaDocumentId?: string;
  trainerCertificateDocumentId?: string;
  availabilityDocumentId?: string;
  notes?: string;
};

export type ExpertCourseMapping = {
  id: string;
  supplierId: string;
  supplierName: string;
  expertId: string;
  expertName: string;
  role: ExpertRole;
  courseId: string;
  courseName: string;
  courseKeywords: string[];
  yearsClaimedF6?: number;
  yearsClaimedCv?: number;
  yearsProvenGeneral: number;
  yearsOnlineClaimed?: number;
  yearsOnlineProven: number;
  supportDocumentIds: string[];
  cvMatchesEvidence: ProcurementEvaluationStatus;
  f6MatchesEvidence: ProcurementEvaluationStatus;
  courseRelevance: RelevanceLevel;
  keywordMatchScore: number;
  declaredVsProvenGap: number;
  eligibilityDecision: ProcurementEvaluationStatus;
  selectedForScoring: boolean;
  confidence: number;
  reviewerNotes?: string;
};

export type SimilarExperience = {
  id: string;
  supplierId: string;
  supplierName: string;
  beneficiary?: string;
  contractNo?: string;
  object?: string;
  valueRonExVat?: number;
  startDate?: string;
  endDate?: string;
  onlineEvidence?: boolean;
  supportDocumentIds: string[];
  status: ProcurementEvaluationStatus;
};

export type FinancialOffer = {
  supplierId: string;
  supplierName: string;
  currency: string;
  totalPriceExVat?: number;
  vat?: number;
  totalPriceWithVat?: number;
  offerValidityDays?: number;
  priceFirm?: boolean;
  form12Present: boolean;
  annexPresent: boolean;
  totalsMatch: boolean;
  status: ProcurementEvaluationStatus;
};

export type ValidationResult = {
  id: string;
  ruleId: string;
  requirement: string;
  severity: ProcurementEvaluationSeverity;
  status: ProcurementEvaluationStatus;
  observedValue?: string;
  sourceDocumentIds: string[];
  reviewerNotes?: string;
};

export type ScoringResult = {
  supplierId: string;
  supplierName: string;
  blockingValidationPass: boolean;
  ct1CoordinatorScore: number;
  ct2TrainersScore: number;
  ct3OnlineScore: number;
  priceExVat?: number;
  priceScore: number;
  totalScore: number;
  rank?: number;
  status: ProcurementEvaluationStatus;
};

export type ProcurementEvaluationSnapshot = {
  package: ProcurementOfferPackage;
  documents: OfferPackageDocumentInput[];
  classifications: DocumentClassification[];
  extractedFields: ExtractedField[];
  experts: ProcurementExpert[];
  expertCourseMappings: ExpertCourseMapping[];
  similarExperience: SimilarExperience[];
  financialOffers: FinancialOffer[];
  validationResults: ValidationResult[];
  scoringResults: ScoringResult[];
};
