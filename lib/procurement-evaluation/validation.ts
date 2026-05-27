import type { DocumentClassification, ExpertCourseMapping, FinancialOffer, OfferPackageDocumentInput, StandardDocumentType, ValidationResult } from './types.ts';

const REQUIRED_DOCUMENTS: Array<{ docType: StandardDocumentType; label: string }> = [
  { docType: 'OPIS', label: 'OPIS' },
  { docType: 'FORMULAR_1', label: 'Formular 1' },
  { docType: 'FORMULAR_1A', label: 'Formular 1A' },
  { docType: 'FORMULAR_2', label: 'Formular 2' },
  { docType: 'FORMULAR_3', label: 'Formular 3' },
  { docType: 'FORMULAR_4', label: 'Formular 4' },
  { docType: 'FORMULAR_5', label: 'Formular 5' },
  { docType: 'FORMULAR_6', label: 'Formular 6' },
  { docType: 'FORMULAR_7', label: 'Formular 7' },
  { docType: 'FORMULAR_8', label: 'Formular 8' },
  { docType: 'FORMULAR_9', label: 'Formular 9' },
  { docType: 'FORMULAR_10', label: 'Formular 10' },
  { docType: 'FORMULAR_11', label: 'Formular 11' },
  { docType: 'FORMULAR_12', label: 'Formular 12' },
  { docType: 'FORMULAR_12_ANEXA', label: 'Anexa financiară' },
  { docType: 'FORMULAR_13', label: 'Formular 13' },
];

function presentDocuments(classifications: DocumentClassification[]) {
  return new Set(classifications.filter((item) => item.docType !== 'NECLASIFICAT').map((item) => item.docType));
}

export function validateClassifiedDocuments(classifications: DocumentClassification[]): ValidationResult[] {
  const present = presentDocuments(classifications);
  const results: ValidationResult[] = REQUIRED_DOCUMENTS.map((required, index) => ({
    id: `validation-doc-${index + 1}`,
    ruleId: index === 0 ? 'V001' : 'V002',
    requirement: `Există ${required.label}`,
    severity: 'Blocant',
    status: present.has(required.docType) ? 'Conform' : 'Neconform',
    observedValue: present.has(required.docType) ? 'identificat' : 'lipsă',
    sourceDocumentIds: classifications.filter((item) => item.docType === required.docType).map((item) => item.documentId),
  }));

  const ambiguous = classifications.filter((item) => item.reviewRequired);
  if (ambiguous.length) {
    results.push({
      id: 'validation-doc-review',
      ruleId: 'V900',
      requirement: 'Documentele ambigue sunt revizuite manual',
      severity: 'Major',
      status: 'Review',
      observedValue: `${ambiguous.length} documente necesită review`,
      sourceDocumentIds: ambiguous.map((item) => item.documentId),
    });
  }

  return results;
}

export function validateExpertCoverage(mappings: ExpertCourseMapping[]): ValidationResult[] {
  const selectedConform = mappings.filter((mapping) => mapping.role === 'FORMATOR' && mapping.selectedForScoring && mapping.eligibilityDecision === 'Conform');
  const coveredCourses = new Set(selectedConform.map((mapping) => mapping.courseId));
  const coordinators = mappings.filter((mapping) => mapping.role === 'COORDONATOR' && mapping.eligibilityDecision === 'Conform');

  return [
    {
      id: 'validation-exp-001',
      ruleId: 'V030',
      requirement: 'Minimum 1 coordonator conform',
      severity: 'Blocant' as const,
      status: coordinators.length >= 1 ? 'Conform' : 'Neconform',
      observedValue: String(coordinators.length),
      sourceDocumentIds: coordinators.flatMap((mapping) => mapping.supportDocumentIds),
    },
    {
      id: 'validation-exp-002',
      ruleId: 'V031',
      requirement: 'Minimum 8 formatori conformi, câte unul pentru fiecare curs',
      severity: 'Blocant' as const,
      status: selectedConform.length >= 8 && coveredCourses.size >= 8 ? 'Conform' : 'Review',
      observedValue: `${selectedConform.length} formatori / ${coveredCourses.size} cursuri`,
      sourceDocumentIds: selectedConform.flatMap((mapping) => mapping.supportDocumentIds),
    },
  ];
}

export function validateFinancialOffer(offer: FinancialOffer | undefined): ValidationResult[] {
  if (!offer) {
    return [
      {
        id: 'validation-fin-001',
        ruleId: 'V040',
        requirement: 'Oferta financiară este prezentă și completă',
        severity: 'Blocant' as const,
        status: 'Neconform',
        observedValue: 'lipsește',
        sourceDocumentIds: [],
      },
    ];
  }

  return [
    {
      id: 'validation-fin-001',
      ruleId: 'V040',
      requirement: 'Oferta financiară este prezentă și completă',
      severity: 'Blocant' as const,
      status: offer.form12Present && offer.annexPresent ? 'Conform' : 'Neconform',
      observedValue: `Formular 12: ${offer.form12Present ? 'Da' : 'Nu'}; Anexă: ${offer.annexPresent ? 'Da' : 'Nu'}`,
      sourceDocumentIds: [],
    },
    {
      id: 'validation-fin-002',
      ruleId: 'V041',
      requirement: 'Total Formular 12 = total anexă financiară',
      severity: 'Blocant' as const,
      status: offer.totalsMatch ? 'Conform' : 'Review',
      observedValue: offer.totalsMatch ? 'totaluri egale' : 'necesită verificare',
      sourceDocumentIds: [],
    },
  ];
}

export function validateDocumentSignatures(documents: OfferPackageDocumentInput[]): ValidationResult[] {
  if (!documents.length) return [];
  const unsigned = documents.filter((document) => !document.signaturePresent);
  const notQualified = documents.filter((document) => document.signaturePresent && document.qualifiedSignatureStatus !== 'valid');

  return [
    {
      id: 'validation-sign-001',
      ruleId: 'V003',
      requirement: 'Toate documentele au semnătură electronică integrată',
      severity: 'Blocant',
      status: unsigned.length === 0 ? 'Conform' : 'Review',
      observedValue: unsigned.length ? `${unsigned.length} documente fără markeri locali de semnătură` : 'semnături detectate local',
      sourceDocumentIds: unsigned.map((document) => document.id),
      reviewerNotes: 'Detectarea locală nu înlocuiește validarea juridică a certificatului calificat.',
    },
    {
      id: 'validation-sign-002',
      ruleId: 'V003Q',
      requirement: 'Semnăturile electronice sunt validate calificat prin provider configurat',
      severity: 'Blocant',
      status: notQualified.length === 0 ? 'Conform' : 'Review',
      observedValue: notQualified.length ? `${notQualified.length} semnături necesită validare calificată/review` : 'validare calificată confirmată',
      sourceDocumentIds: notQualified.map((document) => document.id),
      reviewerNotes: 'Statusul Conform se acordă doar când providerul extern returnează valid.',
    },
  ];
}

export function hasBlockingValidationPass(results: ValidationResult[]) {
  return results.every((result) => result.severity !== 'Blocant' || result.status === 'Conform');
}
