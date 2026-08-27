import { NextResponse } from 'next/server';
import { OUTLOOK_TOKEN_COOKIE, clearOutlookCookie } from '@/lib/outlook-graph';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearOutlookCookie(response, OUTLOOK_TOKEN_COOKIE);
  return response;
}
