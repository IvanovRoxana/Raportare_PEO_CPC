import type {
  ActivityAutofillCatalogCandidate,
  ActivityAutofillDeliverable,
  ActivityAutofillSuggestion,
} from '../activity-autofill.ts';
import type {
  ActivityAutofillAudit,
  KnowledgeChunk,
  KnowledgeDocument,
} from '../types.ts';

export type RagSourceType =
  | 'cerere_finantare'
  | 'manual_beneficiar'
  | 'descriere_activitati'
  | 'scop_sa'
  | 'fisa_post'
  | 'raportare_aprobata_oir'
  | 'raport_activitate_aprobat'
  | 'livrabil_aprobat'
  | 'livrabil_istoric'
  | 'other'
  | string;

export interface RagChunkInput {
  text: string;
  maxChars?: number;
  overlapChars?: number;
}

export interface RagChunk {
  chunkIndex: number;
  text: string;
  textHash: string;
  tokenEstimate: number;
}

export interface RagRetrievalRequest {
  deliverables: ActivityAutofillDeliverable[];
  catalogCandidates: ActivityAutofillCatalogCandidate[];
  selectedActivityId?: string;
  saCode: string;
  activityName: string;
  currentDescription: string;
  expertId?: string;
  expertName?: string;
  expertRole?: string;
  positionInProject?: string;
  category?: string;
  projectCode?: string;
  month?: number | string;
  year?: number | string;
  selectedDates?: string[];
}

export interface RagRetrievedChunk {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
}

export interface RagRetrievalResult {
  enabled: boolean;
  skippedReason?: string;
  queryText?: string;
  queryEmbeddingModel?: string;
  chunks: RagRetrievedChunk[];
  warnings: string[];
}

export interface CompactRagContext {
  promptContext: string;
  retrievalJson: string;
  candidateJson: string;
  warnings: string[];
}

export interface RagIndexDocumentInput {
  roleId?: string;
  title: string;
  sourceType: RagSourceType;
  text: string;
  category?: string;
  expertId?: string;
  expertName?: string;
  expertRole?: string;
  projectCode?: string;
  month?: number;
  year?: number;
  saCode?: string;
  activityName?: string;
  approvalStatus?: string;
  originalFileName?: string;
  s3Key?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  extractionSource?: 'native' | 'ocr';
  extractionComplete?: boolean;
}

export interface RagIndexDocumentResult {
  document: KnowledgeDocument | null;
  chunks: KnowledgeChunk[];
  dryRun: boolean;
}

export interface RagAuthContext {
  authToken?: string;
  timeoutMs?: number;
}

export interface ActivityAutofillAuditInput extends Omit<ActivityAutofillAudit, 'id' | 'createdAt' | 'updatedAt'> {
  suggestion?: ActivityAutofillSuggestion;
}
