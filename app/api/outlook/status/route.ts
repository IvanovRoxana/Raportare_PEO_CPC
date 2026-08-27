import { NextRequest, NextResponse } from 'next/server';
import {
  getOutlookGraphConfig,
  normalizeOutlookEmail,
  readOutlookToken,
  tokenMatchesExpert,
} from '@/lib/outlook-graph';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const expertEmail = normalizeOutlookEmail(request.nextUrl.searchParams.get('expertEmail'));
  const config = getOutlookGraphConfig(origin);
  const token = config.isConfigured ? readOutlookToken(request, config.encryptionSecret) : null;

  return NextResponse.json({
    configured: config.isConfigured,
    missing: config.missing,
    connected: Boolean(expertEmail && tokenMatchesExpert(token, expertEmail)),
    connectedEmail: token?.email || null,
  });
}
