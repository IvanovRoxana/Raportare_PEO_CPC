import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPmClarificationRealertItems } from '../lib/pm-clarification-realerts.ts';
import type { Expert, PmClarificationThread } from '../lib/types.ts';

const experts: Expert[] = [
  { id: 'e1', name: 'Expert 1', role: 'Expert', norma: 8 },
  { id: 'e2', name: 'Expert 2', role: 'Expert', norma: 4 },
];

function thread(id: string, overrides: Partial<PmClarificationThread>): PmClarificationThread {
  return {
    id,
    targetType: 'month',
    targetId: id,
    expertId: 'e1',
    month: 7,
    year: 2026,
    status: 'requested',
    pmMessage: 'Clarificare PM',
    requestedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildPmClarificationRealertItems', () => {
  it('afișează doar clarificările deschise, prioritizate după ultima re-alertare sau răspuns', () => {
    const items = buildPmClarificationRealertItems({
      experts,
      threads: [
        thread('old-open', { requestedAt: '2026-08-01T10:00:00.000Z' }),
        thread('resolved', { status: 'resolved', resolvedAt: '2026-08-03T10:00:00.000Z' }),
        thread('answered', { status: 'answered', answeredAt: '2026-08-04T10:00:00.000Z' }),
        thread('realerted', { expertId: 'e2', lastRealertedAt: '2026-08-05T10:00:00.000Z', realertCount: 2 }),
      ],
    });

    assert.deepEqual(items.map((item) => item.thread.id), ['realerted', 'answered', 'old-open']);
    assert.equal(items[0].expert?.name, 'Expert 2');
    assert.equal(items[0].statusLabel, 'Cerută');
    assert.equal(items[1].statusLabel, 'Răspuns');
  });
});
