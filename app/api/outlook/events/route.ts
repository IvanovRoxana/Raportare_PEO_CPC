import { NextRequest, NextResponse } from 'next/server';
import {
  OUTLOOK_TOKEN_COOKIE,
  getOutlookCalendarEvents,
  getOutlookGraphConfig,
  getPublicRequestOrigin,
  normalizeOutlookEmail,
  readOutlookToken,
  refreshOutlookToken,
  setEncryptedCookie,
  toStoredOutlookToken,
  tokenMatchesExpert,
  tokenNeedsRefresh,
} from '@/lib/outlook-graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function outlookEventsResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...(init || {}),
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      ...(init?.headers || {}),
    },
  });
}

function monthRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  return {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const origin = getPublicRequestOrigin(request);
  const expertEmail = normalizeOutlookEmail(request.nextUrl.searchParams.get('expertEmail'));
  const month = Number(request.nextUrl.searchParams.get('month'));
  const year = Number(request.nextUrl.searchParams.get('year'));
  const config = getOutlookGraphConfig(origin);

  if (!config.isConfigured) {
    return outlookEventsResponse({ connected: false, configured: false, events: [], missing: config.missing }, { status: 200 });
  }
  if (!expertEmail || !Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) {
    return outlookEventsResponse({ error: 'Parametri Outlook invalizi.' }, { status: 400 });
  }

  let token = readOutlookToken(request, config.encryptionSecret);
  if (!tokenMatchesExpert(token, expertEmail)) {
    return outlookEventsResponse({ connected: false, configured: true, events: [] }, { status: 403 });
  }

  let refreshedToken = false;
  try {
    if (token && tokenNeedsRefresh(token)) {
      token = await refreshOutlookToken({ origin, token });
      refreshedToken = true;
    }
    if (!token) {
      return outlookEventsResponse({ connected: false, configured: true, events: [] }, { status: 401 });
    }
    if (!token.accessToken) {
      return outlookEventsResponse({ connected: false, configured: true, events: [] }, { status: 401 });
    }
    const events = await getOutlookCalendarEvents({
      accessToken: token.accessToken,
      ...monthRange(month, year),
    });
    const response = outlookEventsResponse({ connected: true, configured: true, events });
    if (refreshedToken) {
      setEncryptedCookie(response, OUTLOOK_TOKEN_COOKIE, toStoredOutlookToken(token, token.email), config.encryptionSecret, 30 * 24 * 60 * 60);
    }
    return response;
  } catch (error) {
    return outlookEventsResponse({
      connected: false,
      configured: true,
      events: [],
      error: error instanceof Error ? error.message : 'Calendarul Outlook nu a putut fi citit.',
    }, { status: 502 });
  }
}
