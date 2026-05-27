import { LEARNING_HUB_COURSE_PROFILES } from './courses.ts';
import { assessCourseRelevance, calculateOnlineYearsFromIntervals, calculateYearsFromIntervals, finalizeExpertCourseMapping } from './experience.ts';
import type { DocumentClassification, ExpertCourseMapping, FinancialOffer, OfferPackageDocumentInput, ProcurementExpert, StandardDocumentType } from './types.ts';
import { normalizeEvaluationText } from './utils.ts';

const EVIDENCE_TYPES: StandardDocumentType[] = ['RECOMANDARE', 'ADEVERINTA', 'CONTRACT_SIMILAR', 'PROCES_VERBAL_RECEPTIE'];

function titleCaseFromFilename(filename: string) {
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\b(cv|curriculum|vitae|formular|nr|recomandare|adeverinta|contract|diploma|certificat|formator)\b/gi, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractNameFromText(text: string, fallback: string) {
  const explicit = text.match(/(?:nume(?:le)?\s*(?:expertului)?|expert)\s*[:\-]\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț' -]{5,80})/);
  if (explicit?.[1]) return explicit[1].replace(/\s+/g, ' ').trim();
  const candidate = text.match(/\b([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})\b/);
  return candidate?.[1] ?? fallback;
}

function extractYears(text: string) {
  const normalized = normalizeEvaluationText(text);
  const matches = [...normalized.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:ani|an)\b/g)].map((match) => Number(match[1].replace(',', '.')));
  return matches.length ? Math.max(...matches) : undefined;
}

function intervalsFromText(text: string, sourceDocumentId: string) {
  const intervals = [...text.matchAll(/(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4})\s*(?:-|–|—|pana la|până la)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4})/gi)].map((match) => {
    const normalizeDate = (value: string) => {
      if (/^\d{4}$/.test(value)) return `${value}-01-01`;
      const [day, month, year] = value.split(/[./-]/);
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    };
    return {
      startDate: normalizeDate(match[1]),
      endDate: /^\d{4}$/.test(match[2]) ? `${match[2]}-12-31` : normalizeDate(match[2]),
      sourceDocumentId,
      onlineDelivery: /online|e-learning|webinar|virtual|platforma|platformă/i.test(text),
    };
  });
  return intervals;
}

function docTypeFor(documentId: string, classifications: DocumentClassification[]) {
  return classifications.find((classification) => classification.documentId === documentId)?.docType ?? 'NECLASIFICAT';
}

export function deriveExpertsFromDocuments(documents: OfferPackageDocumentInput[], classifications: DocumentClassification[]) {
  const cvDocs = documents.filter((document) => docTypeFor(document.id, classifications) === 'CV');
  const form6 = documents.find((document) => docTypeFor(document.id, classifications) === 'FORMULAR_6');
  const evidenceDocs = documents.filter((document) => EVIDENCE_TYPES.includes(docTypeFor(document.id, classifications)));
  const expertDocs = cvDocs.length ? cvDocs : documents.filter((document) => /cv|expert|formator|coordonator/i.test(document.originalPath));

  const experts: ProcurementExpert[] = expertDocs.map((document, index) => {
    const expertName = extractNameFromText(document.extractedText ?? '', titleCaseFromFilename(document.normalizedFilename) || `Expert ${index + 1}`);
    const role = /coordonator/i.test(`${document.originalPath} ${document.extractedText ?? ''}`) ? 'COORDONATOR' : 'FORMATOR';
    return {
      id: `expert-${index + 1}-${expertName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      supplierId: document.supplierId,
      supplierName: document.supplierName,
      expertName,
      role,
      cvDocumentId: document.id,
      diplomaDocumentId: documents.find((item) => docTypeFor(item.id, classifications) === 'DIPLOMA' && normalizeEvaluationText(item.originalPath).includes(normalizeEvaluationText(expertName.split(' ')[0])))?.id,
      trainerCertificateDocumentId: documents.find((item) => docTypeFor(item.id, classifications) === 'CERTIFICAT_FORMATOR' && normalizeEvaluationText(item.originalPath).includes(normalizeEvaluationText(expertName.split(' ')[0])))?.id,
      availabilityDocumentId: documents.find((item) => docTypeFor(item.id, classifications) === 'FORMULAR_7' && normalizeEvaluationText(item.extractedText).includes(normalizeEvaluationText(expertName)))?.id,
    };
  });

  const fallbackSupplier = documents[0];
  if (!experts.length && fallbackSupplier) {
    experts.push({
      id: `expert-review-${fallbackSupplier.supplierId}`,
      supplierId: fallbackSupplier.supplierId,
      supplierName: fallbackSupplier.supplierName,
      expertName: 'Expert de identificat din Formularul 6',
      role: 'FORMATOR',
      notes: 'Nu s-a putut extrage automat numele expertului; necesită review.',
    });
  }

  const mappings: ExpertCourseMapping[] = experts.flatMap((expert) => {
    const expertText = documents
      .filter((document) => document.id === expert.cvDocumentId || normalizeEvaluationText(document.extractedText).includes(normalizeEvaluationText(expert.expertName)))
      .map((document) => document.extractedText ?? '')
      .join('\n');
    const evidenceText = evidenceDocs.map((document) => document.extractedText ?? '').join('\n');
    const supportDocumentIds = evidenceDocs.map((document) => document.id);
    const intervals = evidenceDocs.flatMap((document) => intervalsFromText(document.extractedText ?? '', document.id));
    const yearsFromIntervals = calculateYearsFromIntervals(intervals);
    const yearsFromEvidenceText = evidenceDocs.map((document) => extractYears(document.extractedText ?? '') ?? 0).reduce((max, value) => Math.max(max, value), 0);
    const yearsProvenGeneral = Math.max(yearsFromIntervals, yearsFromEvidenceText);
    const yearsOnlineProven = Math.max(calculateOnlineYearsFromIntervals(intervals), /online|e-learning|webinar|virtual|platforma|platformă/i.test(evidenceText) ? Math.min(yearsProvenGeneral, 1) : 0);
    const yearsClaimedCv = extractYears(expertText);
    const yearsClaimedF6 = extractYears(form6?.extractedText ?? '');

    if (expert.role === 'COORDONATOR') {
      return [
        finalizeExpertCourseMapping({
          id: `mapping-${expert.id}-coord`,
          supplierId: expert.supplierId,
          supplierName: expert.supplierName,
          expertId: expert.id,
          expertName: expert.expertName,
          role: 'COORDONATOR',
          courseId: 'COORD',
          courseName: 'Coordonare proiect formare',
          courseKeywords: ['management de proiect', 'formare profesională', 'organizare cursuri'],
          yearsClaimedF6,
          yearsClaimedCv,
          yearsProvenGeneral,
          yearsOnlineProven,
          supportDocumentIds,
          cvMatchesEvidence: 'Neverificat',
          f6MatchesEvidence: 'Neverificat',
          courseRelevance: yearsProvenGeneral > 0 ? 'review' : 'scazuta',
          keywordMatchScore: 0,
          declaredVsProvenGap: 0,
          eligibilityDecision: 'Neverificat',
          selectedForScoring: false,
          confidence: yearsProvenGeneral > 0 ? 0.55 : 0.25,
        }),
      ];
    }

    return LEARNING_HUB_COURSE_PROFILES.map((course) => {
      const relevance = assessCourseRelevance({ profile: course, evidenceText, cvText: expertText });
      return finalizeExpertCourseMapping({
        id: `mapping-${expert.id}-${course.courseId.toLowerCase()}`,
        supplierId: expert.supplierId,
        supplierName: expert.supplierName,
        expertId: expert.id,
        expertName: expert.expertName,
        role: 'FORMATOR',
        courseId: course.courseId,
        courseName: course.courseName,
        courseKeywords: course.coreKeywords,
        yearsClaimedF6,
        yearsClaimedCv,
        yearsProvenGeneral,
        yearsOnlineProven,
        supportDocumentIds,
        cvMatchesEvidence: 'Neverificat',
        f6MatchesEvidence: 'Neverificat',
        courseRelevance: relevance.relevance,
        keywordMatchScore: relevance.keywordMatchScore,
        declaredVsProvenGap: 0,
        eligibilityDecision: 'Neverificat',
        selectedForScoring: relevance.relevance === 'ridicata' || relevance.relevance === 'medie',
        confidence: relevance.keywordMatchScore,
      });
    });
  });

  return { experts, mappings };
}

export function deriveFinancialOfferFromDocuments(documents: OfferPackageDocumentInput[], classifications: DocumentClassification[]): FinancialOffer | undefined {
  const supplier = documents[0];
  if (!supplier) return undefined;
  const financialDocs = documents.filter((document) => ['FORMULAR_12', 'FORMULAR_12_ANEXA', 'ANEXA_FINANCIARA', 'OFERTA_FINANCIARA'].includes(docTypeFor(document.id, classifications)));
  const joinedText = financialDocs.map((document) => document.extractedText ?? '').join('\n');
  const values = [...joinedText.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:ron|lei)/gi)]
    .map((match) => Number(match[1].replace(/[.\s]/g, '').replace(',', '.')))
    .filter((value) => Number.isFinite(value));
  const total = values.length ? Math.max(...values) : undefined;

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.supplierName,
    currency: 'RON',
    totalPriceExVat: total,
    form12Present: financialDocs.some((document) => docTypeFor(document.id, classifications) === 'FORMULAR_12'),
    annexPresent: financialDocs.some((document) => ['FORMULAR_12_ANEXA', 'ANEXA_FINANCIARA'].includes(docTypeFor(document.id, classifications))),
    totalsMatch: false,
    status: total ? 'Review' : 'Neconform',
  };
}
