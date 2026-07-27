import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import { buildWorkBlocks, type ReportingWorkBlockBundle } from '../lib/activity-report/work-blocks.ts';
import type { Activity, Expert } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert raportare',
  category: 'ap',
  norma: 4,
  positionInProject: 'Expert politici publice',
  projectCode: '302141',
  projectTitle: 'Proiect PEO',
  beneficiary: 'Beneficiar Test',
  contractNumber: '12/2026',
  contractType: 'CIM',
};

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    expertId: expert.id,
    date: '2026-06-02',
    hours: 2,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    projectCode: '302141',
    deliverables: [],
    ...overrides,
  };
}

test('construieste model determinist din activitati legacy fara work block-uri persistate', () => {
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', hours: 2 }),
    activity({ id: 'a2', date: '2026-06-05', hours: 3 }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(model.header.month, 'Iunie');
  assert.equal(model.header.expertName, 'Expert Test');
  assert.equal(model.header.contract, 'CIM 12/2026');
  assert.equal(model.tableRows.length, 2);
  assert.equal(model.totalHours, 5);
  assert.equal(model.signature.date, '2026-06-05');
});

test('un work block multi-day produce un singur rand cu totalul orelor', () => {
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', hours: 2, periodGroupId: 'analysis' }),
    activity({ id: 'a2', date: '2026-06-05', hours: 3, periodGroupId: 'analysis' }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(model.tableRows.length, 1);
  assert.equal(model.tableRows[0].hours, 5);
  assert.match(model.saSections[0].items[0].heading, /2 și 5 iunie 2026/);
});

test('modelul determinist prefera activitySummary cand nu exista consolidare work block', () => {
  const activities = [
    activity({
      id: 'a1',
      date: '2026-06-02',
      hours: 2,
      periodGroupId: 'summary-group',
      activitySummary: 'Am sintetizat statusul livrabilelor pentru raportarea lunara.',
      description: 'Descriere lunga veche, redundanta si mai putin utila pentru tabel.',
    }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(model.tableRows[0].performedActivity, 'Am sintetizat statusul livrabilelor pentru raportarea lunara.');
  assert.equal(model.saSections[0].items[0].body, 'Am sintetizat statusul livrabilelor pentru raportarea lunara.');
});

test('mai multe livrabile apar in acelasi rand cand apartin aceluiasi flux', () => {
  const activities = [
    activity({
      id: 'a1',
      periodGroupId: 'meeting',
      deliverables: [
        { id: 'd1', fileName: 'Agenda TF Consumers.docx', fileType: 'docx', fileSize: 10 },
      ],
    }),
    activity({
      id: 'a2',
      date: '2026-06-03',
      periodGroupId: 'meeting',
      deliverables: [
        { id: 'd2', fileName: 'Minuta TF Consumers.docx', fileType: 'docx', fileSize: 10 },
      ],
    }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.deepEqual(model.tableRows[0].resultsAndDeliverables, ['Agenda TF Consumers.docx', 'Minuta TF Consumers.docx']);
});

test('narativul este grupat pe SA si pastreaza totalul fiecarei sectiuni', () => {
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', hours: 2, saCode: 'SA3.4' }),
    activity({ id: 'a2', date: '2026-06-03', hours: 4, saCode: 'SA3.5' }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.deepEqual(model.saSections.map((section) => section.saCode), ['SA3.4', 'SA3.5']);
  assert.deepEqual(model.saSections.map((section) => section.totalHours), [2, 4]);
  assert.match(model.saSections[0].items[0].body, /Am realizat activitatea/);
});

test('concediul este exclus implicit din total si poate fi inclus configurabil', () => {
  const activities = [
    activity({ id: 'work', date: '2026-06-02', hours: 4 }),
    activity({ id: 'leave', date: '2026-06-03', hours: 4, dayType: 'CO', title: 'Concediu odihna' }),
  ];

  const defaultModel = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });
  const includeLeaveModel = buildAnexa10ReportModel({
    expert,
    activities,
    month: 5,
    year: 2026,
    settings: { includeLeaveInTable: true, includeLeaveInTotal: true },
  });

  assert.equal(defaultModel.totalHours, 4);
  assert.equal(includeLeaveModel.totalHours, 8);
});

test('signature date foloseste ultima zi lucrata si ignora concediul implicit', () => {
  const activities = [
    activity({ id: 'work', date: '2026-06-20', hours: 4 }),
    activity({ id: 'leave', date: '2026-06-30', hours: 4, dayType: 'CO', title: 'Concediu odihna' }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(model.signature.date, '2026-06-20');
});

test('raporteaza problemele de alocare din work block-uri', () => {
  const activities = [activity({ id: 'a1', hours: 2 })];
  const bundles = buildWorkBlocks(activities);
  const invalidBundles: ReportingWorkBlockBundle[] = [{
    ...bundles[0],
    activityLinks: [{ ...bundles[0].activityLinks[0], allocatedHours: 3 }],
  }];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026, workBlockBundles: invalidBundles });

  assert.equal(model.problems.some((problem) => problem.code === 'over_allocated_activity'), true);
});

test('avertizeaza cand acelasi livrabil este folosit in doua work block-uri', () => {
  const deliverable = { id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 };
  const activities = [
    activity({ id: 'a1', date: '2026-06-02', deliverables: [deliverable] }),
    activity({ id: 'a2', date: '2026-06-03', deliverables: [deliverable] }),
  ];

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(model.warnings.some((warning) => /asociat in mai multe work block-uri/.test(warning)), true);
});

test('adauga avertizari non-blocante pentru statusul eligibilitatii livrabilelor', () => {
  const activities = [
    activity({
      id: 'a1',
      date: '2026-06-02',
      deliverables: [{
        id: 'd1',
        fileName: 'observatii.docx',
        fileType: 'docx',
        fileSize: 10,
        declaredTitle: 'Observatii acte normative',
        eligibilityCheck: {
          status: 'eligibil_cu_observatii',
          score: 80,
          summary: 'Necesita verificare manuala.',
          checks: [],
          missingElements: [],
          recommendations: [],
          riskFlags: [],
        },
      }, {
        id: 'd2',
        fileName: 'neverificat.docx',
        fileType: 'docx',
        fileSize: 10,
      }],
    }),
  ];
  const bundles = buildWorkBlocks(activities);

  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026, workBlockBundles: bundles });

  assert.equal(model.problems.length, 0);
  assert.equal(model.warnings.some((warning) => /eligibil cu observatii/.test(warning)), true);
  assert.equal(model.warnings.some((warning) => /nu are eligibilitatea verificata/.test(warning)), true);
});
