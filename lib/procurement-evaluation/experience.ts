import type { CourseProfile, DateInterval, ExpertCourseMapping, RelevanceLevel } from './types.ts';
import { clamp, countKeywordHits, lexicalMatchScore, roundScore } from './utils.ts';

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mergeOverlappingIntervals(intervals: DateInterval[]) {
  const parsed = intervals
    .map((interval) => ({ ...interval, start: parseDate(interval.startDate), end: parseDate(interval.endDate) }))
    .filter((interval): interval is DateInterval & { start: Date; end: Date } => Boolean(interval.start && interval.end && interval.end >= interval.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Array<DateInterval & { start: Date; end: Date }> = [];
  parsed.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start.getTime() > previous.end.getTime()) {
      merged.push({ ...interval });
      return;
    }

    if (interval.end.getTime() > previous.end.getTime()) {
      previous.end = interval.end;
      previous.endDate = interval.endDate;
    }
    previous.onlineDelivery = Boolean(previous.onlineDelivery || interval.onlineDelivery);
  });

  return merged.map(({ start, end, ...interval }) => interval);
}

export function calculateYearsFromIntervals(intervals: DateInterval[]) {
  return roundScore(
    mergeOverlappingIntervals(intervals).reduce((sum, interval) => {
      const start = parseDate(interval.startDate);
      const end = parseDate(interval.endDate);
      if (!start || !end || end < start) return sum;
      const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
      return sum + days / 365.25;
    }, 0),
    2,
  );
}

export function calculateOnlineYearsFromIntervals(intervals: DateInterval[]) {
  return calculateYearsFromIntervals(intervals.filter((interval) => interval.onlineDelivery));
}

export function assessCourseRelevance(args: {
  profile: CourseProfile;
  evidenceText: string;
  cvText?: string;
}) {
  const evidenceScore = lexicalMatchScore(args.evidenceText, args.profile.coreKeywords, args.profile.strongEvidenceTerms);
  const cvScore = lexicalMatchScore(args.cvText ?? '', args.profile.coreKeywords, args.profile.strongEvidenceTerms);
  const evidenceCoreHits = countKeywordHits(args.evidenceText, args.profile.coreKeywords);
  const evidenceStrongHits = countKeywordHits(args.evidenceText, args.profile.strongEvidenceTerms);
  const cvHits = countKeywordHits(args.cvText ?? '', [...args.profile.coreKeywords, ...args.profile.strongEvidenceTerms]);
  const combinedScore = clamp(evidenceScore * 0.75 + cvScore * 0.25, 0, 1);

  let relevance: RelevanceLevel = 'scazuta';
  if (
    evidenceScore >= args.profile.thresholds.high &&
    (evidenceCoreHits >= args.profile.thresholds.minimumEvidenceKeywordHits || evidenceStrongHits >= 1)
  ) {
    relevance = 'ridicata';
  } else if (evidenceScore >= args.profile.thresholds.medium || (cvHits > 0 && evidenceCoreHits > 0)) {
    relevance = 'medie';
  } else if (cvHits > 0) {
    relevance = 'review';
  }

  return {
    relevance,
    keywordMatchScore: roundScore(combinedScore, 3),
    evidenceCoreHits,
    evidenceStrongHits,
    cvHits,
  };
}

export function finalizeExpertCourseMapping(mapping: ExpertCourseMapping): ExpertCourseMapping {
  const declaredGeneral = Math.max(mapping.yearsClaimedF6 ?? 0, mapping.yearsClaimedCv ?? 0);
  const declaredVsProvenGap = roundScore(Math.max(0, declaredGeneral - mapping.yearsProvenGeneral), 2);
  const f6MatchesEvidence = mapping.yearsClaimedF6 === undefined || mapping.yearsProvenGeneral >= mapping.yearsClaimedF6 ? 'Conform' : 'Review';
  const cvMatchesEvidence = mapping.yearsClaimedCv === undefined || mapping.yearsProvenGeneral >= mapping.yearsClaimedCv ? 'Conform' : 'Review';
  const eligible =
    mapping.yearsProvenGeneral >= 3 &&
    mapping.yearsOnlineProven >= 1 &&
    mapping.courseRelevance !== 'scazuta' &&
    mapping.supportDocumentIds.length > 0 &&
    f6MatchesEvidence === 'Conform' &&
    cvMatchesEvidence === 'Conform';

  return {
    ...mapping,
    declaredVsProvenGap,
    f6MatchesEvidence,
    cvMatchesEvidence,
    eligibilityDecision: eligible ? 'Conform' : declaredVsProvenGap > 0 || mapping.courseRelevance === 'review' ? 'Review' : 'Neconform',
    selectedForScoring: eligible && mapping.selectedForScoring,
  };
}
