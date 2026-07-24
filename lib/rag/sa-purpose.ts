import type { KnowledgeChunk } from '../types.ts';

const SA_HEADING_PATTERN = /^\s*\(\s*S\.?A\.?\s*(\d+(?:\.\d+)+)\s*\)\s*(.*)$/gim;

export interface SaPurposeContext {
  saCode: string;
  title?: string;
  text: string;
  sourceType?: string;
  documentId?: string;
  chunkIds: string[];
}

export interface SaPurposeRetrievalResult {
  found: boolean;
  context?: SaPurposeContext;
  warnings: string[];
}

export function normalizeSaPurposeCode(value?: string) {
  const normalized = String(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^S\.?A\.?/, 'SA');
  const match = normalized.match(/^SA(\d+(?:\.\d+)+)$/);
  return match ? `SA${match[1]}` : normalized;
}

export function extractSaPurposeSection(text: string, requestedSaCode: string) {
  const normalizedRequestedCode = normalizeSaPurposeCode(requestedSaCode);
  const matches = Array.from(text.matchAll(SA_HEADING_PATTERN));

  for (const [index, match] of matches.entries()) {
    const saCode = normalizeSaPurposeCode(`SA${match[1]}`);
    if (saCode !== normalizedRequestedCode || match.index === undefined) continue;

    const sectionStart = match.index + match[0].length;
    const sectionEnd = matches[index + 1]?.index ?? text.length;
    const title = String(match[2] || '').trim();
    const sectionText = text.slice(sectionStart, sectionEnd).trim();

    if (!sectionText) return null;
    return {
      saCode,
      title: title || undefined,
      text: sectionText,
    };
  }

  return null;
}

export function findSaPurposeContext(chunks: KnowledgeChunk[], requestedSaCode: string): SaPurposeContext | null {
  const normalizedRequestedCode = normalizeSaPurposeCode(requestedSaCode);
  const grouped = new Map<string, KnowledgeChunk[]>();

  for (const chunk of chunks) {
    const documentChunks = grouped.get(chunk.documentId) || [];
    documentChunks.push(chunk);
    grouped.set(chunk.documentId, documentChunks);
  }

  for (const [documentId, documentChunks] of grouped.entries()) {
    const orderedChunks = [...documentChunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
    const directlyTagged = orderedChunks.filter(
      (chunk) => normalizeSaPurposeCode(chunk.saCode) === normalizedRequestedCode,
    );

    if (directlyTagged.length > 0) {
      const text = directlyTagged.map((chunk) => chunk.text.trim()).filter(Boolean).join('\n\n').trim();
      if (text) {
        return {
          saCode: normalizedRequestedCode,
          text,
          sourceType: directlyTagged[0]?.sourceType,
          documentId,
          chunkIds: directlyTagged.map((chunk) => chunk.id),
        };
      }
    }

    const reconstructedDocument = orderedChunks
      .map((chunk) => chunk.text.trim())
      .filter(Boolean)
      .join('\n\n');
    const section = extractSaPurposeSection(reconstructedDocument, normalizedRequestedCode);
    if (!section) continue;

    return {
      ...section,
      sourceType: orderedChunks[0]?.sourceType,
      documentId,
      chunkIds: orderedChunks.map((chunk) => chunk.id),
    };
  }

  return null;
}
