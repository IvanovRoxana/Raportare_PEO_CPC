import type { ExpertCourseMapping, FinancialOffer, ScoringResult } from './types.ts';
import { roundScore } from './utils.ts';

export function scoreCoordinatorYears(yearsProven: number, documentsConform = true) {
  if (!documentsConform) return 0;
  if (yearsProven >= 10) return 10;
  if (yearsProven > 7) return 5;
  if (yearsProven > 5) return 3;
  if (yearsProven > 3) return 1;
  return 0;
}

export function scoreTrainerYears(yearsProven: number, options?: { bonusDialogSocial?: boolean; bonusCollectiveNegotiation?: boolean; documentsConform?: boolean }) {
  if (options?.documentsConform === false) return 0;
  const base = yearsProven > 7 ? 7 : yearsProven > 5 ? 3 : yearsProven > 3 ? 1 : 0;
  const bonus = (options?.bonusDialogSocial ? 0.25 : 0) + (options?.bonusCollectiveNegotiation ? 0.25 : 0);
  return Math.min(7.5, roundScore(base + bonus, 2));
}

export function scoreOnlineYears(yearsOnlineProven: number, documentsConform = true) {
  if (!documentsConform) return 0;
  if (yearsOnlineProven > 5) return 1.25;
  if (yearsOnlineProven > 3) return 0.625;
  if (yearsOnlineProven > 1) return 0.375;
  return 0;
}

export function calculatePriceScore(priceExVat: number | undefined, minimumAdmissiblePrice: number | undefined) {
  if (!priceExVat || !minimumAdmissiblePrice || priceExVat <= 0 || minimumAdmissiblePrice <= 0) return 0;
  return roundScore(Math.min(20, (minimumAdmissiblePrice / priceExVat) * 20), 2);
}

export function calculateScoring(args: {
  supplierId: string;
  supplierName: string;
  blockingValidationPass: boolean;
  coordinatorYearsProven: number;
  coordinatorDocumentsConform?: boolean;
  mappings: ExpertCourseMapping[];
  financialOffer?: FinancialOffer;
  minimumAdmissiblePrice?: number;
}): ScoringResult {
  const selectedTrainerMappings = args.mappings.filter((mapping) => mapping.role === 'FORMATOR' && mapping.selectedForScoring);
  const byCourse = new Map<string, ExpertCourseMapping>();
  selectedTrainerMappings.forEach((mapping) => {
    const existing = byCourse.get(mapping.courseId);
    if (!existing || mapping.yearsProvenGeneral > existing.yearsProvenGeneral) {
      byCourse.set(mapping.courseId, mapping);
    }
  });

  const ct1CoordinatorScore = scoreCoordinatorYears(args.coordinatorYearsProven, args.coordinatorDocumentsConform ?? true);
  const ct2TrainersScore = roundScore(
    [...byCourse.values()].reduce((sum, mapping) => sum + scoreTrainerYears(mapping.yearsProvenGeneral, { documentsConform: mapping.eligibilityDecision === 'Conform' }), 0),
    2,
  );
  const ct3OnlineScore = roundScore(
    [...byCourse.values()].reduce((sum, mapping) => sum + scoreOnlineYears(mapping.yearsOnlineProven, mapping.eligibilityDecision === 'Conform'), 0),
    2,
  );
  const priceScore = calculatePriceScore(args.financialOffer?.totalPriceExVat, args.minimumAdmissiblePrice);
  const status = args.blockingValidationPass ? 'Conform' : 'Neconform';
  const totalScore = status === 'Conform' ? roundScore(ct1CoordinatorScore + ct2TrainersScore + ct3OnlineScore + priceScore, 2) : 0;

  return {
    supplierId: args.supplierId,
    supplierName: args.supplierName,
    blockingValidationPass: args.blockingValidationPass,
    ct1CoordinatorScore,
    ct2TrainersScore,
    ct3OnlineScore,
    priceExVat: args.financialOffer?.totalPriceExVat,
    priceScore,
    totalScore,
    status,
  };
}

export function rankScoringResults(results: ScoringResult[]) {
  return [...results]
    .sort((a, b) => b.totalScore - a.totalScore || (a.priceExVat ?? Number.MAX_SAFE_INTEGER) - (b.priceExVat ?? Number.MAX_SAFE_INTEGER))
    .map((result, index) => ({ ...result, rank: result.status === 'Conform' ? index + 1 : undefined }));
}
