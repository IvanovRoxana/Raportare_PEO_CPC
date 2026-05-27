import { LEARNING_HUB_COURSE_PROFILES } from './courses.ts';
import { finalizeExpertCourseMapping } from './experience.ts';
import { calculateScoring, rankScoringResults } from './scoring.ts';
import type { ExpertCourseMapping, ProcurementEvaluationSnapshot } from './types.ts';
import { hasBlockingValidationPass, validateClassifiedDocuments, validateExpertCoverage, validateFinancialOffer } from './validation.ts';

export function createLearningHubEvaluationSeed(procurementProjectId: string): ProcurementEvaluationSnapshot {
  const supplierId = 'supplier-demo-learning-hub';
  const supplierName = 'Ofertant demonstrativ Learning Hub';
  const offerPackage = {
    id: 'pkg-demo-learning-hub',
    procurementProjectId,
    supplierId,
    supplierName,
    originalRootName: 'dosar-oferta-demo',
    importedAt: new Date('2026-05-27T09:00:00.000Z').toISOString(),
    documentCount: 0,
    status: 'Review' as const,
    notes: 'Set demonstrativ pentru verificarea fluxului.',
  };
  const experts = [
    { id: 'expert-coord-1', supplierId, supplierName, expertName: 'Coordonator propus', role: 'COORDONATOR' as const, notes: 'Anii dovediți se completează după documentele suport.' },
    ...LEARNING_HUB_COURSE_PROFILES.map((course, index) => ({
      id: `expert-formator-${course.courseId.toLowerCase()}`,
      supplierId,
      supplierName,
      expertName: `Formator ${index + 1}`,
      role: 'FORMATOR' as const,
      notes: course.courseName,
    })),
  ];
  const mappings: ExpertCourseMapping[] = [
    finalizeExpertCourseMapping({
      id: 'mapping-coord',
      supplierId,
      supplierName,
      expertId: 'expert-coord-1',
      expertName: 'Coordonator propus',
      role: 'COORDONATOR',
      courseId: 'COORD',
      courseName: 'Coordonare proiect formare',
      courseKeywords: ['management de proiect', 'formare profesională', 'organizare cursuri'],
      yearsClaimedF6: 10,
      yearsClaimedCv: 9,
      yearsProvenGeneral: 8,
      yearsOnlineClaimed: 4,
      yearsOnlineProven: 3,
      supportDocumentIds: [],
      cvMatchesEvidence: 'Review',
      f6MatchesEvidence: 'Review',
      courseRelevance: 'review',
      keywordMatchScore: 0.45,
      declaredVsProvenGap: 2,
      eligibilityDecision: 'Review',
      selectedForScoring: false,
      confidence: 0.62,
      reviewerNotes: 'Necesită încărcarea dovezilor de coordonare.',
    }),
    ...LEARNING_HUB_COURSE_PROFILES.map((course, index) =>
      finalizeExpertCourseMapping({
        id: `mapping-${course.courseId.toLowerCase()}`,
        supplierId,
        supplierName,
        expertId: `expert-formator-${course.courseId.toLowerCase()}`,
        expertName: `Formator ${index + 1}`,
        role: 'FORMATOR',
        courseId: course.courseId,
        courseName: course.courseName,
        courseKeywords: course.coreKeywords,
        yearsClaimedF6: 6,
        yearsClaimedCv: 6,
        yearsProvenGeneral: index < 4 ? 5.5 : 2.5,
        yearsOnlineClaimed: 2,
        yearsOnlineProven: index < 4 ? 1.5 : 0.5,
        supportDocumentIds: [],
        cvMatchesEvidence: 'Review',
        f6MatchesEvidence: 'Review',
        courseRelevance: index < 4 ? 'medie' : 'review',
        keywordMatchScore: index < 4 ? 0.33 : 0.14,
        declaredVsProvenGap: 0,
        eligibilityDecision: 'Review',
        selectedForScoring: index < 4,
        confidence: index < 4 ? 0.7 : 0.48,
        reviewerNotes: 'Date demonstrative; scoringul final cere dovezi.',
      }),
    ),
  ];
  const financialOffers = [
    {
      supplierId,
      supplierName,
      currency: 'RON',
      totalPriceExVat: 1_394_786.78,
      vat: 292_905.22,
      totalPriceWithVat: 1_687_692,
      offerValidityDays: 90,
      priceFirm: true,
      form12Present: false,
      annexPresent: false,
      totalsMatch: false,
      status: 'Review' as const,
    },
  ];
  const validationResults = [
    ...validateClassifiedDocuments([]),
    ...validateExpertCoverage(mappings),
    ...validateFinancialOffer(financialOffers[0]),
  ];
  const blockingValidationPass = hasBlockingValidationPass(validationResults);
  const scoringResults = rankScoringResults([
    calculateScoring({
      supplierId,
      supplierName,
      blockingValidationPass,
      coordinatorYearsProven: 8,
      coordinatorDocumentsConform: false,
      mappings,
      financialOffer: financialOffers[0],
      minimumAdmissiblePrice: 1_394_786.78,
    }),
  ]);

  return {
    package: offerPackage,
    documents: [],
    classifications: [],
    extractedFields: [],
    experts,
    expertCourseMappings: mappings,
    similarExperience: [],
    financialOffers,
    validationResults,
    scoringResults,
  };
}
