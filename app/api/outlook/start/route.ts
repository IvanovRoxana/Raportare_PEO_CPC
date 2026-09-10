import { NextRequest, NextResponse } from 'next/server';
import {
  OUTLOOK_STATE_COOKIE,
  buildOutlookAuthorizeUrl,
  getPublicRequestOrigin,
  normalizeOutlookEmail,
  setEncryptedCookie,
} from '@/lib/outlook-graph';

export const runtime = 'nodejs';

function redirectBack(origin: string, returnTo: string, status: string) {
  const parsedUrl = new URL(returnTo || '/expert/peo#outlook', origin);
  const url = parsedUrl.origin === origin ? parsedUrl : new URL('/expert/peo#outlook', origin);
  url.searchParams.set('outlook', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = getPublicRequestOrigin(request);
  const expertEmail = normalizeOutlookEmail(request.nextUrl.searchParams.get('expertEmail'));
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/expert/peo#outlook';

  if (!expertEmail) {
    return redirectBack(origin, returnTo, 'missing_email');
  }

  const { config, statePayload, url } = buildOutlookAuthorizeUrl({ origin, expertEmail, returnTo });
  if (!config.isConfigured) {
    return redirectBack(origin, returnTo, 'not_configured');
  }

  const response = NextResponse.redirect(url);
  setEncryptedCookie(response, OUTLOOK_STATE_COOKIE, statePayload, config.encryptionSecret, 10 * 60);
  return response;
}
