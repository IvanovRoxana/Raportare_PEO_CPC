import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { managedCognitoGroups, type ManagedCognitoGroup } from '@/lib/cognito-roles';

export const runtime = 'nodejs';

const service = 'cognito-idp';
const userPoolId = outputs.auth?.user_pool_id;
const region = outputs.auth?.aws_region || 'eu-north-1';
const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const cognitoHost = `cognito-idp.${region}.amazonaws.com`;

type CognitoListGroupsResponse = {
  Groups?: Array<{ GroupName?: string }>;
};

class CognitoRouteError extends Error {
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
  if (!payload) throw new CognitoRouteError('Token Cognito invalid.', 401);

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalizeGroups(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

async function validateAccessTokenWithCognito(accessToken: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.GetUser',
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  });

  if (!response.ok) {
    throw new CognitoRouteError('Sesiunea Cognito a administratorului nu a putut fi validata.', 401);
  }
}

async function assertAdminCaller(request: Request) {
  if (!hasAllowedOrigin(request)) {
    throw new CognitoRouteError('Cerere respinsa.', 403);
  }

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) {
    throw new CognitoRouteError('Lipseste tokenul Cognito al administratorului.', 401);
  }

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new CognitoRouteError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new CognitoRouteError('Sesiunea Cognito a expirat.', 401);
  }

  await validateAccessTokenWithCognito(token);

  if (!normalizeGroups(payload['cognito:groups']).includes('admin')) {
    throw new CognitoRouteError('Doar administratorii pot sincroniza grupuri Cognito.', 403);
  }
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
    throw new CognitoRouteError('Credentialele AWS nu sunt disponibile pentru sincronizarea Cognito.', 503);
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.COGNITO_SYNC_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
  };
}

async function callSignedCognito<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const credentials = getCredentials();
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const target = `AWSCognitoIdentityProviderService.${action}`;

  const canonicalHeaders = [
    ['content-type', 'application/x-amz-json-1.1'],
    ['host', cognitoHost],
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-date': amzDate,
      'x-amz-target': target,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message || errorBody?.__type || `Cognito ${action} failed.`;
    throw new CognitoRouteError(message, response.status);
  }

  return response.json() as Promise<T>;
}

function normalizeRequestedGroups(value: unknown): ManagedCognitoGroup[] {
  const requestedGroups = Array.isArray(value) ? value.map(String) : [];
  const invalidGroups = requestedGroups.filter((group) => !managedCognitoGroups.includes(group as ManagedCognitoGroup));
  if (invalidGroups.length > 0) {
    throw new CognitoRouteError(`Grupuri Cognito nepermise: ${invalidGroups.join(', ')}.`, 400);
  }

  return managedCognitoGroups.filter((group) => requestedGroups.includes(group));
}

export async function PUT(request: Request) {
  try {
    if (!userPoolId) {
      throw new CognitoRouteError('User pool-ul Cognito nu este configurat.', 503);
    }

    await assertAdminCaller(request);

    const body = await request.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const requestedGroups = normalizeRequestedGroups(body?.groups);

    if (!email || !email.includes('@')) {
      throw new CognitoRouteError('Email invalid pentru sincronizarea Cognito.', 400);
    }

    const current = await callSignedCognito<CognitoListGroupsResponse>('AdminListGroupsForUser', {
      UserPoolId: userPoolId,
      Username: email,
    });
    const currentManagedGroups = new Set(
      (current.Groups || [])
        .map((group) => group.GroupName)
        .filter((group): group is ManagedCognitoGroup => managedCognitoGroups.includes(group as ManagedCognitoGroup)),
    );

    const groupsToAdd = requestedGroups.filter((group) => !currentManagedGroups.has(group));
    const requestedGroupSet = new Set(requestedGroups);
    const groupsToRemove = [...currentManagedGroups].filter((group) => !requestedGroupSet.has(group));

    for (const group of groupsToAdd) {
      await callSignedCognito('AdminAddUserToGroup', {
        GroupName: group,
        UserPoolId: userPoolId,
        Username: email,
      });
    }

    for (const group of groupsToRemove) {
      await callSignedCognito('AdminRemoveUserFromGroup', {
        GroupName: group,
        UserPoolId: userPoolId,
        Username: email,
      });
    }

    return NextResponse.json({
      email,
      groups: requestedGroups,
      added: groupsToAdd,
      removed: groupsToRemove,
    });
  } catch (error) {
    const status = error instanceof CognitoRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Sincronizarea Cognito a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
