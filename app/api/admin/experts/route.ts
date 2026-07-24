import { createHash, createHmac, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { EXPERT_PM_EXTENDED_ACCESS_EMAILS } from '@/lib/access-control';

export const runtime = 'nodejs';

const region = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const cognitoHost = `cognito-idp.${region}.amazonaws.com`;
const dynamoEndpoint = `https://dynamodb.${region}.amazonaws.com/`;
const dynamoHost = `dynamodb.${region}.amazonaws.com`;

const EXPERT_FIELDS = [
  'userId',
  'name',
  'role',
  'email',
  'phone',
  'category',
  'norma',
  'normType',
  'oreZi',
  'dailyHours',
  'manualMonthlyNorm',
  'projectMonthlyNorm',
  'positionInProject',
  'projectCode',
  'projectTitle',
  'aiReportingInstructions',
  'beneficiary',
  'saCodes',
  'hasPmAccess',
  'cognitoGroups',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;

type AdminExpertAction = 'create' | 'update';
type DdbAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { L: DdbAttribute[] }
  | { M: Record<string, DdbAttribute> };

let expertTableNameCache: string | null = null;

class AdminExpertsRouteError extends Error {
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
  if (!payload) throw new AdminExpertsRouteError('Token Cognito invalid.', 401);

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalizeGroups(value: unknown) {
  const groups = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  return groups.map((group) => group.trim().toLowerCase()).filter(Boolean);
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, service: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function getCredentials() {
  const accessKeyId = process.env.COGNITO_SYNC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.COGNITO_SYNC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new AdminExpertsRouteError('Credentialele AWS nu sunt disponibile pentru administrarea expertilor.', 503);
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.COGNITO_SYNC_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
  };
}

async function callSignedAws<T>(
  service: 'cognito-idp' | 'dynamodb',
  host: string,
  endpoint: string,
  target: string,
  contentType: 'application/x-amz-json-1.0' | 'application/x-amz-json-1.1',
  payload: Record<string, unknown>,
): Promise<T> {
  const credentials = getCredentials();
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = [
    ['content-type', contentType],
    ['host', host],
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
  const signature = createHmac('sha256', getSignatureKey(credentials.secretAccessKey, dateStamp, service))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': contentType,
      'x-amz-date': amzDate,
      'x-amz-target': target,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message || errorBody?.__type || `${target} failed.`;
    throw new AdminExpertsRouteError(message, response.status);
  }

  const responseText = await response.text();
  return responseText.trim() ? JSON.parse(responseText) as T : {} as T;
}

async function callSignedCognito<T>(action: string, payload: Record<string, unknown>) {
  return callSignedAws<T>(
    'cognito-idp',
    cognitoHost,
    cognitoEndpoint,
    `AWSCognitoIdentityProviderService.${action}`,
    'application/x-amz-json-1.1',
    payload,
  );
}

async function callSignedDynamo<T>(action: string, payload: Record<string, unknown>) {
  return callSignedAws<T>(
    'dynamodb',
    dynamoHost,
    dynamoEndpoint,
    `DynamoDB_20120810.${action}`,
    'application/x-amz-json-1.0',
    payload,
  );
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
    throw new AdminExpertsRouteError('Sesiunea Cognito a administratorului nu a putut fi validata.', 401);
  }

  return response.json() as Promise<{
    Username?: string;
    UserAttributes?: Array<{ Name?: string; Value?: string }>;
  }>;
}

async function assertAdminCaller(request: Request) {
  if (!hasAllowedOrigin(request)) {
    throw new AdminExpertsRouteError('Cerere respinsa.', 403);
  }
  if (!userPoolId) {
    throw new AdminExpertsRouteError('User pool-ul Cognito nu este configurat.', 503);
  }

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw new AdminExpertsRouteError('Lipseste tokenul Cognito al administratorului.', 401);
  }

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new AdminExpertsRouteError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new AdminExpertsRouteError('Sesiunea Cognito a expirat.', 401);
  }

  const cognitoUser = await validateAccessTokenWithCognito(token);
  const username = String(cognitoUser.Username || payload.username || payload.sub || '').trim();
  const email = String(
    cognitoUser.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value || payload.email || '',
  ).trim().toLowerCase();
  if (!username) {
    throw new AdminExpertsRouteError('Nu pot identifica utilizatorul Cognito curent.', 403);
  }

  let groups = normalizeGroups(payload['cognito:groups']);
  try {
    const liveGroups = await callSignedCognito<{ Groups?: Array<{ GroupName?: string }> }>('AdminListGroupsForUser', {
      UserPoolId: userPoolId,
      Username: username,
    });
    groups = normalizeGroups(liveGroups.Groups?.map((group) => group.GroupName).filter(Boolean));
  } catch (error) {
    console.warn('Nu am putut citi live grupurile Cognito pentru utilizatorul curent; folosesc grupurile din token.', error);
  }

  const hasAdminAccess = groups.includes('admin');
  const hasExplicitPmAdminAccess = groups.includes('pm') && EXPERT_PM_EXTENDED_ACCESS_EMAILS.includes(email);
  if (!hasAdminAccess && !hasExplicitPmAdminAccess) {
    throw new AdminExpertsRouteError('Doar administratorii pot administra profilurile expertilor.', 403);
  }
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

async function getExpertTableName() {
  if (expertTableNameCache) return expertTableNameCache;

  const names: string[] = [];
  let ExclusiveStartTableName: string | undefined;
  do {
    const response = await callSignedDynamo<{ TableNames?: string[]; LastEvaluatedTableName?: string }>('ListTables', {
      ...(ExclusiveStartTableName ? { ExclusiveStartTableName } : {}),
    });
    names.push(...(response.TableNames || []));
    ExclusiveStartTableName = response.LastEvaluatedTableName;
  } while (ExclusiveStartTableName);

  const matches = names.filter((name) => name.startsWith('Expert-'));
  if (matches.length !== 1) {
    throw new AdminExpertsRouteError(
      `Nu pot identifica tabelul DynamoDB pentru Expert. Gasite: ${matches.join(', ') || 'niciunul'}.`,
      503,
    );
  }

  expertTableNameCache = matches[0];
  return expertTableNameCache;
}

function pickExpertFields(input: Record<string, unknown>, action: AdminExpertAction) {
  const allowed = new Set<string>(['id', ...EXPERT_FIELDS]);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      if (key === 'id') return action === 'create';
      return action === 'update' || (value !== undefined && value !== null && value !== '');
    }),
  );
}

async function createExpert(input: Record<string, unknown>) {
  const tableName = await getExpertTableName();
  const now = new Date().toISOString();
  const record = pickExpertFields({
    ...input,
    id: String(input.id || randomUUID()),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }, 'create');

  if (!String(record.name || '').trim()) {
    throw new AdminExpertsRouteError('Numele expertului este obligatoriu.', 400);
  }

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

async function updateExpert(id: string, updates: Record<string, unknown>) {
  const tableName = await getExpertTableName();
  const record = pickExpertFields({ ...updates, updatedAt: new Date().toISOString() }, 'update');
  delete record.id;

  const setEntries = Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
  const removeEntries = Object.entries(record).filter(([, value]) => value === null);
  if (setEntries.length === 0 && removeEntries.length === 0) {
    throw new AdminExpertsRouteError('Nu exista campuri permise pentru actualizare.', 400);
  }

  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, DdbAttribute> = {};
  const setParts = setEntries.map(([key, value], index) => {
    const nameKey = `#n${index}`;
    const valueKey = `:v${index}`;
    ExpressionAttributeNames[nameKey] = key;
    const attribute = toDdbAttribute(value);
    if (!attribute) throw new AdminExpertsRouteError(`Valoare invalida pentru ${key}.`, 400);
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

function parseAction(value: unknown): AdminExpertAction {
  if (value === 'create' || value === 'update') return value;
  throw new AdminExpertsRouteError('Actiune admin nepermisa pentru experti.', 400);
}

export async function POST(request: Request) {
  try {
    await assertAdminCaller(request);

    const body = await request.json().catch(() => null);
    const action = parseAction(body?.action);
    const input = (body?.input && typeof body.input === 'object' ? body.input : {}) as Record<string, unknown>;
    const id = String(body?.id || input.id || '').trim();

    if (action === 'create') {
      const data = await createExpert(input);
      return NextResponse.json({ data });
    }

    if (!id) {
      throw new AdminExpertsRouteError('Lipseste id-ul expertului pentru actualizare.', 400);
    }

    const data = await updateExpert(id, input);
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof AdminExpertsRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Administrarea expertului a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
