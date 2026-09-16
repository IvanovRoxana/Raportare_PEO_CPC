export const RAG_DEFAULT_PROJECT = '302141';
export type ProjectBackfillModel = 'KnowledgeDocument' | 'KnowledgeChunk';
type Graphql = (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>;

// Scan a bounded page without loading document text or embeddings. The caller
// must follow nextToken even when a filtered page contains no matching records.
export async function backfillProjectPage(model: ProjectBackfillModel, nextToken: string | null, graphql: Graphql) {
  const listKey = `list${model}s`;
  const missing = { or: [
    { projectCode: { attributeExists: false } },
    { projectCode: { attributeType: '_null' } },
    { projectCode: { eq: '' } },
  ] };
  const data = await graphql(`query BackfillProject($nextToken: String, $filter: Model${model}FilterInput) {
    ${listKey}(limit: 5, nextToken: $nextToken, filter: $filter) { items { id projectCode } nextToken }
  }`, { nextToken, filter: missing });
  const page = data[listKey] as { items: Array<{ id: string; projectCode?: string | null } | null>; nextToken?: string | null };
  if (!page || !Array.isArray(page.items)) throw new Error('Raspuns invalid la citirea surselor RAG.');
  let updated = 0;
  const failed: string[] = [];
  for (const item of page.items) {
    if (!item || item.projectCode) continue;
    try {
      const result = await graphql(`mutation BackfillProject($input: Update${model}Input!, $condition: Model${model}ConditionInput) {
        update${model}(input: $input, condition: $condition) { id }
      }`, { input: { id: item.id, projectCode: RAG_DEFAULT_PROJECT }, condition: {
        and: [{ id: { attributeExists: true } }, missing],
      } });
      if (!(result[`update${model}`] as { id?: string } | undefined)?.id) throw new Error('Actualizare neconfirmata.');
      updated++;
    } catch {
      failed.push(item.id);
    }
  }
  return { updated, failed, nextToken: page.nextToken || null };
}
