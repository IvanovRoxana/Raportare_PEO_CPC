import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import { assertCanExportAnexa10Docx, getAnexa10ExportGate } from '../lib/activity-report/export-readiness.ts';
import { buildDeterministicAnexa10Preflight } from '../lib/activity-report/preflight.ts';
import type { Activity, Expert } from '../lib/types.ts';

const baseExpert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert raportare',
  category: 'ap',
  norma: 4,
  positionInProject: 'Expert politici publice',
  projectCode: '302141',
  projectTitle: 'Proiect PEO',
  beneficiary: 'Beneficiar Test',
};

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    expertId: baseExpert.id,
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

test('preflight blocheaza Anexa 10 cand lipsesc contractul, categoria si responsabilitatile', () => {
  const model = buildAnexa10ReportModel({
    expert: baseExpert,
    activities: [activity({ id: 'a1' })],
    month: 5,
    year: 2026,
  });

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, false);
  assert.equal(report.findings.some((finding) => finding.id === 'missing-contract'), true);
  assert.equal(report.findings.some((finding) => finding.id === 'missing-expert-category'), true);
  assert.equal(report.findings.some((finding) => finding.id === 'missing-responsibilities'), true);
});

test('preflight permite Anexa 10 cand datele institutionale sunt complete', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, true);
  assert.equal(report.findings.filter((finding) => finding.severity === 'critical').length, 0);
});

test('preflight nu blocheaza activitati legitime despre formulare sau chestionare', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      title: 'Chestionare si formulare feedback membri',
      activitySummary: 'Am elaborat formularul de feedback si am centralizat raspunsurile transmise de membri.',
      deliverables: [{ id: 'd1', fileName: 'Feedback.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, true);
  assert.equal(report.findings.some((finding) => finding.id === 'forbidden-phrases'), false);
});

test('preflight blocheaza in continuare referirile la formular generat automat', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      activitySummary: 'Am revizuit formularul generat si am pastrat observatiile relevante pentru raportare.',
      deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, false);
  assert.equal(report.findings.some((finding) => (
    finding.id === 'forbidden-phrases' && finding.detail.includes('formularul generat')
  )), true);
});

test('preflight semnaleaza heading narativ duplicat in corp', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      activitySummary: 'Am elaborat analiza legislativa pentru membrii CPC si am sintetizat impactul propunerii.',
      deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });
  model.saSections[0].items[0].timing = `${model.saSections[0].items[0].body} (2 iunie 2026, 2 ore lucrate)`;

  const report = buildDeterministicAnexa10Preflight(model);

  assert.equal(report.canExport, true);
  assert.equal(report.findings.some((finding) => finding.id === 'duplicated-heading-body-narrative'), true);
});

test('gate-ul comun cere preflight trecut pentru exportul principal Anexa 10', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });

  const gate = getAnexa10ExportGate(model, { requirePassedPreflight: true });

  assert.equal(gate.canExport, false);
  assert.match(gate.blockingMessages[0], /Ruleaza preflight-ul Anexa 10/);
  assert.throws(() => assertCanExportAnexa10Docx(model, { requirePassedPreflight: true }), /preflight-ul Anexa 10/);
});

test('gate-ul comun permite exportul dupa preflight trecut', () => {
  const model = buildAnexa10ReportModel({
    expert: {
      ...baseExpert,
      contractNumber: '12/2026',
      contractType: 'CIM',
      expertExperienceCategory: 'expert senior',
      jobDescriptionText: 'Am responsabilitati de analiza legislativa, sinteza si formulare pozitii institutionale.',
    },
    activities: [activity({
      id: 'a1',
      deliverables: [{ id: 'd1', fileName: 'Analiza.docx', fileType: 'docx', fileSize: 10 }],
    })],
    month: 5,
    year: 2026,
  });
  const preflightReport = buildDeterministicAnexa10Preflight(model);

  const gate = assertCanExportAnexa10Docx(model, {
    preflightReport,
    requirePassedPreflight: true,
  });

  assert.equal(gate.canExport, true);
});
