import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';

export const runtime = 'nodejs';

const region = outputs.auth?.aws_region || 'eu-north-1';
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const dynamoEndpoint = `https://dynamodb.${region}.amazonaws.com/`;
const dynamoHost = `dynamodb.${region}.amazonaws.com`;
const expertTableName = process.env.EXPERT_TABLE_NAME || 'Expert-3wpaiebzefggpcmhzurrifx53i-NONE';

const SELF_PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'beneficiary',
  'positionInProject',
  'avatarUrl',
] as const;

type DdbAttribute = { S: string } | { N: string } | { BOOL: boolean };

class ExpertProfileRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function getBearerToken(value?: string | null) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
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
    throw new ExpertProfileRouteError('Credentialele AWS nu sunt disponibile pentru salvarea profilului.', 503);
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
    throw new ExpertProfileRouteError(errorBody?.message || errorBody?.__type || `${target} failed.`, response.status);
  }

  const responseText = await response.text();
  return responseText.trim() ? JSON.parse(responseText) as T : {} as T;
}

async function getCognitoEmail(accessToken: string) {
  const response = await fetch(cognitoEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.GetUser',
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  });

  if (!response.ok) {
    throw new ExpertProfileRouteError('Sesiunea Cognito nu a putut fi validata.', 401);
  }

  const body = await response.json() as { UserAttributes?: Array<{ Name?: string; Value?: string }> };
  return String(body.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value || '').trim().toLowerCase();
}

function toDdbAttribute(value: unknown): DdbAttribute | undefined {
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number' && Number.isFinite(value)) return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  return undefined;
}

function pickProfileFields(input: Record<string, unknown>, currentEmail: string) {
  const clean = Object.fromEntries(
    SELF_PROFILE_FIELDS
      .map((field) => [field, input[field]] as const)
      .filter(([, value]) => value !== undefined && value !== null),
  );
  const nextEmail = String(clean.email || '').trim().toLowerCase();
  if (nextEmail && currentEmail && nextEmail !== currentEmail) {
    throw new ExpertProfileRouteError('Emailul profilului trebuie sa ramana emailul contului autentificat.', 403);
  }
  return clean;
}

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request.headers.get('authorization'));
    if (!accessToken) throw new ExpertProfileRouteError('Lipseste tokenul Cognito.', 401);

    const body = await request.json().catch(() => null) as { id?: string; input?: Record<string, unknown> } | null;
    const id = String(body?.id || '').trim();
    if (!id) throw new ExpertProfileRouteError('Lipseste id-ul expertului.', 400);

    const currentEmail = await getCognitoEmail(accessToken);
    const input = pickProfileFields(body?.input || {}, currentEmail);
    if (!String(input.name || '').trim()) throw new ExpertProfileRouteError('Numele este obligatoriu.', 400);

    const payload = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const entries = Object.entries(payload)
      .map(([key, value]) => [key, toDdbAttribute(value)] as const)
      .filter((entry): entry is readonly [string, DdbAttribute] => Boolean(entry[1]));

    const expressionAttributeNames = Object.fromEntries(entries.map(([key]) => [`#${key}`, key]));
    const expressionAttributeValues = Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value]));
    expressionAttributeNames['#email'] = 'email';
    expressionAttributeNames['#id'] = 'id';
    expressionAttributeNames['#role'] = 'role';
    expressionAttributeNames['#norma'] = 'norma';
    expressionAttributeNames['#createdAt'] = 'createdAt';
    expressionAttributeValues[':currentEmail'] = { S: currentEmail };
    expressionAttributeValues[':defaultRole'] = { S: 'Expert' };
    expressionAttributeValues[':defaultNorma'] = { N: '8' };
    expressionAttributeValues[':createdAt'] = { S: new Date().toISOString() };

    const result = await callSignedDynamo<{ Attributes?: Record<string, DdbAttribute> }>('UpdateItem', {
      TableName: expertTableName,
      Key: { id: { S: id } },
      UpdateExpression: [
        `SET ${entries.map(([key]) => `#${key} = :${key}`).join(', ')}`,
        '#role = if_not_exists(#role, :defaultRole)',
        '#norma = if_not_exists(#norma, :defaultNorma)',
        '#createdAt = if_not_exists(#createdAt, :createdAt)',
      ].join(', '),
      ConditionExpression: 'attribute_not_exists(#id) OR #email = :currentEmail OR attribute_not_exists(#email)',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return NextResponse.json({ ok: true, data: result.Attributes ?? null });
  } catch (error) {
    const status = error instanceof ExpertProfileRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Profilul nu a putut fi salvat.';
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
