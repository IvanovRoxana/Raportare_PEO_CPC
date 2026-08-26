import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import type { NotificationLogCreateInput } from '@/lib/types';

export const runtime = 'nodejs';

const cognitoRegion = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;
const emailRegion = process.env.NOTIFICATION_EMAIL_REGION
  || process.env.AWS_SES_REGION
  || process.env.AWS_REGION
  || process.env.AWS_DEFAULT_REGION
  || cognitoRegion;
const sesHost = `email.${emailRegion}.amazonaws.com`;
const sesEndpoint = `https://${sesHost}/v2/email/outbound-emails`;
const fromEmail = process.env.NOTIFICATION_EMAIL_FROM
  || process.env.AWS_SES_FROM_EMAIL
  || process.env.SES_FROM_EMAIL
  || '';
const replyToEmail = process.env.NOTIFICATION_EMAIL_REPLY_TO || process.env.AWS_SES_REPLY_TO_EMAIL || '';

type DeliveryStatus = Pick<NotificationLogCreateInput, 'status' | 'sentAt' | 'errorMessage'>;

class NotificationSendError extends Error {
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
  if (!payload) throw new NotificationSendError('Token Cognito invalid.', 401);

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
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
    throw new NotificationSendError('Sesiunea Cognito nu a putut fi validata.', 401);
  }
}

async function assertAuthenticatedCaller(request: Request) {
  if (!hasAllowedOrigin(request)) throw new NotificationSendError('Cerere respinsa.', 403);

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) throw new NotificationSendError('Lipseste tokenul Cognito.', 401);

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new NotificationSendError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new NotificationSendError('Sesiunea Cognito a expirat.', 401);
  }

  await validateAccessTokenWithCognito(token);
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function getSignatureKey(secretAccessKey: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, emailRegion);
  const kService = hmac(kRegion, 'ses');
  return hmac(kService, 'aws4_request');
}

function getCredentials() {
  const accessKeyId = process.env.NOTIFICATION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.NOTIFICATION_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.NOTIFICATION_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
  };
}

function normalizeNotification(input: unknown): NotificationLogCreateInput | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as Partial<NotificationLogCreateInput>;
  const recipientEmail = String(item.recipientEmail || '').trim();
  const subject = String(item.subject || '').trim();
  const body = String(item.body || '').trim();
  const kind = String(item.kind || '').trim();

  if (!kind || !recipientEmail || !subject || !body) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return null;

  return {
    ...item,
    kind,
    recipientEmail,
    subject: subject.slice(0, 240),
    body,
    status: 'pending',
  };
}

async function sendSesEmail(notification: NotificationLogCreateInput): Promise<DeliveryStatus> {
  const credentials = getCredentials();
  if (!fromEmail || !credentials) {
    return {
      status: 'pending',
      errorMessage: 'SES nu este configurat: lipseste NOTIFICATION_EMAIL_FROM sau credentialele AWS.',
    };
  }

  const payload = {
    FromEmailAddress: fromEmail,
    ...(replyToEmail ? { ReplyToAddresses: [replyToEmail] } : {}),
    Destination: { ToAddresses: [notification.recipientEmail] },
    Content: {
      Simple: {
        Subject: { Data: notification.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: notification.body, Charset: 'UTF-8' },
        },
      },
    },
  };
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = '/v2/email/outbound-emails';
  const contentType = 'application/json';
  const canonicalHeaders = [
    ['content-type', contentType],
    ['host', sesHost],
    ['x-amz-date', amzDate],
    ...(credentials.sessionToken ? [['x-amz-security-token', credentials.sessionToken]] : []),
  ] as Array<[string, string]>;
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(';');
  const canonicalRequest = [
    'POST',
    canonicalUri,
    '',
    canonicalHeaders.map(([key, value]) => `${key}:${value.trim()}\n`).join(''),
    signedHeaders,
    sha256(body),
  ].join('\n');
  const credentialScope = `${dateStamp}/${emailRegion}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', getSignatureKey(credentials.secretAccessKey, dateStamp))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const response = await fetch(sesEndpoint, {
    method: 'POST',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': contentType,
      'x-amz-date': amzDate,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    return {
      status: 'failed',
      errorMessage: errorBody?.message || errorBody?.Message || `SES a raspuns cu status ${response.status}.`,
    };
  }

  return { status: 'sent', sentAt: new Date().toISOString() };
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedCaller(request);
    const body = await request.json().catch(() => null) as { notifications?: unknown[]; notification?: unknown } | null;
    const rawNotifications = Array.isArray(body?.notifications) ? body.notifications : body?.notification ? [body.notification] : [];
    const notifications = rawNotifications.map(normalizeNotification).filter((item): item is NotificationLogCreateInput => Boolean(item));

    if (notifications.length === 0) {
      throw new NotificationSendError('Nu exista notificari valide de trimis.', 400);
    }
    if (notifications.length > 20) {
      throw new NotificationSendError('Prea multe notificari intr-o singura cerere.', 400);
    }

    const deliveries = [];
    for (const notification of notifications) {
      deliveries.push(await sendSesEmail(notification));
    }

    return NextResponse.json({ deliveries });
  } catch (error) {
    const status = error instanceof NotificationSendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Trimiterea notificarilor a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
