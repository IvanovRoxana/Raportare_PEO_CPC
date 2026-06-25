import { timingSafeEqual } from 'node:crypto';

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

function getBearerToken(value?: string | null) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getRequestToken(request: Request) {
  return (
    request.headers.get(ADMIN_TOKEN_HEADER)?.trim()
    || getBearerToken(request.headers.get('authorization'))
  );
}

function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function guardRagAdminRequest(request: Request) {
  if (!hasAllowedOrigin(request)) {
    return Response.json({ error: 'Cerere RAG admin respinsa.' }, { status: 403 });
  }

  const configuredToken = process.env.RAG_ADMIN_IMPORT_TOKEN?.trim();
  if (!configuredToken) {
    return Response.json({ error: 'RAG admin import token nu este configurat pe server.' }, { status: 503 });
  }

  const requestToken = getRequestToken(request);
  if (!requestToken || !tokensMatch(requestToken, configuredToken)) {
    return Response.json({ error: 'Cerere RAG admin respinsa.' }, { status: 403 });
  }

  return null;
}
