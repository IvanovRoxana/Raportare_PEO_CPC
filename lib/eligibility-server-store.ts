import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import outputs from '../amplify_outputs.json';

export type EligibilityModel = 'Expert' | 'Deliverable' | 'Document' | 'Activity' | 'ActivityCatalog'
  | 'KnowledgeDocument' | 'KnowledgeChunk' | 'AiEligibilityRuleset' | 'AiEligibilityRuleVersion'
  | 'EligibilityEvaluationRun' | 'EligibilityEvaluationEvidence' | 'PmEligibilityDecision' | 'EligibilityRuntime';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: outputs.auth.aws_region, maxAttempts: 3 }), {
  marshallOptions: { removeUndefinedValues: true },
});

export function eligibilityTable(model: EligibilityModel) {
  const custom = (outputs as unknown as { custom?: { eligibilityTables?: Record<string, string> } }).custom;
  const table = custom?.eligibilityTables?.[model];
  if (!table) throw new Error(`ELIGIBILITY_BACKEND_NOT_DEPLOYED:${model}`);
  return table;
}

export const eligibilityStore = {
  async get<T>(model: EligibilityModel, id: string): Promise<T | null> {
    const result = await client.send(new GetCommand({ TableName: eligibilityTable(model), Key: { id }, ConsistentRead: true }));
    return (result.Item as T) || null;
  },
  async list<T>(model: EligibilityModel, filter?: { field: string; value: string }): Promise<T[]> {
    const items: T[] = [];
    let key: Record<string, unknown> | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await client.send(new ScanCommand({
        TableName: eligibilityTable(model), ConsistentRead: true, ExclusiveStartKey: key,
        ...(filter ? { FilterExpression: '#field = :value', ExpressionAttributeNames: { '#field': filter.field }, ExpressionAttributeValues: { ':value': filter.value } } : {}),
      }));
      items.push(...(result.Items || []) as T[]);
      key = result.LastEvaluatedKey;
      if (!key) return items;
    }
    throw new Error('ELIGIBILITY_INCOMPLETE_BACKEND_READ');
  },
  async transact(items: NonNullable<TransactWriteCommandInput['TransactItems']>) {
    await client.send(new TransactWriteCommand({ TransactItems: items }));
  },
};

export function immutablePut(model: EligibilityModel, value: Record<string, unknown>) {
  const now = new Date().toISOString();
  return { Put: { TableName: eligibilityTable(model), Item: { __typename: model, createdAt: now, updatedAt: now, ...value }, ConditionExpression: 'attribute_not_exists(id)' } };
}
