import { getDocumentAuditTitle } from './document-sharing.ts';
import type { DocumentMetadata } from './types.ts';

export type PmTitleIssueGroup = {
  id: string;
  title: string;
  documents: DocumentMetadata[];
  expertNames: string[];
  saCodes: string[];
};

function normalizeTitleKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getIssueGroupKey(document: DocumentMetadata) {
  if (document.possibleDuplicateOfDocumentId) return `duplicate:${document.possibleDuplicateOfDocumentId}`;
  if (document.sourceActivityId) return `activity:${document.sourceActivityId}`;
  const auditTitle = getDocumentAuditTitle(document);
  const normalizedAuditTitle = normalizeTitleKey(auditTitle);
  if (normalizedAuditTitle) return `title:${normalizedAuditTitle}`;
  return `document:${document.id}`;
}

function getGroupTitle(document: DocumentMetadata) {
  return document.declaredTitle || document.extractedTitle || document.suggestedTitle || document.originalFileName;
}

export function groupPmTitleIssues(documents: DocumentMetadata[]): PmTitleIssueGroup[] {
  const groups = new Map<string, PmTitleIssueGroup>();

  documents.forEach((document) => {
    const key = getIssueGroupKey(document);
    const existing = groups.get(key);
    const expertName = document.uploadedByExpertName || document.uploadedByExpertId;
    const saCode = document.saCode || '';

    if (existing) {
      existing.documents.push(document);
      if (expertName && !existing.expertNames.includes(expertName)) existing.expertNames.push(expertName);
      if (saCode && !existing.saCodes.includes(saCode)) existing.saCodes.push(saCode);
      return;
    }

    groups.set(key, {
      id: key,
      title: getGroupTitle(document),
      documents: [document],
      expertNames: expertName ? [expertName] : [],
      saCodes: saCode ? [saCode] : [],
    });
  });

  return Array.from(groups.values()).sort((a, b) => b.documents.length - a.documents.length || a.title.localeCompare(b.title));
}
