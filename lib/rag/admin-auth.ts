import { timingSafeEqual } from 'node:crypto';
import outputs from '../../amplify_outputs.json' with { type: 'json' };

const ADMIN_TOKEN_HEADER = 'x-rag-admin-token';

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

const region = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;

class RagAdminAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getBearerToken(value?: string | null) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function decodeJwtPayload(token: string) {
  const payload = token.split('.')[1];
  if (!payload) throw new RagAdminAuthError('Sesiunea Cognito nu este valida.', 401);
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new RagAdminAuthError('Sesiunea Cognito nu este valida.', 401);
  }
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
  if (!response.ok) throw new RagAdminAuthError('Sesiunea Cognito nu a putut fi validata.', 401);
  return response.json() as Promise<{ Username?: string }>;
}

export async function assertRagAdminRequest(request: Request) {
  if (!hasAllowedOrigin(request)) {
    throw new RagAdminAuthError('Nu ai permisiunea necesara pentru indexarea surselor AI.', 403);
  }
  if (!userPoolId) throw new RagAdminAuthError('User pool-ul Cognito nu este configurat.', 503);

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) throw new RagAdminAuthError('Nu ai permisiunea necesara pentru indexarea surselor AI.', 401);
  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new RagAdminAuthError('Sesiunea Cognito nu este valida.', 401);
  }
  if (Number(payload.exp || 0) * 1000 <= Date.now()) {
    throw new RagAdminAuthError('Sesiunea Cognito a expirat.', 401);
  }

  const cognitoUser = await validateAccessTokenWithCognito(token);
  const identity = String(cognitoUser.Username || payload.username || payload.sub || '').trim();
  if (!identity) throw new RagAdminAuthError('Nu ai permisiunea necesara pentru indexarea surselor AI.', 403);
  const groups = Array.isArray(payload['cognito:groups'])
    ? payload['cognito:groups'].map(String).map((group) => group.toLowerCase())
    : [String(payload['cognito:groups'] || '').toLowerCase()];
  if (!groups.includes('admin')) {
    throw new RagAdminAuthError('Nu ai permisiunea necesara pentru indexarea surselor AI.', 403);
  }
  return token;
}

export function ragAdminAuthErrorResponse(error: unknown) {
  if (error instanceof RagAdminAuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/** Legacy credential for non-UI/CLI imports. Interactive Admin requests must use Cognito. */
export function guardRagAdminRequest(request: Request) {
  if (!hasAllowedOrigin(request)) {
    return Response.json({ error: 'Cerere RAG admin respinsa.' }, { status: 403 });
  }
  const configuredToken = process.env.RAG_ADMIN_IMPORT_TOKEN?.trim();
  if (!configuredToken) {
    return Response.json({ error: 'RAG admin import token nu este configurat pe server.' }, { status: 503 });
  }
  const actual = request.headers.get(ADMIN_TOKEN_HEADER)?.trim() || '';
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(configuredToken);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return Response.json({ error: 'Cerere RAG admin respinsa.' }, { status: 403 });
  }
  return null;
}
