import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyEvidenceCoverage,
  extractMonthlyEvidenceDates,
} from '../lib/monthly-evidence.ts';
import type { Activity } from '../lib/types.ts';

const activity = (overrides: Partial<Activity>): Activity => ({
  id: overrides.id ?? 'activity-1',
  expertId: 'expert-com',
  date: overrides.date ?? '2026-05-12',
  hours: 8,
  activityType: 'Social media management',
  title: 'Social media management',
  dayType: 'lucratoare',
  ...overrides,
});

test('detecteaza date romanesti si numerice dintr-un pachet lunar de dovezi', () => {
  const text = [
    '12 mai',
    'Capturi LinkedIn si Facebook',
    '2026-05-13 TikTok',
    '14.05.2026 newsletter',
  ].join('\n');

  assert.deepEqual(extractMonthlyEvidenceDates(text, 4, 2026), [
    '2026-05-12',
    '2026-05-13',
    '2026-05-14',
  ]);
});

test('ignora datele din afara lunii raportate', () => {
  assert.deepEqual(
    extractMonthlyEvidenceDates('30 aprilie\n1 mai\n2026-06-01', 4, 2026),
    ['2026-05-01'],
  );
});

test('construieste acoperirea zi pontata - dovada lunara', () => {
  const coverage = buildMonthlyEvidenceCoverage({
    month: 4,
    year: 2026,
    activities: [
      activity({ id: 'covered', date: '2026-05-12' }),
      activity({ id: 'missing', date: '2026-05-13' }),
    ],
    evidence: [
      {
        id: 'word-pack',
        fileName: 'Dovezi_social_media_mai.docx',
        text: '12 mai\nCapturi postari social media',
      },
    ],
  });

  assert.deepEqual(
    coverage.map((row) => [row.date, row.status]),
    [
      ['2026-05-12', 'covered'],
      ['2026-05-13', 'missing_evidence'],
    ],
  );
});

test('semnaleaza dovezi incarcate pentru zile fara activitate', () => {
  const coverage = buildMonthlyEvidenceCoverage({
    month: 4,
    year: 2026,
    activities: [],
    evidence: [{ id: 'image-1', fileName: '2026-05-20_FB_postare.png' }],
  });

  assert.equal(coverage[0].date, '2026-05-20');
  assert.equal(coverage[0].status, 'missing_activity');
});
