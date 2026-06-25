import { z } from 'zod';

const MAX_DELIVERABLE_TEXT_CHARS = 6000;
const MAX_PROMPT_DELIVERABLES = 8;

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
export type ActivityAutofillSuggestion = z.infer<typeof activityAutofillSuggestionSchema> & {
  modelAuditId?: string;
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

  return {
    system: `Esti un asistent de raportare PEO. Sugerezi completarea formularului de activitate pe baza livrabilelor incarcate si a Catalogului activitatilor. Nu inventa informatii. Returneaza doar JSON valid, fara text in afara JSON.`,
    prompt: `Obiectiv: sugereaza subactivitatea, activitatea si descrierea activitatii pentru formularul "Adaugare Activitate".

Reguli obligatorii pentru fiecare camp:
- recommended.saCode: alege exact un cod din catalogCandidates. Nu inventa subactivitati si nu schimba codul.
- recommended.activityName: alege exact denumirea unei activitati din catalogCandidates pentru subactivitatea aleasa. Nu reformula titlul.
- recommended.description: redacteaza in romana, profesional, doar pe baza documentelor si a logicii catalogului. Nu inventa participanti, indicatori, rezultate, decizii, locatii sau ore.
- fieldInstructions.saCode: explica de ce subactivitatea aleasa este compatibila cu documentele si cu logica activitatilor.
- fieldInstructions.activityName: explica de ce activitatea aleasa este cea mai apropiata din catalog.
- fieldInstructions.description: explica ce informatii din documente/catalog trebuie sa se regaseasca in descriere.
- Daca documentele nu sustin clar alegerea, foloseste confidence "low" si pune avertisment explicit in warnings.
- Nu propune modificari pentru ore, tip zi, locatie, colaborare, GDPR sau eligibilitatea livrabilelor.
- Catalogul ramane sursa obligatorie pentru recommended.saCode si recommended.activityName.
- Contextul RAG intern ajuta doar la alegerea dintre activitatile permise si la redactarea descrierii.
- Daca sursele RAG contrazic orice element din catalog, catalogul are prioritate.
- Poti inspira stilul descrierii din raportari aprobate, dar nu copia mecanic fragmente lungi.

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
