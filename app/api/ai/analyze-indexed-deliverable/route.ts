import { Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiErrorResponse, assertAllowedAiRequest, governedGenerateText } from '@/lib/ai-governance';
import { openaiModel } from '@/lib/openai';
import { buildCompactActivityAutofillRagContext } from '@/lib/rag/activity-autofill-rag';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { retrieveActivityAutofillContext } from '@/lib/rag/retrieval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const catalogCandidateSchema = z.object({
  id: z.string(),
  category: z.string().optional(),
  saCode: z.string().min(1),
  serviceCategory: z.string().optional(),
  activityNumber: z.number().optional(),
  activityName: z.string().min(1),
  description: z.string().optional(),
  objectives: z.string().optional(),
  deliverables: z.string().optional(),
  indicators: z.string().optional(),
});

const indexedDeliverableAnalysisRequestSchema = z.object({
  candidate: z.object({
    id: z.string().optional(),
    fileName: z.string().min(1),
    mimeType: z.string().optional(),
    fileSize: z.number().optional(),
    reportingMonth: z.number().min(1).max(12),
    reportingYear: z.number().min(2000).max(2100),
    extractedText: z.string().optional(),
    extractedTextPreview: z.string().optional(),
    detectedDate: z.string().optional(),
    suggestedTitle: z.string().optional(),
    suggestedType: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }),
  expert: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    category: z.string().optional(),
    projectCode: z.string().optional(),
    saCodes: z.array(z.string()).optional(),
  }).optional(),
  catalogCandidates: z.array(catalogCandidateSchema).min(1),
  existingActivities: z.array(z.object({
    date: z.string().optional(),
    title: z.string().optional(),
    activityType: z.string().optional(),
    description: z.string().optional(),
    saCode: z.string().optional(),
  })).optional(),
});

const indexedDeliverableAnalysisSchema = z.object({
  eligibilityStatus: z.enum(['eligibil', 'necesita_revizie', 'neeligibil']),
  eligibilityReason: z.string().min(10),
  eligibilityScore: z.number().min(0).max(100),
  confidence: z.enum(['high', 'medium', 'low']),
  suggestedSaCode: z.string().optional(),
  suggestedActivityCatalogId: z.string().optional(),
  suggestedActivityName: z.string().optional(),
  suggestedTitle: z.string().min(1),
  suggestedType: z.string().min(1),
  suggestedDescription: z.string().optional(),
  suggestedResult: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  alternativeMatches: z.array(z.object({
    saCode: z.string().optional(),
    activityCatalogId: z.string().optional(),
    activityName: z.string().optional(),
    reason: z.string().optional(),
    confidence: z.string().optional(),
  })).default([]),
});

function normalizeForSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCatalogCategory(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function scopeCatalogByExpert(
  candidates: z.infer<typeof catalogCandidateSchema>[],
  expertCategory?: string,
) {
  const category = normalizeCatalogCategory(expertCategory);
  if (!category) return candidates;
  const scoped = candidates.filter((candidate) => normalizeCatalogCategory(candidate.category) === category);
  return scoped.length > 0 ? scoped : candidates;
}

function shortlistCatalog(
  candidates: z.infer<typeof catalogCandidateSchema>[],
  context: string,
  expertSaCodes: string[] = [],
  expertCategory?: string,
) {
  const query = normalizeForSearch(context);
  const allowedSaCodes = new Set(expertSaCodes.filter(Boolean));
  const scopedCandidates = scopeCatalogByExpert(candidates, expertCategory);
  return scopedCandidates
    .map((candidate, index) => {
      const text = normalizeForSearch([
        candidate.category,
        candidate.saCode,
        candidate.activityName,
        candidate.serviceCategory,
        candidate.description,
        candidate.objectives,
        candidate.deliverables,
        candidate.indicators,
      ].filter(Boolean).join(' '));
      let score = allowedSaCodes.has(candidate.saCode) ? 20 : 0;
      text.split(' ').forEach((token) => {
        if (token.length >= 4 && query.includes(token)) score += 1;
      });
      if (query.includes(normalizeForSearch(candidate.activityName))) score += 20;
      return { candidate, score, index };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .slice(0, 12)
    .map((item) => item.candidate);
}

function uniqueMessages(messages: string[]) {
  return Array.from(new Set(messages.map((message) => message.trim()).filter(Boolean)));
}

type CatalogCandidate = z.infer<typeof catalogCandidateSchema>;
type IndexedDeliverableAnalysis = z.infer<typeof indexedDeliverableAnalysisSchema>;

function tokenize(value: string) {
  const stopWords = new Set([
    'pentru', 'privind', 'referitor', 'referitoare', 'minuta', 'minuta', 'agenda', 'preliminara',
    'semnatura', 'semnaturi', 'captura', 'electronic', 'electronica', 'document', 'livrabil',
    'proiect', 'peo', 'cpc', 'concordia',
  ]);
  return normalizeForSearch(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function scoreCatalogCandidate(candidate: CatalogCandidate, context: string, expertSaCodes: string[] = []) {
  const queryTokens = new Set(tokenize(context));
  const catalogText = normalizeForSearch([
    candidate.category,
    candidate.saCode,
    candidate.serviceCategory,
    candidate.activityName,
    candidate.description,
    candidate.objectives,
    candidate.deliverables,
    candidate.indicators,
  ].filter(Boolean).join(' '));
  const candidateTokens = new Set(tokenize(catalogText));
  let score = expertSaCodes.includes(candidate.saCode) ? 18 : 0;

  queryTokens.forEach((token) => {
    if (candidateTokens.has(token)) score += 8;
    else if (catalogText.includes(token)) score += 3;
  });

  if (context.toLowerCase().includes(candidate.saCode.toLowerCase())) score += 16;
  if (normalizeForSearch(candidate.activityName) && normalizeForSearch(context).includes(normalizeForSearch(candidate.activityName))) score += 22;
  return score;
}

function buildDeterministicAnalysis(args: {
  request: z.infer<typeof indexedDeliverableAnalysisRequestSchema>;
  candidateText: string;
  shortlistedCatalog: CatalogCandidate[];
  retrievalWarnings?: string[];
  source: 'fallback' | 'ai_unavailable';
}): IndexedDeliverableAnalysis {
  const { request, candidateText, shortlistedCatalog, retrievalWarnings = [], source } = args;
  const expertSaCodes = request.expert?.saCodes ?? [];
  const ranked = shortlistedCatalog
    .map((candidate) => ({ candidate, score: scoreCatalogCandidate(candidate, candidateText, expertSaCodes) }))
    .sort((first, second) => second.score - first.score);
  const best = ranked[0]?.candidate ?? request.catalogCandidates[0];
  const bestScore = ranked[0]?.score ?? 0;
  const hasEnoughText = normalizeForSearch(candidateText).length >= 40;
  const detectedDate = request.candidate.detectedDate ? new Date(`${request.candidate.detectedDate}T00:00:00`) : null;
  const wrongMonth = Boolean(
    detectedDate
    && (detectedDate.getMonth() + 1 !== request.candidate.reportingMonth || detectedDate.getFullYear() !== request.candidate.reportingYear),
  );
  const hasUsefulMatch = bestScore >= 18 || expertSaCodes.includes(best.saCode);
  const eligibilityStatus: IndexedDeliverableAnalysis['eligibilityStatus'] = wrongMonth || !hasEnoughText
    ? 'necesita_revizie'
    : hasUsefulMatch
      ? 'eligibil'
      : 'necesita_revizie';
  const eligibilityScore = wrongMonth
    ? 45
    : hasUsefulMatch
      ? Math.min(88, Math.max(62, 50 + bestScore))
      : Math.max(35, Math.min(58, 35 + bestScore));
  const reasonParts = [
    wrongMonth
      ? `Data detectata (${request.candidate.detectedDate}) nu este in luna selectata.`
      : `Potrivire propusa din catalog pe baza textului extras si a metadatelor: ${best.saCode} - ${best.activityName}.`,
    source === 'ai_unavailable'
      ? 'Analiza AI nu a fost disponibila, asa ca am folosit potrivirea determinista catalog/RAG.'
      : 'Propunerea este determinista si trebuie validata de expert.',
  ];

  return {
    eligibilityStatus,
    eligibilityReason: reasonParts.join(' '),
    eligibilityScore,
    confidence: hasUsefulMatch && !wrongMonth ? 'medium' : 'low',
    suggestedSaCode: best.saCode,
    suggestedActivityCatalogId: best.id,
    suggestedActivityName: best.activityName,
    suggestedTitle: request.candidate.suggestedTitle || request.candidate.fileName,
    suggestedType: request.candidate.suggestedType || 'livrabil',
    suggestedDescription: [
      `Am realizat ${best.activityName.toLowerCase()} pe baza livrabilului "${request.candidate.suggestedTitle || request.candidate.fileName}".`,
      request.candidate.detectedDate ? `Livrabilul indica data ${request.candidate.detectedDate}.` : '',
    ].filter(Boolean).join(' '),
    suggestedResult: `Livrabil analizat si incadrat preliminar la ${best.saCode}.`,
    keywords: uniqueMessages([...(request.candidate.keywords ?? []), ...tokenize(candidateText).slice(0, 8)]),
    warnings: uniqueMessages([
      ...retrievalWarnings,
      source === 'ai_unavailable' ? 'Analiza AI a esuat; propunerea a fost generata prin potrivire determinista.' : '',
      wrongMonth ? 'Verifica luna/data inainte de pontare.' : '',
      !hasEnoughText ? 'Text extras insuficient; verifica manual continutul livrabilului.' : '',
    ]),
    alternativeMatches: ranked.slice(1, 4).map(({ candidate, score }) => ({
      saCode: candidate.saCode,
      activityCatalogId: candidate.id,
      activityName: candidate.activityName,
      reason: `Potrivire alternativa in catalog, scor ${score}.`,
      confidence: score >= 18 ? 'medium' : 'low',
    })),
  };
}

function findCatalogMatch(analysis: IndexedDeliverableAnalysis, catalog: CatalogCandidate[]) {
  const suggestedId = analysis.suggestedActivityCatalogId;
  if (suggestedId) {
    const byId = catalog.find((candidate) => candidate.id === suggestedId);
    if (byId) return byId;
  }

  const suggestedName = normalizeForSearch(analysis.suggestedActivityName);
  const suggestedSaCode = normalizeForSearch(analysis.suggestedSaCode);
  return catalog.find((candidate) => {
    const sameName = suggestedName && normalizeForSearch(candidate.activityName) === suggestedName;
    const sameSaCode = suggestedSaCode && normalizeForSearch(candidate.saCode) === suggestedSaCode;
    return sameName && sameSaCode;
  });
}

function alignAnalysisToCatalog(
  analysis: IndexedDeliverableAnalysis,
  fallback: IndexedDeliverableAnalysis,
  catalog: CatalogCandidate[],
) {
  const match = findCatalogMatch(analysis, catalog);
  if (!match) {
    return {
      ...fallback,
      warnings: uniqueMessages([
        ...(fallback.warnings ?? []),
        'Propunerea AI a fost ignorata deoarece nu apartine catalogului permis pentru expert.',
      ]),
    };
  }

  return {
    ...analysis,
    suggestedSaCode: match.saCode,
    suggestedActivityCatalogId: match.id,
    suggestedActivityName: match.activityName,
  };
}

export async function POST(req: Request) {
  try {
    assertAllowedAiRequest(req);
    const parsed = indexedDeliverableAnalysisRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cererea de analiza livrabil nu este valida.', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const request = parsed.data;
    const candidateText = [
      request.candidate.suggestedTitle,
      request.candidate.suggestedType,
      request.candidate.fileName,
      request.candidate.detectedDate,
      request.candidate.extractedText,
      request.candidate.extractedTextPreview,
      ...(request.candidate.keywords ?? []),
    ].filter(Boolean).join('\n');
    const shortlistedCatalog = shortlistCatalog(
      request.catalogCandidates,
      candidateText,
      request.expert?.saCodes ?? [],
      request.expert?.category,
    );
    const topCatalog = shortlistedCatalog[0] ?? request.catalogCandidates[0];
    const authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: true });
    const ragRequest = {
      deliverables: [{
        id: request.candidate.id,
        fileName: request.candidate.fileName,
        documentTitle: request.candidate.suggestedTitle,
        deliverableType: request.candidate.suggestedType,
        extractedText: (request.candidate.extractedText || request.candidate.extractedTextPreview || request.candidate.fileName).slice(0, 6000),
      }],
      catalogCandidates: shortlistedCatalog,
      saCode: topCatalog.saCode,
      activityName: topCatalog.activityName,
      expertId: request.expert?.id,
      expertName: request.expert?.name,
      expertRole: request.expert?.role,
      category: request.expert?.category || topCatalog.category,
      projectCode: request.expert?.projectCode,
      month: request.candidate.reportingMonth,
      year: request.candidate.reportingYear,
      currentDescription: '',
    };
    const fallbackAnalysis = buildDeterministicAnalysis({
      request,
      candidateText,
      shortlistedCatalog,
      source: 'fallback',
    });
    let retrieval;
    try {
      retrieval = await retrieveActivityAutofillContext(ragRequest, { authToken });
    } catch (retrievalError) {
      console.error('Recoverable indexed deliverable RAG failure:', retrievalError);
      retrieval = {
        enabled: false,
        skippedReason: 'RAG indisponibil pentru analiza curenta',
        chunks: [],
        warnings: ['RAG indisponibil; am folosit catalogul si textul extras.'],
      };
    }
    const ragContext = buildCompactActivityAutofillRagContext(retrieval);

    let result;
    try {
      result = await governedGenerateText({
      endpoint: '/api/ai/analyze-indexed-deliverable',
      operation: 'analyze-indexed-deliverable',
      request: {
        candidateId: request.candidate.id,
        reportingMonth: request.candidate.reportingMonth,
        reportingYear: request.candidate.reportingYear,
        catalogCandidates: shortlistedCatalog.length,
        rag: {
          enabled: retrieval.enabled,
          chunks: retrieval.chunks.length,
          warnings: retrieval.warnings,
        },
      },
      actorName: request.expert?.name,
      projectCode: request.expert?.projectCode,
      month: request.candidate.reportingMonth,
      year: request.candidate.reportingYear,
      model: openaiModel(),
      system: `Esti un agent de raportare PEO. Analizezi livrabile incarcate bulk, verifici eligibilitatea si propui un draft de activitate. Nu inventa fapte. Daca nu poti demonstra incadrarea, foloseste necesita_revizie sau neeligibil.`,
      prompt: `Analizeaza livrabilul pentru luna ${request.candidate.reportingMonth}/${request.candidate.reportingYear}.

Expert:
${JSON.stringify(request.expert ?? {}, null, 2)}

Livrabil:
${JSON.stringify(request.candidate, null, 2)}

Text/metadate livrabil:
${candidateText.slice(0, 9000)}

Catalog eligibil shortlist:
${JSON.stringify(shortlistedCatalog, null, 2)}

Activitati existente in luna:
${JSON.stringify((request.existingActivities ?? []).slice(0, 30), null, 2)}

Context RAG intern:
${ragContext?.promptContext || 'Fara context RAG disponibil.'}

Reguli:
- Categoria expertului este restrictiva: foloseste doar activitati din categoria "${request.expert?.category || 'nespecificata'}" daca exista in catalogul primit.
- Alege cea mai buna subactivitate numai din catalogul primit.
- Daca livrabilul pare din alta luna, marcheaza necesita_revizie sau neeligibil.
- Daca nu exista text suficient dar numele/metadatele sunt promitatoare, marcheaza necesita_revizie.
- eligibil inseamna ca poate genera draft pentru expert, dar expertul valideaza final.
- suggestedDescription trebuie sa fie o descriere de activitate gata de revizuit de expert.
- Explica scurt motivul si listeaza alternative cand exista potriviri apropiate.`,
      output: Output.object({ schema: indexedDeliverableAnalysisSchema }),
      });
    } catch (generationError) {
      console.error('Recoverable indexed deliverable AI failure:', generationError);
      const deterministic = buildDeterministicAnalysis({
        request,
        candidateText,
        shortlistedCatalog,
        retrievalWarnings: retrieval.warnings,
        source: 'ai_unavailable',
      });
      return NextResponse.json({
        ...deterministic,
        ragUsed: retrieval.enabled && retrieval.chunks.length > 0,
        ragSummary: retrieval.enabled
          ? `${retrieval.chunks.length} fragmente RAG analizate`
          : retrieval.skippedReason || 'RAG inactiv',
      });
    }

    const parsedOutput = indexedDeliverableAnalysisSchema.safeParse(result.output);
    const output = parsedOutput.success
      ? alignAnalysisToCatalog(parsedOutput.data, fallbackAnalysis, shortlistedCatalog)
      : fallbackAnalysis;

    return NextResponse.json({
      ...output,
      warnings: uniqueMessages([...output.warnings, ...retrieval.warnings]),
      ragUsed: retrieval.enabled && retrieval.chunks.length > 0,
      ragSummary: retrieval.enabled
        ? `${retrieval.chunks.length} fragmente RAG analizate`
        : retrieval.skippedReason || 'RAG inactiv',
      modelAuditId: result.auditId,
    });
  } catch (error) {
    console.error('Error analyzing indexed deliverable:', error);
    return aiErrorResponse(error, 'Eroare la analiza livrabilului indexat');
  }
}
