import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const OUTLOOK_TOKEN_COOKIE = 'peo_outlook_graph_token';
export const OUTLOOK_STATE_COOKIE = 'peo_outlook_graph_state';

const OUTLOOK_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.Read'];
const COOKIE_CHUNK_SIZE = 3000;
const MAX_COOKIE_CHUNKS = 8;

export type OutlookGraphEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  durationHours: number;
};

type OutlookState = {
  state: string;
  expertEmail: string;
  returnTo: string;
  createdAt: number;
};

type OutlookTokenBundle = {
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphUserResponse = {
  mail?: string;
  userPrincipalName?: string;
};

type GraphCalendarViewResponse = {
  value?: Array<{
    id?: string;
    subject?: string;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    location?: { displayName?: string };
  }>;
};

export function normalizeOutlookEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || '';
}

function originFromUrl(value?: string | null) {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isLocalhostHost(host: string) {
  return host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1' || host.startsWith('127.0.0.1:');
}

export function getPublicRequestOrigin(request: NextRequest) {
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  if (forwardedHost && !isLocalhostHost(forwardedHost)) {
    const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto')) || 'https';
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = firstHeaderValue(request.headers.get('host'));
  if (host && !isLocalhostHost(host)) {
    const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto')) || request.nextUrl.protocol.replace(':', '') || 'https';
    return `${forwardedProto}://${host}`;
  }

  const configuredOrigin = originFromUrl(process.env.NEXT_PUBLIC_APP_URL)
    || originFromUrl(process.env.APP_URL)
    || originFromUrl(process.env.OUTLOOK_REDIRECT_URI);
  if (configuredOrigin) return configuredOrigin;

  return request.nextUrl.origin;
}

export function getOutlookGraphConfig(origin: string) {
  const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_GRAPH_CLIENT_ID || '';
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_GRAPH_CLIENT_SECRET || '';
  const tenantId = process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'organizations';
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || `${origin}/api/outlook/callback`;
  const encryptionSecret = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY || process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_GRAPH_CLIENT_SECRET || '';
  const missing = [
    clientId ? null : 'OUTLOOK_CLIENT_ID',
    clientSecret ? null : 'OUTLOOK_CLIENT_SECRET',
    encryptionSecret ? null : 'OUTLOOK_TOKEN_ENCRYPTION_KEY',
  ].filter((item): item is string => Boolean(item));

  return {
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    encryptionSecret,
    scopes: OUTLOOK_SCOPES.join(' '),
    isConfigured: missing.length === 0,
    missing,
  };
}

export function buildOutlookAuthorizeUrl(args: {
  origin: string;
  expertEmail: string;
  returnTo: string;
}) {
  const config = getOutlookGraphConfig(args.origin);
  const state = randomBytes(24).toString('base64url');
  const statePayload: OutlookState = {
    state,
    expertEmail: normalizeOutlookEmail(args.expertEmail),
    returnTo: args.returnTo || '/expert/peo#outlook',
    createdAt: Date.now(),
  };
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('login_hint', args.expertEmail);

  return { config, statePayload, url };
}

export function setEncryptedCookie(response: NextResponse, name: string, value: unknown, secret: string, maxAge: number) {
  const encrypted = encryptJson(value, secret);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  } as const;

  if (encrypted.length <= COOKIE_CHUNK_SIZE) {
    response.cookies.set(name, encrypted, cookieOptions);
    clearOutlookCookieChunks(response, name);
    return;
  }

  const chunks = encrypted.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, 'g')) || [];
  if (chunks.length > MAX_COOKIE_CHUNKS) {
    throw new Error('Outlook token is too large to store in cookies.');
  }
  response.cookies.set(name, `chunked:${chunks.length}`, cookieOptions);
  chunks.forEach((chunk, index) => {
    response.cookies.set(`${name}.${index}`, chunk, cookieOptions);
  });
  for (let index = chunks.length; index < MAX_COOKIE_CHUNKS; index += 1) {
    response.cookies.set(`${name}.${index}`, '', { ...cookieOptions, maxAge: 0 });
  }
}

export function clearOutlookCookie(response: NextResponse, name: string) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  } as const;
  response.cookies.set(name, '', cookieOptions);
  clearOutlookCookieChunks(response, name);
}

export function readOutlookState(request: NextRequest, secret: string) {
  return decryptJson<OutlookState>(readEncryptedCookieValue(request, OUTLOOK_STATE_COOKIE), secret);
}

export function readOutlookToken(request: NextRequest, secret: string) {
  return decryptJson<OutlookTokenBundle>(readEncryptedCookieValue(request, OUTLOOK_TOKEN_COOKIE), secret);
}

export async function exchangeOutlookCode(args: {
  origin: string;
  code: string;
}) {
  const config = getOutlookGraphConfig(args.origin);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: args.code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    scope: config.scopes,
  });
  const result = await tokenRequest(config.tenantId, body);
  return tokenBundleFromResponse(result);
}

export async function refreshOutlookToken(args: {
  origin: string;
  token: OutlookTokenBundle;
}) {
  if (!args.token.refreshToken) return args.token;
  const config = getOutlookGraphConfig(args.origin);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: args.token.refreshToken,
    grant_type: 'refresh_token',
    scope: config.scopes,
  });
  const result = await tokenRequest(config.tenantId, body);
  return {
    ...tokenBundleFromResponse(result),
    email: args.token.email,
    refreshToken: result.refresh_token || args.token.refreshToken,
  };
}

export async function getOutlookUserEmail(accessToken: string) {
  const response = await graphRequest<GraphUserResponse>('https://graph.microsoft.com/v1.0/me', accessToken);
  return normalizeOutlookEmail(response.mail || response.userPrincipalName);
}

export async function getOutlookCalendarEvents(args: {
  accessToken: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
}) {
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
  url.searchParams.set('startDateTime', args.startDateTime);
  url.searchParams.set('endDateTime', args.endDateTime);
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '100');
  const data = await graphRequest<GraphCalendarViewResponse>(url.toString(), args.accessToken, {
    Prefer: `outlook.timezone="${args.timeZone || 'Europe/Bucharest'}"`,
  });
  return (data.value || []).map(toOutlookGraphEvent).filter((event): event is OutlookGraphEvent => Boolean(event));
}

export function tokenNeedsRefresh(token: OutlookTokenBundle) {
  return token.expiresAt <= Date.now() + 60_000;
}

export function tokenMatchesExpert(token: OutlookTokenBundle | null, expertEmail: string) {
  return Boolean(token && normalizeOutlookEmail(token.email) === normalizeOutlookEmail(expertEmail));
}

async function tokenRequest(tenantId: string, body: URLSearchParams) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Microsoft OAuth token request failed.');
  }
  return data;
}

function tokenBundleFromResponse(data: TokenResponse): OutlookTokenBundle {
  if (!data.access_token) {
    throw new Error('Microsoft OAuth response did not include an access token.');
  }
  return {
    email: '',
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in || 3600) * 1000,
  };
}

async function graphRequest<T>(url: string, accessToken: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(headers || {}),
    },
  });
  const data = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || 'Microsoft Graph request failed.');
  }
  return data;
}

function toOutlookGraphEvent(item: NonNullable<GraphCalendarViewResponse['value']>[number]): OutlookGraphEvent | null {
  if (!item.id || !item.start?.dateTime || !item.end?.dateTime) return null;
  const start = new Date(item.start.dateTime);
  const end = new Date(item.end.dateTime);
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const event: OutlookGraphEvent = {
    id: item.id,
    title: item.subject || 'Sedinta Outlook',
    date: item.start.dateTime.slice(0, 10),
    startTime: item.start.dateTime.slice(11, 16),
    endTime: item.end.dateTime.slice(11, 16),
    durationHours: Math.round((durationMs / 3_600_000) * 10) / 10,
  };
  if (item.location?.displayName) {
    event.location = item.location.displayName;
  }
  return event;
}

function readEncryptedCookieValue(request: NextRequest, name: string) {
  const value = request.cookies.get(name)?.value;
  if (!value?.startsWith('chunked:')) return value;

  const chunkCount = Number(value.replace('chunked:', ''));
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_COOKIE_CHUNKS) return undefined;

  const chunks = Array.from({ length: chunkCount }, (_, index) => request.cookies.get(`${name}.${index}`)?.value || '');
  return chunks.every(Boolean) ? chunks.join('') : undefined;
}

function clearOutlookCookieChunks(response: NextResponse, name: string) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  } as const;
  for (let index = 0; index < MAX_COOKIE_CHUNKS; index += 1) {
    response.cookies.set(`${name}.${index}`, '', cookieOptions);
  }
}

function encryptJson(value: unknown, secret: string) {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptJson<T>(value: string | undefined, secret: string): T | null {
  if (!value || !secret) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) return null;
    const key = createHash('sha256').update(secret).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}
