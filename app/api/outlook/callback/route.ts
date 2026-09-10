import { NextRequest, NextResponse } from 'next/server';
import {
  OUTLOOK_STATE_COOKIE,
  OUTLOOK_TOKEN_COOKIE,
  clearOutlookCookie,
  exchangeOutlookCode,
  getOutlookGraphConfig,
  getPublicRequestOrigin,
  getOutlookUserEmail,
  normalizeOutlookEmail,
  readOutlookState,
  setEncryptedCookie,
} from '@/lib/outlook-graph';

export const runtime = 'nodejs';

function redirectWithStatus(origin: string, returnTo: string, status: string) {
  const parsedUrl = new URL(returnTo || '/expert/peo#outlook', origin);
  const url = parsedUrl.origin === origin ? parsedUrl : new URL('/expert/peo#outlook', origin);
  url.searchParams.set('outlook', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = getPublicRequestOrigin(request);
  const config = getOutlookGraphConfig(origin);
  const state = request.nextUrl.searchParams.get('state') || '';
  const code = request.nextUrl.searchParams.get('code') || '';
  const error = request.nextUrl.searchParams.get('error');
  const statePayload = readOutlookState(request, config.encryptionSecret);
  const returnTo = statePayload?.returnTo || '/expert/peo#outlook';

  if (error) {
    const response = redirectWithStatus(origin, returnTo, 'cancelled');
    clearOutlookCookie(response, OUTLOOK_STATE_COOKIE);
    return response;
  }

  if (!config.isConfigured || !statePayload || !state || state !== statePayload.state || !code) {
    const response = redirectWithStatus(origin, returnTo, 'invalid_state');
    clearOutlookCookie(response, OUTLOOK_STATE_COOKIE);
    return response;
  }

  try {
    const token = await exchangeOutlookCode({ origin, code });
    const signedInOutlookEmail = await getOutlookUserEmail(token.accessToken);
    const expectedEmail = normalizeOutlookEmail(statePayload.expertEmail);

    if (!signedInOutlookEmail || signedInOutlookEmail !== expectedEmail) {
      const response = redirectWithStatus(origin, returnTo, 'wrong_account');
      clearOutlookCookie(response, OUTLOOK_STATE_COOKIE);
      clearOutlookCookie(response, OUTLOOK_TOKEN_COOKIE);
      return response;
    }

    const response = redirectWithStatus(origin, returnTo, 'connected');
    clearOutlookCookie(response, OUTLOOK_STATE_COOKIE);
    setEncryptedCookie(response, OUTLOOK_TOKEN_COOKIE, {
      ...token,
      email: signedInOutlookEmail,
    }, config.encryptionSecret, 30 * 24 * 60 * 60);
    return response;
  } catch {
    const response = redirectWithStatus(origin, returnTo, 'error');
    clearOutlookCookie(response, OUTLOOK_STATE_COOKIE);
    return response;
  }
}
