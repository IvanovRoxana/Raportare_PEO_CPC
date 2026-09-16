import type { RagIndexDocumentInput, RagSourceType } from './types.ts';

export interface RagReferenceImportOverride {
  title?: string;
  sourceType?: RagSourceType;
  projectCode?: string;
  saCode?: string;
  category?: string;
  expertId?: string;
  expertName?: string;
  expertRole?: string;
}

export interface RagReferenceImportOptions {
  projectCode?: string;
  createdBy?: string;
  override?: RagReferenceImportOverride;
}

export type RagReferenceImportInference =
  | {
      ok: true;
      input: Omit<RagIndexDocumentInput, 'text'>;
      warnings: string[];
    }
  | {
      ok: false;
      reason: string;
      warnings: string[];
      title: string;
    };

const DEFAULT_PROJECT_CODE = '302141';

export const REFERENCE_SOURCE_TYPES = ['scop_sa', 'descriere_activitati', 'fisa_post', 'cerere_finantare', 'manual_beneficiar'] as const;
export const MAX_REFERENCE_FILE_BYTES = 15 * 1024 * 1024;

// Role aliases used by the project's Expert catalog. The original filename is retained.
const ROLE_ALIASES: Record<string, string> = {
  'expert recrutare si selectie grup tinta': 'Expert Recrutare si Selectie GT',
  'expert cu protectia datelor cu caracter personal': 'Expert Protectia Datelor',
  'responsabil centru regional': 'Responsabil Centre Regionale',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  cerere_finantare: 'cerere_finantare',
  manual_beneficiar: 'manual_beneficiar',
  descriere_activitati: 'descriere_activitati',
  scop_sa: 'scop_sa',
  fisa_post: 'fisa_post',
};

export function normalizeReferenceLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .replace(/[ăâ]/gi, 'a')
    .replace(/[î]/gi, 'i')
    .toLowerCase()
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanReferenceTitle(fileName: string) {
  return String(fileName || '')
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferSaCodeFromFileName(fileName: string) {
  const normalized = normalizeReferenceLabel(fileName);
  const match = normalized.match(/(?:^|\s)sa\s*([0-9]+(?:\.[0-9]+)?)(?:\s|$)/i)
    ?? normalized.match(/(?:^|\s)subactivitatea?\s*([0-9]+(?:\.[0-9]+)?)(?:\s|$)/i);
  return match?.[1] ? `SA${match[1]}` : '';
}

export function inferExpertRoleFromFileName(fileName: string) {
  const title = cleanReferenceTitle(fileName);
  const withoutCommonPrefixes = title
    .replace(/\b(fi[șşs]a)\s+(de\s+)?post(ului)?\b/gi, ' ')
    .replace(/\bjob\s+description\b/gi, ' ')
    .replace(/\bjd\b/gi, ' ')
    .replace(/\b302141\b/g, ' ')
    .replace(/\bSA\s*[0-9]+(?:\.[0-9]+)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ROLE_ALIASES[normalizeReferenceLabel(withoutCommonPrefixes)] || withoutCommonPrefixes;
}

function inferSourceType(fileName: string, override?: RagReferenceImportOverride): RagSourceType | '' {
  if (override?.sourceType) return override.sourceType;
  const normalized = normalizeReferenceLabel(fileName);

  if (/(^|\s)(fisa\s+(de\s+)?post(ului)?|job\s+description|jd)(\s|$)/.test(normalized)) {
    return SOURCE_TYPE_LABELS.fisa_post;
  }
  if (/cerere\s+de\s+finantare|cererea\s+de\s+finantare|contract\s+finantare/.test(normalized)) {
    return SOURCE_TYPE_LABELS.cerere_finantare;
  }
  if (/manual(ul)?\s+(beneficiar|implementare)|instructiuni\s+beneficiar/.test(normalized)) {
    return SOURCE_TYPE_LABELS.manual_beneficiar;
  }
  if (/descriere|scop|subactivitate|activitati|activitate/.test(normalized)) {
    return SOURCE_TYPE_LABELS.scop_sa;
  }
  return '';
}

export function inferRagReferenceImportFromFileName(
  fileName: string,
  options: RagReferenceImportOptions = {},
): RagReferenceImportInference {
  const override = options.override ?? {};
  const warnings: string[] = [];
  const title = override.title || cleanReferenceTitle(fileName);
  const sourceType = inferSourceType(fileName, override);
  const projectCode = (override.projectCode || options.projectCode || DEFAULT_PROJECT_CODE).trim();
  const inferredSaCode = inferSaCodeFromFileName(fileName);
  const saCode = (override.saCode || inferredSaCode).trim();
  const expertRole = (override.expertRole || inferExpertRoleFromFileName(fileName)).trim();
  const expertId = override.expertId?.trim() || '';
  const expertName = override.expertName?.trim() || '';

  if (!sourceType || !REFERENCE_SOURCE_TYPES.some((type) => type === sourceType)) {
    return {
      ok: false,
      reason: 'Nu am putut incadra fisierul ca sursa RAG oficiala. Redenumeste fisierul sau trimite override.sourceType.',
      warnings,
      title,
    };
  }

  if (!projectCode) {
    return { ok: false, reason: 'Completeaza codul proiectului.', warnings, title };
  }

  if (['scop_sa', 'descriere_activitati'].includes(sourceType) && !/^SA\d+\.\d+$/.test(saCode)) {
    return {
      ok: false,
      reason: 'Documentul de descriere/scop SA nu contine codul SA in numele fisierului.',
      warnings,
      title,
    };
  }

  if (sourceType === 'fisa_post' && !expertId && !expertName && !expertRole) {
    return {
      ok: false,
      reason: 'Fisa postului nu are expert, nume expert sau pozitie inferabila din numele fisierului.',
      warnings,
      title,
    };
  }

  if (sourceType === 'fisa_post' && !override.expertRole) {
    warnings.push('Verifica pozitia propusa fata de fisa postului si catalogul expertilor.');
  }
  if (sourceType === 'scop_sa' && normalizeReferenceLabel(fileName).includes('descriere')) {
    warnings.push('Documentul de descriere a fost mapat intentionat ca scop_sa, conform fluxului de eligibilitate.');
  }

  return {
    ok: true,
    warnings,
    input: {
      title,
      sourceType,
      projectCode: ['cerere_finantare', 'manual_beneficiar', 'scop_sa', 'descriere_activitati'].includes(sourceType)
        ? projectCode
        : projectCode || undefined,
      saCode: ['scop_sa', 'descriere_activitati'].includes(sourceType) ? saCode : undefined,
      category: override.category?.trim() || undefined,
      expertId: expertId || undefined,
      expertName: expertName || undefined,
      expertRole: sourceType === 'fisa_post' ? expertRole : override.expertRole?.trim() || undefined,
      originalFileName: fileName,
      createdBy: options.createdBy || 'admin-rag-reference-pdf-import',
      metadata: {
        importMode: 'reference_pdf_auto_map',
        inferredFromFileName: true,
      },
      extractionSource: 'native',
      extractionComplete: true,
    },
  };
}
