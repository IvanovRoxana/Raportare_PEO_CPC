import { embed, embedMany } from 'ai';
import { getActivityAutofillEmbeddingModel } from '../feature-flags.ts';
import { getOpenAIClient } from '../openai.ts';
import { normalizeRagText } from './chunking.ts';

export function getRagEmbeddingModelName() {
  return getActivityAutofillEmbeddingModel();
}

function toNumericEmbedding(value: Iterable<unknown>): number[] {
  const values = Array.from(value);
  if (!values.length || values.some((item) => typeof item !== 'number' || !Number.isFinite(item))) throw new Error('Invalid embedding values.');
  return values as number[];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const value = normalizeRagText(text);
  if (!value) return [];

  const { governedEmbeddingCall } = await import('../ai-governance.ts');
  const result = await governedEmbeddingCall({ model: getRagEmbeddingModelName(), values: [value], operation: 'rag-query-embedding',
    call: () => embed({ model: getOpenAIClient().embeddingModel(getRagEmbeddingModelName()), value, maxRetries: 0 }),
  });

  return toNumericEmbedding(result.embedding);
}

export async function generateEmbeddings(texts: string[], metadata: { runId?: string; actorId?: string; projectCode?: string } = {}): Promise<number[][]> {
  const values = texts.map(normalizeRagText).filter(Boolean);
  if (values.length === 0) return [];

  const { governedEmbeddingCall } = await import('../ai-governance.ts');
  const result = await governedEmbeddingCall({ ...metadata, model: getRagEmbeddingModelName(), values, operation: 'rag-index-embeddings',
    call: () => embedMany({ model: getOpenAIClient().embeddingModel(getRagEmbeddingModelName()), values, maxRetries: 0 }),
  });

  return result.embeddings.map(toNumericEmbedding);
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
