import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLocalActivityReport,
  isBlockedActivityReportExport,
  isLocalFallbackReport,
  LOCAL_FALLBACK_MARKER,
  TRUNCATED_MARKER,
  truncateActivityReportText,
} from '../lib/activity-report/local-fallback.ts';

const baseActivity = {
  id: 'activity-1',
  expertId: 'expert-1',
  date: '2026-06-10',
  year: 2026,
  month: 5,
  hours: 4,
  activityType: 'analiza',
  saCode: 'SA3.4',
  title: 'Analiza proiect acte normative',
  description: 'Analiza proiectelor de acte normative primite pentru raportarea lunara.',
  location: 'online',
  deliverables: [],
};

test('fallback-ul local este marcat explicit si blocheaza exportul', () => {
  const report = buildLocalActivityReport({
    activities: [baseActivity as any],
    month: 5,
    year: 2026,
    expertName: 'Expert Test',
    preferredPhrases: [],
    forbiddenPhrases: [],
  });

  assert.equal(report.startsWith(LOCAL_FALLBACK_MARKER), true);
  assert.equal(isLocalFallbackReport(report), true);
  assert.equal(isBlockedActivityReportExport(report), true);
});

test('fallback-ul local nu mai include formularile generice interzise', () => {
  const report = buildLocalActivityReport({
    activities: [baseActivity as any],
    month: 5,
    year: 2026,
    expertName: 'Expert Test',
    preferredPhrases: [],
    forbiddenPhrases: [],
  });

  assert.doesNotMatch(report, /proiectul si partile interesate relevante/i);
  assert.doesNotMatch(report, /activitatea a fost documentata/i);
  assert.doesNotMatch(report, /contributie la indeplinirea activitatilor planificate/i);
  assert.match(report, /Campuri care necesita completare\/verificare/);
});

test('textele scurtate primesc markerul TRUNCATED si blocheaza exportul', () => {
  const longText = 'activitate '.repeat(120);
  const truncated = truncateActivityReportText(longText);

  assert.equal(truncated.includes(TRUNCATED_MARKER), true);
  assert.equal(isBlockedActivityReportExport(`Raport\n${truncated}`), true);
});
