'use client';

import type { TitleCheckStatus, TitleSource, TitleSuggestionConfidence } from './title-suggestion.ts';
import { titleExistsInDocumentText } from './title-suggestion.ts';

// All deliverable types available in the system
export const ALL_DELIVERABLE_TYPES = [
  'Studiu / Analiză / Raport de cercetare',
  'Ghid / Manual / Toolkit',
  'Metodologie / Procedură',
  'Curriculum / Suport de curs',
  'Material de informare / Infografic',
  'Plan de acțiune / Strategie',
  'Minute întâlnire / MOM',
  'Raport de monitorizare',
  'Instrument de lucru / Template',
  'Fotografii eveniment',
  'Lista prezență',
  'Altele',
] as const;

// Grup Tinta organizations
export const GT_ORGANIZATIONS = [
  { id: 'cpc', name: 'CPC', full: 'Confederația Patronală Concordia', label: 'CPC — Confederația Patronală Concordia' },
  { id: 'anis', name: 'ANIS', full: 'Federația Patronală a Industriei de Software și Servicii', label: 'ANIS — Software & IT' },
  { id: 'apmr', name: 'APMR', full: 'Asociația Producătorilor de Mobilă din România', label: 'APMR — Producători Mobilă' },
  { id: 'cpbr', name: 'CPBR', full: 'Consiliul Patronatelor Bancare din România', label: 'CPBR — Sector Bancar' },
  { id: 'fpfr', name: 'FPFR', full: 'Federația Patronală a Farmaciilor din România', label: 'FPFR — Farmacii' },
  { id: 'plcr', name: 'PLCR', full: 'Patronatul Leasingului și al Creditului din România', label: 'PLCR — Leasing & Credit' },
  { id: 'frbr', name: 'FRBR', full: 'Federația pentru Băuturi Răcoritoare', label: 'FRBR — Băuturi' },
] as const;

// GT Activity types
export const GT_ACTIVITY_TYPES = [
  'Eveniment / atelier',
  'Consultanță / consiliere',
  'Informare / newsletter',
  'Întâlnire bilaterală',
  'Activitate de recrutare',
  'Altele',
] as const;

// Document stadiu options
export const DOCUMENT_STADIU_OPTIONS = [
  { value: 'draft', label: 'Draft / În lucru' },
  { value: 'final', label: 'Versiune finală' },
  { value: 'approved', label: 'Aprobat / Validat' },
] as const;

// Helper to check if activity is event type (requires special documents)
export function isEventActivity(activityType: string): boolean {
  const eventKeywords = [
    'eveniment', 'atelier', 'workshop', 'conferință', 'seminar',
    'întâlnire', 'reuniune', 'sesiune', 'forum', 'dezbatere',
    'training', 'formare', 'instruire', 'webinar'
  ];
  const lower = activityType.toLowerCase();
  return eventKeywords.some(k => lower.includes(k));
}

// Helper to extract date from document text
export function extractEventDate(text: string): string | null {
  if (!text) return null;

  // Try various Romanian date formats
  const patterns = [
    /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/,
    /(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+(\d{4})/i,
  ];

  const monthNames: Record<string, string> = {
    'ianuarie': '01', 'februarie': '02', 'martie': '03', 'aprilie': '04',
    'mai': '05', 'iunie': '06', 'iulie': '07', 'august': '08',
    'septembrie': '09', 'octombrie': '10', 'noiembrie': '11', 'decembrie': '12'
  };

  const parseDate = (source: string) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) {
        if (match[2] && monthNames[match[2].toLowerCase()]) {
          const day = match[1].padStart(2, '0');
          const month = monthNames[match[2].toLowerCase()];
          const year = match[3];
          return `${year}-${month}-${day}`;
        } else {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year = match[3];
          return `${year}-${month}-${day}`;
        }
      }
    }

    return null;
  };

  const eventDateLine = text
    .split(/\r?\n/)
    .find((line) => {
      const normalizedLine = line
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      return /^\s*(data(?:\s+eveniment(?:ului)?)?|eveniment)\s*[:=-]/.test(normalizedLine)
        && !normalizedLine.includes('intocmirii');
    });

  return (eventDateLine ? parseDate(eventDateLine) : null) || parseDate(text);
}

// Helper to check if title is contained in document
export function titleContains(docTitle: string, declaredTitle: string): boolean {
  return titleExistsInDocumentText(docTitle, declaredTitle);
}

// Deliverable slot types for structured organization
export type DeliverableSlotType = 
  | 'livrabil'       // Main deliverable (studiu, ghid, etc.)
  | 'main'           // Alias for livrabil (backward compatibility)
  | 'raport_preliminar' // Optional preliminary report
  | 'event_mom'      // MOM / Event report
  | 'event_proof'    // Photo / Attendance list
  | 'justificativ';  // Supporting documents

export interface DeliverableEligibilityCheck {
  status: 'eligibil' | 'eligibil_cu_observatii' | 'neeligibil' | 'neconcludent' | string;
  score: number;
  summary: string;
  checks: Array<{
    criterion: string;
    status: 'pass' | 'warning' | 'fail' | 'unknown' | string;
    explanation: string;
  }>;
  missingElements: string[];
  recommendations: string[];
  riskFlags: string[];
  suggestedSettings?: {
    saCode?: string;
    activityName?: string;
    selectedActivityId?: string;
    deliverableType?: string;
    confidence: 'high' | 'medium' | 'low' | string;
    reason: string;
    changes: Array<'activity' | 'deliverableType' | string>;
  } | null;
  checkedAt?: string;
  checkedBy?: string;
  checkedActivityId?: string;
  checkedSaCode?: string;
  checkedActivityName?: string;
  checkedDeliverableType?: string;
  pmUnlockRequested?: boolean;
  pmUnlockRequestedAt?: string;
  pmUnlockRequestedBy?: string;
  pmUnlockReason?: string;
  pmUnlockApproved?: boolean;
  pmUnlockApprovedAt?: string;
  pmUnlockApprovedBy?: string;
  pmUnlockResolvedByCorrection?: boolean;
  pmUnlockResolvedAt?: string;
  pmUnlockOriginalStatus?: string;
  pmUnlockOriginalSummary?: string;
  modelAuditId?: string;
  analyzedDeliverables?: Array<{
    id?: string;
    documentTitle?: string;
    fileName?: string;
    deliverableType?: string;
    isPrimary?: boolean;
  }>;
}

export interface DeliverableSlot {
  id: string;
  slotType: DeliverableSlotType;
  type?: string; // Deliverable type from ALL_DELIVERABLE_TYPES
  name?: string; // Display name
  filename?: string;
  rawFilename?: string;
  fileType?: string;
  fileSize?: number;
  filePath?: string;
  fileData?: string; // Base64
  documentId?: string;
  s3Bucket?: string;
  s3Key?: string;
  fileHash?: string;
  firstPageTextHash?: string;
  contentFingerprint?: string;
  uploadedByExpertId?: string;
  uploadedByExpertName?: string;
  projectId?: string;
  projectName?: string;
  sourceActivityId?: string;
  activityDate?: string;
  saCode?: string;
  deliverableType?: string;
  isCommonDeliverable?: boolean;
  requiresEventProof?: boolean;
  sharedWithExpertIds?: string[];
  possibleDuplicateOfDocumentId?: string;
  duplicateStatus?: string;
  uploadedAt?: string;
  uploaded: boolean;
  isPhoto: boolean;
  docTitle: string | null;
  docText: string | null;
  textExtractionSource?: 'native' | 'ocr';
  declaredTitle: string;
  suggestedTitle?: string | null;
  titleSuggestionConfidence?: TitleSuggestionConfidence;
  titleSuggestionAlternatives?: string[];
  titleSuggestionReason?: string;
  firstPageText?: string | null;
  titleSource?: TitleSource;
  titleMatch: boolean | null;
  titleConfirmed: boolean;
  titleCheckStatus?: TitleCheckStatus;
  titleCheckMessage?: string;
  stadiu: string;
  aiCheck: {
    eligible: boolean | null;
    reason: string;
    issues: string[];
  } | null;
  aiStatus?: string;
  aiReason?: string;
  eligibilityCheck?: DeliverableEligibilityCheck | null;
  common?: boolean; // If this is a shared deliverable across experts
  attachedFromExisting?: boolean;
  lockedExistingMetadata?: boolean;
  uploadError?: string;
  isPendingConfirm: boolean;
}

export function inferDeliverableStadiuFromEligibility(
  stadiu?: string | null,
  eligibilityCheck?: DeliverableEligibilityCheck | null,
) {
  const normalizedStadiu = String(stadiu || '').trim();
  if (normalizedStadiu) return normalizedStadiu;

  const status = eligibilityCheck?.status;
  if (
    status === 'eligibil'
    || status === 'eligibil_cu_observatii'
    || eligibilityCheck?.pmUnlockApproved
  ) {
    return 'final';
  }

  return '';
}

// Default empty deliverable slot
export function createDeliverableSlot(slotType: DeliverableSlotType, name: string = ''): DeliverableSlot {
  return {
    id: `deliv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    slotType,
    type: '',
    name,
    filename: '',
    rawFilename: '',
    fileType: '',
    fileSize: 0,
    filePath: undefined,
    fileData: undefined,
    documentId: undefined,
    s3Bucket: undefined,
    s3Key: undefined,
    fileHash: undefined,
    firstPageTextHash: undefined,
    contentFingerprint: undefined,
    uploadedByExpertId: undefined,
    uploadedByExpertName: undefined,
    projectId: undefined,
    projectName: undefined,
    sourceActivityId: undefined,
    activityDate: undefined,
    saCode: undefined,
    deliverableType: undefined,
    isCommonDeliverable: false,
    requiresEventProof: false,
    sharedWithExpertIds: [],
    possibleDuplicateOfDocumentId: undefined,
    duplicateStatus: undefined,
    uploadedAt: undefined,
    uploaded: false,
    isPhoto: false,
    docTitle: null,
    docText: null,
    declaredTitle: '',
    suggestedTitle: null,
    titleSuggestionConfidence: undefined,
    titleSuggestionAlternatives: [],
    titleSuggestionReason: undefined,
    firstPageText: null,
    titleSource: undefined,
    titleMatch: null,
    titleConfirmed: false,
    titleCheckStatus: undefined,
    titleCheckMessage: undefined,
    stadiu: '',
    aiCheck: null,
    eligibilityCheck: null,
    common: false,
    isPendingConfirm: false,
  };
}
