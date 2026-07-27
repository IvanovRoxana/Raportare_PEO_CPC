import assert from 'node:assert/strict';
import test from 'node:test';

import { listAllIndexed, listDeliverablesByActivityId } from '../lib/aws-pagination.ts';

test('concateneaza toate paginile unei interogari indexate si transmite cheia neschimbata', async () => {
  const calls: Array<{ key: { activityId: string }; nextToken?: string | null; limit?: number }> = [];
  const pages = new Map<string | null | undefined, { data: Array<{ id: string }>; nextToken?: string | null }>([
    [null, { data: [{ id: 'deliverable-1' }], nextToken: 'page-2' }],
    ['page-2', { data: [{ id: 'deliverable-2' }], nextToken: 'page-3' }],
    ['page-3', { data: [{ id: 'deliverable-3' }], nextToken: null }],
  ]);

  const items = await listAllIndexed(
    async (key, options) => {
      calls.push({ key, ...options });
      return pages.get(options?.nextToken) ?? { data: [] };
    },
    { activityId: 'activity-1' },
  );

  assert.deepEqual(items.map((item) => item.id), ['deliverable-1', 'deliverable-2', 'deliverable-3']);
  assert.deepEqual(calls, [
    { key: { activityId: 'activity-1' }, limit: 1000, nextToken: null },
    { key: { activityId: 'activity-1' }, limit: 1000, nextToken: 'page-2' },
    { key: { activityId: 'activity-1' }, limit: 1000, nextToken: 'page-3' },
  ]);
});

test('returneaza lista goala pentru un index fara rezultate', async () => {
  const items = await listAllIndexed(async () => ({ data: null, nextToken: null }), { activityId: 'missing' });

  assert.deepEqual(items, []);
});

test('opreste paginarea si pastreaza eroarea AWS de pe o pagina intermediara', async () => {
  await assert.rejects(
    listAllIndexed(
      async (_key, options) => options?.nextToken
        ? { data: [], errors: [{ errorType: 'DynamoDB:ThrottlingException' }] }
        : { data: [{ id: 'deliverable-1' }], nextToken: 'page-2' },
      { activityId: 'activity-1' },
    ),
    /AWS indexed list failed.*DynamoDB:ThrottlingException/,
  );
});

test('refuza un nextToken repetat in loc sa intre intr-o bucla infinita', async () => {
  await assert.rejects(
    listAllIndexed(
      async () => ({ data: [], nextToken: 'same-token' }),
      { activityId: 'activity-1' },
    ),
    /nextToken repetat/,
  );
});

test('citirea indexata a livrabilelor este echivalenta cu filtrarea veche si nu foloseste list', async () => {
  const allDeliverables = [
    { id: 'deliverable-1', activityId: 'activity-1', fileName: 'unu.pdf' },
    { id: 'deliverable-2', activityId: 'activity-2', fileName: 'doi.pdf' },
    { id: 'deliverable-3', activityId: 'activity-1', fileName: 'trei.pdf' },
  ];
  const expectedFromOldRead = allDeliverables.filter((item) => item.activityId === 'activity-1');
  let genericListCalls = 0;
  const indexedCalls: Array<{ key: { activityId: string }; nextToken?: string | null; limit?: number }> = [];

  const deliverableModel = {
    async list() {
      genericListCalls += 1;
      throw new Error('Citirea generica nu trebuie apelata');
    },
    async listDeliverableByActivityId(
      key: { activityId: string },
      options?: { nextToken?: string | null; limit?: number },
    ) {
      indexedCalls.push({ key, ...options });
      return options?.nextToken
        ? { data: [allDeliverables[2]], nextToken: null }
        : { data: [allDeliverables[0]], nextToken: 'page-2' };
    },
  };

  const actual = await listDeliverablesByActivityId(deliverableModel, 'activity-1');

  assert.deepEqual(actual, expectedFromOldRead);
  assert.equal(genericListCalls, 0);
  assert.deepEqual(indexedCalls, [
    { key: { activityId: 'activity-1' }, limit: 1000, nextToken: null },
    { key: { activityId: 'activity-1' }, limit: 1000, nextToken: 'page-2' },
  ]);
});
