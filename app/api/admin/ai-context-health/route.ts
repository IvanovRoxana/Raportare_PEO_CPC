import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { EXPERT_PM_EXTENDED_ACCESS_EMAILS } from '@/lib/access-control';
import { normalizePeoCategory } from '@/lib/peo-category';
import { getActiveAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';
import {
  listKnowledgeChunksByCategoryAndSourceType,
  listKnowledgeChunks,
  listKnowledgeChunksByExpertId,
} from '@/lib/rag/store';
import type { ActivityAutofillAudit, Expert } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HealthStatus = 'ok' | 'warning' | 'missing' | 'not_applicable';

const appSyncEndpoint = outputs.data?.url;
const EXPERT_FIELDS = `
  id
  name
  role
  email
  category
  positionInProject
  projectCode
  jobDescriptionText
  aiReportingInstructions
  saCodes
  isActive
`;
const ACTIVITY_AUTOFILL_AUDIT_FIELDS = `
  id
  expertId
  expertName
  expertRole
  category
  projectCode
  month
  year
  suggestedActivityName
  confidence
  warningsJson
  applied
  createdAt
`;

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
  if (!payload) throw new Error('Token Cognito invalid.');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

function normalizeGroups(value: unknown) {
  const groups = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  return groups.map((group) => group.trim().toLowerCase()).filter(Boolean);
}

function assertAdminContextRequest(request: Request) {
  if (!hasAllowedOrigin(request)) {
    return { error: 'Cerere respinsa.', status: 403 as const };
  }

  const token = getBearerToken(request.headers.get('authorization'));
  if (!token) {
    return { error: 'Lipseste tokenul Cognito pentru citirea contextului AI.', status: 401 as const };
  }

  const payload = decodeJwtPayload(token);
  const expiresAt = Number(payload.exp || 0) * 1000;
  if (!expiresAt || expiresAt <= Date.now()) {
    return { error: 'Sesiunea Cognito a expirat.', status: 401 as const };
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const groups = normalizeGroups(payload['cognito:groups']);
  const allowed = groups.includes('admin') || (groups.includes('pm') && EXPERT_PM_EXTENDED_ACCESS_EMAILS.includes(email));
  if (!allowed) {
    return { error: 'Doar Admin/PM extins poate vedea sanatatea contextului AI.', status: 403 as const };
  }

  return { token };
}

function statusFromCount(count: number, warningThreshold = 1): HealthStatus {
  if (count <= 0) return 'missing';
  if (count < warningThreshold) return 'warning';
  return 'ok';
}

function sourceSummary(count: number, label: string) {
  if (count === 0) return `Nu exista ${label}.`;
  if (count === 1) return `1 fragment ${label} disponibil.`;
  return `${count} fragmente ${label} disponibile.`;
}

async function appSyncList<T>({
  token,
  query,
  resultKey,
  variables = {},
  maxItems = 500,
}: {
  token: string;
  query: string;
  resultKey: string;
  variables?: Record<string, unknown>;
  maxItems?: number;
}) {
  if (!appSyncEndpoint) throw new Error('Endpointul AppSync nu este configurat.');

  const items: T[] = [];
  let nextToken: string | null | undefined;

  do {
    const response = await fetch(appSyncEndpoint, {
      method: 'POST',
      headers: {
        authorization: token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { ...variables, nextToken },
      }),
    });
    const body = await response.json().catch(() => null) as {
      data?: Record<string, { items?: T[]; nextToken?: string | null }>;
      errors?: Array<{ message?: string }>;
    } | null;
    const graphQlError = body?.errors?.[0]?.message;
    if (!response.ok || graphQlError) {
      throw new Error(graphQlError || 'Citirea AppSync a esuat.');
    }

    const result = body?.data?.[resultKey];
    items.push(...(result?.items || []));
    nextToken = result?.nextToken;
  } while (nextToken && items.length < maxItems);

  return items.slice(0, maxItems);
}

async function listExperts(token: string) {
  return appSyncList<Expert>({
    token,
    resultKey: 'listExperts',
    query: `query AdminAiContextListExperts($nextToken: String) {
      listExperts(limit: 500, nextToken: $nextToken) {
        items { ${EXPERT_FIELDS} }
        nextToken
      }
    }`,
  });
}

async function listActivityAutofillAudits(token: string, month?: number, year?: number) {
  const filter = {
    ...(month !== undefined ? { month: { eq: month } } : {}),
    ...(year !== undefined ? { year: { eq: year } } : {}),
  };
  return appSyncList<ActivityAutofillAudit>({
    token,
    resultKey: 'listActivityAutofillAudits',
    variables: { filter: Object.keys(filter).length ? filter : undefined },
    query: `query AdminAiContextListActivityAutofillAudits($filter: ModelActivityAutofillAuditFilterInput, $nextToken: String) {
      listActivityAutofillAudits(filter: $filter, limit: 100, nextToken: $nextToken) {
        items { ${ACTIVITY_AUTOFILL_AUDIT_FIELDS} }
        nextToken
      }
    }`,
    maxItems: 300,
  });
}

export async function GET(request: Request) {
  try {
    const auth = assertAdminContextRequest(request);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const expertId = url.searchParams.get('expertId') || undefined;
    const selectedCategory = url.searchParams.get('category') || undefined;
    const saCode = url.searchParams.get('saCode') || undefined;
    const requestedProjectCode = url.searchParams.get('projectCode') || undefined;
    const monthParam = url.searchParams.get('month');
    const yearParam = url.searchParams.get('year');
    const month = monthParam !== null && monthParam !== '' ? Number(monthParam) : undefined;
    const year = yearParam !== null && yearParam !== '' ? Number(yearParam) : undefined;

    const experts = await listExperts(auth.token);
    const expert = expertId ? experts.find((item) => item.id === expertId) : undefined;
    const category = normalizePeoCategory(selectedCategory || expert?.category) || selectedCategory || expert?.category || undefined;
    const projectCode = requestedProjectCode || expert?.projectCode || undefined;

    const [
      expertFisaPostChunks,
      approvedReportsByExpert,
      categoryFisaPostChunks,
      categoryReferenceChunks,
      categoryApprovedReports,
      projectSourceChunks,
      subactivitySourceChunks,
      activeRuleset,
      catalogRows,
      recentAudits,
    ] = await Promise.all([
      expert?.id
        ? listKnowledgeChunksByExpertId(expert.id, { sourceType: { eq: 'fisa_post' } }, { authToken: auth.token, limit: 20, maxItems: 80 })
        : Promise.resolve([]),
      expert?.id
        ? listKnowledgeChunksByExpertId(expert.id, { sourceType: { eq: 'raportare_aprobata_oir' } }, { authToken: auth.token, limit: 20, maxItems: 80 })
        : Promise.resolve([]),
      category
        ? listKnowledgeChunksByCategoryAndSourceType(category, 'fisa_post', undefined, { authToken: auth.token, limit: 20, maxItems: 80 })
        : Promise.resolve([]),
      category
        ? Promise.all(['cerere_finantare', 'manual_beneficiar', 'descriere_activitati'].map((sourceType) => (
            listKnowledgeChunksByCategoryAndSourceType(category, sourceType, undefined, { authToken: auth.token, limit: 20, maxItems: 80 })
          ))).then((groups) => groups.flat())
        : Promise.resolve([]),
      category
        ? listKnowledgeChunksByCategoryAndSourceType(category, 'raportare_aprobata_oir', undefined, { authToken: auth.token, limit: 20, maxItems: 120 })
        : Promise.resolve([]),
      projectCode
        ? listKnowledgeChunks({ status: { eq: 'active' }, projectCode: { eq: projectCode }, or: [{ sourceType: { eq: 'cerere_finantare' } }, { sourceType: { eq: 'manual_beneficiar' } }] }, { authToken: auth.token, limit: 20, maxItems: 120 })
        : Promise.resolve([]),
      projectCode && saCode
        ? listKnowledgeChunks({ status: { eq: 'active' }, projectCode: { eq: projectCode }, saCode: { eq: saCode }, or: [{ sourceType: { eq: 'scop_sa' } }, { sourceType: { eq: 'descriere_activitati' } }] }, { authToken: auth.token, limit: 20, maxItems: 120 })
        : Promise.resolve([]),
      getActiveAiEligibilityRuleset({ authToken: auth.token, timeoutMs: 2500 }).catch(() => null),
      appSyncList<{ id: string }>({ token: auth.token, resultKey: 'listActivityCatalogs', query: `query AdminAiContextListCatalog($nextToken: String) { listActivityCatalogs(limit: 200, nextToken: $nextToken) { items { id } nextToken } }`, maxItems: 500 }).catch(() => []),
      listActivityAutofillAudits(auth.token, month, year).catch(() => []),
    ]);

    const visibleAudits = recentAudits
      .filter((audit) => !expert?.id || audit.expertId === expert.id)
      .filter((audit) => !category || normalizePeoCategory(audit.category) === normalizePeoCategory(category))
      .slice(0, 12);
    const warnings = visibleAudits.flatMap((audit) => {
      try {
        const parsed = audit.warningsJson ? JSON.parse(audit.warningsJson) : [];
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
      } catch {
        return [];
      }
    });
    const uniqueWarnings = Array.from(new Set(warnings)).slice(0, 8);

    const jobDescriptionOk = Boolean(expert?.jobDescriptionText?.trim()) || expertFisaPostChunks.length > 0;
    const aiInstructionsOk = Boolean(expert?.aiReportingInstructions?.trim());
    const approvedCount = approvedReportsByExpert.length + categoryApprovedReports.length;
    const referenceCount = categoryReferenceChunks.length;
    const fisaPostCount = expertFisaPostChunks.length + categoryFisaPostChunks.length + (expert?.jobDescriptionText?.trim() ? 1 : 0);

    return NextResponse.json({
      filters: { expertId, category, saCode, projectCode, month, year },
      expert: expert ? {
        id: expert.id,
        name: expert.name,
        role: expert.role,
        category: expert.category,
        positionInProject: expert.positionInProject,
        projectCode: expert.projectCode,
        hasJobDescriptionText: Boolean(expert.jobDescriptionText?.trim()),
        hasAiReportingInstructions: Boolean(expert.aiReportingInstructions?.trim()),
      } : null,
      cards: [
        {
          id: 'job-description',
          title: 'Fisa post / rol expert',
          status: jobDescriptionOk ? 'ok' : 'missing',
          count: fisaPostCount,
          detail: jobDescriptionOk
            ? sourceSummary(fisaPostCount, 'pentru fisa post/rol')
            : 'Nu exista fisa post pe expert si nici sursa RAG fisa_post relevanta.',
          recommendedAction: jobDescriptionOk ? null : 'Completeaza fisa postului pentru expert sau indexeaza o sursa fisa_post.',
        },
        {
          id: 'ai-instructions',
          title: 'Instructiuni AI expert',
          status: aiInstructionsOk ? 'ok' : 'warning',
          count: aiInstructionsOk ? 1 : 0,
          detail: aiInstructionsOk ? 'Expertul are instructiuni AI PM/Admin.' : 'Nu exista instructiuni AI dedicate pentru expert.',
          recommendedAction: aiInstructionsOk ? null : 'Adauga instructiuni AI pentru stil si responsabilitati specifice.',
        },
        {
          id: 'sa-purpose',
          title: 'Scop SA / cerere finantare',
          status: saCode ? statusFromCount(subactivitySourceChunks.length) : 'not_applicable',
          count: subactivitySourceChunks.length,
          detail: saCode ? sourceSummary(subactivitySourceChunks.length, `pentru ${saCode}`) : 'Alege un cod SA pentru verificare.',
          recommendedAction: saCode && subactivitySourceChunks.length === 0 ? 'Indexeaza scopul SA sau descrierea activitatilor pentru proiectul si SA-ul selectate.' : null,
        },
        {
          id: 'project-sources',
          title: 'Surse oficiale proiect',
          status: projectCode ? statusFromCount(projectSourceChunks.length) : 'missing',
          count: projectSourceChunks.length,
          detail: projectCode ? sourceSummary(projectSourceChunks.length, `pentru proiectul ${projectCode}`) : 'Expertul selectat nu are cod de proiect.',
          recommendedAction: projectCode && projectSourceChunks.length === 0 ? 'Indexeaza Cererea de finantare sau Manualul beneficiarului la nivel de proiect.' : null,
        },
        {
          id: 'eligibility-rules',
          title: 'Ruleset eligibilitate',
          status: activeRuleset ? 'ok' : 'warning',
          count: Number(Boolean(activeRuleset)),
          detail: activeRuleset ? 'Exista un ruleset activ publicat.' : 'Nu exista un ruleset activ publicat.',
          recommendedAction: activeRuleset ? null : 'Publica un ruleset activ in Catalog eligibilitate din modulul PM.',
        },
        {
          id: 'activity-catalog',
          title: 'Catalog activitati backend',
          status: catalogRows.length > 0 ? 'ok' : 'warning',
          count: catalogRows.length,
          detail: catalogRows.length > 0 ? `${catalogRows.length} activitati disponibile in catalogul backend.` : 'Catalogul backend nu este disponibil.',
          recommendedAction: catalogRows.length > 0 ? null : 'Verifica accesul si datele catalogului de activitati in modulul PM.',
        },
        {
          id: 'category-rag',
          title: 'RAG categorie',
          status: category ? statusFromCount(referenceCount) : 'not_applicable',
          count: referenceCount,
          detail: category ? sourceSummary(referenceCount, `de referinta pentru categoria ${category}`) : 'Alege o categorie pentru verificare.',
          recommendedAction: category && referenceCount === 0 ? 'Indexeaza manuale, descrieri activitati sau cerere de finantare pe categorie.' : null,
        },
        {
          id: 'approved-reports',
          title: 'Raportari aprobate',
          status: statusFromCount(approvedCount, 3),
          count: approvedCount,
          detail: approvedCount >= 3
            ? sourceSummary(approvedCount, 'de raportare aprobata')
            : `${approvedCount} fragmente aprobate; contextul istoric poate fi insuficient pentru stil.`,
          recommendedAction: approvedCount >= 3 ? null : 'Indexeaza raportari aprobate OIR pentru expert/categorie/SA.',
        },
        {
          id: 'recent-warnings',
          title: 'Avertismente AI recente',
          status: uniqueWarnings.length === 0 ? 'ok' : 'warning',
          count: uniqueWarnings.length,
          detail: uniqueWarnings.length === 0 ? 'Nu exista avertismente recurente in auditul recent.' : 'Exista avertismente recente din autocompletari.',
          recommendedAction: uniqueWarnings.length > 0 ? 'Revizuieste warning-urile si completeaza sursele lipsa.' : null,
        },
      ],
      warnings: uniqueWarnings,
      rules: { activeRuleset: Boolean(activeRuleset), catalogCount: catalogRows.length },
      recentAudits: visibleAudits.map((audit) => ({
        id: audit.id,
        expertName: audit.expertName,
        activityName: audit.suggestedActivityName,
        confidence: audit.confidence,
        applied: audit.applied,
        createdAt: audit.createdAt,
      })),
    });
  } catch (error) {
    console.error('[admin-ai-context-health] Failed to build context health.', error);
    return NextResponse.json({ error: 'Sanatatea contextului AI nu a putut fi citita.' }, { status: 500 });
  }
}
