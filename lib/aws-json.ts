export function serializeAwsJsonField(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function parseAwsJsonField<T>(value: unknown): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
