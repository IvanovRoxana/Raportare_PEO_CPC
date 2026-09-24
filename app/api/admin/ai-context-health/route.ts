import { NextResponse } from 'next/server';
import outputs from '@/amplify_outputs.json';
import { assertKnowledgeRequest, knowledgeAuthErrorResponse } from '@/lib/rag/knowledge-auth';
import { normalizePeoCategory } from '@/lib/peo-category';
import { getActiveAiEligibilityRuleset, getScheduledAiEligibilityRuleset } from '@/lib/ai-eligibility-ruleset-runtime';
import { selectHealthChunks, type HealthChunk } from '@/lib/rag/health-chunks';
import type { ActivityAutofillAudit, Expert } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HealthStatus = 'ok' | 'warning' | 'missing' | 'not_applicable';
type SubactivityHealth = { saCode: string; count: number; status: HealthStatus };
type ProjectSourceIndexState = 'available' | 'staged' | 'missing';

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
  signal,
}: {
  token: string;
  query: string;
  resultKey: string;
  variables?: Record<string, unknown>;
  maxItems?: number;
  signal?: AbortSignal;
}) {
  if (!appSyncEndpoint) throw new Error('Endpointul AppSync nu este configurat.');

  const items: T[] = [];
  let nextToken: string | null | undefined;

  do {
    const response = await fetch(appSyncEndpoint, {
      signal: signal ?? AbortSignal.timeout(10000),
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
    if (!result || !Array.isArray(result.items)) throw new Error('AppSync nu a returnat lista solicitata.');
    items.push(...result.items.filter((item): item is NonNullable<T> => item != null));
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
    const auth = { token: await assertKnowledgeRequest(request) };

    const url = new URL(request.url);
    const expertId = url.searchParams.get('expertId') || undefined;
    const expertEmail = url.searchParams.get('expertEmail')?.trim().toLowerCase() || undefined;
    const selectedCategory = url.searchParams.get('category') || undefined;
    const saCode = url.searchParams.get('saCode') || undefined;
    const requestedProjectCode = url.searchParams.get('projectCode') || undefined;
    const monthParam = url.searchParams.get('month');
    const yearParam = url.searchParams.get('year');
    const month = monthParam !== null && monthParam !== '' ? Number(monthParam) : undefined;
    const year = yearParam !== null && yearParam !== '' ? Number(yearParam) : undefined;

    const experts = await listExperts(auth.token);
    const expert = expertId
      ? experts.find((item) => item.id === expertId)
        || (expertEmail ? experts.find((item) => item.email?.trim().toLowerCase() === expertEmail) : undefined)
      : undefined;
    const category = normalizePeoCategory(selectedCategory || expert?.category) || selectedCategory || expert?.category || undefined;
    const projectCode = requestedProjectCode || expert?.projectCode || undefined;
    const availableSaCodes = Array.from(new Set(experts.flatMap((item) => item.saCodes || []))).sort();
    // The health panel needs the current scope, not every historical RAG row.
    // Keeping this query bounded prevents a growing shared library from timing out
    // the panel and hiding otherwise valid project sources.
    const scopeFilters = [
      ...(projectCode ? [{ projectCode: { eq: projectCode } }] : []),
      ...(expert?.id ? [{ expertId: { eq: expert.id } }] : []),
      ...(category ? [{ category: { eq: category } }] : []),
    ];
    const chunkFilter = scopeFilters.length
      ? { and: [{ status: { eq: 'active' } }, { or: scopeFilters }] }
      : { status: { eq: 'active' } };
    const documentFilter = scopeFilters.length ? { or: scopeFilters } : undefined;

    const [candidateChunks, activeRuleset, scheduledRuleset, catalogRows, recentAudits, generationDocuments] = await Promise.all([
      appSyncList<HealthChunk>({
        token: auth.token,
        resultKey: 'listKnowledgeChunks',
        variables: { filter: chunkFilter },
        query: `query AdminHealthChunkMetadata($filter: ModelKnowledgeChunkFilterInput, $nextToken: String) {
          listKnowledgeChunks(limit: 300, nextToken: $nextToken, filter: $filter) {
            items { id documentId sourceType category expertId expertName roleId projectCode saCode status indexGenerationId metadataJson }
            nextToken
          }
        }`,
        maxItems: 600,
        signal: AbortSignal.timeout(15000),
      }),
      getActiveAiEligibilityRuleset({ projectCode: projectCode || '302141' }).catch(() => null),
      getScheduledAiEligibilityRuleset({ projectCode: projectCode || '302141' }).catch(() => null),
      appSyncList<{ id: string }>({ token: auth.token, resultKey: 'listActivityCatalogs', query: `query AdminAiContextListCatalog($nextToken: String) { listActivityCatalogs(limit: 200, nextToken: $nextToken) { items { id } nextToken } }`, maxItems: 500 }).catch(() => []),
      listActivityAutofillAudits(auth.token, month, year).catch(() => []),
      appSyncList<{
        id: string; status?: string; sourceType?: string; projectCode?: string;
        publishedGeneration?: string; indexedAt?: string;
      }>({ token: auth.token, resultKey: 'listKnowledgeDocuments',
        variables: { filter: documentFilter },
        query: `query HealthGenerationDocuments($filter: ModelKnowledgeDocumentFilterInput, $nextToken: String) { listKnowledgeDocuments(filter: $filter, limit: 300, nextToken: $nextToken) { items { id status sourceType projectCode publishedGeneration indexedAt } nextToken } }`, maxItems: 600 }),
    ]);
    const documentsById = new Map(generationDocuments.map((document) => [document.id, document]));
    const allChunks = candidateChunks.filter((chunk) => {
      const parent = chunk.documentId ? documentsById.get(chunk.documentId) : undefined;
      return parent?.status === 'active' && (parent.publishedGeneration ? parent.publishedGeneration === chunk.indexGenerationId : !chunk.indexGenerationId);
    });
    const {
      expertFisaPostChunks, approvedReportsByExpert, categoryFisaPostChunks,
      categoryReferenceChunks, categoryApprovedReports, projectSourceChunks, subactivitySourceChunks,
    } = selectHealthChunks(allChunks, { expertId: expert?.id, expertName: expert?.name, positionInProject: expert?.positionInProject, category, projectCode, saCode });

    const subactivities: SubactivityHealth[] = availableSaCodes.map((code) => {
      if (!projectCode) return { saCode: code, count: 0, status: 'not_applicable' };
      const count = selectHealthChunks(allChunks, { projectCode, saCode: code }).subactivitySourceChunks.length;
      return { saCode: code, count, status: statusFromCount(count) };
    });

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
    const projectSources = (['cerere_finantare', 'manual_beneficiar'] as const).map((sourceType) => {
      const count = projectSourceChunks.filter((chunk) => chunk.sourceType === sourceType).length;
      const sourceDocuments = generationDocuments.filter((document) => document.projectCode === projectCode && document.sourceType === sourceType);
      const sourceDocumentIds = new Set(sourceDocuments.map((document) => document.id));
      const stagedCount = candidateChunks.filter((chunk) => chunk.documentId !== undefined && sourceDocumentIds.has(chunk.documentId) && chunk.sourceType === sourceType).length;
      const indexState: ProjectSourceIndexState = count > 0 ? 'available' : sourceDocuments.length > 0 ? 'staged' : 'missing';
      const latestIndexedAt = sourceDocuments.map((document) => document.indexedAt).filter((value): value is string => Boolean(value)).sort().at(-1);
      const detail = indexState === 'available'
        ? `${count} fragmente indexate și disponibile agentului.`
        : indexState === 'staged'
          ? `S-au găsit ${stagedCount} fragmente, dar generația nu a fost publicată; agentul nu o consultă.`
          : 'Nu există o indexare disponibilă agentului.';
      return { sourceType, count, stagedCount, status: indexState === 'available' ? 'ok' : indexState === 'staged' ? 'warning' : 'missing', indexState, detail, indexedAt: latestIndexedAt };
    });

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
          detail: activeRuleset
            ? 'Exista un ruleset activ publicat.'
            : scheduledRuleset
              ? `Există un ruleset publicat, programat să devină activ la ${new Date(scheduledRuleset.rules.validFrom).toLocaleString('ro-RO')}.`
              : 'Nu exista un ruleset activ publicat.',
          recommendedAction: activeRuleset || scheduledRuleset ? null : 'Publica un ruleset activ in Catalog eligibilitate din modulul PM.',
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
      projectSources,
      warnings: uniqueWarnings,
      rules: { activeRuleset: Boolean(activeRuleset), catalogCount: catalogRows.length },
      subactivities,
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
    const denied = knowledgeAuthErrorResponse(error);
    if (denied) return denied;
    console.error('[admin-ai-context-health] Failed to build context health.', error);
    return NextResponse.json({ error: 'Sanatatea contextului AI nu a putut fi citita.' }, { status: 500 });
  }
}
