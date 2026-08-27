import assert from 'node:assert/strict';
import test from 'node:test';
import { ANEXA10_EXPORT_SETTINGS, buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import { buildDeterministicAnexa10Preflight } from '../lib/activity-report/preflight.ts';
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
  expertExperienceCategory: 'expert senior',
  jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
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
    activitySummary: 'Am analizat propunerea legislativa si am sintetizat impactul pentru membrii CPC.',
    ...overrides,
  };
}

test('Anexa 10 foloseste activitatea generala A3 pentru SA3.4 si SA3.5', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [
      activity({ id: 'a1', saCode: 'SA3.4', title: 'Monitorizare legislativa si informare membri CPC' }),
      activity({ id: 'a2', saCode: 'SA3.5', title: 'Monitorizare legislativa UE si informare membri' }),
    ],
    month: 5,
    year: 2026,
  });

  assert.equal(model.tableRows[0].officialActivityTitle, model.tableRows[1].officialActivityTitle);
  assert.match(model.tableRows[0].officialActivityTitle, /^A3 - /);
});

test('Anexa 10 limiteaza Activitate prestata la maximum 50 de cuvinte', () => {
  const longSummary = [
    'Am analizat documentele transmise de membri si am centralizat observatiile relevante pentru raportarea lunara.',
    'Am verificat informatiile legislative, am corelat contributiile primite, am redactat concluzii, am formulat recomandari si am pregatit materialul pentru transmitere catre echipa de proiect.',
    'Am inclus elemente suplimentare de context pentru audit si pentru urmarirea rezultatelor.',
  ].join(' ');
  const model = buildAnexa10ReportModel({
    expert,
    activities: [activity({ id: 'a1', activitySummary: longSummary })],
    month: 5,
    year: 2026,
  });

  assert.equal((model.tableRows[0].performedActivity.match(/\S+/g)?.length ?? 0) <= 50, true);
});

test('Anexa 10 include numele expertului pentru livrabile comune', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [activity({
      id: 'a1',
      expertName: 'Andreea Cojocaru',
      deliverables: [{
        id: 'd1',
        fileName: 'newsletter.docx',
        fileType: 'docx',
        fileSize: 10,
        declaredTitle: '20260709 Concordia members updates iunie 2026',
        isCommonDeliverable: true,
        uploadedByExpertName: 'Andreea Cojocaru',
      }],
    })],
    month: 5,
    year: 2026,
  });

  assert.deepEqual(model.tableRows[0].resultsAndDeliverables, ['20260709 Concordia members updates iunie 2026']);
  assert.equal(model.tableRows[0].commonDeliverable, 'Da - Andreea Cojocaru');
});

test('Anexa 10 afiseaza livrabilele existente chiar daca titlul contine raportare', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [activity({
      id: 'a1',
      title: 'Raportare participare / reprezentare consultare publica sau dezbatere',
      activityType: 'Raportare participare / reprezentare consultare publica sau dezbatere',
      deliverables: [{
        id: 'd1',
        fileName: 'Raport participare consultare publica.docx',
        fileType: 'docx',
        fileSize: 10,
        declaredTitle: 'Raport participare consultare publica',
      }],
    })],
    month: 5,
    year: 2026,
  });

  assert.equal(model.tableRows[0].reportingFlowType, 'consultation');
  assert.deepEqual(model.tableRows[0].resultsAndDeliverables, ['Raport participare consultare publica']);
});

test('preflight blocheaza regresiile de tabel Anexa 10', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [activity({ id: 'a1', deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }] })],
    month: 5,
    year: 2026,
  });
  model.tableRows[0].officialActivityTitle = 'Monitorizare legislativa si informare membri CPC';
  model.tableRows[0].performedActivity = Array.from({ length: 51 }, (_, index) => `cuvant${index + 1}`).join(' ');

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, false);
  assert.equal(report.findings.some((finding) => finding.id === 'non-financing-activity-title'), true);
  assert.equal(report.findings.some((finding) => finding.id === 'performed-activity-over-word-limit'), true);
});

test('preflight permite randurile de concediu fara activitate A din cererea de finantare', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [
      activity({
        id: 'co-1',
        date: '2026-06-10',
        hours: 8,
        dayType: 'CO',
        title: 'CO - Concediu odihna',
        activityType: 'CO - Concediu odihna',
        saCode: '',
        activitySummary: '',
      }),
    ],
    month: 5,
    year: 2026,
    settings: ANEXA10_EXPORT_SETTINGS,
  });

  assert.equal(model.tableRows[0].reportingFlowType, 'leave');
  assert.doesNotMatch(model.tableRows[0].officialActivityTitle, /^A\d+\s+-\s+/);

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, true);
  assert.equal(report.findings.some((finding) => finding.id === 'non-financing-activity-title'), false);
});

test('Anexa 10 consolideaza concediul pe un singur rand la finalul tabelului', () => {
  const model = buildAnexa10ReportModel({
    expert,
    activities: [
      activity({
        id: 'work',
        date: '2026-06-03',
        hours: 6,
        periodGroupId: 'work',
        title: 'Analiza acte normative',
      }),
      activity({
        id: 'co-1',
        date: '2026-06-10',
        hours: 6,
        dayType: 'CO',
        title: 'CO - Concediu odihna',
        activityType: 'CO - Concediu odihna',
        saCode: '',
        activitySummary: '',
      }),
      activity({
        id: 'co-2',
        date: '2026-06-11',
        hours: 6,
        dayType: 'CO',
        title: 'CO - Concediu odihna',
        activityType: 'CO - Concediu odihna',
        saCode: '',
        activitySummary: '',
      }),
    ],
    month: 5,
    year: 2026,
    settings: ANEXA10_EXPORT_SETTINGS,
  });

  assert.equal(model.tableRows.length, 2);
  assert.equal(model.tableRows.at(-1)?.reportingFlowType, 'leave');
  assert.equal(model.tableRows.at(-1)?.performedActivity, 'Concediu de odihna');
  assert.equal(model.tableRows.at(-1)?.hours, 12);
});
