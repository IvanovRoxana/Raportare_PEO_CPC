import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { buildLinearIssueDraft } from '@/lib/support-ticketing';
import type { SupportTicket } from '@/lib/types';

export const runtime = 'nodejs';

const cognitoRegion = outputs.auth?.aws_region || 'eu-north-1';
const userPoolId = outputs.auth?.user_pool_id;
const cognitoEndpoint = `https://cognito-idp.${cognitoRegion}.amazonaws.com/`;
const linearEndpoint = 'https://api.linear.app/graphql';

class SupportTicketLinearError extends Error {
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
  if (!payload) throw new SupportTicketLinearError('Token Cognito invalid.', 401);

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalizeGroups(value: unknown) {
  const groups = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  return groups.map((group) => group.trim().toLowerCase()).filter(Boolean);
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
    throw new SupportTicketLinearError('Sesiunea Cognito nu a putut fi validata.', 401);
  }
}

async function assertPmOrAdminCaller(request: Request) {
  if (!hasAllowedOrigin(request)) throw new SupportTicketLinearError('Cerere respinsa.', 403);

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) throw new SupportTicketLinearError('Lipseste tokenul Cognito.', 401);

  const payload = decodeJwtPayload(token);
  const issuer = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== issuer || payload.token_use !== 'access') {
    throw new SupportTicketLinearError('Token Cognito nepotrivit pentru acest user pool.', 403);
  }

  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    throw new SupportTicketLinearError('Sesiunea Cognito a expirat.', 401);
  }

  const groups = normalizeGroups(payload['cognito:groups']);
  if (!groups.includes('pm') && !groups.includes('admin')) {
    throw new SupportTicketLinearError('Doar PM/Admin poate crea issue-uri Linear din tichete.', 403);
  }

  await validateAccessTokenWithCognito(token);
}

function linearPriorityValue(value?: string) {
  if (value === 'urgent') return 1;
  if (value === 'high') return 2;
  if (value === 'medium') return 3;
  if (value === 'low') return 4;
  return 0;
}

async function callLinear<T>(query: string, variables: Record<string, unknown>) {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    throw new SupportTicketLinearError('LINEAR_API_KEY nu este configurat pe server.', 503);
  }

  const response = await fetch(linearEndpoint, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.errors?.length) {
    const message = body?.errors?.[0]?.message || 'Crearea issue-ului Linear a esuat.';
    throw new SupportTicketLinearError(message, response.ok ? 502 : response.status);
  }

  return body?.data as T;
}

async function resolveLabelIds(labelNames: string[], teamId: string) {
  if (labelNames.length === 0) return { labelIds: [], missingLabels: [] };

  const data = await callLinear<{
    issueLabels?: { nodes?: Array<{ id: string; name: string }> };
  }>(
    `query IssueLabels($teamId: ID!) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }, first: 100) {
        nodes { id name }
      }
    }`,
    { teamId },
  );

  const wanted = new Set(labelNames.map((label) => label.trim().toLowerCase()).filter(Boolean));
  const matchedLabels = (data.issueLabels?.nodes || [])
    .filter((label) => wanted.has(label.name.trim().toLowerCase()));
  const matchedNames = new Set(matchedLabels.map((label) => label.name.trim().toLowerCase()));

  return {
    labelIds: matchedLabels.map((label) => label.id),
    missingLabels: labelNames.filter((label) => !matchedNames.has(label.trim().toLowerCase())),
  };
}

export async function POST(request: Request) {
  try {
    await assertPmOrAdminCaller(request);

    const body = await request.json().catch(() => null);
    const ticket = body?.ticket as SupportTicket | undefined;
    if (!ticket?.id || !ticket.title || !ticket.description) {
      return NextResponse.json({ error: 'Ticket invalid pentru creare Linear.' }, { status: 400 });
    }
    if (ticket.linearIssueUrl) {
      return NextResponse.json({ error: 'Ticketul are deja link Linear.' }, { status: 409 });
    }

    const teamId = process.env.LINEAR_TEAM_ID?.trim();
    if (!teamId) {
      throw new SupportTicketLinearError('LINEAR_TEAM_ID nu este configurat pe server.', 503);
    }

    const draft = buildLinearIssueDraft(ticket);
    const { labelIds, missingLabels } = await resolveLabelIds(draft.labels, teamId);
    const data = await callLinear<{
      issueCreate?: {
        success?: boolean;
        issue?: { id: string; identifier: string; url: string };
      };
    }>(
      `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      {
        input: {
          teamId,
          title: draft.title,
          description: draft.description,
          priority: linearPriorityValue(draft.priority),
          ...(labelIds.length > 0 ? { labelIds } : {}),
        },
      },
    );

    const issue = data.issueCreate?.issue;
    if (!data.issueCreate?.success || !issue?.url) {
      throw new SupportTicketLinearError('Linear nu a returnat issue-ul creat.', 502);
    }

    return NextResponse.json({
      ok: true,
      issueId: issue.identifier || issue.id,
      issueUrl: issue.url,
      missingLabels,
    });
  } catch (error) {
    const status = error instanceof SupportTicketLinearError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Crearea issue-ului Linear a esuat.';
    return NextResponse.json({ error: message }, { status });
  }
}
