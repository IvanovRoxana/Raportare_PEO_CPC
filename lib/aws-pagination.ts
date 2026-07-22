export interface IndexedListOptions {
  limit?: number;
  nextToken?: string | null;
}

export interface IndexedListResult<T> {
  data?: T[] | null;
  errors?: unknown;
  nextToken?: string | null;
}

type IndexedListFunction<TKey, TItem> = (
  key: TKey,
  options?: IndexedListOptions,
) => Promise<IndexedListResult<TItem>>;

function hasErrors(errors: unknown) {
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
}

export async function listAllIndexed<TKey, TItem>(
  listFn: IndexedListFunction<TKey, TItem>,
  key: TKey,
): Promise<TItem[]> {
  const items: TItem[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | null | undefined = null;

  do {
    if (nextToken) {
      if (seenTokens.has(nextToken)) {
        throw new Error(`AWS indexed list failed: nextToken repetat (${nextToken})`);
      }
      seenTokens.add(nextToken);
    }

    const result = await listFn(key, { limit: 1000, nextToken });
    if (hasErrors(result.errors)) {
      throw new Error(`AWS indexed list failed: ${JSON.stringify(result.errors)}`);
    }

    items.push(...(result.data ?? []));
    nextToken = result.nextToken;
  } while (nextToken);

  return items;
}

interface DeliverableModelWithActivityIndex<TItem> {
  listDeliverableByActivityId: IndexedListFunction<{ activityId: string }, TItem>;
}

export function listDeliverablesByActivityId<TItem>(
  deliverableModel: DeliverableModelWithActivityIndex<TItem>,
  activityId: string,
) {
  return listAllIndexed(
    (key, options) => deliverableModel.listDeliverableByActivityId(key, options),
    { activityId },
  );
}
