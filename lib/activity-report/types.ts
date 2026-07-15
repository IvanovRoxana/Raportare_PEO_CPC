export type ActivityReportDetailLevel = 'mediu' | 'detaliat' | 'foarte_detaliat';
export type ActivityReportTone = 'administrativ' | 'tehnic_administrativ' | 'narativ_institutional';

export type ReportingRules = {
  detailLevel?: ActivityReportDetailLevel;
  tone?: ActivityReportTone;
  forbiddenPhrases?: string[];
  preferredPhrases?: string[];
  mentionSources?: boolean;
  firstPersonSingular?: boolean;
  includeValidationSection?: boolean;
  includeResultBeneficiaryImpact?: boolean;
};

export type ActivityInput = {
  date: string;
  hours: number;
  saCode?: string;
  activityType?: string;
  title: string;
  description: string;
  location?: 'online' | 'onsite' | 'hibrid' | string;
  collaborators?: string[];
  deliverables?: string[];
  beneficiaries?: string[];
  indicatorImpact?: string;
  gdprTemplateCode?: string;
  gdprGeneratedText?: string;
  gdprConclusionCode?: string;
};

export type NormalizedActivity = Required<Pick<ActivityInput, 'date' | 'hours' | 'title' | 'description'>> & {
  saCode: string;
  activityType?: string;
  location: string;
  collaborators: string[];
  deliverables: string[];
  beneficiaries: string[];
  indicatorImpact?: string;
  gdprTemplateCode?: string;
  gdprGeneratedText?: string;
  gdprConclusionCode?: string;
  originalIndex: number;
};

export type ActivityTotals = {
  totalHours: number;
  totalsBySA: Record<string, number>;
  totalsByDate: Record<string, number>;
  warnings: string[];
};

export type ValidatedActivityReportExample = {
  title: string;
  saCode?: string;
  inputSummary?: string;
  outputExample: string;
};

export type ActivityReportRequest = {
  expertName: string;
  expertRole?: string;
  month: string;
  year: number;
  projectCode?: string;
  useFineTunedModel?: boolean;
  activities: ActivityInput[];
  reportingRules?: ReportingRules;
  validatedExamples?: ValidatedActivityReportExample[];
};

export type ActivityReportSectionKind = 'table' | 'sa-detail' | 'validation';

export type ActivityReportSectionRequest = ActivityReportRequest & {
  sectionKind: ActivityReportSectionKind;
  sectionTitle?: string;
  sectionSaCode?: string;
  sectionIndex?: number;
  totalSections?: number;
};

export type ActivityReportPromptInput = ActivityReportRequest & {
  normalizedActivities: NormalizedActivity[];
  groupedActivities: Record<string, NormalizedActivity[]>;
  totals: ActivityTotals;
  rules: Required<ReportingRules>;
};

export type ReportModelSelection = {
  model: string;
  usedFineTunedModel: boolean;
  warnings: string[];
};

export type ActivityReportTrainingExample = {
  id: string;
  createdAt: string;
  expertName: string;
  expertRole?: string;
  month: string;
  year: number;
  projectCode: string;
  input: {
    activities: ActivityInput[];
    reportingRules?: ReportingRules;
  };
  validatedOutput: string;
  tags?: string[];
  notes?: string;
};
