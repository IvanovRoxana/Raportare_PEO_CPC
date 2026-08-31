import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import type { Activity, Deliverable, Expert } from '@/lib/types';

export const runtime = 'nodejs';

type DdbAttribute =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: boolean }
  | { L: DdbAttribute[] }
  | { M: Record<string, DdbAttribute> };

type CognitoUser = {
  Username?: string;
  UserAttributes?: Array<{ Name?: string; Value?: string }>;
};
type RawItem = Record<string, any>;

class ColleagueOverviewRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const region = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const dynamoEndpoint = `https://dynamodb.${region}.amazonaws.com/`;
const dynamoHost = `dynamodb.${region}.amazonaws.com`;
const tableNameCache: Record<string, string> = {};

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
  if (!payload) throw new ColleagueOverviewRouteError('Token Cognito invalid.', 401);
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalize(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function normalizeGroups(value: unknown) {
  const groups = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  return groups.map(normalize).filter(Boolean);
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
  const kService = hmac(kRegion, 'dynamodb');
  return hmac(kService, 'aws4_request');
}

function getCredentials() {
  const accessKeyId = process.env.COGNITO_SYNC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.COGNITO_SYNC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new ColleagueOverviewRouteError('Credentialele AWS nu sunt disponibile pentru newsletterul colegilor.', 503);
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.COGNITO_SYNC_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
  };
}

async function callSignedDynamo<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const credentials = getCredentials();
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = [
    ['content-type', 'application/x-amz-json-1.0'],
    ['host', dynamoHost],
    ['x-amz-date', amzDate],
    ['x-amz-target', `DynamoDB_20120810.${target}`],
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
  const credentialScope = `${dateStamp}/${region}/dynamodb/aws4_request`;
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
      'x-amz-target': `DynamoDB_20120810.${target}`,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ColleagueOverviewRouteError(errorBody?.message || errorBody?.__type || `${target} failed.`, response.status);
  }

  return response.json() as Promise<T>;
}

async function validateAccessToken(accessToken: string) {
  const response = await fetch(cognitoEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.GetUser',
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  });

  if (!response.ok) {
    throw new ColleagueOverviewRouteError('Sesiunea Cognito nu a putut fi validata.', 401);
  }

  return response.json() as Promise<CognitoUser>;
}

function fromDdbAttribute(attribute?: DdbAttribute): unknown {
  if (!attribute) return undefined;
  if ('S' in attribute) return attribute.S;
  if ('N' in attribute) return Number(attribute.N);
  if ('BOOL' in attribute) return attribute.BOOL;
  if ('NULL' in attribute) return null;
  if ('L' in attribute) return attribute.L.map(fromDdbAttribute);
  if ('M' in attribute) return Object.fromEntries(Object.entries(attribute.M).map(([key, value]) => [key, fromDdbAttribute(value)]));
  return undefined;
}

function fromDdbItem(item: Record<string, DdbAttribute>) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fromDdbAttribute(value)]));
}

function toDdbAttribute(value: string | number): DdbAttribute {
  return typeof value === 'number' ? { N: String(value) } : { S: value };
}

async function listTableNames() {
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

async function getTableName(modelName: 'Activity' | 'Deliverable' | 'Expert') {
  const envName = process.env[`${modelName.toUpperCase()}_TABLE_NAME`];
  if (envName) return envName;
  if (tableNameCache[modelName]) return tableNameCache[modelName];

  const matches = (await listTableNames()).filter((name) => name.startsWith(`${modelName}-`));
  if (matches.length !== 1) {
    throw new ColleagueOverviewRouteError(`Nu pot identifica tabelul ${modelName} pentru newsletterul colegilor.`, 503);
  }

  tableNameCache[modelName] = matches[0];
  return matches[0];
}

async function scanTable<T>(
  modelName: 'Activity' | 'Deliverable' | 'Expert',
  input: Omit<Record<string, unknown>, 'TableName'> = {},
) {
  const TableName = await getTableName(modelName);
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, DdbAttribute> | undefined;

  do {
    const response = await callSignedDynamo<{
      Items?: Array<Record<string, DdbAttribute>>;
      LastEvaluatedKey?: Record<string, DdbAttribute>;
    }>('Scan', {
      TableName,
      ...input,
      ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
    });
    items.push(...(response.Items || []).map((item) => fromDdbItem(item) as T));
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

async function getCurrentCaller(request: Request) {
  if (!hasAllowedOrigin(request)) {
    throw new ColleagueOverviewRouteError('Cerere respinsa.', 403);
  }
  if (!userPoolId) {
    throw new ColleagueOverviewRouteError('User pool-ul Cognito nu este configurat.', 503);
  }

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw new ColleagueOverviewRouteError('Lipseste tokenul Cognito.', 401);
  }

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new ColleagueOverviewRouteError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new ColleagueOverviewRouteError('Sesiunea Cognito a expirat.', 401);
  }

  const user = await validateAccessToken(token);
  const email = normalize(user.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value || String(payload.email || ''));
  const groups = normalizeGroups(payload['cognito:groups']);
  const experts = await scanTable<Expert>('Expert', {
    ProjectionExpression: 'id, #name, email, projectCode, isActive',
    ExpressionAttributeNames: { '#name': 'name' },
  });
  const currentExpert = experts.find((expert) => normalize(expert.email) === email || normalize(expert.id) === normalize(user.Username));

  if (!currentExpert && !groups.includes('pm') && !groups.includes('admin')) {
    throw new ColleagueOverviewRouteError('Nu pot identifica expertul curent.', 403);
  }

  return {
    canAccessAllExperts: groups.includes('pm') || groups.includes('admin'),
    currentExpert,
    experts,
  };
}

function mapDeliverable(item: RawItem): Deliverable {
  return {
    id: String(item.id),
    activityId: String(item.activityId || ''),
    fileName: String(item.fileName || item.title || ''),
    originalFileName: item.originalFileName,
    filePath: item.filePath,
    fileType: String(item.fileType || ''),
    fileSize: Number(item.fileSize) || 0,
    category: item.category,
    documentId: item.documentId,
    s3Key: item.s3Key,
    uploadedByExpertId: item.uploadedByExpertId,
    projectId: item.projectId,
    fileHash: item.fileHash,
    firstPageTextHash: item.firstPageTextHash,
    contentFingerprint: item.contentFingerprint,
  };
}

function mapActivity(item: RawItem, deliverables: Deliverable[]): Activity {
  return {
    id: String(item.id),
    expertId: String(item.expertId || ''),
    expertName: item.expertName,
    date: String(item.date || ''),
    hours: Number(item.hours) || 0,
    activityType: String(item.activityType || ''),
    saCode: item.saCode,
    catalogActivityId: item.catalogActivityId,
    title: String(item.title || item.activityType || ''),
    description: item.description,
    activitySummary: item.activitySummary,
    activityKeywords: item.activityKeywords,
    location: item.location,
    dayType: item.dayType,
    status: item.status || 'draft',
    shareStatus: item.shareStatus,
    originActivityId: item.originActivityId,
    takenByExperts: item.takenByExperts,
    projectCode: item.projectCode,
    autoGenerated: item.autoGenerated,
    generatedAt: item.generatedAt,
    generatedBy: item.generatedBy,
    pmNotes: item.pmNotes,
    gdprTemplateCode: item.gdprTemplateCode,
    gdprMetaJson: item.gdprMetaJson,
    gdprGeneratedText: item.gdprGeneratedText,
    gdprConclusionCode: item.gdprConclusionCode,
    businessHubMetaJson: item.businessHubMetaJson,
    eventDurationHours: item.eventDurationHours,
    eventExtendedDescription: item.eventExtendedDescription,
    deliverables,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function listDeliverablesByActivityIds(activityIds: string[], month: number, year: number) {
  if (activityIds.length === 0) return new Map<string, Deliverable[]>();
  const allowedActivityIds = new Set(activityIds);

  const deliverables = (await scanTable<RawItem>('Deliverable', {
    FilterExpression: '#year = :year AND #month = :month',
    ExpressionAttributeNames: { '#year': 'year', '#month': 'month' },
    ExpressionAttributeValues: {
      ':year': toDdbAttribute(year),
      ':month': toDdbAttribute(month),
    },
  }))
    .map(mapDeliverable)
    .filter((deliverable) => allowedActivityIds.has(deliverable.activityId || ''));

  const byActivityId = new Map<string, Deliverable[]>();
  deliverables.forEach((deliverable) => {
    const activityId = deliverable.activityId;
    if (!activityId) return;
    byActivityId.set(activityId, [...(byActivityId.get(activityId) ?? []), deliverable]);
  });
  return byActivityId;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = Number(url.searchParams.get('month'));
    const year = Number(url.searchParams.get('year'));

    if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) {
      throw new ColleagueOverviewRouteError('Luna sau anul sunt invalide.', 400);
    }

    const caller = await getCurrentCaller(request);
    const currentProjectCode = caller.currentExpert?.projectCode;
    const rows = await scanTable<Partial<Activity>>('Activity', {
      FilterExpression: '#year = :year AND #month = :month',
      ExpressionAttributeNames: { '#year': 'year', '#month': 'month' },
      ExpressionAttributeValues: {
        ':year': toDdbAttribute(year),
        ':month': toDdbAttribute(month),
      },
    });
    const filtered = rows
      .filter((activity) => activity.expertId && activity.expertId !== caller.currentExpert?.id)
      .filter((activity) => caller.canAccessAllExperts || !currentProjectCode || !activity.projectCode || activity.projectCode === currentProjectCode);
    const activityIds = filtered.map((activity) => String(activity.id || '')).filter((id) => id.length > 0);
    const deliverablesByActivityId = await listDeliverablesByActivityIds(activityIds, month, year);
    const activities = filtered
      .map((activity) => mapActivity(activity, deliverablesByActivityId.get(String(activity.id)) ?? []))
      .sort((a, b) => {
        const expertCompare = (a.expertName || '').localeCompare(b.expertName || '');
        if (expertCompare !== 0) return expertCompare;
        return a.date.localeCompare(b.date);
      });

    return NextResponse.json({ activities });
  } catch (error) {
    const status = error instanceof ColleagueOverviewRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Newsletterul colegilor nu a putut fi incarcat.';
    return NextResponse.json({ error: message }, { status });
  }
}
