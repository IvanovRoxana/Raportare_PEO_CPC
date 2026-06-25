import { createHash } from 'node:crypto';
import type { RagChunk, RagChunkInput } from './types';

const DEFAULT_MAX_CHARS = 1400;
const DEFAULT_OVERLAP_CHARS = 180;

export function normalizeRagText(value: unknown) {
  return String(value ?? '')
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashRagText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function estimateRagTokens(value: string) {
  return Math.ceil(normalizeRagText(value).length / 4);
}

function findSplitPoint(text: string, start: number, targetEnd: number) {
  const hardEnd = Math.min(text.length, targetEnd);
  if (hardEnd >= text.length) return text.length;

  const windowStart = Math.max(start + 400, hardEnd - 300);
  const candidates = [
    text.lastIndexOf('\n\n', hardEnd),
    text.lastIndexOf('. ', hardEnd),
    text.lastIndexOf('; ', hardEnd),
    text.lastIndexOf(', ', hardEnd),
    text.lastIndexOf(' ', hardEnd),
  ];

  const split = candidates.find((candidate) => candidate >= windowStart);
  return split && split > start ? split + 1 : hardEnd;
}

export function splitTextIntoRagChunks(input: RagChunkInput): RagChunk[] {
  const text = normalizeRagText(input.text);
  if (!text) return [];

  const maxChars = Math.max(600, input.maxChars ?? DEFAULT_MAX_CHARS);
  const overlapChars = Math.max(0, Math.min(input.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 3)));
  const chunks: RagChunk[] = [];

  let start = 0;
  while (start < text.length) {
    const end = findSplitPoint(text, start, start + maxChars);
    const chunkText = normalizeRagText(text.slice(start, end));
    if (chunkText) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunkText,
        textHash: hashRagText(chunkText),
        tokenEstimate: estimateRagTokens(chunkText),
      });
    }

    if (end >= text.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}
