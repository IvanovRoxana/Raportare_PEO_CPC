import { hasUsableMainDeliverable } from './submit-readiness.ts';
import type { Activity, Expert, ReportStatus } from './types';

export type AdminRole = 'expert' | 'pm' | 'project_admin' | 'technical_super_admin';
export type RuleSeverity = 'informare' | 'avertizare' | 'blocare';
export type AdminPhase = 'Etapa 1' | 'Etapa 2' | 'Etapa 3';

export interface AdminMenuItem {
  id: string;
  title: string;
  description: string;
  phase: AdminPhase;
  owners: AdminRole[];
  controls: string[];
  href?: string;
}

export interface AdminDashboardSnapshotInput {
  experts: Pick<Expert, 'id' | 'name' | 'email' | 'saCodes' | 'isActive' | 'hasPmAccess'>[];
  activities: Array<{ expertId?: string; expertEmail?: string; hours?: number; deliverables?: Activity['deliverables']; status?: string; saCode?: string }>;
  reportStatuses: Array<{ status: string }>;
  activeReportingMonths: string[];
  activityCatalogCount: number;
  workingGroupsCount: number;
}

export interface AdminDashboardSnapshot {
  totalExperts: number;
  activeExperts: number;
  expertsWithPmAccess: number;
  reportedExperts: number;
  completeTimesheets: number;
  incompleteActivities: number;
  missingDeliverables: number;
  draftReports: number;
  sentReports: number;
  validatedReports: number;
  reportsWithObservations: number;
  nonConformingReports: number;
  activeReportingMonths: string[];
  configurationErrors: string[];
  referenceData: {
    activityCatalogCount: number;
    workingGroupsCount: number;
  };
}

export const adminRoles: Array<{ role: AdminRole; label: string; description: string }> = [
  {
    role: 'expert',
    label: 'Expert',
    description: 'Completează activități, pontaj, livrabile și rapoarte proprii.',
  },
  {
    role: 'pm',
    label: 'PM / verificator',
    description: 'Verifică raportările experților, pune observații și schimbă statusuri operaționale.',
  },
  {
    role: 'project_admin',
    label: 'Admin proiect',
    description: 'Configurează utilizatori, experți, proiecte, luni, subactivități și reguli de raportare.',
  },
  {
    role: 'technical_super_admin',
    label: 'Super admin / tehnic',
    description: 'Administrează setări sensibile: AI, audit, backup, limite și structură exporturi.',
  },
];

export const adminMenuItems: AdminMenuItem[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Panou de avertizare pentru luna curentă, statusuri, livrabile lipsă și erori de configurare.',
    phase: 'Etapa 1',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['indicatori lună', 'alerte ore', 'statusuri rapoarte', 'erori configurare'],
  },
  {
    id: 'users',
    title: 'Utilizatori și roluri',
    description: 'Conturi, roluri, acces la date proprii/toate datele, activare/dezactivare și resetare acces.',
    phase: 'Etapa 1',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['expert', 'pm', 'admin proiect', 'super admin', 'permisiuni granularizate'],
    href: '/admin/users',
  },
  {
    id: 'experts',
    title: 'Experți',
    description: 'Date contractuale, norme, subactivități alocate, livrabile obligatorii și responsabil PM.',
    phase: 'Etapa 1',
    owners: ['project_admin'],
    controls: ['contract', 'normă lunară', 'ore/zi', 'subactivități', 'status expert'],
  },
  {
    id: 'projects',
    title: 'Proiecte',
    description: 'Date proiect, cod MySMIS, beneficiar, perioade, obiective, indicatori și template-uri asociate.',
    phase: 'Etapa 1',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['cod proiect', 'beneficiar', 'finanțator', 'perioade', 'multi-proiect'],
  },
  {
    id: 'subactivities',
    title: 'Subactivități',
    description: 'Coduri SA, descrieri oficiale, experți alocați, livrabile acceptate și perioade active.',
    phase: 'Etapa 1',
    owners: ['project_admin'],
    controls: ['SA1.1', 'SA3.1', 'indicatori', 'perioadă activă', 'reguli specifice'],
  },
  {
    id: 'activity-catalog',
    title: 'Catalog activități',
    description: 'Tipuri de activități importate/configurabile, formulări standard și cerințe de livrabil.',
    phase: 'Etapa 1',
    owners: ['project_admin'],
    controls: ['categorie', 'subactivitate', 'descriere standard', 'necesită livrabil', 'mod desfășurare'],
  },
  {
    id: 'reporting-months',
    title: 'Luni de raportare',
    description: 'Deschidere/închidere luni, deadline-uri, experți incluși, template-uri active și blocări individuale.',
    phase: 'Etapa 1',
    owners: ['project_admin'],
    controls: ['neîncepută', 'deschisă', 'în verificare', 'închisă', 'arhivată'],
  },
  {
    id: 'rules',
    title: 'Reguli de raportare',
    description: 'Reguli de pontaj și validări cu severitate informare, avertizare sau blocare.',
    phase: 'Etapa 1',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['max ore/zi', 'max ore/lună', 'weekend', 'sărbători legale', 'date obligatorii'],
  },
  {
    id: 'deliverables',
    title: 'Livrabile și documente',
    description: 'Tipuri documente, extensii acceptate, dimensiuni, reguli S3, statusuri și validare PM.',
    phase: 'Etapa 2',
    owners: ['project_admin'],
    controls: ['PDF', 'DOCX', 'XLSX', 'status livrabil', 'documente obligatorii'],
  },
  {
    id: 'pm-checks',
    title: 'Verificare PM',
    description: 'Checklisturi, criterii obligatorii/opționale, observații standard și neconformități.',
    phase: 'Etapa 2',
    owners: ['pm', 'project_admin'],
    controls: ['criterii', 'severitate', 'termen remediere', 'observații standard'],
  },
  {
    id: 'templates',
    title: 'Template-uri',
    description: 'Rapoarte, Anexa 10, pontaj, MySMIS, OPIS, emailuri, texte standard și variabile disponibile.',
    phase: 'Etapa 1',
    owners: ['project_admin'],
    controls: ['{expert_nume}', '{luna}', '{activitati}', '{livrabile}', '{indicatori}'],
  },
  {
    id: 'exports',
    title: 'Exporturi',
    description: 'Coloane, ordine, denumiri, formate și profiluri de export pentru PM, expert, MySMIS și arhivă.',
    phase: 'Etapa 2',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['Excel', 'Word', 'PDF', 'MySMIS', 'arhivă internă'],
  },
  {
    id: 'ai',
    title: 'AI',
    description: 'Activare funcții AI, prompturi, roluri permise, limite de utilizare, audit și costuri estimate.',
    phase: 'Etapa 3',
    owners: ['technical_super_admin'],
    controls: ['generare raport', 'rescriere text', 'rate limit', 'cost limit', 'jurnal AI'],
  },
  {
    id: 'import-backup',
    title: 'Import / Backup',
    description: 'Import Excel/CSV, previzualizare diferențe, validare duplicate, export backup și arhivare lunară.',
    phase: 'Etapa 2',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['experți', 'catalog activități', 'grupuri lucru', 'statusuri', 'restaurare fișier'],
    href: '/admin/historical-import',
  },
  {
    id: 'audit',
    title: 'Audit',
    description: 'Istoric modificări cu actor, dată, valoare veche/nouă și justificare pentru acțiuni sensibile.',
    phase: 'Etapa 2',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['cine', 'când', 'ce câmp', 'valoare veche', 'valoare nouă', 'motiv'],
  },
  {
    id: 'settings',
    title: 'Setări aplicație',
    description: 'Logo, culori, limbă, fus orar, disclaimer finanțare, footer documente și ghiduri interne.',
    phase: 'Etapa 2',
    owners: ['project_admin', 'technical_super_admin'],
    controls: ['nume aplicație', 'format dată', 'email suport', 'manual utilizare'],
  },
];

const isActiveExpert = (expert: Pick<Expert, 'isActive'>): boolean => expert.isActive !== false;

export function buildAdminDashboardSnapshot(input: AdminDashboardSnapshotInput): AdminDashboardSnapshot {
  const activeExperts = input.experts.filter(isActiveExpert);
  const reportedExpertIds = new Set(
    input.activities.map((activity) => activity.expertId ?? activity.expertEmail).filter(Boolean),
  );
  const hoursByExpert = new Map<string, number>();

  for (const activity of input.activities) {
    const expertKey = activity.expertId ?? activity.expertEmail;
    if (!expertKey) continue;

    hoursByExpert.set(expertKey, (hoursByExpert.get(expertKey) ?? 0) + Number(activity.hours ?? 0));
  }

  const incompleteActivities = input.activities.filter((activity) => !activity.saCode || activity.status === 'draft').length;
  const missingDeliverables = input.activities.filter(
    (activity) => !hasUsableMainDeliverable(activity.deliverables),
  ).length;
  const configurationErrors = activeExperts
    .filter((expert) => !expert.email || !expert.saCodes || expert.saCodes.length === 0)
    .map((expert) => `${expert.name}: lipsește ${!expert.email ? 'emailul' : 'alocarea pe subactivități'}`);

  return {
    totalExperts: input.experts.length,
    activeExperts: activeExperts.length,
    expertsWithPmAccess: input.experts.filter((expert) => expert.hasPmAccess).length,
    reportedExperts: reportedExpertIds.size,
    completeTimesheets: Array.from(hoursByExpert.values()).filter((hours) => hours >= 1).length,
    incompleteActivities,
    missingDeliverables,
    draftReports: input.reportStatuses.filter((report) => report.status === 'draft').length,
    sentReports: input.reportStatuses.filter((report) => report.status === 'sent').length,
    validatedReports: input.reportStatuses.filter((report) => report.status === 'approved' || report.status === 'validated').length,
    reportsWithObservations: input.reportStatuses.filter((report) => report.status === 'with_observations').length,
    nonConformingReports: input.reportStatuses.filter((report) => report.status === 'non_conforming').length,
    activeReportingMonths: input.activeReportingMonths,
    configurationErrors,
    referenceData: {
      activityCatalogCount: input.activityCatalogCount,
      workingGroupsCount: input.workingGroupsCount,
    },
  };
}

export const ruleSeverityLevels: Array<{ level: RuleSeverity; label: string; description: string }> = [
  { level: 'informare', label: 'Informare', description: 'Afișează doar un mesaj contextual.' },
  { level: 'avertizare', label: 'Avertizare', description: 'Permite continuarea, dar semnalează cazul la verificare.' },
  { level: 'blocare', label: 'Blocare', description: 'Blochează salvarea sau trimiterea până la corectare.' },
];

export const protectedAdminBoundaries = [
  'Cheile API și conexiunile AWS nu se afișează în adminul operațional.',
  'Structura bazei de date și permisiunile tehnice sensibile rămân la super admin.',
  'Ștergerea definitivă și modificările retroactive pe luni închise cer audit și justificare.',
  'Regulile aplicate unei luni arhivate nu se schimbă fără motiv explicit în jurnal.',
];
