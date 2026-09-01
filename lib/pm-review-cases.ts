import type { Neconformitate, PmReviewCase, PmReviewCasePriority, PmReviewCaseStatus, PmReviewCaseSubjectType } from './types.ts';

const ACTIVE_PM_REVIEW_CASE_STATUSES = new Set(['open', 'waiting_expert', 'answered']);
const EXPERT_VISIBLE_PM_REVIEW_CASE_STATUSES = new Set(['waiting_expert', 'answered']);

export type PmReviewCaseListItem = PmReviewCase & {
  source: 'pm_review_case' | 'legacy_neconformitate';
  legacyId?: string;
};

export const PM_REVIEW_CASE_STATUS_LABELS: Record<string, string> = {
  open: 'Deschis',
  waiting_expert: 'Asteapta expert',
  answered: 'Raspuns expert',
  resolved: 'Rezolvat',
  dismissed: 'Inchis fara actiune',
};

export const PM_REVIEW_CASE_PRIORITY_LABELS: Record<string, string> = {
  low: 'Scazut',
  medium: 'Mediu',
  high: 'Ridicat',
  blocking: 'Blocant',
};

export const PM_REVIEW_CASE_SUBJECT_LABELS: Record<string, string> = {
  activity: 'Activitate',
  deliverable: 'Livrabil',
  monthly_report: 'Raportare lunara',
  shared_deliverable: 'Livrabil comun',
  month_access: 'Acces luna',
  other: 'Alt caz',
};

export function isPmReviewCaseActive(reviewCase: Pick<PmReviewCase, 'status'>) {
  return ACTIVE_PM_REVIEW_CASE_STATUSES.has(reviewCase.status);
}

export function isPmReviewCaseVisibleForExpert(reviewCase: Pick<PmReviewCase, 'status'>) {
  return EXPERT_VISIBLE_PM_REVIEW_CASE_STATUSES.has(reviewCase.status);
}

export function isBlockingPmReviewCase(reviewCase: Pick<PmReviewCase, 'priority' | 'status'>) {
  return reviewCase.priority === 'blocking' && isPmReviewCaseActive(reviewCase);
}

export function normalizePmReviewCaseStatus(status?: string | null): PmReviewCaseStatus {
  return status || 'open';
}

export function normalizePmReviewCasePriority(priority?: string | null): PmReviewCasePriority {
  return priority || 'medium';
}

export function normalizePmReviewCaseSubjectType(subjectType?: string | null): PmReviewCaseSubjectType {
  return subjectType || 'other';
}

export function mapPmReviewCaseToListItem(reviewCase: PmReviewCase): PmReviewCaseListItem {
  return {
    ...reviewCase,
    source: 'pm_review_case',
  };
}

export function mapLegacyNeconformitateToReviewCaseListItem(args: {
  item: Neconformitate;
  fallbackMonth: number;
  fallbackYear: number;
  fallbackExpertName?: string;
  projectCode?: string;
}): PmReviewCaseListItem {
  const priority = args.item.severity === 'high' ? 'high' : args.item.severity === 'low' ? 'low' : 'medium';
  return {
    id: `legacy-neconformitate-${args.item.id}`,
    expertId: args.item.affectedExpertId || '',
    expertName: args.item.affectedExpert || args.fallbackExpertName,
    projectCode: args.projectCode,
    month: args.fallbackMonth,
    year: args.fallbackYear,
    subjectType: args.item.type === 'raport' ? 'monthly_report' : args.item.type === 'livrabil' ? 'deliverable' : args.item.type === 'pontaj' ? 'activity' : 'other',
    subjectId: args.item.id,
    subjectLabel: args.item.description,
    title: args.item.description,
    description: args.item.description,
    priority,
    status: args.item.resolved ? 'resolved' : 'open',
    resolvedAt: args.item.resolvedAt,
    resolution: args.item.resolution,
    createdAt: args.item.createdAt,
    source: 'legacy_neconformitate',
    legacyId: args.item.id,
  };
}
