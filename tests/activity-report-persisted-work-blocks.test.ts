import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPersistedWorkBlockBundles } from '../lib/activity-report/persisted-work-blocks.ts';
import type {
  Activity,
  PersistedReportingWorkBlock,
  PersistedWorkBlockActivityLink,
  PersistedWorkBlockDeliverableLink,
} from '../lib/types.ts';

const activities: Activity[] = [
  {
    id: 'a1',
    expertId: 'expert-1',
    date: '2026-06-03',
    hours: 2,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza documente',
    projectCode: '302141',
  },
  {
    id: 'a2',
    expertId: 'expert-1',
    date: '2026-06-01',
    hours: 3,
    activityType: 'intalnire',
    saCode: 'SA3.1',
    title: 'Intalnire lucru',
    projectCode: '302141',
  },
];

test('asambleaza bundle-uri din work block-uri persistate si link-uri', () => {
  const workBlocks: PersistedReportingWorkBlock[] = [
    {
      id: 'wb-2',
      expertId: 'expert-1',
      projectCode: '302141',
      month: 5,
      year: 2026,
      title: 'Analiza documente',
      saCode: 'SA3.4',
      reportingFlowType: 'deliverable',
      cleanedActivitySummary: 'Analiza documentelor fara repetitii',
      generatedTableSummary: 'Analiza comparativa pentru tabel',
      generatedNarrative: 'Am detaliat analiza in narativul Anexa 10.',
      generationInputsHash: 'abc123',
      aiConsolidationStatus: 'ai_generated',
      aiConsolidationUpdatedAt: '2026-06-04T10:00:00.000Z',
      status: 'ready',
    },
    {
      id: 'wb-1',
      expertId: 'expert-1',
      projectCode: '302141',
      month: 5,
      year: 2026,
      title: 'Intalnire lucru',
      saCode: 'SA3.1',
      reportingFlowType: 'meeting',
      status: 'draft',
    },
  ];
  const activityLinks: PersistedWorkBlockActivityLink[] = [
    { id: 'l1', workBlockId: 'wb-2', activityId: 'a1', allocatedHours: 2 },
    { id: 'l2', workBlockId: 'wb-1', activityId: 'a2', allocatedHours: 3 },
  ];
  const deliverableLinks: PersistedWorkBlockDeliverableLink[] = [
    { id: 'd1', workBlockId: 'wb-2', deliverableId: 'deliverable-1', isPrimary: true, contributionType: 'created' },
  ];

  const bundles = buildPersistedWorkBlockBundles({ workBlocks, activityLinks, deliverableLinks, activities });

  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].workBlock.id, 'wb-1');
  assert.equal(bundles[1].workBlock.id, 'wb-2');
  assert.equal(bundles[1].workBlock.reportingFlowType, 'deliverable');
  assert.equal(bundles[1].workBlock.status, 'ready');
  assert.equal(bundles[1].workBlock.cleanedActivitySummary, 'Analiza documentelor fara repetitii');
  assert.equal(bundles[1].workBlock.generatedTableSummary, 'Analiza comparativa pentru tabel');
  assert.equal(bundles[1].workBlock.generatedNarrative, 'Am detaliat analiza in narativul Anexa 10.');
  assert.equal(bundles[1].workBlock.generationInputsHash, 'abc123');
  assert.equal(bundles[1].workBlock.aiConsolidationStatus, 'ai_generated');
  assert.equal(bundles[1].activityLinks[0].activityDate, '2026-06-03');
  assert.deepEqual(bundles[1].deliverableLinks, [
    {
      id: 'd1',
      workBlockId: 'wb-2',
      deliverableId: 'deliverable-1',
      isPrimary: true,
      contributionType: 'created',
    },
  ]);
});

test('normalizeaza valorile persistate necunoscute inainte de modelul Anexa 10', () => {
  const bundles = buildPersistedWorkBlockBundles({
    activities,
    workBlocks: [
      {
        id: 'wb-unknown',
        expertId: 'expert-1',
        projectCode: '302141',
        month: 5,
        year: 2026,
        title: 'Flux necunoscut',
        saCode: 'SA3.4',
        reportingFlowType: 'legacy-custom',
        status: 'legacy-status',
      },
    ],
    activityLinks: [{ id: 'l1', workBlockId: 'wb-unknown', activityId: 'a1', allocatedHours: 2 }],
    deliverableLinks: [
      {
        id: 'd1',
        workBlockId: 'wb-unknown',
        deliverableId: 'deliverable-1',
        isPrimary: undefined,
        contributionType: 'legacy-contribution',
      },
    ],
  });

  assert.equal(bundles[0].workBlock.reportingFlowType, 'other');
  assert.equal(bundles[0].workBlock.status, 'draft');
  assert.equal(bundles[0].deliverableLinks[0].isPrimary, false);
  assert.equal(bundles[0].deliverableLinks[0].contributionType, undefined);
});

test('deduplica linkurile persistate duplicate inainte de preview si export', () => {
  const bundles = buildPersistedWorkBlockBundles({
    activities,
    workBlocks: [
      {
        id: 'wb-dedupe',
        expertId: 'expert-1',
        projectCode: '302141',
        month: 5,
        year: 2026,
        title: 'Analiza documente',
        saCode: 'SA3.4',
        reportingFlowType: 'deliverable',
        status: 'ready',
      },
    ],
    activityLinks: [
      { id: 'l1', workBlockId: 'wb-dedupe', activityId: 'a1', allocatedHours: 2 },
      { id: 'l1-duplicate', workBlockId: 'wb-dedupe', activityId: 'a1', allocatedHours: 2 },
    ],
    deliverableLinks: [
      { id: 'd1', workBlockId: 'wb-dedupe', deliverableId: 'deliverable-1', isPrimary: true },
      { id: 'd1-duplicate', workBlockId: 'wb-dedupe', deliverableId: 'deliverable-1', isPrimary: true },
    ],
  });

  assert.equal(bundles[0].activityLinks.length, 1);
  assert.equal(bundles[0].activityLinks[0].id, 'l1');
  assert.equal(bundles[0].deliverableLinks.length, 1);
  assert.equal(bundles[0].deliverableLinks[0].id, 'd1');
});
