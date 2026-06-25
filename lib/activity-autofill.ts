import { z } from 'zod';

const MAX_DELIVERABLE_TEXT_CHARS = 6000;
const MAX_PROMPT_DELIVERABLES = 8;
const DEFAULT_MAX_CATALOG_CANDIDATES_FOR_PROMPT = 10;

export const activityAutofillDeliverableSchema = z.object({
  id: z.string().optional(),
  fileName: z.string().optional(),
  documentTitle: z.string().optional(),
  deliverableType: z.string().optional(),
  stadiu: z.string().optional(),
  eligibilityStatus: z.string().optional(),
  eligibilitySummary: z.string().optional(),
  extractedText: z.string().min(1),
  textScope: z.string().optional(),
});

export const activityAutofillCatalogCandidateSchema = z.object({
  id: z.string(),
  category: z.string().optional(),
  saCode: z.string().min(1),
  serviceCategory: z.string().optional(),
  activityNumber: z.number().optional(),
  activityName: z.string().min(1),
  description: z.string().optional(),
  objectives: z.string().optional(),
  serviceComponent: z.string().optional(),
  beneficiaries: z.string().optional(),
  expectedResults: z.string().optional(),
  deliverables: z.string().optional(),
  indicators: z.string().optional(),
});

export const activityAutofillRequestSchema = z.object({
  deliverables: z.array(activityAutofillDeliverableSchema).min(1),
  catalogCandidates: z.array(activityAutofillCatalogCandidateSchema).min(1),
  expertId: z.string().optional(),
  expertName: z.string().optional(),
  expertRole: z.string().optional(),
  category: z.string().optional(),
  projectCode: z.string().optional(),
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  selectedDates: z.array(z.string()).optional(),
  knowledgeContext: z.string().optional(),
  internalRagContext: z.object({
    promptContext: z.string().optional(),
    retrievalJson: z.string().optional(),
    candidateJson: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
});

export const activityAutofillSuggestionSchema = z.object({
  recommended: z.object({
    saCode: z.string().min(1),
    activityName: z.string().min(1),
    description: z.string().min(20),
  }),
  confidence: z.enum(['high', 'medium', 'low']),
  fieldInstructions: z.object({
    saCode: z.string().min(1),
    activityName: z.string().min(1),
    description: z.string().min(1),
  }),
  evidence: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ActivityAutofillDeliverable = z.infer<typeof activityAutofillDeliverableSchema>;
export type ActivityAutofillCatalogCandidate = z.infer<typeof activityAutofillCatalogCandidateSchema>;
export type ActivityAutofillRequest = z.infer<typeof activityAutofillRequestSchema>;
export type ActivityAutofillRagSource = {
  rank: number;
  score: number;
  sourceType?: string;
  expertName?: string;
  month?: number;
  year?: number;
  saCode?: string;
  activityName?: string;
};

export type ActivityAutofillRagStatus = {
  enabled: boolean;
  used: boolean;
  skippedReason?: string;
  chunks: number;
  warnings: string[];
  sources: ActivityAutofillRagSource[];
};

export type ActivityAutofillSuggestion = z.infer<typeof activityAutofillSuggestionSchema> & {
  modelAuditId?: string;
  rag?: ActivityAutofillRagStatus;
};

export type ActivityAutofillDeliverableDraft = {
  id?: string;
  fileName?: string;
  documentTitle?: string | null;
  deliverableType?: string;
  stadiu?: string;
  docText?: string | null;
  firstPageText?: string | null;
  eligibilityStatus?: string;
  eligibilitySummary?: string;
};

function trimText(value: unknown, maxChars = MAX_DELIVERABLE_TEXT_CHARS) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function normalizeForSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a', 'ai', 'am', 'ale', 'al', 'alei', 'am', 'are', 'asupra', 'au', 'ca', 'catre', 'cu', 'de', 'din',
  'dupa', 'este', 'fost', 'in', 'intr', 'la', 'le', 'lor', 'mai', 'membri', 'membrilor', 'o', 'pe',
  'pentru', 'prin', 'privind', 'sau', 'se', 'si', 'sunt', 'un', 'unei', 'unor',
]);

const PA_SA_GUIDE: Record<string, { label: string; keywords: string[] }> = {
  'SA3.2': {
    label: 'infrastructura si functionare a structurilor dialogului social',
    keywords: ['infrastructura', 'regional', 'hub', 'business hub', 'harta interactiva', 'baza date', 'site', 'operational', 'flux', 'mecanism', 'atelier local'],
  },
  'SA3.3': {
    label: 'campanii de recrutare de noi membri',
    keywords: ['recrutare', 'afiliere', 'prospectare', 'prospect', 'membru nou', 'membri noi', 'onboarding', 'avantaje afiliere'],
  },
  'SA3.4': {
    label: 'activitati si servicii suport / informare pentru membri',
    keywords: ['newsletter', 'informare', 'monitorizare legislativa', 'document de pozitie', 'analiza legislativa', 'consultare publica', 'grup de lucru', 'task force', 'tf', 'speaking points', 'mesaje strategice', 'chestionar', 'feedback', 'membri cpc'],
  },
  'SA3.5': {
    label: 'schimb de bune practici la nivel european',
    keywords: ['european', 'ue', 'uniunea europeana', 'businesseurope', 'ioe', 'biac', 'comisia europeana', 'parlamentul european', 'vizita de studiu', 'schimb de experienta', 'bune practici'],
  },
};

function tokenize(value: unknown) {
  return normalizeForSearch(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function getCandidateSearchText(candidate: ActivityAutofillCatalogCandidate) {
  return [
    candidate.saCode,
    candidate.serviceCategory,
    candidate.activityName,
    candidate.description,
    candidate.objectives,
    candidate.serviceComponent,
    candidate.beneficiaries,
    candidate.expectedResults,
    candidate.deliverables,
    candidate.indicators,
  ].filter(Boolean).join(' ');
}

function getRequestSearchText(input: ActivityAutofillRequest) {
  return [
    input.expertRole,
    input.category,
    input.knowledgeContext,
    input.internalRagContext?.promptContext,
    ...(input.deliverables ?? []).flatMap((deliverable) => [
      deliverable.fileName,
      deliverable.documentTitle,
      deliverable.deliverableType,
      deliverable.stadiu,
      deliverable.eligibilitySummary,
      deliverable.extractedText,
    ]),
  ].filter(Boolean).join(' ');
}

function scoreCatalogCandidate(candidate: ActivityAutofillCatalogCandidate, requestText: string, requestTokens: Set<string>) {
  const candidateName = normalizeForSearch(candidate.activityName);
  const candidateText = normalizeForSearch(getCandidateSearchText(candidate));
  const candidateNameTokens = tokenize(candidate.activityName);
  const candidateAllTokens = tokenize(candidateText);
  const guide = PA_SA_GUIDE[candidate.saCode];
  let score = 0;

  if (candidateName && requestText.includes(candidateName)) score += 120;
  if (candidate.saCode && requestText.includes(normalizeForSearch(candidate.saCode))) score += 25;

  candidateNameTokens.forEach((token) => {
    if (requestTokens.has(token)) score += 10;
  });
  candidateAllTokens.forEach((token) => {
    if (requestTokens.has(token)) score += 2;
  });

  if (guide) {
    guide.keywords.forEach((keyword) => {
      const normalizedKeyword = normalizeForSearch(keyword);
      if (requestText.includes(normalizedKeyword)) score += 18;
    });
  }

  if (candidate.activityName && requestText.includes(normalizeForSearch(`"activityName":"${candidate.activityName}"`))) {
    score += 80;
  }
  score += countOccurrences(requestText, candidateName) * 18;

  return score;
}

export function buildActivityAutofillCatalogShortlist(
  input: ActivityAutofillRequest,
  maxCandidates = DEFAULT_MAX_CATALOG_CANDIDATES_FOR_PROMPT,
) {
  const normalized = normalizeActivityAutofillRequest(input);
  if (normalized.catalogCandidates.length <= maxCandidates) return normalized.catalogCandidates;

  const requestText = normalizeForSearch(getRequestSearchText(normalized));
  const requestTokens = new Set(tokenize(requestText));
  const scored = normalized.catalogCandidates
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      score: scoreCatalogCandidate(candidate, requestText, requestTokens),
    }))
    .sort((a, b) => (b.score - a.score) || (a.originalIndex - b.originalIndex));

  const selected = scored.slice(0, Math.max(1, maxCandidates));
  const selectedKeys = new Set(selected.map((item) => `${item.candidate.saCode}::${item.candidate.activityName}`));

  // Keep at least one candidate from each available SA so classification can still move between SA3.2/3.3/3.4/3.5.
  for (const item of scored) {
    if (selected.length >= maxCandidates + 4) break;
    const hasSa = selected.some((selectedItem) => selectedItem.candidate.saCode === item.candidate.saCode);
    const key = `${item.candidate.saCode}::${item.candidate.activityName}`;
    if (!hasSa && !selectedKeys.has(key)) {
      selected.push(item);
      selectedKeys.add(key);
    }
  }

  return selected
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => item.candidate);
}

export function buildActivityAutofillDeliverablesPayload(
  deliverables: ActivityAutofillDeliverableDraft[],
): ActivityAutofillDeliverable[] {
  return deliverables
    .map((deliverable): ActivityAutofillDeliverable | null => {
      const docText = trimText(deliverable.docText);
      const firstPageText = trimText(deliverable.firstPageText);
      const extractedText = docText || firstPageText;

      if (!extractedText) return null;

      const payload: ActivityAutofillDeliverable = {
        extractedText,
        textScope: docText && docText !== firstPageText
          ? 'Text extras disponibil din document'
          : 'Prima pagina / inceputul documentului',
      };

      if (deliverable.id) payload.id = deliverable.id;
      if (deliverable.fileName) payload.fileName = deliverable.fileName;
      if (deliverable.documentTitle) payload.documentTitle = deliverable.documentTitle;
      if (deliverable.deliverableType) payload.deliverableType = deliverable.deliverableType;
      if (deliverable.stadiu) payload.stadiu = deliverable.stadiu;
      if (deliverable.eligibilityStatus) payload.eligibilityStatus = deliverable.eligibilityStatus;
      if (deliverable.eligibilitySummary) payload.eligibilitySummary = deliverable.eligibilitySummary;

      return payload;
    })
    .filter((item): item is ActivityAutofillDeliverable => Boolean(item));
}

export function normalizeActivityAutofillRequest(input: ActivityAutofillRequest): ActivityAutofillRequest {
  return {
    ...input,
    deliverables: input.deliverables
      .map((deliverable) => ({
        ...deliverable,
        extractedText: trimText(deliverable.extractedText),
      }))
      .filter((deliverable) => deliverable.extractedText.length > 0)
      .slice(0, MAX_PROMPT_DELIVERABLES),
    catalogCandidates: input.catalogCandidates.map((candidate) => ({
      ...candidate,
      description: trimText(candidate.description, 1200) || undefined,
      objectives: trimText(candidate.objectives, 1200) || undefined,
      serviceComponent: trimText(candidate.serviceComponent, 1200) || undefined,
      beneficiaries: trimText(candidate.beneficiaries, 800) || undefined,
      expectedResults: trimText(candidate.expectedResults, 1200) || undefined,
      deliverables: trimText(candidate.deliverables, 1200) || undefined,
      indicators: trimText(candidate.indicators, 800) || undefined,
    })),
    knowledgeContext: trimText(input.knowledgeContext, 6000) || undefined,
    internalRagContext: input.internalRagContext
      ? {
          ...input.internalRagContext,
          promptContext: trimText(input.internalRagContext.promptContext, 6000) || undefined,
        }
      : undefined,
  };
}

export function buildActivityAutofillPrompt(input: ActivityAutofillRequest) {
  const normalized = normalizeActivityAutofillRequest(input);
  const catalogPairs = normalized.catalogCandidates
    .map((candidate) => `${candidate.saCode} :: ${candidate.activityName}`)
    .join('\n');
  const ragPromptContext = normalized.internalRagContext?.promptContext || normalized.knowledgeContext;
  const ragSection = ragPromptContext
    ? `\nContext RAG intern (folosit doar pentru orientare, nu pentru inventare):\n${ragPromptContext}\n`
    : '';
  const paSaGuide = Object.entries(PA_SA_GUIDE)
    .map(([code, guide]) => `${code} - ${guide.label}. Indicatori orientativi: ${guide.keywords.join(', ')}.`)
    .join('\n');

  return {
    system: `Esti un asistent specializat in redactarea Raportului de Activitate pentru un Expert / Responsabil Afaceri Publice in proiectul "Consolidarea capacitatii Concordia pentru dialog social" (PEO). Transformi livrabile, note, minute, agende, emailuri sintetizate, liste de sarcini, rapoarte preliminare sau rezumate de lucru in completari narative profesioniste, auditabile si fidele inputului. Nu inventa persoane, date, documente, rezultate sau contexte care nu apar in input ori nu rezulta direct si necesar din natura livrabilului. Returneaza doar JSON valid, fara text in afara JSON.`,
    prompt: `Obiectiv: sugereaza subactivitatea, activitatea si descrierea activitatii pentru formularul "Adaugare Activitate".

Reguli obligatorii pentru fiecare camp:
- recommended.saCode: alege exact un cod din catalogCandidates. Nu inventa subactivitati si nu schimba codul.
- recommended.activityName: alege exact denumirea unei activitati din catalogCandidates pentru subactivitatea aleasa. Nu reformula titlul.
- recommended.description: redacteaza in romana, la persoana I singular, profesional, administrativ si suficient de detaliat pentru raportare. Foloseste paragrafe ample si coerente, doar pe baza documentelor, a logicii catalogului si a contextului RAG. Nu inventa participanti, functii, indicatori, rezultate decizionale, locatii sau ore.
- fieldInstructions.saCode: explica de ce subactivitatea aleasa este compatibila cu documentele si cu logica activitatilor.
- fieldInstructions.activityName: explica de ce activitatea aleasa este cea mai apropiata din catalog.
- fieldInstructions.description: explica ce informatii din documente/catalog trebuie sa se regaseasca in descriere.
- Daca documentele nu sustin clar alegerea, foloseste confidence "low" si pune avertisment explicit in warnings.
- Nu propune modificari pentru ore, tip zi, locatie, colaborare, GDPR sau eligibilitatea livrabilelor.
- Catalogul ramane sursa obligatorie pentru recommended.saCode si recommended.activityName.
- Contextul RAG intern ajuta doar la alegerea dintre activitatile permise si la redactarea descrierii.
- Daca sursele RAG contrazic orice element din catalog, catalogul are prioritate.
- Poti inspira stilul descrierii din raportari aprobate, dar nu copia mecanic fragmente lungi.

Ghid de incadrare AP/PA:
${paSaGuide}

Reguli pentru selectarea activitatii:
- Alege intai subactivitatea pe baza continutului real al livrabilului, nu pe baza unui singur cuvant izolat.
- Daca livrabilul este newsletter, informare membri, analiza legislativa, document de pozitie, consultare publica, grup de lucru, sinteza, speaking points sau material suport pentru membri, trateaza cu prioritate SA3.4.
- Daca livrabilul vizeaza infrastructura operationala, Business HUB, harta interactiva, baze de date, site sau mecanisme de functionare, trateaza cu prioritate SA3.2.
- Daca livrabilul vizeaza recrutare, prospectare, afiliere sau integrarea orientata spre membri noi, trateaza cu prioritate SA3.3.
- Daca livrabilul vizeaza UE, BusinessEurope, IOE, BIAC, schimb de bune practici sau interactiuni europene, trateaza cu prioritate SA3.5.
- Daca exista dubiu intre doua activitati din aceeasi SA, alege activitatea cu cea mai apropiata denumire si descriere din catalogCandidates, apoi marcheaza confidence "medium" sau "low".

Reguli pentru descrierea propusa:
- Scrie un text complet, coerent, credibil, natural si auditabil.
- Include natural: ce am facut concret, pentru cine/ce structura am lucrat, scopul activitatii, etapele de lucru, rezultatul obtinut, livrabilul/documentul rezultat, tipul documentului si gradul de realizare, doar daca aceste elemente apar in input sau rezulta direct din natura livrabilului.
- Daca utilizatorul indica mai multe zile in selectedDates, redacteaza cel putin un paragraf distinct pentru fiecare zi, in ordine cronologica, doar daca succesiunea este credibila pentru acel livrabil.
- Daca inputul include doar un livrabil si datele lucrate, poti reconstrui prudent etape standard compatibile cu livrabilul: analiza, extragerea si structurarea informatiilor relevante, redactare, revizuire, consolidare, verificarea coerentei si pregatirea versiunii de lucru sau finale.
- Nu crea artificial volum si nu adauga activitati neverosimile. Cand exista dubiu intre detaliere si fidelitate, fidelitatea fata de input are prioritate.
- Evita bullets, liste, tabele, meta-explicatii, formule vagi sau repetitii. Outputul din recommended.description trebuie sa fie doar text narativ.
- Daca informatia este suficienta, descrierea trebuie sa aiba de regula 900-1600 de caractere; daca informatia este limitata, redacteaza prudent dar nu schematic.
- La final poti adauga 1-2 fraze prudente de legatura cu subactivitatea, de tip "Aceasta activitate a contribuit la...", doar daca legatura reiese clar.

Activitati permise:
${catalogPairs}

Context:
${JSON.stringify({
  expertName: normalized.expertName,
  expertRole: normalized.expertRole,
  category: normalized.category,
  projectCode: normalized.projectCode,
  month: normalized.month,
  year: normalized.year,
  selectedDates: normalized.selectedDates,
}, null, 2)}
${ragSection}

Catalog activitati:
${JSON.stringify(normalized.catalogCandidates, null, 2)}

Livrabile analizate:
${JSON.stringify(normalized.deliverables, null, 2)}

Returneaza strict JSON valid cu:
{
  "recommended": {
    "saCode": "...",
    "activityName": "...",
    "description": "..."
  },
  "confidence": "high|medium|low",
  "fieldInstructions": {
    "saCode": "...",
    "activityName": "...",
    "description": "..."
  },
  "evidence": ["..."],
  "warnings": ["..."]
}`,
  };
}

export function validateActivityAutofillSuggestionAgainstCatalog(
  output: unknown,
  catalogCandidates: ActivityAutofillCatalogCandidate[],
) {
  const parsed = activityAutofillSuggestionSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false as const, error: 'Raspunsul AI nu respecta schema asteptata.' };
  }

  const match = catalogCandidates.some((candidate) => (
    candidate.saCode === parsed.data.recommended.saCode
    && candidate.activityName === parsed.data.recommended.activityName
  ));

  if (!match) {
    return {
      ok: false as const,
      error: 'Raspunsul AI a propus o subactivitate sau activitate in afara catalogului disponibil.',
    };
  }

  return { ok: true as const, data: parsed.data };
}
