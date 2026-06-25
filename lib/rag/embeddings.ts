import { embed, embedMany } from 'ai';
import { getActivityAutofillEmbeddingModel } from '../feature-flags.ts';
import { getOpenAIClient } from '../openai.ts';
import { normalizeRagText } from './chunking.ts';

export function getRagEmbeddingModelName() {
  return getActivityAutofillEmbeddingModel();
}

export async function generateEmbedding(text: string) {
  const value = normalizeRagText(text);
  if (!value) return [];

  const result = await embed({
    model: getOpenAIClient().embeddingModel(getRagEmbeddingModelName()),
    value,
  });

  return Array.from(result.embedding);
}

export async function generateEmbeddings(texts: string[]) {
  const values = texts.map(normalizeRagText).filter(Boolean);
  if (values.length === 0) return [];

  const result = await embedMany({
    model: getOpenAIClient().embeddingModel(getRagEmbeddingModelName()),
    values,
  });

  return result.embeddings.map((embedding) => Array.from(embedding));
}

export function serializeEmbedding(embedding: number[]) {
  return JSON.stringify(embedding);
}

export function parseEmbedding(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : [];
  } catch {
    return [];
  }
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}
