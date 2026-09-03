import type {
  DocumentMetadata,
  Expert,
  SupportTicket,
  SupportTicketCreateInput,
  SupportTicketModule,
  SupportTicketSeverity,
  SupportTicketType,
} from './types.ts';

export const supportTicketTypes: Array<{ value: SupportTicketType; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'question', label: 'Intrebare' },
  { value: 'suggestion', label: 'Sugestie' },
  { value: 'blocker', label: 'Blocaj' },
  { value: 'export_issue', label: 'Problema export' },
  { value: 'ai_issue', label: 'Problema AI' },
  { value: 'access_issue', label: 'Acces / date' },
  { value: 'ux_issue', label: 'UX / neclaritate' },
];

export const supportTicketModules: Array<{ value: SupportTicketModule; label: string }> = [
  { value: 'expert', label: 'Expert' },
  { value: 'pm', label: 'PM' },
  { value: 'financial', label: 'Financiar' },
  { value: 'deliverables', label: 'Livrabile' },
  { value: 'gt', label: 'GT' },
  { value: 'business_hub', label: 'Business Hub' },
  { value: 'achizitii', label: 'Achizitii' },
  { value: 'ai', label: 'AI' },
  { value: 'export', label: 'Export' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Alt modul' },
];

export const supportTicketSeverities: Array<{ value: SupportTicketSeverity; label: string }> = [
  { value: 'blocking', label: 'Blocheaza raportarea' },
  { value: 'important', label: 'Important' },
  { value: 'minor', label: 'Minor' },
];

export function inferSupportTicketModuleFromPath(pathname: string): SupportTicketModule {
  if (pathname.startsWith('/pm')) return 'pm';
  if (pathname.startsWith('/financiar')) return 'financial';
  if (pathname.startsWith('/gt')) return 'gt';
  if (pathname.startsWith('/achizitii')) return 'achizitii';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.includes('livrabile')) return 'deliverables';
  if (pathname.startsWith('/api/ai')) return 'ai';
  return 'expert';
}

export function buildSupportTicketTitle(input: {
  module: SupportTicketModule;
  type: SupportTicketType;
  prefix?: string;
}) {
  const moduleLabel = supportTicketModules.find((item) => item.value === input.module)?.label || input.module;
  const typeLabel = supportTicketTypes.find((item) => item.value === input.type)?.label || input.type;
  return `${input.prefix || '[UAT]'}[${moduleLabel}] ${typeLabel}`;
}

export function buildSupportTicketLinearLabels(input: {
  module: SupportTicketModule;
  type: SupportTicketType;
  severity: SupportTicketSeverity;
  affectsMonthlyReporting: boolean;
}) {
  const labels = ['PL uat', 'PL needs-retest', `PL ${input.module}`];
  if (input.type === 'ai_issue') labels.push('PL ai-validation');
  if (input.type === 'export_issue') labels.push('PL export-validation');
  if (input.type === 'access_issue') labels.push('PL security-gdpr');
  if (input.severity === 'blocking' || input.affectsMonthlyReporting) labels.push('PL blocker-live');
  return Array.from(new Set(labels));
}

export function buildSupportTicketLinearPriority(severity: SupportTicketSeverity, type: SupportTicketType) {
  if (severity === 'blocking' || type === 'access_issue') return 'urgent';
  if (type === 'export_issue') return 'high';
  if (severity === 'important') return 'medium';
  return 'low';
}

export function isClosedSupportTicket(ticket: SupportTicket) {
  return ['resolved', 'duplicate', 'not_bug', 'deferred'].includes(ticket.status);
}

export function findActiveDocumentSupportTicket(
  tickets: SupportTicket[],
  input: Pick<SupportTicket, 'relatedDocumentId' | 'selectedMonth' | 'selectedYear' | 'module'>,
) {
  return tickets.find((ticket) => (
    !isClosedSupportTicket(ticket)
    && ticket.module === input.module
    && ticket.relatedDocumentId === input.relatedDocumentId
    && ticket.selectedMonth === input.selectedMonth
    && ticket.selectedYear === input.selectedYear
  ));
}

export function buildLinearIssueDraft(ticket: SupportTicketCreateInput) {
  const context = [
    ticket.currentPath ? `Path: ${ticket.currentPath}` : null,
    ticket.selectedYear !== undefined && ticket.selectedMonth !== undefined
      ? `Luna raportare: ${ticket.selectedMonth + 1}/${ticket.selectedYear}`
      : null,
    ticket.selectedExpertId ? `Expert: ${ticket.selectedExpertId}` : null,
    ticket.relatedActivityId ? `Activitate: ${ticket.relatedActivityId}` : null,
    ticket.relatedDocumentId ? `Document: ${ticket.relatedDocumentId}` : null,
    ticket.networkStatus ? `Network: ${ticket.networkStatus}` : null,
    ticket.appVersion ? `Versiune: ${ticket.appVersion}` : null,
    ticket.environment ? `Mediu: ${ticket.environment}` : null,
  ].filter(Boolean);

  const body = [
    ticket.description,
    ticket.actualResult ? `\nCe s-a intamplat:\n${ticket.actualResult}` : null,
    ticket.expectedResult ? `\nRezultat asteptat:\n${ticket.expectedResult}` : null,
    ticket.reproductionSteps ? `\nPasi reproducere:\n${ticket.reproductionSteps}` : null,
    context.length ? `\nContext:\n${context.map((item) => `- ${item}`).join('\n')}` : null,
    ticket.lastClientError ? `\nEroare client:\n${ticket.lastClientError}` : null,
  ].filter(Boolean).join('\n');

  return {
    title: ticket.title,
    description: body,
    labels: ticket.linearLabels ?? [],
    priority: ticket.linearPriority,
  };
}

export function buildPmDocumentClarificationSupportTicket(input: {
  document: DocumentMetadata;
  expert?: Expert;
  note: string;
  month: number;
  year: number;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  currentPath?: string;
  appVersion?: string;
  environment?: string;
}): SupportTicketCreateInput {
  const severity: SupportTicketSeverity = input.document.eligibilityCheck?.pmUnlockRequestedAt ? 'blocking' : 'important';
  const affectsMonthlyReporting = true;
  const type: SupportTicketType = input.document.eligibilityCheck?.pmUnlockRequestedAt ? 'blocker' : 'question';
  const module: SupportTicketModule = 'pm';
  const title = buildSupportTicketTitle({ module, type, prefix: '[PM]' });
  const expertName = input.expert?.name || input.document.uploadedByExpertName || input.document.uploadedByExpertId;
  const documentTitle = input.document.declaredTitle || input.document.extractedTitle || input.document.originalFileName;
  const description = [
    `Clarificare PM solicitata pentru documentul "${documentTitle}".`,
    `Expert: ${expertName}.`,
    `Mesaj PM: ${input.note}`,
  ].join('\n');

  return {
    title,
    description,
    type,
    module,
    severity,
    status: 'confirmed',
    actualResult: input.document.titleCheckMessage || input.document.eligibilityCheck?.summary || undefined,
    expectedResult: 'Expertul raspunde clarificarii sau corecteaza documentul/livrabilul in raportarea lunara.',
    reproductionSteps: `PM > Neconformitati > Alerteaza documentul ${input.document.originalFileName}`,
    affectsMonthlyReporting,
    canReproduce: 'yes',
    userId: input.actorId,
    userName: input.actorName,
    userRole: input.actorRole,
    currentPath: input.currentPath || '/pm',
    selectedMonth: input.month,
    selectedYear: input.year,
    selectedExpertId: input.document.uploadedByExpertId,
    relatedActivityId: input.document.sourceActivityId,
    relatedDocumentId: input.document.id,
    appVersion: input.appVersion,
    environment: input.environment,
    linearLabels: buildSupportTicketLinearLabels({ module, type, severity, affectsMonthlyReporting }),
    linearPriority: buildSupportTicketLinearPriority(severity, type),
    createdBy: input.actorId || input.actorName,
  };
}
