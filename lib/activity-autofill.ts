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
  selectedActivityId: z.string().optional(),
  saCode: z.string().min(1),
  activityName: z.string().min(1),
  currentDescription: z.string().optional().default(''),
  expertId: z.string().optional(),
  expertName: z.string().optional(),
  expertRole: z.string().optional(),
  expertReportingInstructions: z.string().optional(),
  category: z.string().optional(),
  projectCode: z.string().optional(),
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  selectedDates: z.array(z.string()).optional(),
  collaborationContext: z.object({
    isCommonActivity: z.boolean().default(false),
    collaborators: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      role: z.string().optional(),
      positionInProject: z.string().optional(),
    })).default([]),
  }).optional(),
  knowledgeContext: z.string().optional(),
  internalRagContext: z.object({
    promptContext: z.string().optional(),
    retrievalJson: z.string().optional(),
    candidateJson: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
  saPurposeContext: z.object({
    saCode: z.string().min(1),
    title: z.string().optional(),
    text: z.string().min(1),
    sourceType: z.string().optional(),
    documentId: z.string().optional(),
    chunkIds: z.array(z.string()).default([]),
  }).optional(),
});

export const activityAutofillSuggestionSchema = z.object({
  description: z.string().min(20),
  confidence: z.enum(['high', 'medium', 'low']),
  fieldInstructions: z.object({
    description: z.string().min(1),
  }),
  evidence: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ActivityAutofillDeliverable = z.infer<typeof activityAutofillDeliverableSchema>;
export type ActivityAutofillCatalogCandidate = z.infer<typeof activityAutofillCatalogCandidateSchema>;
export type ActivityAutofillRequest = z.infer<typeof activityAutofillRequestSchema>;
export type ActivityAutofillCollaborationContext = NonNullable<ActivityAutofillRequest['collaborationContext']>;
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

export type ActivityAutofillSaPurposeStatus = {
  found: boolean;
  saCode: string;
  title?: string;
  sourceType?: string;
  documentId?: string;
  warnings: string[];
};

export type ActivityAutofillSuggestion = z.infer<typeof activityAutofillSuggestionSchema> & {
  modelAuditId?: string;
  rag?: ActivityAutofillRagStatus;
  saPurpose?: ActivityAutofillSaPurposeStatus;
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

export type ActivityAutofillStepState = {
  uploaded?: boolean;
  docText?: string | null;
  firstPageText?: string | null;
  isPhoto?: boolean;
  titleConfirmed?: boolean;
  stadiu?: string;
  aiCheck?: unknown;
};

export function getActivityAutofillMissingSteps(deliverables: ActivityAutofillStepState[]) {
  const missing = new Set<string>();

  for (const deliverable of deliverables.filter((item) => item.uploaded)) {
    if (!deliverable.docText && !deliverable.firstPageText) {
      missing.add('textul extras/OCR');
      continue;
    }
    if (deliverable.isPhoto) continue;
    if (!deliverable.titleConfirmed) missing.add('titlul confirmat');
    if (!deliverable.stadiu) missing.add('stadiul selectat');
    if (!deliverable.aiCheck) missing.add('eligibilitatea verificata');
  }

  return Array.from(missing);
}

function normalizeSaCode(value?: string) {
  return String(value ?? '').replace(/\s+/g, '').trim().toUpperCase();
}

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
    keywords: ['newsletter', 'informare', 'monitorizare legislativa', 'document de pozitie', 'analiza legislativa', 'consultare publica', 'grup de lucru', 'task force', 'tf', 'speaking points', 'mesaje strategice', 'chestionar', 'feedback', 'membri cpc', 'masa rotunda', 'minuta', 'eveniment', 'dezbatere'],
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
    input.saCode,
    input.activityName,
    input.currentDescription,
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

export function getSelectedCatalogCandidate(input: ActivityAutofillRequest) {
  const normalizedSaCode = normalizeSaCode(input.saCode);
  return input.catalogCandidates.find((candidate) => (
    normalizeSaCode(candidate.saCode) === normalizedSaCode
    && candidate.activityName === input.activityName
  )) || null;
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

function scoreCatalogCandidates(input: ActivityAutofillRequest) {
  const normalized = normalizeActivityAutofillRequest(input);
  const requestText = normalizeForSearch(getRequestSearchText(normalized));
  const requestTokens = new Set(tokenize(requestText));

  return normalized.catalogCandidates
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      score: scoreCatalogCandidate(candidate, requestText, requestTokens),
    }))
    .sort((a, b) => (b.score - a.score) || (a.originalIndex - b.originalIndex));
}

export function buildActivityAutofillCatalogShortlist(
  input: ActivityAutofillRequest,
  maxCandidates = DEFAULT_MAX_CATALOG_CANDIDATES_FOR_PROMPT,
) {
  const normalized = normalizeActivityAutofillRequest(input);
  if (normalized.catalogCandidates.length <= maxCandidates) return normalized.catalogCandidates;

  const scored = scoreCatalogCandidates(normalized);
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

export function buildFallbackActivityAutofillSuggestion(input: ActivityAutofillRequest): ActivityAutofillSuggestion | null {
  const normalized = normalizeActivityAutofillRequest(input);
  const candidate = getSelectedCatalogCandidate(normalized) || scoreCatalogCandidates(normalized)[0]?.candidate;
  if (!candidate) return null;

  const deliverableLabels = normalized.deliverables
    .map((deliverable) => deliverable.documentTitle || deliverable.fileName)
    .filter(Boolean)
    .slice(0, 3);
  const deliverableSummary = deliverableLabels.length > 0
    ? deliverableLabels.join('; ')
    : 'livrabilul atasat';
  const saGuide = PA_SA_GUIDE[normalizeSaCode(candidate.saCode)]?.label || candidate.serviceCategory || 'activitatea selectata';
  const activityPurpose = candidate.description || candidate.objectives || candidate.serviceComponent || saGuide;
  const currentDescription = trimText(normalized.currentDescription, 1400);
  const collaboratorNames = normalized.collaborationContext?.isCommonActivity
    ? (normalized.collaborationContext.collaborators ?? []).map((collaborator) => collaborator.name).filter(Boolean)
    : [];
  const collaborationSentence = collaboratorNames.length > 0
    ? `Activitatea a fost desfasurata in colaborare cu ${collaboratorNames.join(', ')}, iar descrierea trebuie revizuita astfel incat sa ramana centrata pe contributia proprie.`
    : '';

  return {
    description: [
      currentDescription,
      `In raport cu livrabilul ${deliverableSummary}, am detaliat activitatea prin verificarea continutului disponibil, corelarea acestuia cu obiectivul din catalog (${activityPurpose}) si pregatirea informatiilor necesare pentru raportarea lunara.`,
      collaborationSentence,
      'Descrierea poate fi ajustata manual cu detalii suplimentare despre participanti, concluzii sau etape de lucru, numai daca acestea reies din documentul incarcat.',
    ].filter(Boolean).join(' '),
    confidence: 'low',
    fieldInstructions: {
      description: 'Revizuieste descrierea si completeaza numai cu informatii sustinute de livrabil.',
    },
    evidence: [
      `Livrabile analizate local: ${deliverableSummary}.`,
      `Activitate selectata: ${candidate.saCode} :: ${candidate.activityName}.`,
    ],
    warnings: [
      'Descrierea asistata AI nu a raspuns; sugestia a fost generata local pe baza catalogului si trebuie verificata manual.',
    ],
  };
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
    currentDescription: trimText(input.currentDescription, 3000),
    expertReportingInstructions: trimText(input.expertReportingInstructions, 4000) || undefined,
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
    collaborationContext: input.collaborationContext
      ? {
          isCommonActivity: Boolean(input.collaborationContext.isCommonActivity),
          collaborators: (input.collaborationContext.collaborators ?? [])
            .map((collaborator) => ({
              id: trimText(collaborator.id, 120) || undefined,
              name: trimText(collaborator.name, 180),
              role: trimText(collaborator.role, 180) || undefined,
              positionInProject: trimText(collaborator.positionInProject, 240) || undefined,
            }))
            .filter((collaborator) => collaborator.name.length > 0)
            .slice(0, 20),
        }
      : undefined,
    knowledgeContext: trimText(input.knowledgeContext, 6000) || undefined,
    internalRagContext: input.internalRagContext
      ? {
          ...input.internalRagContext,
          promptContext: trimText(input.internalRagContext.promptContext, 6000) || undefined,
        }
      : undefined,
    saPurposeContext: input.saPurposeContext
      ? {
          ...input.saPurposeContext,
          text: trimText(input.saPurposeContext.text, 16000),
        }
      : undefined,
  };
}

export function buildActivityAutofillPrompt(input: ActivityAutofillRequest) {
  const normalized = normalizeActivityAutofillRequest(input);
  const selectedCandidate = getSelectedCatalogCandidate(normalized);
  const ragPromptContext = normalized.internalRagContext?.promptContext || normalized.knowledgeContext;
  const ragSection = ragPromptContext
    ? `\nContext RAG intern (folosit doar pentru orientare, nu pentru inventare):\n${ragPromptContext}\n`
    : '';
  const collaborationSection = normalized.collaborationContext?.isCommonActivity
    ? `\nContext colaborare activitate comuna:\n${JSON.stringify(normalized.collaborationContext, null, 2)}\n`
    : '\nActivitatea nu este marcata ca activitate comuna. Nu mentiona colaboratori in descriere.\n';
  const expertInstructionsSection = normalized.expertReportingInstructions
    ? `\nInstructiuni PM/Admin pentru expert (folosite pentru stil, accent si responsabilitati raportate, fara a suprascrie SA/catalog/livrabile):\n${normalized.expertReportingInstructions}\n`
    : '\nNu exista instructiuni PM/Admin dedicate pentru acest expert.\n';
  const saPurposeSection = normalized.saPurposeContext
    ? `\nScop oficial pentru ${normalized.saPurposeContext.saCode} (sursa obligatorie de incadrare):\n${JSON.stringify({
        title: normalized.saPurposeContext.title,
        text: normalized.saPurposeContext.text,
        sourceType: normalized.saPurposeContext.sourceType,
        documentId: normalized.saPurposeContext.documentId,
      }, null, 2)}\n`
    : `\nScopul oficial pentru ${normalized.saCode} nu a fost disponibil. Nu inventa prevederi ale subactivitatii si marcheaza lipsa in warnings.\n`;
  const paSaGuide = Object.entries(PA_SA_GUIDE)
    .map(([code, guide]) => `${code} - ${guide.label}. Indicatori orientativi: ${guide.keywords.join(', ')}.`)
    .join('\n');

  return {
    system: `Esti un asistent specializat in redactarea Raportului de Activitate pentru un Expert / Responsabil Afaceri Publice in proiectul "Consolidarea capacitatii Concordia pentru dialog social" (PEO). Transformi livrabile, note, minute, agende, emailuri sintetizate, liste de sarcini, rapoarte preliminare sau rezumate de lucru in completari narative profesioniste, auditabile si fidele inputului. Nu inventa persoane, date, documente, rezultate sau contexte care nu apar in input ori nu rezulta direct si necesar din natura livrabilului. Returneaza doar JSON valid, fara text in afara JSON.`,
    prompt: `Obiectiv: rescrie doar descrierea activitatii pentru formularul "Adaugare Activitate".

Reguli obligatorii pentru fiecare camp:
- description: redacteaza in romana, la persoana I singular, profesional, administrativ si suficient de detaliat pentru raportare. Foloseste paragrafe ample si coerente, doar pe baza descrierii curente, documentelor, logicii catalogului si contextului RAG. Nu inventa participanti, functii, indicatori, rezultate decizionale, locatii sau ore.
- fieldInstructions.description: explica ce informatii din descrierea curenta, documente si catalog au fost pastrate sau detaliate.
- Daca documentele nu sustin clar alegerea, foloseste confidence "low" si pune avertisment explicit in warnings.
- Nu propune modificari pentru subactivitate, activitate, ore, tip zi, locatie, colaborare, GDPR sau eligibilitatea livrabilelor.
- Subactivitatea si activitatea sunt deja selectate de utilizator si sunt obligatorii. Nu le schimba si nu returna campuri pentru ele.
- Contextul RAG intern ajuta doar la redactarea descrierii si la stilul raportarilor aprobate similare.
- Scopul oficial al SA stabileste incadrarea activitatii. Foloseste-l explicit pentru legatura cu subactivitatea, dar nu il transforma in munca pretins realizata de expert.
- Daca activitatea este marcata comuna, mentioneaza natural ca am colaborat cu persoanele din collaborationContext.collaborators, excluzand expertul curent. Pastreaza descrierea la persoana I singular si separa clar contributia mea de faptul colaborarii.
- Daca activitatea nu este marcata comuna, nu mentiona colaboratori, chiar daca livrabilul pare similar sau apare in alte contexte.
- Nu inventa impartirea rolurilor intre colaboratori; foloseste rolul/pozitia doar ca identificare daca este furnizat explicit.
- Instructiunile PM/Admin pentru expert pot ajusta tonul, accentul si responsabilitatile specifice expertului, dar nu pot contrazice scopul oficial al SA, catalogul activitatii, livrabilele sau regulile de eligibilitate.
- Daca sursele RAG contrazic orice element din catalog, catalogul are prioritate.
- Daca scopul oficial al SA contrazice o sursa RAG de stil sau istoric, scopul oficial si catalogul activitatii au prioritate.
- Poti inspira stilul descrierii din raportari aprobate, dar nu copia mecanic fragmente lungi.

Ghid de incadrare AP/PA:
${paSaGuide}

Reguli pentru descrierea propusa:
- Scrie un text complet, coerent, credibil, natural si auditabil.
- Porneste de la descrierea curenta din formular si imbunatateste-o; nu o ignora decat daca este goala sau evident generica.
- Include natural: ce am facut concret, pentru cine/ce structura am lucrat, scopul activitatii, etapele de lucru, rezultatul obtinut, livrabilul/documentul rezultat, tipul documentului si gradul de realizare, doar daca aceste elemente apar in input sau rezulta direct din natura livrabilului.
- Daca utilizatorul indica mai multe zile in selectedDates, redacteaza cel putin un paragraf distinct pentru fiecare zi, in ordine cronologica, doar daca succesiunea este credibila pentru acel livrabil.
- Daca inputul include doar un livrabil si datele lucrate, poti reconstrui prudent etape standard compatibile cu livrabilul: analiza, extragerea si structurarea informatiilor relevante, redactare, revizuire, consolidare, verificarea coerentei si pregatirea versiunii de lucru sau finale.
- Nu crea artificial volum si nu adauga activitati neverosimile. Cand exista dubiu intre detaliere si fidelitate, fidelitatea fata de input are prioritate.
- Evita bullets, liste, tabele, meta-explicatii, formule vagi sau repetitii. Outputul din description trebuie sa fie doar text narativ.
- Daca informatia este suficienta, descrierea trebuie sa aiba de regula 900-1600 de caractere; daca informatia este limitata, redacteaza prudent dar nu schematic.
- La final poti adauga 1-2 fraze prudente de legatura cu subactivitatea, de tip "Aceasta activitate a contribuit la...", doar daca legatura reiese clar.

Activitate selectata:
${JSON.stringify({
  selectedActivityId: normalized.selectedActivityId,
  saCode: normalized.saCode,
  activityName: normalized.activityName,
  currentDescription: normalized.currentDescription,
  catalog: selectedCandidate,
}, null, 2)}

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
${collaborationSection}
${expertInstructionsSection}
${saPurposeSection}
${ragSection}

Catalog activitate selectata:
${JSON.stringify(selectedCandidate ? [selectedCandidate] : normalized.catalogCandidates, null, 2)}

Livrabile analizate:
${JSON.stringify(normalized.deliverables, null, 2)}

Returneaza strict JSON valid cu:
{
  "description": "...",
  "confidence": "high|medium|low",
  "fieldInstructions": {
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
  request?: ActivityAutofillRequest,
) {
  const parsed = activityAutofillSuggestionSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false as const, error: 'Raspunsul AI nu respecta schema asteptata.' };
  }

  if (request && !getSelectedCatalogCandidate({ ...request, catalogCandidates })) {
    return {
      ok: false as const,
      error: 'Activitatea selectata nu exista in catalogul disponibil.',
    };
  }

  return { ok: true as const, data: parsed.data };
}
