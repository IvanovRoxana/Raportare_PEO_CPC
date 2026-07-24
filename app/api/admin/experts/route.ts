import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { EXPERT_PM_EXTENDED_ACCESS_EMAILS } from '@/lib/access-control';

export const runtime = 'nodejs';

const region = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
const cognitoHost = `cognito-idp.${region}.amazonaws.com`;
const appSyncEndpoint = outputs.data?.url;

const EXPERT_FIELDS = [
  'name',
  'role',
  'email',
  'phone',
  'category',
  'norma',
  'normType',
  'oreZi',
  'manualMonthlyNorm',
  'projectMonthlyNorm',
  'positionInProject',
  'projectCode',
  'projectTitle',
  'contractNumber',
  'contractType',
  'expertExperienceCategory',
  'jobDescriptionText',
  'aiReportingInstructions',
  'beneficiary',
  'saCodes',
  'hasPmAccess',
  'isActive',
] as const;

type AdminExpertAction = 'create' | 'update';

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
  service: 'cognito-idp',
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

  return token;
}

function pickExpertFields(input: Record<string, unknown>, action: AdminExpertAction) {
  const allowed = new Set<string>(EXPERT_FIELDS);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      return action === 'update' || (value !== undefined && value !== null && value !== '');
    }),
  );
}

const EXPERT_SELECTION = `
  id
  name
  role
  email
  phone
  category
  norma
  normType
  oreZi
  manualMonthlyNorm
  projectMonthlyNorm
  positionInProject
  projectCode
  projectTitle
  contractNumber
  contractType
  expertExperienceCategory
  jobDescriptionText
  aiReportingInstructions
  beneficiary
  saCodes
  hasPmAccess
  isActive
  createdAt
  updatedAt
`;

async function writeExpertWithAppSync(
  accessToken: string,
  action: AdminExpertAction,
  input: Record<string, unknown>,
  id?: string,
) {
  if (!appSyncEndpoint) {
    throw new AdminExpertsRouteError('Endpointul AppSync nu este configurat.', 503);
  }

  const cleanInput = pickExpertFields(input, action);
  if (action === 'create' && (!String(cleanInput.name || '').trim() || !String(cleanInput.role || '').trim())) {
    throw new AdminExpertsRouteError('Numele si rolul expertului sunt obligatorii.', 400);
  }
  if (action === 'update' && Object.keys(cleanInput).length === 0) {
    throw new AdminExpertsRouteError('Nu exista campuri permise pentru actualizare.', 400);
  }

  const mutationName = action === 'create' ? 'createExpert' : 'updateExpert';
  const inputType = action === 'create' ? 'CreateExpertInput!' : 'UpdateExpertInput!';
  const mutationInput = action === 'update' ? { id, ...cleanInput } : cleanInput;
  const response = await fetch(appSyncEndpoint, {
    method: 'POST',
    headers: {
      authorization: accessToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation AdminWriteExpert($input: ${inputType}) {
        ${mutationName}(input: $input) {
          ${EXPERT_SELECTION}
        }
      }`,
      variables: { input: mutationInput },
    }),
  });
  const body = await response.json().catch(() => null) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string; errorType?: string }>;
  } | null;
  const graphQlError = body?.errors?.[0];

  if (!response.ok || graphQlError) {
    const message = graphQlError?.message || graphQlError?.errorType || 'Scrierea profilului prin AppSync a esuat.';
    const status = /unauthorized|not authorized|access denied/i.test(message)
      ? 403
      : response.ok
        ? 400
        : response.status;
    throw new AdminExpertsRouteError(message, status);
  }

  const result = body?.data?.[mutationName];
  if (!result) {
    throw new AdminExpertsRouteError('AppSync nu a returnat profilul salvat.', 502);
  }
  return result;
}

function parseAction(value: unknown): AdminExpertAction {
  if (value === 'create' || value === 'update') return value;
  throw new AdminExpertsRouteError('Actiune admin nepermisa pentru experti.', 400);
}

export async function POST(request: Request) {
  try {
    const accessToken = await assertAdminCaller(request);

    const body = await request.json().catch(() => null);
    const action = parseAction(body?.action);
    const input = (body?.input && typeof body.input === 'object' ? body.input : {}) as Record<string, unknown>;
    const id = String(body?.id || input.id || '').trim();

    if (action === 'create') {
      const data = await writeExpertWithAppSync(accessToken, action, input);
      return NextResponse.json({ data });
    }

    if (!id) {
      throw new AdminExpertsRouteError('Lipseste id-ul expertului pentru actualizare.', 400);
    }

    const data = await writeExpertWithAppSync(accessToken, action, input, id);
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof AdminExpertsRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Administrarea expertului a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
