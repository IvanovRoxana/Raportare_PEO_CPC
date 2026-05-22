import type { OperationalStatus } from '@/components/ui/status-badge';

export const PROCUREMENT_STATUSES = [
  'DRAFT',
  'PLANIFICATA',
  'DOCUMENTATIE_IN_LUCRU',
  'DOCUMENTATIE_IN_VERIFICARE',
  'NECESITA_COMPLETARI',
  'GATA_DE_LANSARE',
  'LANSATA',
  'IN_CLARIFICARI',
  'TERMEN_OFERTE_EXPIRAT',
  'OFERTE_PRIMITE',
  'FARA_OFERTE',
  'NEATRIBUITA_RELANSARE',
  'IN_EVALUARE',
  'ATRIBUITA',
  'CONTRACT_SEMNAT',
  'CONTRACT_IN_IMPLEMENTARE',
  'LIVRABILE_PREDATE',
  'PV_RECEPTIE_SEMNAT',
  'FACTURA_EMISA',
  'TRANSMIS_FINANCIAR',
  'CONTRACT_INCHEIAT',
  'ARHIVATA',
] as const;

export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];
export type ProcurementType = 'SERVICII' | 'BUNURI' | 'LUCRARI';
export type ProcurementProcedureType = 'ACHIZITIE_DIRECTA' | 'ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE' | 'ALTA_PROCEDURA';
export type ProcurementDocumentVisibility = 'INTERNAL_ONLY' | 'PUBLICABLE' | 'SENT_TO_BIDDERS' | 'REPORTING_ONLY';
export type ProcurementAttentionLevel = 'on_track' | 'in_atentie' | 'decalat_fata_de_plan' | 'necesita_actualizare_termen';

export type ProcurementPlanRawRow = {
  n: number;
  c: string;
  t: string;
  pt: string;
  pr: string;
  pe: string;
  cur: string;
  net: number;
  vat: number;
  gross: number;
};

export interface ProcurementProject {
  id: string;
  code: string;
  title: string;
  description?: string;
  category: string;
  projectId?: string;
  projectCode?: string;
  mysmisCode?: string;
  subactivity?: string;
  procurementType: ProcurementType;
  procedureType: ProcurementProcedureType;
  responsibleUserId?: string;
  department?: string;
  currentStatus: ProcurementStatus;
  estimatedValueWithoutVat: number;
  estimatedVatValue: number;
  estimatedValueWithVat: number;
  currency: string;
  budgetLine?: string;
  fundingSource?: string;
  plannedPeriod: string;
  plannedStartYear?: number;
  plannedEndYear?: number;
  attentionLevel: ProcurementAttentionLevel;
  attentionLabel?: string;
  sourceRowNumber?: number;
  sourceFileName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementDocument {
  id: string;
  procurementProjectId: string;
  documentType: string;
  title: string;
  visibilityType: ProcurementDocumentVisibility;
  stage: string;
  fileUrl?: string;
  status?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementLaunch {
  id: string;
  procurementProjectId: string;
  launchDate?: string;
  launchMethod?: string;
  launchChannel?: string;
  publishedUrl?: string;
  clarificationsDeadline?: string;
  offerDeadline?: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementSupplier {
  id: string;
  name: string;
  cui?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  isVatPayer?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementOffer {
  id: string;
  procurementProjectId: string;
  supplierId?: string;
  receivedDate?: string;
  offeredValueWithoutVat?: number;
  offeredValueWithVat?: number;
  currency?: string;
  documentsComplete?: boolean;
  eligibilityStatus?: string;
  technicalConformityStatus?: string;
  financialScore?: number;
  isWinningOffer?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementEvaluation {
  id: string;
  procurementProjectId: string;
  offerId?: string;
  evaluationStage: string;
  administrativeResult?: string;
  technicalResult?: string;
  financialResult?: string;
  decision?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementContract {
  id: string;
  procurementProjectId: string;
  winningOfferId?: string;
  supplierId?: string;
  contractNumber?: string;
  contractDate?: string;
  contractValueWithoutVat?: number;
  contractValueWithVat?: number;
  currency?: string;
  implementationStartDate?: string;
  implementationEndDate?: string;
  contractStatus?: string;
  fileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementDeliverable {
  id: string;
  procurementContractId?: string;
  procurementProjectId: string;
  title: string;
  description?: string;
  dueDate?: string;
  deliveryDate?: string;
  status?: string;
  acceptanceNotes?: string;
  fileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementReception {
  id: string;
  procurementContractId?: string;
  procurementProjectId: string;
  receptionDate?: string;
  receptionDocumentNumber?: string;
  receptionFileUrl?: string;
  status?: string;
  sentToFinancialAt?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementInvoice {
  id: string;
  procurementContractId?: string;
  procurementProjectId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceValueWithoutVat?: number;
  invoiceVatValue?: number;
  invoiceValueWithVat?: number;
  currency?: string;
  invoiceFileUrl?: string;
  sentToFinancialAt?: string;
  status?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementStatusHistory {
  id: string;
  procurementProjectId: string;
  oldStatus?: ProcurementStatus;
  newStatus: ProcurementStatus;
  changedBy?: string;
  changedAt: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementChecklist {
  id: string;
  procurementProjectId: string;
  stage: string;
  itemKey: string;
  itemLabel: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const PROCUREMENT_STATUS_LABELS: Record<ProcurementStatus, string> = {
  DRAFT: 'Draft',
  PLANIFICATA: 'Planificată',
  DOCUMENTATIE_IN_LUCRU: 'Documentație în lucru',
  DOCUMENTATIE_IN_VERIFICARE: 'Documentație în verificare',
  NECESITA_COMPLETARI: 'Necesită completări',
  GATA_DE_LANSARE: 'Gata de lansare',
  LANSATA: 'Lansată',
  IN_CLARIFICARI: 'În clarificări',
  TERMEN_OFERTE_EXPIRAT: 'Termen oferte expirat',
  OFERTE_PRIMITE: 'Oferte primite',
  FARA_OFERTE: 'Fără oferte',
  NEATRIBUITA_RELANSARE: 'Neatribuită / relansare',
  IN_EVALUARE: 'În evaluare',
  ATRIBUITA: 'Atribuită',
  CONTRACT_SEMNAT: 'Contract semnat',
  CONTRACT_IN_IMPLEMENTARE: 'Contract în implementare',
  LIVRABILE_PREDATE: 'Livrabile predate',
  PV_RECEPTIE_SEMNAT: 'PV recepție semnat',
  FACTURA_EMISA: 'Factură emisă',
  TRANSMIS_FINANCIAR: 'Transmis financiar',
  CONTRACT_INCHEIAT: 'Contract încheiat',
  ARHIVATA: 'Arhivată',
};

export const PROCUREMENT_STATUS_BADGE: Record<ProcurementStatus, OperationalStatus> = {
  DRAFT: 'draft',
  PLANIFICATA: 'in_lucru',
  DOCUMENTATIE_IN_LUCRU: 'in_lucru',
  DOCUMENTATIE_IN_VERIFICARE: 'in_analiza',
  NECESITA_COMPLETARI: 'cu_observatii',
  GATA_DE_LANSARE: 'verificat',
  LANSATA: 'in_lucru',
  IN_CLARIFICARI: 'in_analiza',
  TERMEN_OFERTE_EXPIRAT: 'cu_observatii',
  OFERTE_PRIMITE: 'in_analiza',
  FARA_OFERTE: 'cu_observatii',
  NEATRIBUITA_RELANSARE: 'cu_observatii',
  IN_EVALUARE: 'in_analiza',
  ATRIBUITA: 'aprobat',
  CONTRACT_SEMNAT: 'aprobat',
  CONTRACT_IN_IMPLEMENTARE: 'in_lucru',
  LIVRABILE_PREDATE: 'verificat',
  PV_RECEPTIE_SEMNAT: 'verificat',
  FACTURA_EMISA: 'verificat',
  TRANSMIS_FINANCIAR: 'gata_export',
  CONTRACT_INCHEIAT: 'inchisa',
  ARHIVATA: 'inchisa',
};

export const PROCUREMENT_ATTENTION_LABELS: Record<ProcurementAttentionLevel, string> = {
  on_track: 'în grafic',
  in_atentie: 'în atenție',
  decalat_fata_de_plan: 'decalat față de plan',
  necesita_actualizare_termen: 'necesită actualizare termen',
};

export const PROCUREMENT_DOCUMENT_VISIBILITY_LABELS: Record<ProcurementDocumentVisibility, string> = {
  INTERNAL_ONLY: 'Dosar intern',
  PUBLICABLE: 'Publicabil',
  SENT_TO_BIDDERS: 'Transmis ofertanților',
  REPORTING_ONLY: 'Raportare',
};

export const REQUIRED_PROCUREMENT_CHECKLIST = [
  { stage: 'DOCUMENTATION', itemKey: 'referat_necesitate', itemLabel: 'Referat de necesitate', isRequired: true },
  { stage: 'DOCUMENTATION', itemKey: 'nota_valoare_estimata', itemLabel: 'Notă determinare valoare estimată', isRequired: true },
  { stage: 'LAUNCH', itemKey: 'specificatii_tehnice', itemLabel: 'Specificații tehnice', isRequired: true },
  { stage: 'LAUNCH', itemKey: 'calendar_achizitie', itemLabel: 'Calendarul achiziției', isRequired: true },
  { stage: 'LAUNCH', itemKey: 'anunt_procedura', itemLabel: 'Anunțul procedurii', isRequired: true },
  { stage: 'EVALUATION', itemKey: 'proces_verbal_evaluare', itemLabel: 'Proces-verbal de evaluare', isRequired: true },
  { stage: 'EVALUATION', itemKey: 'nota_atribuire', itemLabel: 'Notă justificativă de atribuire', isRequired: true },
  { stage: 'CONTRACT', itemKey: 'contract_semnat', itemLabel: 'Contract semnat', isRequired: true },
  { stage: 'RECEPTION', itemKey: 'pv_receptie', itemLabel: 'Proces-verbal de recepție', isRequired: true },
  { stage: 'INVOICE', itemKey: 'factura', itemLabel: 'Factură emisă', isRequired: true },
] as const;

export function normalizeProcurementType(value: string): ProcurementType {
  const normalized = normalizeText(value);
  if (normalized.includes('lucrari')) return 'LUCRARI';
  if (normalized.includes('furnizare') || normalized.includes('bunuri')) return 'BUNURI';
  return 'SERVICII';
}

export function normalizeProcedureType(value: string): ProcurementProcedureType {
  const normalized = normalizeText(value);
  if (normalized.includes('directa')) return 'ACHIZITIE_DIRECTA';
  if (normalized.includes('competitiva') || normalized.includes('mfe')) return 'ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE';
  return 'ALTA_PROCEDURA';
}

export function normalizeProcurementPlanRow(row: ProcurementPlanRawRow): ProcurementProject {
  const { startYear, endYear } = parseProcurementPeriod(row.pe);

  return {
    id: `seed-procurement-${String(row.n).padStart(3, '0')}`,
    code: `ACH-${String(row.n).padStart(3, '0')}`,
    title: row.t,
    category: row.c,
    procurementType: normalizeProcurementType(row.pt),
    procedureType: normalizeProcedureType(row.pr),
    currentStatus: 'PLANIFICATA',
    estimatedValueWithoutVat: row.net,
    estimatedVatValue: row.vat,
    estimatedValueWithVat: row.gross,
    currency: row.cur || 'RON',
    plannedPeriod: row.pe,
    plannedStartYear: startYear,
    plannedEndYear: endYear,
    attentionLevel: getProcurementAttentionLevel({ plannedEndYear: endYear, currentStatus: 'PLANIFICATA' }),
    attentionLabel: PROCUREMENT_ATTENTION_LABELS[getProcurementAttentionLevel({ plannedEndYear: endYear, currentStatus: 'PLANIFICATA' })],
    sourceRowNumber: row.n,
    sourceFileName: 'Plan_achizitii_SMIS_April_2026.xlsx',
  };
}

export function buildProcurementProjectFromImportRow(input: Record<string, unknown>, rowNumber: number): ProcurementProject {
  const raw: ProcurementPlanRawRow = {
    n: rowNumber,
    c: stringValue(input['Titlul achiziției'] ?? input['Titlul achizitiei'] ?? input['title']),
    t: stringValue(input['Descrierea achiziției'] ?? input['Descrierea achizitiei'] ?? input['description']),
    pt: stringValue(input['Tip achiziție'] ?? input['Tip achizitie'] ?? input['procurementType']),
    pr: stringValue(input['Tip procedură'] ?? input['Tip procedura'] ?? input['procedureType']),
    pe: stringValue(input['Perioada'] ?? input['period']),
    cur: stringValue(input['Monedă'] ?? input['Moneda'] ?? input['currency']) || 'RON',
    net: numberValue(input['Valoare estimată fără TVA'] ?? input['Valoare estimata fara TVA'] ?? input['net']),
    vat: numberValue(input['Valoare TVA'] ?? input['vat']),
    gross: numberValue(input['Valoare totală estimată'] ?? input['Valoare totala estimata'] ?? input['gross']),
  };

  return normalizeProcurementPlanRow(raw);
}

export function getContractedProcurementProjects() {
  return CONTRACTED_PROCUREMENT_PLAN_ROWS.map(normalizeProcurementPlanRow);
}

export function buildProcurementDashboardSummary(projects: ProcurementProject[]) {
  const byStatus = new Map<ProcurementStatus, number>();
  const byType = new Map<ProcurementType, number>();
  const byProcedure = new Map<ProcurementProcedureType, number>();
  const byAttention = new Map<ProcurementAttentionLevel, number>();

  projects.forEach((project) => {
    byStatus.set(project.currentStatus, (byStatus.get(project.currentStatus) ?? 0) + 1);
    byType.set(project.procurementType, (byType.get(project.procurementType) ?? 0) + 1);
    byProcedure.set(project.procedureType, (byProcedure.get(project.procedureType) ?? 0) + 1);
    byAttention.set(project.attentionLevel, (byAttention.get(project.attentionLevel) ?? 0) + 1);
  });

  return {
    totalProjects: projects.length,
    plannedProjects: byStatus.get('PLANIFICATA') ?? 0,
    documentationInProgress: (byStatus.get('DOCUMENTATIE_IN_LUCRU') ?? 0) + (byStatus.get('DOCUMENTATIE_IN_VERIFICARE') ?? 0),
    readyToLaunch: byStatus.get('GATA_DE_LANSARE') ?? 0,
    launched: byStatus.get('LANSATA') ?? 0,
    inClarifications: byStatus.get('IN_CLARIFICARI') ?? 0,
    inEvaluation: byStatus.get('IN_EVALUARE') ?? 0,
    awarded: byStatus.get('ATRIBUITA') ?? 0,
    contractsSigned: byStatus.get('CONTRACT_SEMNAT') ?? 0,
    contractsInImplementation: byStatus.get('CONTRACT_IN_IMPLEMENTARE') ?? 0,
    completed: (byStatus.get('CONTRACT_INCHEIAT') ?? 0) + (byStatus.get('ARHIVATA') ?? 0),
    attentionProjects:
      (byAttention.get('in_atentie') ?? 0) +
      (byAttention.get('decalat_fata_de_plan') ?? 0) +
      (byAttention.get('necesita_actualizare_termen') ?? 0),
    totalEstimatedWithoutVat: roundMoney(projects.reduce((sum, project) => sum + project.estimatedValueWithoutVat, 0)),
    totalEstimatedVat: roundMoney(projects.reduce((sum, project) => sum + project.estimatedVatValue, 0)),
    totalEstimatedWithVat: roundMoney(projects.reduce((sum, project) => sum + project.estimatedValueWithVat, 0)),
    byStatus,
    byType,
    byProcedure,
    byAttention,
  };
}

export function createProcurementStatusHistoryEntry(input: {
  procurementProjectId: string;
  oldStatus?: ProcurementStatus;
  newStatus: ProcurementStatus;
  changedBy?: string;
  notes?: string;
  changedAt?: string;
}): Omit<ProcurementStatusHistory, 'id'> {
  return {
    procurementProjectId: input.procurementProjectId,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    changedBy: input.changedBy,
    changedAt: input.changedAt ?? new Date().toISOString(),
    notes: input.notes,
  };
}

export function getProcurementAttentionLevel(input: {
  plannedEndYear?: number;
  currentStatus: ProcurementStatus;
  now?: Date;
}): ProcurementAttentionLevel {
  if (['CONTRACT_INCHEIAT', 'ARHIVATA', 'TRANSMIS_FINANCIAR'].includes(input.currentStatus)) return 'on_track';
  if (!input.plannedEndYear) return 'necesita_actualizare_termen';

  const currentYear = input.now?.getFullYear() ?? new Date().getFullYear();
  if (input.plannedEndYear < currentYear) return 'decalat_fata_de_plan';
  if (input.plannedEndYear === currentYear) return 'in_atentie';
  return 'on_track';
}

export function isProcurementChecklistComplete(items: Pick<ProcurementChecklist, 'isRequired' | 'isCompleted'>[]) {
  return items.filter((item) => item.isRequired).every((item) => item.isCompleted);
}

export function formatRon(value: number) {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatProcedureType(value: ProcurementProcedureType) {
  if (value === 'ACHIZITIE_DIRECTA') return 'Achiziție directă';
  if (value === 'ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE') return 'Achiziție privată competitivă';
  return 'Altă procedură';
}

export function formatProcurementType(value: ProcurementType) {
  if (value === 'BUNURI') return 'Bunuri';
  if (value === 'LUCRARI') return 'Lucrări';
  return 'Servicii';
}

function parseProcurementPeriod(value: string) {
  const years = Array.from(value.matchAll(/\d{4}/g)).map((match) => Number(match[0]));
  return {
    startYear: years.length ? Math.min(...years) : undefined,
    endYear: years.length ? Math.max(...years) : undefined,
  };
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function stringValue(value: unknown) {
  return String(value ?? '').trim();
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '0').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const CONTRACTED_PROCUREMENT_PLAN_ROWS: ProcurementPlanRawRow[] = [
  { n: 1, c: 'Analiza', t: 'Serviciu externalizat de elaborare "Studiu privind Impactul AI asupra productivității muncii în România - politici pentru adopție în sectorul public și privat"', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2028', cur: 'RON', net: 405572, vat: 85170.12, gross: 490742.12 },
  { n: 2, c: 'Analiza', t: 'Serviciu externalizat de elaborare "Studiu privind costurile birocrației pentru angajatorii români"', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026', cur: 'RON', net: 433478.12, vat: 91030.4, gross: 524508.52 },
  { n: 3, c: 'Analiza', t: 'Serviciu externalizat de elaborare "Studiu strategic privind poziționarea României față de viitorul European Competitiveness Fund (ECF) în Cadrul Financiar Multianual 2028-2034"', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026', cur: 'RON', net: 462619.1, vat: 97150.01, gross: 559769.11 },
  { n: 4, c: 'Servicii deplasare schimb de experiență', t: 'Achiziționarea unor servicii de transport și cazare pentru Schimb de experiență internațională în Spania, Cod CPV 63510000-7 6', pt: 'Servicii', pr: 'Achiziție directă', pe: '2027', cur: 'RON', net: 21701.73, vat: 0, gross: 21701.73 },
  { n: 5, c: 'Servicii deplasare schimb de experiență', t: 'Achiziționarea unor servicii de transport și cazare pentru Schimb de experiență internațională în Italia, Cod CPV 63510000-7', pt: 'Servicii', pr: 'Achiziție directă', pe: '2026', cur: 'RON', net: 19279.4, vat: 0, gross: 19279.4 },
  { n: 6, c: 'Servicii deplasare schimb de experiență', t: 'Achiziționarea unor servicii de transport și cazare pentru Schimb de experiență internațională în Suedia, Cod CPV 63510000-7', pt: 'Servicii', pr: 'Achiziție directă', pe: '2025', cur: 'RON', net: 20748.68, vat: 0, gross: 20748.68 },
  { n: 7, c: 'Organizare ateliere de lucru', t: 'Serviciu externalizat de organizare de forumuri /ateliere de lucru anuale pentru Centrul Regional 3 (4 forumuri /ateliere) Cod CPV79951000-5;79341000-6', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027 - 2028', cur: 'RON', net: 82046.28, vat: 17229.72, gross: 99276 },
  { n: 8, c: 'Organizare ateliere de lucru', t: 'Serviciu externalizat de organizare de forumuri /ateliere de lucru anuale pentru Centrul Regional 2 (6 forumuri /ateliere) Cod CPV79951000-5;79341000-6', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026 - 2028', cur: 'RON', net: 123069.42, vat: 25844.58, gross: 148914 },
  { n: 9, c: 'Organizare ateliere de lucru', t: 'Serviciu externalizat de organizare forumuri /ateliere de lucru anuale, pentru Centrul Regional 1 (8 forumuri /ateliere) Cod CPV79951000-5;79341000-6', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025 - 2028', cur: 'RON', net: 164092.56, vat: 34459.44, gross: 198552 },
  { n: 10, c: 'Organizare Eveniment', t: 'Serviciu externalizat de organizare evenimente anuale Centru Regional 3 la pachet/simultan cu campanii de promovare pe diverse canale media (2 ev. anuale) CodCPV 79952000-2; 79341000-6;79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027 - 2028', cur: 'RON', net: 410231.4, vat: 86148.59, gross: 496379.99 },
  { n: 11, c: 'Organizare Eveniment', t: 'Serviciu externalizat de organizare evenimente anuale Centru Regional 2 la pachet/simultan cu campanii de promovare pe diverse canale media (3 ev. anuale) Cod CPV 79952000-2; 79341000-6;79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026 - 2028', cur: 'RON', net: 615347.11, vat: 129222.89, gross: 744570 },
  { n: 12, c: 'Organizare Eveniment', t: 'Serviciu externalizat de organizare evenimente anuale Centru Regional 1 la pachet/simultan cu campanii de promovare pe diverse canale media (4 ev. anuale) CodCPV 79952000-2; 79341000-6;79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025 - 2028', cur: 'RON', net: 861485.95, vat: 180912.05, gross: 1042398 },
  { n: 13, c: 'Masa podcast', t: 'Achizitionarea unei mese podcast pentru echipare studio inregistrari audio-video.Cod CPV 39121200-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 14146.83, vat: 2687.9, gross: 16834.73 },
  { n: 14, c: 'Lampa birou', t: 'Achizitionarea a 13 lampi de birou. Cod CPV 31521100-5', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 1469, vat: 279.11, gross: 1748.11 },
  { n: 15, c: 'Mixer video', t: 'Achizitionarea unui mixer video pentru studio inregistrari audio-video Business Hub. Cod CPV 32323300-6', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 5453, vat: 1036.07, gross: 6489.07 },
  { n: 16, c: 'Imprimante', t: 'Achizitionarea a 4 imprimante pentru Business Hub si 3 centre regionale. Cod CPV 30232110-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024-2027', cur: 'RON', net: 15568, vat: 2957.92, gross: 18525.92 },
  { n: 17, c: 'Blat', t: 'Achizitionarea a 9 blaturi necesare dotarii spatiului din Business Hub. Cod CPV 39130000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 3261.24, vat: 619.64, gross: 3880.88 },
  { n: 18, c: 'Structura metalica', t: 'Achizitionarea a 9 structuri metalice. Cod CPV 39130000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 27742.68, vat: 5271.11, gross: 33013.79 },
  { n: 19, c: 'Scaun cadru metalic', t: 'Achizitionarea a 8 x Scaun Abuela, cadru metalic. Cod CPV 39141000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 8934.88, vat: 1697.63, gross: 10632.51 },
  { n: 20, c: 'Scaun birou', t: 'Achizitionarea a 3 scaune birou.Cod CPV 39112000-0', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 5584.29, vat: 1061.02, gross: 6645.31 },
  { n: 21, c: 'Vitrina frigorifica sala evenimente', t: 'Achizitionare 2 vitrine frigorifice pentru sala evenimente. Cod CPV 42513210-0', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 3332, vat: 633.08, gross: 3965.08 },
  { n: 22, c: 'Vitrina frigorifica mare bucatarie', t: 'Achizitionarea vitrina frigorifica. Cod CPV 42513210-0', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 1890, vat: 359.1, gross: 2249.1 },
  { n: 23, c: 'Dulap 2 usi', t: 'Achizitionarea a 3 dulapuri cu 2 usi. Cod CPV 39122100-4', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 6477.75, vat: 1230.77, gross: 7708.52 },
  { n: 24, c: 'Espressor Business HUB& centre regionale', t: 'achizitionarea a 4 expresoare cafea pentru centrele regionale si Business Hub. Cod CPV 39711310-5', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024-2027', cur: 'RON', net: 17372, vat: 3300.68, gross: 20672.68 },
  { n: 25, c: 'Frigidere centre regionale', t: 'Achizitionarea a 3 frigidere pentru centrele regionale. Cod CPV 39711130-9', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2025-2027', cur: 'RON', net: 5547, vat: 1053.93, gross: 6600.93 },
  { n: 26, c: 'Televizor', t: 'Achizitionarea a 2 televizoare. Cod CPV 32324100-1', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 3362, vat: 638.78, gross: 4000.78 },
  { n: 27, c: 'Camere filmat', t: 'Achizitionarea a 3 camere de fimat studio inregistrari audio-video.Cod CPV 32333200-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 16575, vat: 3149.25, gross: 19724.25 },
  { n: 28, c: 'Ansamblu bucatarie, baza suspendate', t: 'Achizitionarea a Ansamblu bucatarie L400, baza suspendate. Cod CPV 39141000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 21840.72, vat: 4149.74, gross: 25990.46 },
  { n: 29, c: 'Combi dulap inalt cu usi', t: 'Achizitionarea a 1 Combi dulap inalt cu usi. Cod CPV 39141000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 3459.77, vat: 657.36, gross: 4117.13 },
  { n: 30, c: 'Panou frontal birouri', t: 'Achizitionarea a 9 panouri frontale pentru departajarea birourilor. Cod CPV 44112310-4', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 9024.21, vat: 1714.6, gross: 10738.81 },
  { n: 31, c: 'Masa bucatarie BusinessHUB', t: 'Achizitionarea a 2 x Masa Claro bucatarie. Cod CPV 39141000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 5559.46, vat: 1056.3, gross: 6615.76 },
  { n: 32, c: 'Licenta sistem operare', t: 'Achizitionarea a 14 licente sisteme de operare. Cod CPV 48517000-5', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 2338, vat: 444.22, gross: 2782.22 },
  { n: 33, c: 'Multifunctionala', t: 'Achizitionarea unei imprimante multifunctionale. Cod CPV 30232110-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 11500, vat: 2185, gross: 13685 },
  { n: 34, c: 'Mixer audio', t: 'Achizitionarea unui mixer audio. Cod CPV 32342410-9', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 3697, vat: 702.43, gross: 4399.43 },
  { n: 35, c: 'Microfoane', t: 'achizitionarea a 3 microfoane studio inregistrari audio-video Business Hub. Cod CPV 32341000-5', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 16620, vat: 3157.8, gross: 19777.8 },
  { n: 36, c: 'Calculator Desktop', t: 'Achizitionarea a 6 desktop-uri. Cod CPV 30213300-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 27546, vat: 5233.74, gross: 32779.74 },
  { n: 37, c: 'Laptop', t: 'Achizitionarea a 14 laptop-uri. Cod CPV 30213100-6', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 59052, vat: 11219.88, gross: 70271.88 },
  { n: 38, c: 'Masa foldabila', t: 'Achizitionarea a 12 mese foldabile .Cod CPV 39121200-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 128959.56, vat: 24502.32, gross: 153461.88 },
  { n: 39, c: 'Sistem videoconferinta', t: 'Achizitionarea unui sistem de video-conferinta sala de evenimente. Cod CPV 32232000-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 25762.12, vat: 4894.8, gross: 30656.92 },
  { n: 40, c: 'Scaun KIND', t: 'Achizitionarea a 9 scaune KIND. Cod CPV 39121200-8', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 19656.63, vat: 3734.76, gross: 23391.39 },
  { n: 41, c: 'Rollbox /Casetiera 3 sertare', t: 'Achizitionarea a 9 rollbox pentru depozitare documente. Cod CPV 39130000-2', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 11079.18, vat: 2105.04, gross: 13184.22 },
  { n: 42, c: 'Scaun sala consiliu', t: 'Achizitionarea a 24 scaune pentru sala de evenimente Business Hub.Cod CPV 39112000-0', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 41934.24, vat: 7967.51, gross: 49901.75 },
  { n: 43, c: 'Monitor', t: 'Achizitionarea a 10 monitoare. Cod Cpv 33195100-4', pt: 'Furnizare', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 8365.7, vat: 1335.7, gross: 9701.4 },
  { n: 44, c: 'Atelier de evaluare si mentorat "Atelier pentru Echipe cu Performanțe Ridicate "', t: 'Serviciu externalizat de organizare a unei sesiuni/atelier de evaluare si mentorat individual pentru dezvoltarea competentelor individuale si de leadership ale echipei.Cod CPV80532000-2/79998000-6', pt: 'Servicii', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 98283.24, vat: 18673.82, gross: 116957.06 },
  { n: 45, c: 'Program de formare profesionala', t: 'Serviciu externalizat organizare cursuri formare- instruire denumit generic "Concordia Learning Hub" pe tematici aplicate .Cod CPV80500000-9 /80510000-2', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026 - 2028', cur: 'RON', net: 1394786.78, vat: 292905.22, gross: 1687692 },
  { n: 46, c: 'Organizare eveniment', t: 'Serviciu externalizat organizare eveniment anual simultan cu campanie pe diverse canale media intitulat " Dialog pentru dezvoltare".Cod CPV79952000-2;79341000-6/79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2028', cur: 'RON', net: 307673.55, vat: 64611.45, gross: 372285 },
  { n: 47, c: 'Organizare eveniment', t: 'Serviciu externalizat de organizare eveniment anual simultan cu o campanie pe diverse canale media intitulat " Dialog pentru dezvoltare".Cod CPV79952000-2;79341000-6/79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027', cur: 'RON', net: 307673.55, vat: 64611.45, gross: 372285 },
  { n: 48, c: 'Organizare eveniment', t: 'Serviciu externalizat organizare eveniment anual simultan cu campanie pe diverse canale media intitulat " Dialog pentru dezvoltare".Cod CPV79952000-2;79341000-6/79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026', cur: 'RON', net: 307673.55, vat: 64611.45, gross: 372285 },
  { n: 49, c: 'Organizare eveniment', t: 'Serviciu externalizat organizare eveniment anual simultan cu campanie pe diverse canale media intitulat " Dialog pentru dezvoltare".Cod CPV79952000-2;79341000-6/79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025', cur: 'RON', net: 307673.55, vat: 64611.45, gross: 372285 },
  { n: 50, c: 'Organizare conferinta', t: 'Serviciu externalizat de organizare conferinta simultan cu campanie pe diverse canale media de prezentare rezultate"Analiza cantitativa a pietei muncii ".Cod CPV79952000-2;79341000-6 /79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026, 2028', cur: 'RON', net: 49227.77, vat: 10337.83, gross: 59565.6 },
  { n: 51, c: 'Organizare conferinta', t: 'Serviciu externalizat de organizare conferinta si campanie de promovare "Analiza cu privire la valoarea adaugata si contributia unor sectoare strategice.Cod CPV79952000-2;79341000-6; 79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025', cur: 'RON', net: 38971.98, vat: 8184.12, gross: 47156.1 },
  { n: 52, c: 'Organizare conferinta', t: 'Serviciu externalizat de organizare eveniment si campanie de promovare raport de analiza "Impozitarea muncii".Cod CPV79952000-2; 79341000-6/79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025', cur: 'RON', net: 36920.83, vat: 7753.37, gross: 44674.2 },
  { n: 53, c: 'Servicii actualizare pagina web Concordia', t: 'Serviciu externalizat de actualizare si intretinere website Concordia .Cod CPV72413000-8', pt: 'Servicii', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 48645.24, vat: 9242.6, gross: 57887.84 },
  { n: 54, c: 'Lucrari amenajare spatiu Business Hub Bucuresti', t: 'Serviciu externalizat de amenajare business HUB.Cod CPV45451100-4', pt: 'Lucrări', pr: 'Achiziție directă', pe: '2024', cur: 'RON', net: 189675.56, vat: 36038.36, gross: 225713.92 },
  { n: 55, c: 'Servicii de inchiriere spatiu Business HUB Bucuresti', t: 'Serviciu externalizat de inchiriere spatiu Business HUB.Cod CPV70310000-7', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2024-2028', cur: 'RON', net: 1490094.51, vat: 0, gross: 1490094.51 },
  { n: 56, c: 'Servicii de inchiriere spatiu pentru centru regional 3', t: 'Serviciu externalizat de inchiriere spatiu pentru infiintarea hub/centru regional in fiecare regiune istorica a Romaniei', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027-2028', cur: 'RON', net: 144000, vat: 30240, gross: 174240 },
  { n: 57, c: 'Servicii de inchiriere spatiu pentru centru regional 2', t: 'Serviciu externalizat de inchiriere spatiu pentru infiintarea hub/centru regional in fiecare regiune istorica a Romaniei', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026-2028', cur: 'RON', net: 216000, vat: 45360, gross: 261360 },
  { n: 58, c: 'Servicii de inchiriere spatiu pentru centru regional 1', t: 'Serviciu externalizat de inchiriere spatiu pentru infiintarea hub/centru regional in fiecare regiune istorica a Romaniei', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025-2028', cur: 'RON', net: 288000, vat: 60480, gross: 348480 },
  { n: 59, c: 'Campanie de comunicare si promovare', t: 'Serviciu externalizat de organizare campanie comunicare pe diverse canale de comunicare (eg.social media,publicatii din industrie si informare directa).Cod CPV79341000-6; 79341400-0', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026 - 2028', cur: 'RON', net: 1312740.5, vat: 275675.51, gross: 1588416.01 },
  { n: 60, c: 'Studiu de piata', t: 'Serviciu externalizat de elaborare a unei evaluarii a perceptiilor fata de Concordia.Cod CPV79320000-3', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2024', cur: 'RON', net: 95726.88, vat: 18188.11, gross: 113914.99 },
  { n: 61, c: 'Analiza', t: 'Serviciu externalizat de elaborare raport privind timpul de lucru si flexibilizarea muncii. Cod CPV79311100-8;79311200-9', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026', cur: 'RON', net: 106226.96, vat: 22307.66, gross: 128534.62 },
  { n: 62, c: 'Servicii dezvoltare solutii/aplicatii informatice tip gestionare/baza de date', t: 'Serviciu externalizat de dezvoltare a unei aplicatii/ solutii informatice tip gestionare /baza de date " Harta interactiva a Romaniei". Cod CPV72212482-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2024', cur: 'RON', net: 243772.22, vat: 46316.72, gross: 290088.94 },
  { n: 63, c: 'Analiza', t: 'Serviciu externalizat de elaborare raport privind integrarea lucratorilor non UE.Cod CPV79311100-8;79311200-9', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027', cur: 'RON', net: 89043.19, vat: 18699.07, gross: 107742.26 },
  { n: 64, c: 'Analiza', t: 'Serviciu externalizat de elaborare raport privind telemunca si dreptul de deconectare. Cod CPV79311100-8;79311200-9', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027', cur: 'RON', net: 44521.6, vat: 9349.54, gross: 53871.14 },
  { n: 65, c: 'Analiza', t: 'Serviciu externalizat de elaborare raport privind violenta si hartuirea la locul de munca. Cod CPV79311100-8;79311200-9', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2024', cur: 'RON', net: 62742.43, vat: 11921.06, gross: 74663.49 },
  { n: 66, c: 'Analiza', t: 'Serviciu externalizat de elaborare raport de analiza cantitativa a pietei muncii din Romania. Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2026, 2028', cur: 'RON', net: 317313.99, vat: 66635.94, gross: 383949.93 },
  { n: 67, c: 'Analiza', t: 'Serviciu externalizat de elaborare studiu despre impozitarea muncii .Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025', cur: 'RON', net: 397104, vat: 75449.76, gross: 472553.76 },
  { n: 68, c: 'Analiza', t: 'Serviciu externalizat de elaborare analiza referitoare la salariului minim.Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2024', cur: 'RON', net: 134022.6, vat: 25464.29, gross: 159486.89 },
  { n: 69, c: 'Analiza', t: 'Serviciu externalizat de elaborare document de analiza cu privire la valuarea adaugata si contributia unui sector strategic la economia nationala .Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2027', cur: 'RON', net: 102516.83, vat: 21528.53, gross: 124045.36 },
  { n: 70, c: 'Analiza', t: 'Serviciu externalizat de elaborare document de analiza cu privire la valuarea adaugata si contributia unui sector strategic la economia nationala .Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2028', cur: 'RON', net: 102516.83, vat: 21528.53, gross: 124045.36 },
  { n: 71, c: 'Analiza', t: 'Serviciu externalizat de elaborare document de analiza cu privire la valuarea adaugata si contributia a 3 sectoare strategice la economia nationala .Cod CPV79311400-1', pt: 'Servicii', pr: 'Achiziţie privată competitivă conform Ordin MFE', pe: '2025', cur: 'RON', net: 182480.83, vat: 38320.98, gross: 220801.81 },
];
