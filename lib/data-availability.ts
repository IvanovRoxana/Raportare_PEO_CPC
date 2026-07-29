export type DataAvailabilityStatus =
  | 'disabled'
  | 'loading'
  | 'error'
  | 'empty'
  | 'success';

export function resolveDataStatus<T>({
  data,
  error,
  isLoading,
  enabled = true,
}: {
  data: T[] | null | undefined;
  error?: unknown;
  isLoading: boolean;
  enabled?: boolean;
}): DataAvailabilityStatus {
  if (!enabled) return 'disabled';
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (!data || data.length === 0) return 'empty';
  return 'success';
}
