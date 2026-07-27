import { z } from 'zod';

export const deliverableEligibilityCheckSchema = z.object({
  criterion: z.string(),
  status: z.enum(['pass', 'warning', 'fail', 'unknown']),
  explanation: z.string(),
});

export const deliverableEligibilitySchema = z.object({
  status: z.enum(['eligibil', 'eligibil_cu_observatii', 'neeligibil', 'neconcludent']),
  score: z.number().min(0).max(100),
  summary: z.string(),
  checks: z.array(deliverableEligibilityCheckSchema),
  missingElements: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
  suggestedSettings: z.object({
    saCode: z.string().nullable(),
    activityName: z.string().nullable(),
    selectedActivityId: z.string().nullable(),
    deliverableType: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
    changes: z.array(z.enum(['activity', 'deliverableType'])),
  }).nullable(),
});

export const deliverableEligibilityAiSchema = z.object({
  status: z.enum(['eligibil', 'eligibil_cu_observatii', 'neeligibil', 'neconcludent']),
  score: z.number().min(0).max(100),
  summary: z.string(),
  checks: z.array(deliverableEligibilityCheckSchema),
  missingElements: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
  suggestedSettings: z.object({
    hasSuggestion: z.boolean(),
    saCode: z.string(),
    activityName: z.string(),
    selectedActivityId: z.string(),
    deliverableType: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
    changes: z.array(z.enum(['activity', 'deliverableType'])),
  }),
});

export const deliverableEligibilityActivityCandidateSchema = z.object({
  id: z.string(),
  saCode: z.string(),
  activityName: z.string(),
  serviceCategory: z.string().optional(),
  description: z.string().optional(),
  objectives: z.string().optional(),
  serviceComponent: z.string().optional(),
  beneficiaries: z.string().optional(),
  expectedResults: z.string().optional(),
  deliverables: z.string().optional(),
  indicators: z.string().optional(),
});

export const deliverableEligibilityDocumentSchema = z.object({
  id: z.string().optional(),
  activityGroupId: z.string().optional(),
  workBlockId: z.string().optional(),
  isPrimary: z.boolean().optional(),
  documentTitle: z.string().optional(),
  fileName: z.string().optional(),
  extractedText: z.string().optional(),
  deliverableType: z.string().optional(),
  textScope: z.string().optional(),
  duplicateStatus: z.string().optional(),
  possibleDuplicateOfDocumentId: z.string().optional(),
});

export const DEFAULT_ELIGIBILITY_RULE_VERSION_ID = 'default-code-rules-v1';

type EligibilityStatus = z.infer<typeof deliverableEligibilitySchema>['status'];
type EligibilityCheckStatus = z.infer<typeof deliverableEligibilityCheckSchema>['status'];
type EligibilityResult = z.infer<typeof deliverableEligibilitySchema>;
type EligibilityDocument = z.infer<typeof deliverableEligibilityDocumentSchema>;

export type EligibilityRubricCriterion = {
  score: number;
  maxScore: number;
  status: EligibilityCheckStatus;
  evidence: string[];
};

export type EligibilitySemanticAudit = {
  ruleVersionId: string;
  appliedRules: string[];
  evidenceUsed: string[];
  documentsRead: Array<{
    id?: string;
    documentTitle?: string;
    fileName?: string;
    deliverableType?: string;
    isPrimary?: boolean;
    textScope?: string;
    extractedTextLength: number;
    duplicateStatus?: string;
    possibleDuplicateOfDocumentId?: string;
  }>;
  rubricScores: Record<string, EligibilityRubricCriterion>;
  aiScore: number;
  rubricScore: number;
  normalizedScore: number;
  fallbackFlags: string[];
  categoryContextUsed: {
    expertId?: string;
    expertCategory?: string;
    expertFunction?: string;
    expertProjectRole?: string;
    projectCode?: string;
    selectedActivityId?: string;
    selectedActivityName?: string;
    saCode?: string;
    activityGroupId?: string;
    periodGroupId?: string;
    workingGroupId?: string;
    workBlockId?: string;
    catalogSource?: string;
    collaboratorCount: number;
    workingGroupActivityCount: number;
  };
};

export const CONCORDIA_PUBLICATION_ELIGIBILITY_PROMPT_RULES = `- Pentru tipurile de livrabil "Material publicat + link", "Articole pe concordia.ro" sau "articol publicat pe site", trateaza separat: (1) dovada publicarii/republicarii pe site-ul Concordia si (2) relevanta continutului pentru activitatea selectata.
- Un PDF salvat, tiparit sau exportat dintr-o pagina web constituie dovada de publicare pe concordia.ro chiar daca URL-ul nu este vizibil, atunci cand contine minimum doua indicii concordante precum: sigla/denumirea Confederația Patronală Concordia, meniul site-ului, categoria articolului, titlul, autorul, data, navigatia, footerul Concordia sau mentiuni institutionale specifice site-ului.
- Sigla, navigatia si footerul Concordia impreuna cu titlul si data sunt dovezi suficiente ca documentul reprezinta o pagina de pe site-ul Concordia. In acest caz nu include "dovada publicarii pe concordia.ro" in missingElements.
- Mentionarea faptului ca opinia sau articolul a fost publicat initial pe profit.ro, intr-un ziar sau pe o alta platforma NU infirma republicarea pe concordia.ro. Nu confunda sursa initiala a continutului cu pagina pe care este prezentat documentul incarcat.
- Lipsa unui URL vizibil poate conduce cel mult la "eligibil_cu_observatii", nu la "neeligibil", daca identitatea paginii Concordia este clara.
- Nu respinge un document pentru lipsa unui link separat daca documentul incarcat este chiar printul/exportul paginii publicate. Recomanda atasarea linkului numai ca masura suplimentara de trasabilitate.
- "neeligibil" trebuie folosit numai daca documentul nu este corelat cu activitatea, nu exista indicii credibile ca a fost publicat pe Concordia sau tipul de livrabil este in mod clar gresit.
- In summary, precizeaza separat: "Dovada publicarii pe Concordia: confirmata/neconfirmata" si "Relevanta pentru activitate: confirmata/neconfirmata".
- Exemplu: Un PDF cu sigla Concordia, meniul site-ului, categoria OPINII, data, titlul articolului si footerul Concordia este dovada de publicare pe concordia.ro, chiar daca introducerea spune ca opinia a fost publicata initial pe profit.ro.`;

function normalizeEligibilityText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isConcordiaPublishedDeliverableType(deliverableType: unknown) {
  const normalized = normalizeEligibilityText(deliverableType);
  return (
    normalized.includes('material publicat + link')
    || normalized.includes('articole pe concordia.ro')
    || (normalized.includes('articol') && normalized.includes('concordia.ro'))
    || normalized.includes('articol publicat pe site')
  );
}

export const MIN_ELIGIBILITY_TEXT_LENGTH = 80;

export function hasSufficientDeliverableEvidenceForEligibility(input: {
  extractedText?: unknown;
  firstPageText?: unknown;
  documentTitle?: unknown;
  titleConfirmed?: unknown;
  fileName?: unknown;
  fileType?: unknown;
  deliverableType?: unknown;
}) {
  const extractedText = String(input.extractedText || input.firstPageText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (extractedText.length >= MIN_ELIGIBILITY_TEXT_LENGTH) return true;

  const fileName = String(input.fileName || '').trim();
  const fileType = String(input.fileType || '').trim().toLowerCase();
  const isPdf = /\.pdf$/i.test(fileName) || fileType === 'application/pdf';
  const hasConfirmedTitle = Boolean(input.titleConfirmed && String(input.documentTitle || '').trim());

  return isPdf && hasConfirmedTitle && isConcordiaPublishedDeliverableType(input.deliverableType);
}

export function getConcordiaPublicationEvidence(input: {
  documentTitle?: unknown;
  fileName?: unknown;
  extractedText?: unknown;
}) {
  const title = normalizeEligibilityText(input.documentTitle);
  const text = normalizeEligibilityText([
    input.documentTitle,
    input.fileName,
    input.extractedText,
  ].filter(Boolean).join('\n'));
  const navMatches = ['despre', 'dialog social', 'programe', 'activitate', 'aderare']
    .filter((item) => text.includes(item));
  const evidence: string[] = [];

  if (text.includes('concordia.ro')) evidence.push('URL/domeniu concordia.ro');
  if (
    text.includes('confederatia patronala concordia')
    || text.includes('patronala concordia')
    || /\bconcordia\b/.test(text)
  ) {
    evidence.push('sigla/denumirea Concordia');
  }
  if (navMatches.length >= 2) evidence.push('navigatia site-ului Concordia');
  if (/\bopinii\b|\barticole\b|\bcomunicate\b|\bnews\b/.test(text)) evidence.push('categoria articolului');
  if (title.length >= 12 && text.includes(title)) evidence.push('titlul articolului');
  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{1,2}\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+\d{4}\b/.test(text)) {
    evidence.push('data publicarii');
  }
  if (/\bautor\b|\bde\s+[a-z]+(?:\s+[a-z]+){1,3}\b|\bdaniel apostol\b/.test(text)) evidence.push('autorul');
  if (/\bfooter\b|\bproiect\b|\buniunea europeana\b|\bfinantat\b|\bcontact\b|\bprivacy\b/.test(text)) {
    evidence.push('footerul sau mentiuni institutionale Concordia');
  }

  return Array.from(new Set(evidence));
}

function textMentionsMissingConcordiaPublication(value: unknown) {
  const normalized = normalizeEligibilityText(value);
  return (
    /dovad[aă]?\s+(de\s+)?public/.test(normalized)
    || normalized.includes('publicarii pe concordia')
    || normalized.includes('publicare pe concordia')
    || normalized.includes('concordia.ro')
    || normalized.includes('url')
    || normalized.includes('link')
  );
}

function textMentionsActivityMismatch(value: unknown) {
  const normalized = normalizeEligibilityText(value);
  return (
    normalized.includes('nu este corelat')
    || normalized.includes('nu se potriveste cu activitatea')
    || normalized.includes('nu este relevant')
    || normalized.includes('nerelevant')
    || normalized.includes('activitate gresita')
    || normalized.includes('tip de livrabil gresit')
  );
}

export function protectConcordiaPublicationEligibility(input: {
  result: z.infer<typeof deliverableEligibilitySchema>;
  deliverableType?: unknown;
  documentTitle?: unknown;
  fileName?: unknown;
  extractedText?: unknown;
}) {
  if (!isConcordiaPublishedDeliverableType(input.deliverableType)) return input.result;

  const evidence = getConcordiaPublicationEvidence(input);
  if (evidence.length < 2) return input.result;

  const missingElements = input.result.missingElements.filter((item) => !textMentionsMissingConcordiaPublication(item));
  const publicationWasMissing = missingElements.length !== input.result.missingElements.length;
  const combinedReasons = [
    input.result.summary,
    ...input.result.missingElements,
    ...input.result.riskFlags,
  ].join('\n');
  const onlyPublicationGap = textMentionsMissingConcordiaPublication(combinedReasons)
    && !textMentionsActivityMismatch(combinedReasons);

  if (!publicationWasMissing && !(input.result.status === 'neeligibil' && onlyPublicationGap)) {
    return input.result;
  }

  const status = input.result.status === 'neeligibil' && onlyPublicationGap
    ? 'eligibil_cu_observatii' as const
    : input.result.status;
  const recommendations = input.result.recommendations.length > 0
    ? input.result.recommendations
    : ['Ataseaza linkul exact doar ca masura suplimentara de trasabilitate, daca este disponibil.'];

  return {
    ...input.result,
    status,
    score: status === 'eligibil_cu_observatii' ? Math.max(input.result.score, 70) : input.result.score,
    summary: [
      'Dovada publicarii pe Concordia: confirmata.',
      status === 'eligibil_cu_observatii'
        ? 'Relevanta pentru activitate: confirmata conform analizei AI.'
        : null,
      input.result.summary,
    ].filter(Boolean).join(' '),
    missingElements,
    recommendations,
  };
}

export function normalizeDeliverableEligibilityStringList(value: unknown, maxItems = 80) {
  const parsed = z.array(z.string()).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

export function normalizeDeliverableEligibilityActivityCandidates(value: unknown) {
  const parsed = z.array(deliverableEligibilityActivityCandidateSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.slice(0, 80);
}

export function normalizeDeliverableEligibilityDocuments(input: {
  deliverables?: unknown;
  primaryDeliverableId?: unknown;
  activityGroupId?: unknown;
  workBlockId?: unknown;
  documentTitle?: unknown;
  fileName?: unknown;
  extractedText?: unknown;
  deliverableType?: unknown;
  textScope?: unknown;
}) {
  const parsed = z.array(deliverableEligibilityDocumentSchema).safeParse(input.deliverables);
  const requestedActivityGroupId = String(input.activityGroupId || '').trim();
  const requestedWorkBlockId = String(input.workBlockId || '').trim();
  const primaryDeliverableId = String(input.primaryDeliverableId || '').trim();
  const sourceDocuments = parsed.success && parsed.data.length > 0
    ? parsed.data
    : [{
        documentTitle: String(input.documentTitle || ''),
        fileName: String(input.fileName || ''),
        extractedText: String(input.extractedText || ''),
        deliverableType: String(input.deliverableType || ''),
        textScope: String(input.textScope || ''),
        isPrimary: true,
      }];

  return sourceDocuments
    .filter((deliverable) => {
      if (requestedActivityGroupId) return deliverable.activityGroupId === requestedActivityGroupId;
      if (requestedWorkBlockId) return deliverable.workBlockId === requestedWorkBlockId;
      return true;
    })
    .map((deliverable) => ({
      ...deliverable,
      documentTitle: String(deliverable.documentTitle || '').trim(),
      fileName: String(deliverable.fileName || '').trim(),
      extractedText: String(deliverable.extractedText || '').slice(0, 12000),
      deliverableType: String(deliverable.deliverableType || '').trim(),
      textScope: String(deliverable.textScope || '').trim(),
      isPrimary: Boolean(
        (primaryDeliverableId && deliverable.id === primaryDeliverableId)
        || (!primaryDeliverableId && deliverable.isPrimary)
      ),
    }))
    .filter((deliverable) => (
      deliverable.extractedText.trim()
      || deliverable.documentTitle
      || deliverable.fileName
    ))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .slice(0, 8);
}

function hasTextEvidence(value: unknown, patterns: RegExp[]) {
  const normalized = normalizeEligibilityText(value);
  return patterns.some((pattern) => pattern.test(normalized));
}

function criterion(
  score: number,
  maxScore: number,
  status: EligibilityCheckStatus,
  evidence: string[],
): EligibilityRubricCriterion {
  return {
    score: Math.max(0, Math.min(maxScore, Math.round(score))),
    maxScore,
    status,
    evidence: evidence.filter(Boolean),
  };
}

function statusBaseScore(status: EligibilityStatus) {
  switch (status) {
    case 'eligibil':
      return 90;
    case 'eligibil_cu_observatii':
      return 75;
    case 'neeligibil':
      return 35;
    case 'neconcludent':
    default:
      return 20;
  }
}

function scoreFromChecks(
  result: EligibilityResult,
  patterns: RegExp[],
  maxScore: number,
  defaultScore: number,
) {
  const relevantChecks = result.checks.filter((check) => hasTextEvidence(check.criterion, patterns));
  if (relevantChecks.length === 0) return defaultScore;
  if (relevantChecks.some((check) => check.status === 'fail')) return Math.min(defaultScore, Math.round(maxScore * 0.25));
  if (relevantChecks.some((check) => check.status === 'warning' || check.status === 'unknown')) {
    return Math.min(defaultScore, Math.round(maxScore * 0.65));
  }
  return maxScore;
}

export function buildDeliverableEligibilitySemanticAudit(input: {
  result: EligibilityResult;
  documents: EligibilityDocument[];
  ruleVersionId?: string;
  selectedActivityId?: unknown;
  selectedActivityName?: unknown;
  saCode?: unknown;
  deliverableType?: unknown;
  catalogDescription?: unknown;
  catalogObjectives?: unknown;
  catalogBeneficiaries?: unknown;
  catalogExpectedResults?: unknown;
  catalogDeliverables?: unknown;
  catalogIndicators?: unknown;
  expertId?: unknown;
  expertCategory?: unknown;
  expertFunction?: unknown;
  expertProjectRole?: unknown;
  projectCode?: unknown;
  activityGroupId?: unknown;
  periodGroupId?: unknown;
  workingGroupId?: unknown;
  workBlockId?: unknown;
  catalogSource?: unknown;
  collaborators?: unknown;
  workingGroupActivities?: unknown;
  fallbackFlags?: string[];
}): EligibilitySemanticAudit {
  const documents = input.documents;
  const combinedText = documents.map((document) => [
    document.documentTitle,
    document.fileName,
    document.deliverableType,
    document.extractedText,
  ].filter(Boolean).join('\n')).join('\n\n');
  const normalizedResultText = normalizeEligibilityText([
    input.result.summary,
    ...input.result.missingElements,
    ...input.result.riskFlags,
    ...input.result.recommendations,
  ].join('\n'));
  const documentsWithText = documents.filter((document) => String(document.extractedText || '').trim().length >= MIN_ELIGIBILITY_TEXT_LENGTH);
  const hasSuggestedActivityChange = input.result.suggestedSettings?.changes.includes('activity') ?? false;
  const hasSuggestedDeliverableTypeChange = input.result.suggestedSettings?.changes.includes('deliverableType') ?? false;
  const hasActivityMismatch = textMentionsActivityMismatch(normalizedResultText);
  const hasMinimumEvidenceGap = hasTextEvidence(normalizedResultText, [
    /lips[a]?\s+dove/,
    /dovezi\s+insuficiente/,
    /text\s+insuficient/,
    /nu\s+poate\s+fi\s+analizat/,
  ]);
  const hasBeneficiaryEvidence = hasTextEvidence([combinedText, input.result.summary].join('\n'), [
    /beneficiar/,
    /grup\s+tinta/,
    /participant/,
    /organizatie/,
    /membru/,
  ]);
  const hasExpectedResultEvidence = !hasTextEvidence(normalizedResultText, [
    /rezultat.*lips/,
    /livrabil.*lips/,
    /nu.*rezultat/,
  ]);
  const hasDate = hasTextEvidence(combinedText, [
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\b/,
  ]);
  const hasAuthor = hasTextEvidence(combinedText, [/\bautor\b/, /\bde\s+[a-z]+(?:\s+[a-z]+){1,3}\b/]);
  const hasLink = hasTextEvidence(combinedText, [/https?:\/\//, /\bwww\./, /\.ro\b/, /\blink\b/, /\burl\b/]);
  const duplicateDocuments = documents.filter((document) => document.duplicateStatus);
  const collaborators = Array.isArray(input.collaborators) ? input.collaborators : [];
  const workingGroupActivities = Array.isArray(input.workingGroupActivities) ? input.workingGroupActivities : [];

  const rubricScores = {
    activityMatch: criterion(
      hasSuggestedActivityChange || hasActivityMismatch
        ? 6
        : scoreFromChecks(input.result, [/activitate/, /subactivitate/, /catalog/], 20, input.selectedActivityName ? 18 : 12),
      20,
      hasSuggestedActivityChange || hasActivityMismatch ? 'warning' : 'pass',
      [
        input.selectedActivityName ? `Activitate selectata: ${String(input.selectedActivityName)}` : '',
        input.saCode ? `SA: ${String(input.saCode)}` : '',
      ],
    ),
    deliverableTypeMatch: criterion(
      hasSuggestedDeliverableTypeChange
        ? 5
        : scoreFromChecks(input.result, [/tip/, /livrabil/, /format/], 15, input.deliverableType ? 13 : 8),
      15,
      hasSuggestedDeliverableTypeChange ? 'warning' : 'pass',
      [input.deliverableType ? `Tip livrabil: ${String(input.deliverableType)}` : 'Tip livrabil nespecificat'],
    ),
    minimumEvidence: criterion(
      documentsWithText.length > 0 && !hasMinimumEvidenceGap ? 20 : documentsWithText.length > 0 ? 13 : 4,
      20,
      documentsWithText.length > 0 && !hasMinimumEvidenceGap ? 'pass' : 'warning',
      [`Documente cu text suficient: ${documentsWithText.length}/${documents.length}`],
    ),
    beneficiaryTargetGroup: criterion(
      input.catalogBeneficiaries
        ? (hasBeneficiaryEvidence ? 10 : 6)
        : (hasBeneficiaryEvidence ? 8 : 5),
      10,
      hasBeneficiaryEvidence ? 'pass' : 'unknown',
      [
        input.catalogBeneficiaries ? 'Catalogul include beneficiari.' : '',
        hasBeneficiaryEvidence ? 'Textul sau analiza mentioneaza beneficiar/grup tinta.' : '',
      ],
    ),
    expectedResult: criterion(
      hasExpectedResultEvidence ? 10 : 4,
      10,
      hasExpectedResultEvidence ? 'pass' : 'warning',
      [
        input.catalogExpectedResults ? 'Catalogul include rezultate asteptate.' : '',
        input.catalogDeliverables ? 'Catalogul include livrabile asteptate.' : '',
      ],
    ),
    formatEvidence: criterion(
      documents.some((document) => /\.[a-z0-9]{2,5}$/i.test(document.fileName || '')) ? 8 : 5,
      10,
      documents.some((document) => document.fileName) ? 'pass' : 'unknown',
      documents.map((document) => document.fileName || document.documentTitle || document.id || '').filter(Boolean).slice(0, 4),
    ),
    dateAuthorLink: criterion(
      [hasDate, hasAuthor, hasLink].filter(Boolean).length >= 2
        ? 10
        : [hasDate, hasAuthor, hasLink].filter(Boolean).length === 1 ? 7 : 4,
      10,
      [hasDate, hasAuthor, hasLink].filter(Boolean).length >= 2 ? 'pass' : 'warning',
      [
        hasDate ? 'Data identificata.' : '',
        hasAuthor ? 'Autor identificat.' : '',
        hasLink ? 'Link/URL/domeniu identificat.' : '',
      ],
    ),
    duplicateRisk: criterion(
      duplicateDocuments.length > 0 ? 2 : 5,
      5,
      duplicateDocuments.length > 0 ? 'warning' : 'pass',
      duplicateDocuments.map((document) => `${document.fileName || document.documentTitle || document.id}: ${document.duplicateStatus}`),
    ),
  } satisfies Record<string, EligibilityRubricCriterion>;

  const rubricScore = Object.values(rubricScores).reduce((sum, item) => sum + item.score, 0);
  const statusFloor = statusBaseScore(input.result.status);
  const normalizedScore = Math.round((rubricScore * 0.7) + (Math.min(input.result.score, statusFloor) * 0.3));
  const appliedRules = [
    'technical-fixed-json-output',
    'default-general-eligibility',
    documents.length > 1 ? 'multi-deliverable-group-context' : '',
    isConcordiaPublishedDeliverableType(input.deliverableType) ? 'concordia-publication-default' : '',
  ].filter(Boolean);
  const evidenceUsed = [
    `${documents.length} document(e) analizate`,
    `${documentsWithText.length} document(e) cu text suficient`,
    hasDate ? 'data' : '',
    hasAuthor ? 'autor' : '',
    hasLink ? 'link/url/domeniu' : '',
    input.catalogDescription ? 'descriere catalog' : '',
    input.catalogObjectives ? 'obiective catalog' : '',
    input.catalogBeneficiaries ? 'beneficiari catalog' : '',
    input.catalogExpectedResults ? 'rezultate asteptate catalog' : '',
    input.catalogIndicators ? 'indicatori catalog' : '',
  ].filter(Boolean);

  return {
    ruleVersionId: String(input.ruleVersionId || DEFAULT_ELIGIBILITY_RULE_VERSION_ID),
    appliedRules,
    evidenceUsed,
    documentsRead: documents.map((document) => ({
      id: document.id,
      documentTitle: document.documentTitle,
      fileName: document.fileName,
      deliverableType: document.deliverableType,
      isPrimary: document.isPrimary,
      textScope: document.textScope,
      extractedTextLength: String(document.extractedText || '').trim().length,
      duplicateStatus: document.duplicateStatus,
      possibleDuplicateOfDocumentId: document.possibleDuplicateOfDocumentId,
    })),
    rubricScores,
    aiScore: input.result.score,
    rubricScore,
    normalizedScore: Math.max(0, Math.min(100, normalizedScore)),
    fallbackFlags: input.fallbackFlags || [],
    categoryContextUsed: {
      expertId: String(input.expertId || '') || undefined,
      expertCategory: String(input.expertCategory || '') || undefined,
      expertFunction: String(input.expertFunction || '') || undefined,
      expertProjectRole: String(input.expertProjectRole || '') || undefined,
      projectCode: String(input.projectCode || '') || undefined,
      selectedActivityId: String(input.selectedActivityId || '') || undefined,
      selectedActivityName: String(input.selectedActivityName || '') || undefined,
      saCode: String(input.saCode || '') || undefined,
      activityGroupId: String(input.activityGroupId || '') || undefined,
      periodGroupId: String(input.periodGroupId || '') || undefined,
      workingGroupId: String(input.workingGroupId || '') || undefined,
      workBlockId: String(input.workBlockId || '') || undefined,
      catalogSource: String(input.catalogSource || '') || undefined,
      collaboratorCount: collaborators.length,
      workingGroupActivityCount: workingGroupActivities.length,
    },
  };
}

export function validateEligibilitySuggestedSettings(input: {
  suggestedSettings: z.infer<typeof deliverableEligibilitySchema>['suggestedSettings'];
  activityCatalogCandidates: Array<z.infer<typeof deliverableEligibilityActivityCandidateSchema>>;
  deliverableOptions: string[];
  currentSaCode?: string;
  currentActivityName?: string;
  currentDeliverableType?: string;
}) {
  const suggestion = input.suggestedSettings;
  if (!suggestion) return undefined;

  const requestedChanges = new Set(suggestion.changes);
  const output: NonNullable<z.infer<typeof deliverableEligibilitySchema>['suggestedSettings']> = {
    saCode: null,
    activityName: null,
    selectedActivityId: null,
    deliverableType: null,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    changes: [],
  };

  if (requestedChanges.has('activity')) {
    const activityMatch = input.activityCatalogCandidates.find((candidate) => (
      (suggestion.selectedActivityId && candidate.id === suggestion.selectedActivityId)
      || (
        candidate.saCode === suggestion.saCode
        && candidate.activityName === suggestion.activityName
      )
    ));
    const isDifferentActivity = activityMatch
      && (
        activityMatch.saCode !== input.currentSaCode
        || activityMatch.activityName !== input.currentActivityName
      );

    if (activityMatch && isDifferentActivity) {
      output.selectedActivityId = activityMatch.id;
      output.saCode = activityMatch.saCode;
      output.activityName = activityMatch.activityName;
      output.changes.push('activity');
    }
  }

  if (requestedChanges.has('deliverableType') && suggestion.deliverableType) {
    const deliverableTypeMatch = input.deliverableOptions.find((option) => option === suggestion.deliverableType);
    if (deliverableTypeMatch && deliverableTypeMatch !== input.currentDeliverableType) {
      output.deliverableType = deliverableTypeMatch;
      output.changes.push('deliverableType');
    }
  }

  return output.changes.length > 0 ? output : undefined;
}

export function normalizeDeliverableEligibilityAiOutput(
  output: z.infer<typeof deliverableEligibilityAiSchema>,
): z.infer<typeof deliverableEligibilitySchema> {
  return {
    ...output,
    suggestedSettings: output.suggestedSettings.hasSuggestion
      ? {
          saCode: output.suggestedSettings.saCode || null,
          activityName: output.suggestedSettings.activityName || null,
          selectedActivityId: output.suggestedSettings.selectedActivityId || null,
          deliverableType: output.suggestedSettings.deliverableType || null,
          confidence: output.suggestedSettings.confidence,
          reason: output.suggestedSettings.reason,
          changes: output.suggestedSettings.changes,
        }
      : null,
  };
}

export function buildNonConclusiveAiFailure(reason: string) {
  return {
    status: 'neconcludent' as const,
    score: 0,
    summary: 'Verificarea AI nu a putut fi finalizata automat. Reincearca verificarea sau valideaza manual livrabilul.',
    checks: [
      {
        criterion: 'Verificare AI',
        status: 'unknown' as const,
        explanation: reason,
      },
    ],
    missingElements: [],
    recommendations: ['Reincearca verificarea eligibilitatii dupa cateva momente sau valideaza manual livrabilul.'],
    riskFlags: [`Verificarea AI a esuat: ${reason}`],
    suggestedSettings: null,
  };
}
