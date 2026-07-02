import { createHash, createHmac, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';

export const runtime = 'nodejs';

const region = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const dynamoEndpoint = `https://dynamodb.${region}.amazonaws.com/`;
const dynamoHost = `dynamodb.${region}.amazonaws.com`;
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const service = 'dynamodb';

const MODEL_FIELDS = {
  Organization: [
    'name',
    'normalizedName',
    'kind',
    'legalForm',
    'cui',
    'parentOrganizationId',
    'federationName',
    'patronalOrganizationName',
    'employeeCount',
    'status',
    'sourceSheet',
    'sourceRowNumber',
    'importBatchId',
    'gtNotes',
  ],
  GTEntity: [
    'organizationId',
    'organizationName',
    'status',
    'dataIntrareOperatiune',
    'dataIesireOperatiune',
    'indicator5SO04',
    'indicator5SR04',
    'region',
    'expertResponsabilId',
    'notes',
    'sourceStatusText',
  ],
  GTPerson: [
    'gtEntityId',
    'nume',
    'prenume',
    'cnpHash',
    'email',
    'telefon',
    'functie',
    'status',
    'dataIntrareOperatiune',
    'dataIesireOperatiune',
    'indicator5SO01',
    'indicator5SR01',
    'consimtamantGDPRAt',
    'notes',
  ],
  GTDocument: [
    'subjectType',
    'gtEntityId',
    'gtPersonId',
    'documentType',
    's3Key',
    'fileName',
    'status',
    'validatedByExpertId',
    'validatedAt',
    'expiryDate',
    'notes',
  ],
  GTMonitoringRecord: [
    'subjectType',
    'gtEntityId',
    'gtPersonId',
    'date',
    'year',
    'month',
    'expertId',
    'linkedActivityId',
    'saCode',
    'indicatorCode',
    'obiectivSpecific',
    'descriere',
    'rezultat',
  ],
  GTImportBatch: [
    'sourceFileName',
    'importedBy',
    'importedAt',
    'status',
    'totalRows',
    'createdOrganizations',
    'duplicateRows',
    'warningsJson',
  ],
} as const;

type ModelName = keyof typeof MODEL_FIELDS;
type RegistryAction = 'create' | 'update' | 'delete';
type DdbAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { L: DdbAttribute[] }
  | { M: Record<string, DdbAttribute> };

let tableNameCache: Partial<Record<ModelName | 'Expert', string>> = {};

class GTRegistryRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getBearerToken(value?: string | null) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function decodeJwtPayload(token: string) {
  const payload = token.split('.')[1];
  if (!payload) throw new GTRegistryRouteError('Token Cognito invalid.', 401);

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalizeGroups(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function getSignatureKey(secretAccessKey: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function getCredentials() {
  const accessKeyId = process.env.COGNITO_SYNC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.COGNITO_SYNC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new GTRegistryRouteError('Credentialele AWS nu sunt disponibile pentru modificarile GT server-side.', 503);
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.COGNITO_SYNC_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
  };
}

async function callSignedDynamo<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const credentials = getCredentials();
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const target = `DynamoDB_20120810.${action}`;

  const canonicalHeaders = [
    ['content-type', 'application/x-amz-json-1.0'],
    ['host', dynamoHost],
    ['x-amz-date', amzDate],
    ['x-amz-target', target],
    ...(credentials.sessionToken ? [['x-amz-security-token', credentials.sessionToken]] : []),
  ] as Array<[string, string]>;
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(';');
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders.map(([key, value]) => `${key}:${value.trim()}\n`).join(''),
    signedHeaders,
    sha256(body),
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', getSignatureKey(credentials.secretAccessKey, dateStamp))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const response = await fetch(dynamoEndpoint, {
    method: 'POST',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': 'application/x-amz-json-1.0',
      'x-amz-date': amzDate,
      'x-amz-target': target,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message || errorBody?.__type || `DynamoDB ${action} failed.`;
    throw new GTRegistryRouteError(message, response.status);
  }

  return response.json() as Promise<T>;
}

async function validateAccessTokenWithCognito(accessToken: string) {
  const response = await fetch(cognitoEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.GetUser',
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  });

  if (!response.ok) {
    throw new GTRegistryRouteError('Sesiunea Cognito nu a putut fi validata.', 401);
  }

  return response.json() as Promise<{ UserAttributes?: Array<{ Name?: string; Value?: string }> }>;
}

function toDdbAttribute(value: unknown): DdbAttribute | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { NULL: true };
  if (typeof value === 'boolean') return { BOOL: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return { N: String(value) };
  }
  if (Array.isArray(value)) {
    return { L: value.map(toDdbAttribute).filter((item): item is DdbAttribute => Boolean(item)) };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, toDdbAttribute(child)] as const)
      .filter((entry): entry is readonly [string, DdbAttribute] => Boolean(entry[1]));
    return { M: Object.fromEntries(entries) };
  }
  return { S: String(value) };
}

function fromDdbAttribute(attribute: DdbAttribute | undefined): unknown {
  if (!attribute) return undefined;
  if ('S' in attribute) return attribute.S;
  if ('N' in attribute) return Number(attribute.N);
  if ('BOOL' in attribute) return attribute.BOOL;
  if ('NULL' in attribute) return null;
  if ('L' in attribute) return attribute.L.map(fromDdbAttribute);
  if ('M' in attribute) {
    return Object.fromEntries(Object.entries(attribute.M).map(([key, value]) => [key, fromDdbAttribute(value)]));
  }
  return undefined;
}

function fromDdbItem(item?: Record<string, DdbAttribute>) {
  if (!item) return null;
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fromDdbAttribute(value)]));
}

function pickAllowedFields(modelName: ModelName, input: Record<string, unknown>, mode: RegistryAction) {
  const allowed = new Set<string>(['id', ...MODEL_FIELDS[modelName], 'createdAt', 'updatedAt']);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      if (key === 'id') return mode === 'create';
      return mode === 'update' || (value !== undefined && value !== null && value !== '');
    }),
  );
}

async function listAllTableNames() {
  const names: string[] = [];
  let ExclusiveStartTableName: string | undefined;

  do {
    const response = await callSignedDynamo<{ TableNames?: string[]; LastEvaluatedTableName?: string }>('ListTables', {
      ...(ExclusiveStartTableName ? { ExclusiveStartTableName } : {}),
    });
    names.push(...(response.TableNames || []));
    ExclusiveStartTableName = response.LastEvaluatedTableName;
  } while (ExclusiveStartTableName);

  return names;
}

async function getTableName(modelName: ModelName | 'Expert') {
  if (tableNameCache[modelName]) return tableNameCache[modelName]!;

  const matches = (await listAllTableNames()).filter((name) => name.startsWith(`${modelName}-`));
  if (matches.length !== 1) {
    throw new GTRegistryRouteError(
      `Nu pot identifica tabelul DynamoDB pentru ${modelName}. Gasite: ${matches.join(', ') || 'niciunul'}.`,
      503,
    );
  }
  tableNameCache = { ...tableNameCache, [modelName]: matches[0] };
  return matches[0];
}

async function findExpertByEmail(email: string) {
  const tableName = await getTableName('Expert');
  let ExclusiveStartKey: Record<string, DdbAttribute> | undefined;

  do {
    const response = await callSignedDynamo<{
      Items?: Array<Record<string, DdbAttribute>>;
      LastEvaluatedKey?: Record<string, DdbAttribute>;
    }>('Scan', {
      TableName: tableName,
      ProjectionExpression: 'id, email, category, hasPmAccess',
      ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
    });

    const expert = (response.Items || [])
      .map((item) => fromDdbItem(item) as Record<string, unknown>)
      .find((item) => normalizeEmail(item.email) === email);
    if (expert) return expert;

    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return null;
}

async function assertGTWriter(request: Request) {
  if (!hasAllowedOrigin(request)) {
    throw new GTRegistryRouteError('Cerere respinsa.', 403);
  }
  if (!userPoolId) {
    throw new GTRegistryRouteError('User pool-ul Cognito nu este configurat.', 503);
  }

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw new GTRegistryRouteError('Lipseste tokenul Cognito pentru modificarea GT.', 401);
  }

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new GTRegistryRouteError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new GTRegistryRouteError('Sesiunea Cognito a expirat.', 401);
  }

  const cognitoUser = await validateAccessTokenWithCognito(token);
  const email = normalizeEmail(
    cognitoUser.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value || payload.email,
  );
  const groups = normalizeGroups(payload['cognito:groups']);

  if (groups.includes('admin') || groups.includes('pm')) return;

  const expert = email ? await findExpertByEmail(email) : null;
  if (String(expert?.category || '').trim().toLowerCase() === 'gt' || expert?.hasPmAccess === true) return;

  throw new GTRegistryRouteError('Doar PM/Admin sau expertii cu categoria GT pot modifica registrul Grup Tinta.', 403);
}

async function createRecord(modelName: ModelName, input: Record<string, unknown>) {
  const tableName = await getTableName(modelName);
  const now = new Date().toISOString();
  const record = pickAllowedFields(modelName, {
    ...input,
    id: String(input.id || randomUUID()),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }, 'create');
  const Item = Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, toDdbAttribute(value)] as const)
      .filter((entry): entry is readonly [string, DdbAttribute] => Boolean(entry[1])),
  );

  await callSignedDynamo('PutItem', {
    TableName: tableName,
    Item,
    ConditionExpression: 'attribute_not_exists(id)',
  });

  return record;
}

async function updateRecord(modelName: ModelName, id: string, updates: Record<string, unknown>) {
  const tableName = await getTableName(modelName);
  const record = pickAllowedFields(modelName, { ...updates, updatedAt: new Date().toISOString() }, 'update');
  delete record.id;

  const setEntries = Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
  const removeEntries = Object.entries(record).filter(([, value]) => value === null);

  if (setEntries.length === 0 && removeEntries.length === 0) {
    throw new GTRegistryRouteError('Nu exista campuri permise pentru actualizare.', 400);
  }

  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, DdbAttribute> = {};
  const setParts = setEntries.map(([key, value], index) => {
    const nameKey = `#n${index}`;
    const valueKey = `:v${index}`;
    ExpressionAttributeNames[nameKey] = key;
    const attribute = toDdbAttribute(value);
    if (!attribute) throw new GTRegistryRouteError(`Valoare invalida pentru ${key}.`, 400);
    ExpressionAttributeValues[valueKey] = attribute;
    return `${nameKey} = ${valueKey}`;
  });
  const removeParts = removeEntries.map(([key], index) => {
    const nameKey = `#r${index}`;
    ExpressionAttributeNames[nameKey] = key;
    return nameKey;
  });
  const UpdateExpression = [
    setParts.length ? `SET ${setParts.join(', ')}` : '',
    removeParts.length ? `REMOVE ${removeParts.join(', ')}` : '',
  ].filter(Boolean).join(' ');

  const response = await callSignedDynamo<{ Attributes?: Record<string, DdbAttribute> }>('UpdateItem', {
    TableName: tableName,
    Key: { id: { S: id } },
    UpdateExpression,
    ExpressionAttributeNames,
    ...(Object.keys(ExpressionAttributeValues).length ? { ExpressionAttributeValues } : {}),
    ConditionExpression: 'attribute_exists(id)',
    ReturnValues: 'ALL_NEW',
  });

  return fromDdbItem(response.Attributes);
}

async function deleteRecord(modelName: ModelName, id: string) {
  const tableName = await getTableName(modelName);
  await callSignedDynamo('DeleteItem', {
    TableName: tableName,
    Key: { id: { S: id } },
    ConditionExpression: 'attribute_exists(id)',
  });
}

function parseModelName(value: unknown): ModelName {
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODEL_FIELDS, value)) {
    return value as ModelName;
  }
  throw new GTRegistryRouteError('Model GT nepermis.', 400);
}

function parseAction(value: unknown): RegistryAction {
  if (value === 'create' || value === 'update' || value === 'delete') return value;
  throw new GTRegistryRouteError('Actiune GT nepermisa.', 400);
}

export async function POST(request: Request) {
  try {
    await assertGTWriter(request);

    const body = await request.json().catch(() => null);
    const modelName = parseModelName(body?.modelName);
    const action = parseAction(body?.action);
    const input = (body?.input && typeof body.input === 'object' ? body.input : {}) as Record<string, unknown>;
    const id = String(body?.id || input.id || '').trim();

    if (action === 'create') {
      const data = await createRecord(modelName, input);
      return NextResponse.json({ data });
    }

    if (!id) {
      throw new GTRegistryRouteError('Lipseste id-ul inregistrarii GT.', 400);
    }

    if (action === 'update') {
      const data = await updateRecord(modelName, id, input);
      return NextResponse.json({ data });
    }

    await deleteRecord(modelName, id);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    const status = error instanceof GTRegistryRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Modificarea registrului GT a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
