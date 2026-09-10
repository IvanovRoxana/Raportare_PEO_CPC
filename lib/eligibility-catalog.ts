import { mergeActivityCatalogs, normalizeActivityCatalogSaCode } from './activity-catalog-merge.ts';
import { normalizePeoCategory } from './peo-category.ts';
import type { ActivityCatalog, Expert } from './types.ts';

export type EligibilityCatalogExpert = Pick<Expert,
  'id' | 'name' | 'category' | 'saCodes' | 'projectCode' | 'isActive'
  | 'jobDescriptionText' | 'positionInProject' | 'aiReportingInstructions'
>;

export type EligibilityCatalogRequest = {
  expertId: string;
  expertCategory?: string;
  currentSaCode: string;
  allowedCandidateIds?: string[];
};

export type EligibilityCatalogResult = {
  expert: EligibilityCatalogExpert;
  candidates: ActivityCatalog[];
  source: 'backend' | 'reference_fallback' | 'unavailable';
  warnings: string[];
};

export type EligibilityCatalogOptions = { authToken?: string };

export function scopeEligibilityCatalog(
  catalog: ActivityCatalog[],
  expert: EligibilityCatalogExpert,
  allowedCandidateIds?: string[],
) {
  const category = normalizePeoCategory(expert.category);
  const allowedSaCodes = new Set((expert.saCodes ?? []).map(normalizeActivityCatalogSaCode).filter(Boolean));
  const allowedIds = allowedCandidateIds === undefined ? undefined : new Set(allowedCandidateIds);
  if (!category || expert.isActive === false || allowedSaCodes.size === 0) return [];

  return catalog.filter((item) => (
    item.isActive !== false
    && normalizePeoCategory(item.category) === category
    && allowedSaCodes.has(normalizeActivityCatalogSaCode(item.saCode))
    && (!allowedIds || allowedIds.has(item.id))
  )).map((item) => ({
    ...item,
    category,
    saCode: normalizeActivityCatalogSaCode(item.saCode),
    isActive: true,
  }));
}

type CatalogDependencies = {
  endpoint: string;
  referenceCatalog: ActivityCatalog[];
  referenceExperts: EligibilityCatalogExpert[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxPages?: number;
};

class CatalogAuthenticationError extends Error {}

const EXPERT_QUERY = `query EligibilityCatalogExpert($id: ID!) {
  getExpert(id: $id) {
    id name category saCodes projectCode isActive
    jobDescriptionText positionInProject aiReportingInstructions
  }
}`;

const CATALOG_QUERY = `query EligibilityActivityCatalog($nextToken: String) {
  listActivityCatalogs(limit: 200, nextToken: $nextToken) {
    items {
      id category saCode gdprTemplateCode serviceCategory isEvent activityNumber activityName
      isActive requiresSameDayForSharedDeliverable description objectives serviceComponent
      beneficiaries expectedResults deliverables indicators createdAt
    }
    nextToken
  }
}`;

type GraphqlError = { errorType?: string; extensions?: { code?: string } };
type GraphqlEnvelope<T> = { data?: T; errors?: GraphqlError[] };
type CatalogPage = {
  listActivityCatalogs?: { items?: Array<ActivityCatalog | null>; nextToken?: string | null };
};

// The factory keeps network access explicit and lets tests exercise real pagination with a fake fetch.
export function createEligibilityCatalogLoader(dependencies: CatalogDependencies) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Math.min(Math.max(dependencies.timeoutMs ?? 12_000, 1), 20_000);
  const maxPages = Math.min(Math.max(dependencies.maxPages ?? 10, 1), 20);

  return async function loadEligibilityCatalog(
    request: EligibilityCatalogRequest,
    options: EligibilityCatalogOptions,
  ): Promise<EligibilityCatalogResult> {
    const authToken = options.authToken?.trim();
    if (!authToken) throw new CatalogAuthenticationError('Lipseste autentificarea Cognito pentru verificarea catalogului de activitati.');
    if (!request.expertId.trim()) throw new Error('Expertul trebuie selectat pentru verificarea eligibilitatii.');
    const deadline = Date.now() + timeoutMs;

    async function query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
      if (!dependencies.endpoint) throw new Error('Endpointul catalogului nu este configurat.');
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error('Citirea catalogului a depasit timpul disponibil.');
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetchImpl(dependencies.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authToken! },
              body: JSON.stringify({ query: document, variables }),
              signal: controller.signal,
              cache: 'no-store',
            });
            if (response.status === 401 || response.status === 403) {
              throw new CatalogAuthenticationError('Sesiunea Cognito nu permite citirea catalogului. Autentifica-te din nou.');
            }
            if (!response.ok) throw new Error('Catalogul din baza de date nu este disponibil.');
            const payload = await response.json() as GraphqlEnvelope<T>;
            if (payload.errors?.some((error) => /unauthori[sz]ed|forbidden|accessdenied/i.test(
              `${error.errorType ?? ''} ${error.extensions?.code ?? ''}`,
            ))) {
              throw new CatalogAuthenticationError('Sesiunea Cognito nu permite citirea catalogului. Autentifica-te din nou.');
            }
            if (payload.errors?.length || !payload.data) throw new Error('Catalogul din baza de date nu a putut fi citit complet.');
            return payload.data;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('Citirea catalogului a depasit timpul disponibil.'));
            }, remainingMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    async function listCatalog() {
      const items: ActivityCatalog[] = [];
      const seenTokens = new Set<string>();
      let nextToken: string | null = null;
      for (let page = 0; page < maxPages; page += 1) {
        const data: CatalogPage = await query<CatalogPage>(CATALOG_QUERY, { nextToken });
        const result: CatalogPage['listActivityCatalogs'] = data.listActivityCatalogs;
        if (!result || !Array.isArray(result.items)) throw new Error('Raspunsul catalogului este incomplet.');
        items.push(...result.items.filter((item): item is ActivityCatalog => item !== null));
        nextToken = result.nextToken || null;
        if (!nextToken) return items;
        if (seenTokens.has(nextToken)) throw new Error('Catalogul nu a putut fi parcurs complet.');
        seenTokens.add(nextToken);
      }
      throw new Error('Catalogul depaseste limita de paginare pentru aceasta verificare.');
    }

    const [expertResult, catalogResult] = await Promise.allSettled([
      query<{ getExpert: EligibilityCatalogExpert | null }>(EXPERT_QUERY, { id: request.expertId }),
      listCatalog(),
    ]);
    for (const result of [expertResult, catalogResult]) {
      if (result.status === 'rejected' && result.reason instanceof CatalogAuthenticationError) throw result.reason;
    }

    const warnings: string[] = [];
    const backendExpert = expertResult.status === 'fulfilled' ? expertResult.value.getExpert : null;
    if (backendExpert && backendExpert.id !== request.expertId) throw new Error('Profilul returnat nu corespunde expertului selectat.');
    const referenceExpert = dependencies.referenceExperts.find((expert) => expert.id === request.expertId);
    const profile = backendExpert ?? referenceExpert;
    if (!profile) throw new Error('Profilul expertului nu a putut fi identificat in baza de date sau in datele de referinta.');
    if (!backendExpert) warnings.push('Profilul expertului provine din datele de referinta; configuratia curenta nu a putut fi confirmata in baza de date.');
    if (catalogResult.status === 'rejected') warnings.push('Catalogul curent nu a putut fi citit complet. Datele de referinta necesita confirmare inainte de aprobarea eligibilitatii.');

    const expert: EligibilityCatalogExpert = {
      id: profile.id,
      name: profile.name,
      category: normalizePeoCategory(profile.category),
      saCodes: [...new Set((profile.saCodes ?? []).map(normalizeActivityCatalogSaCode).filter(Boolean))],
      projectCode: profile.projectCode,
      isActive: profile.isActive,
      jobDescriptionText: profile.jobDescriptionText,
      positionInProject: profile.positionInProject,
      aiReportingInstructions: profile.aiReportingInstructions,
    };
    if (expert.isActive === false) throw new Error('Expertul selectat este inactiv.');
    if (!expert.category || !expert.saCodes?.length) throw new Error('Profilul expertului nu are categoria si subactivitatile configurate.');
    if (!expert.saCodes.includes(normalizeActivityCatalogSaCode(request.currentSaCode))) {
      throw new Error('Subactivitatea selectata nu este atribuita expertului in profilul autorizat.');
    }
    if (request.expertCategory && normalizePeoCategory(request.expertCategory) !== expert.category) {
      warnings.push('Categoria din formular difera de profilul expertului; a fost folosita categoria din profilul autorizat.');
    }

    const backendCatalog = catalogResult.status === 'fulfilled' ? catalogResult.value : [];
    // A moved/renamed backend row must not resurrect its old reference copy under another merge key.
    const backendIds = new Set(backendCatalog.map((item) => item.id));
    const catalog = mergeActivityCatalogs(
      dependencies.referenceCatalog.filter((item) => !backendIds.has(item.id)),
      backendCatalog,
    );
    const candidates = scopeEligibilityCatalog(catalog, expert, request.allowedCandidateIds);
    if (candidates.length === 0) warnings.push('Nu exista activitati active in catalog pentru categoria, subactivitatile si selectia curenta.');

    return {
      expert,
      candidates,
      source: backendExpert && catalogResult.status === 'fulfilled'
        ? 'backend'
        : candidates.length > 0 ? 'reference_fallback' : 'unavailable',
      warnings,
    };
  };
}
