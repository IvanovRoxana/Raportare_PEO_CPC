import { getMonthName } from './app-utils.ts';
import { PM_REVIEW_CASE_PRIORITY_LABELS, PM_REVIEW_CASE_SUBJECT_LABELS } from './pm-review-cases.ts';
import type { DocumentMetadata, Expert, NotificationLogCreateInput, PmReviewCase } from './types.ts';

type NotificationMeta = Record<string, string | number | boolean | null | undefined>;

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || '';
}

function uniqEmails(emails: string[]) {
  return Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
}

function monthLabel(month: number, year: number) {
  return `${getMonthName(month)} ${year}`;
}

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

function isPmRecipient(expert: Expert) {
  const groups = (expert.cognitoGroups ?? []).map((group) => group.toLowerCase());
  const roleText = [
    expert.role,
    expert.positionInProject,
    expert.goodworksPosition,
    expert.basePositionConcordia,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return Boolean(
    expert.hasPmAccess
    || groups.some((group) => group === 'pm' || group === 'admin')
    || roleText.includes('pm')
    || roleText.includes('manager project')
    || roleText.includes('project manager')
    || roleText.includes('admin'),
  );
}

export function getPmNotificationRecipients(experts: Expert[]) {
  return uniqEmails(
    experts
      .filter((expert) => expert.isActive !== false && expert.email && isPmRecipient(expert))
      .map((expert) => expert.email!),
  );
}

function notification(args: {
  kind: string;
  recipientEmail: string;
  subject: string;
  body: string[];
  metadata?: NotificationMeta;
}): NotificationLogCreateInput {
  return {
    kind: args.kind,
    recipientEmail: args.recipientEmail,
    subject: args.subject,
    body: args.body.join('\n'),
    status: 'pending',
    metadata: args.metadata ?? null,
  };
}

export function buildExpertSubmittedMonthNotifications(args: {
  expert: Expert;
  pmEmails: string[];
  month: number;
  year: number;
}) {
  const period = monthLabel(args.month, args.year);
  return uniqEmails(args.pmEmails).map((recipientEmail) => notification({
    kind: 'pm_expert_month_submitted',
    recipientEmail,
    subject: `[PEO] ${args.expert.name} a trimis raportarea - ${period}`,
    body: [
      `Expertul ${args.expert.name} a trimis luna ${period} catre PM.`,
      '',
      `Proiect: ${args.expert.projectCode ?? 'PEO'}`,
      `Rol: ${args.expert.role}`,
      '',
      `Verifica raportarea: ${appUrl(`/pm?tab=raportare&month=${args.month}&year=${args.year}&expertId=${args.expert.id}`)}`,
    ],
    metadata: {
      expertId: args.expert.id,
      expertName: args.expert.name,
      month: args.month,
      year: args.year,
      projectCode: args.expert.projectCode,
    },
  }));
}

export function buildPmRequestedClarificationNotification(args: {
  expert: Expert;
  month: number;
  year: number;
  note: string;
  targetLabel?: string;
}) {
  if (!args.expert.email) return [];
  const period = monthLabel(args.month, args.year);
  return [notification({
    kind: 'pm_clarification_requested',
    recipientEmail: args.expert.email,
    subject: `[PEO] PM a cerut clarificari - ${period}`,
    body: [
      `PM a solicitat clarificari pentru ${args.targetLabel || `raportarea din ${period}`}.`,
      '',
      args.note,
      '',
      `Deschide raportarea: ${appUrl(`/expert/peo?month=${args.month}&year=${args.year}`)}`,
    ],
    metadata: {
      expertId: args.expert.id,
      expertName: args.expert.name,
      month: args.month,
      year: args.year,
      targetLabel: args.targetLabel,
    },
  })];
}

export function buildPmApprovedMonthNotification(args: {
  expert: Expert;
  month: number;
  year: number;
}) {
  if (!args.expert.email) return [];
  const period = monthLabel(args.month, args.year);
  return [notification({
    kind: 'pm_month_approved',
    recipientEmail: args.expert.email,
    subject: `[PEO] Raportarea a fost aprobata - ${period}`,
    body: [
      `Raportarea ta pentru ${period} a fost aprobata de PM.`,
      '',
      `Deschide luna: ${appUrl(`/expert/peo?month=${args.month}&year=${args.year}`)}`,
    ],
    metadata: {
      expertId: args.expert.id,
      expertName: args.expert.name,
      month: args.month,
      year: args.year,
    },
  })];
}

export function buildPmOpenedMonthAccessNotification(args: {
  expert: Expert;
  month: number;
  year: number;
}) {
  if (!args.expert.email) return [];
  const period = monthLabel(args.month, args.year);
  return [notification({
    kind: 'pm_month_access_opened',
    recipientEmail: args.expert.email,
    subject: `[PEO] Acces luna deschis - ${period}`,
    body: [
      `PM a deschis accesul pentru luna ${period}.`,
      '',
      `Poti actualiza raportarea aici: ${appUrl(`/expert/peo?month=${args.month}&year=${args.year}`)}`,
    ],
    metadata: {
      expertId: args.expert.id,
      expertName: args.expert.name,
      month: args.month,
      year: args.year,
    },
  })];
}

export function buildPmApprovedDeliverableNotification(args: {
  expert: Expert;
  document: DocumentMetadata;
  month: number;
  year: number;
}) {
  if (!args.expert.email) return [];
  const title = args.document.declaredTitle || args.document.extractedTitle || args.document.originalFileName || 'livrabil';
  return [notification({
    kind: 'pm_deliverable_approved',
    recipientEmail: args.expert.email,
    subject: `[PEO] Livrabil aprobat manual de PM - ${title}`,
    body: [
      `PM a aprobat manual livrabilul "${title}".`,
      '',
      `Luna: ${monthLabel(args.month, args.year)}`,
      `Deschide raportarea: ${appUrl(`/expert/peo?month=${args.month}&year=${args.year}`)}`,
    ],
    metadata: {
      expertId: args.expert.id,
      expertName: args.expert.name,
      documentId: args.document.id,
      documentTitle: title,
      month: args.month,
      year: args.year,
    },
  })];
}

export function buildPmReviewCaseNotification(args: {
  expert: Expert;
  reviewCase: PmReviewCase;
  note?: string;
}) {
  if (!args.expert.email) return [];
  const period = monthLabel(args.reviewCase.month, args.reviewCase.year);
  const subjectTypeLabel = PM_REVIEW_CASE_SUBJECT_LABELS[args.reviewCase.subjectType] || args.reviewCase.subjectType;
  const priorityLabel = PM_REVIEW_CASE_PRIORITY_LABELS[args.reviewCase.priority] || args.reviewCase.priority;
  return [notification({
    kind: 'pm_review_case_notification',
    recipientEmail: args.expert.email,
    subject: `[PEO] Caz PM: ${args.reviewCase.title}`,
    body: [
      `PM a transmis un caz pentru ${period}.`,
      '',
      `Tip: ${subjectTypeLabel}`,
      `Prioritate: ${priorityLabel}`,
      args.reviewCase.subjectLabel ? `Element: ${args.reviewCase.subjectLabel}` : '',
      '',
      args.reviewCase.description,
      args.note ? '' : undefined,
      args.note,
      '',
      `Deschide clarificarile: ${appUrl(`/expert/clarificari?month=${args.reviewCase.month}&year=${args.reviewCase.year}`)}`,
    ].filter((line): line is string => line !== undefined),
    metadata: {
      caseId: args.reviewCase.id,
      expertId: args.expert.id,
      expertName: args.expert.name,
      month: args.reviewCase.month,
      year: args.reviewCase.year,
      projectCode: args.reviewCase.projectCode,
      subjectType: args.reviewCase.subjectType,
      subjectId: args.reviewCase.subjectId,
      priority: args.reviewCase.priority,
      status: args.reviewCase.status,
    },
  })];
}
