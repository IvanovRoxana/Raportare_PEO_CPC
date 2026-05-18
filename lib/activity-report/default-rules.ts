import type { ReportingRules } from './types.ts';

export const DEFAULT_ACTIVITY_REPORT_RULES = {
  detailLevel: 'foarte_detaliat',
  tone: 'tehnic_administrativ',
  mentionSources: false,
  firstPersonSingular: true,
  includeValidationSection: true,
  includeResultBeneficiaryImpact: true,
  forbiddenPhrases: [
    'conform documentului',
    'în fișierul atașat',
    'din datele primite',
    'am participat pasiv',
    'raportul generat',
  ],
  preferredPhrases: [
    'am elaborat',
    'am analizat',
    'am consolidat',
    'am corelat',
    'am facilitat',
    'am asigurat follow-up',
    'am integrat observațiile',
    'am fundamentat propunerile',
  ],
} satisfies Required<ReportingRules>;

export function mergeActivityReportRules(rules?: ReportingRules): Required<ReportingRules> {
  return {
    ...DEFAULT_ACTIVITY_REPORT_RULES,
    ...rules,
    forbiddenPhrases: mergePhraseLists(DEFAULT_ACTIVITY_REPORT_RULES.forbiddenPhrases, rules?.forbiddenPhrases),
    preferredPhrases: mergePhraseLists(DEFAULT_ACTIVITY_REPORT_RULES.preferredPhrases, rules?.preferredPhrases),
  };
}

function mergePhraseLists(defaultValues: readonly string[], providedValues?: string[]) {
  return Array.from(new Set([...defaultValues, ...(providedValues ?? [])].map((value) => value.trim()).filter(Boolean)));
}
