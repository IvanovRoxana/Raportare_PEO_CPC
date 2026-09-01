import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBlockingPmReviewCase,
  isPmReviewCaseActive,
  isPmReviewCaseVisibleForExpert,
  mapLegacyNeconformitateToReviewCaseListItem,
} from '../lib/pm-review-cases.ts';
import type { Neconformitate, PmReviewCase } from '../lib/types.ts';

const baseCase: PmReviewCase = {
  id: 'case-1',
  expertId: 'expert-1',
  expertName: 'Expert Test',
  projectCode: '302141',
  month: 7,
  year: 2026,
  subjectType: 'activity',
  subjectId: 'activity-1',
  title: 'Activitate de verificat',
  description: 'Trebuie clarificat pontajul.',
  priority: 'medium',
  status: 'open',
};

test('cazurile PM active includ open, waiting_expert si answered', () => {
  assert.equal(isPmReviewCaseActive({ ...baseCase, status: 'open' }), true);
  assert.equal(isPmReviewCaseActive({ ...baseCase, status: 'waiting_expert' }), true);
  assert.equal(isPmReviewCaseActive({ ...baseCase, status: 'answered' }), true);
  assert.equal(isPmReviewCaseActive({ ...baseCase, status: 'resolved' }), false);
  assert.equal(isPmReviewCaseActive({ ...baseCase, status: 'dismissed' }), false);
});

test('doar cazurile blocante active blocheaza aprobarea finala PM', () => {
  assert.equal(isBlockingPmReviewCase({ ...baseCase, priority: 'blocking', status: 'open' }), true);
  assert.equal(isBlockingPmReviewCase({ ...baseCase, priority: 'blocking', status: 'answered' }), true);
  assert.equal(isBlockingPmReviewCase({ ...baseCase, priority: 'blocking', status: 'resolved' }), false);
  assert.equal(isBlockingPmReviewCase({ ...baseCase, priority: 'high', status: 'open' }), false);
});

test('expertul vede doar cazuri PM care asteapta expert sau au raspuns', () => {
  assert.equal(isPmReviewCaseVisibleForExpert({ ...baseCase, status: 'open' }), false);
  assert.equal(isPmReviewCaseVisibleForExpert({ ...baseCase, status: 'waiting_expert' }), true);
  assert.equal(isPmReviewCaseVisibleForExpert({ ...baseCase, status: 'answered' }), true);
  assert.equal(isPmReviewCaseVisibleForExpert({ ...baseCase, status: 'resolved' }), false);
});

test('neconformitatile legacy se mapeaza separat in registrul de afisare', () => {
  const legacy: Neconformitate = {
    id: 'nc-1',
    type: 'pontaj',
    severity: 'high',
    description: 'Pontaj de verificat manual.',
    affectedExpertId: 'expert-1',
    resolved: false,
    createdAt: '2026-08-20T10:00:00.000Z',
  };

  const mapped = mapLegacyNeconformitateToReviewCaseListItem({
    item: legacy,
    fallbackMonth: 7,
    fallbackYear: 2026,
    fallbackExpertName: 'Expert Test',
    projectCode: '302141',
  });

  assert.equal(mapped.source, 'legacy_neconformitate');
  assert.equal(mapped.legacyId, 'nc-1');
  assert.equal(mapped.subjectType, 'activity');
  assert.equal(mapped.priority, 'high');
  assert.equal(mapped.status, 'open');
});
