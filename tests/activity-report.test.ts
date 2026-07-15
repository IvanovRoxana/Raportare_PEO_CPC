import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeActivityReportRules } from '../lib/activity-report/default-rules.ts';
import { normalizeAndGroupActivities, selectReportModel } from '../lib/activity-report/normalize.ts';
import { buildActivityReportPrompt, buildActivityReportPromptInput, buildActivityReportSectionPrompt } from '../lib/activity-report/prompt.ts';
import { combineActivityReportSections, splitActivityReportSections } from '../lib/activity-report/sections.ts';
import { buildTrainingExample, exportTrainingExamplesAsJsonl } from '../lib/activity-report/training.ts';

const activities = [
  {
    date: '2026-03-12',
    hours: 2,
    saCode: 'SA2.1',
    activityType: 'analiză',
    title: 'Analiză materiale',
    description: 'Am analizat materialele operaționale și am consolidat observațiile pentru raportare.',
    location: 'online',
    deliverables: ['notă analiză'],
    beneficiaries: ['echipa proiectului'],
    indicatorImpact: 'contribuie la raportare coerentă',
  },
  {
    date: '2026-03-05',
    hours: 3,
    saCode: 'SA1.1',
    activityType: 'elaborare',
    title: 'Elaborare structură',
    description: 'Am elaborat structura de lucru și am corelat cerințele administrative relevante.',
    location: 'onsite',
    deliverables: ['structură de raport'],
    beneficiaries: ['beneficiar proiect'],
    indicatorImpact: 'sprijină trasabilitatea activităților',
  },
  {
    date: '2026-03-01',
    hours: 4,
    saCode: 'SA1.1',
    activityType: 'coordonare',
    title: 'Coordonare inițială',
    description: 'Am coordonat pașii inițiali și am fundamentat activitățile lunare pentru echipă.',
    location: 'hibrid',
    deliverables: ['plan de lucru'],
    beneficiaries: ['echipa proiectului'],
    indicatorImpact: 'asigură continuitatea implementării',
  },
];

test('calculează total ore, totaluri pe SA și totaluri pe zi', () => {
  const { totals } = normalizeAndGroupActivities(activities);

  assert.equal(totals.totalHours, 9);
  assert.deepEqual(totals.totalsBySA, { 'SA1.1': 7, 'SA2.1': 2 });
  assert.deepEqual(totals.totalsByDate, {
    '2026-03-01': 4,
    '2026-03-05': 3,
    '2026-03-12': 2,
  });
});

test('grupează după saCode și sortează cronologic activitățile din fiecare SA', () => {
  const { groupedActivities } = normalizeAndGroupActivities(activities);

  assert.deepEqual(Object.keys(groupedActivities), ['SA1.1', 'SA2.1']);
  assert.deepEqual(groupedActivities['SA1.1'].map((activity) => activity.date), ['2026-03-01', '2026-03-05']);
});

test('normalizează câmpurile lipsă și produce warnings de completare', () => {
  const { groupedActivities, totals } = normalizeAndGroupActivities([
    {
      date: '2026-03-03',
      hours: 0,
      title: 'Activitate incompletă',
      description: 'scurt',
    },
  ]);

  assert.equal(groupedActivities['SA neprecizată'][0].location, 'locație neprecizată');
  assert.match(totals.warnings.join('\n'), /nu are saCode/);
  assert.match(totals.warnings.join('\n'), /nu are locație/);
  assert.match(totals.warnings.join('\n'), /nu are livrabile/);
  assert.match(totals.warnings.join('\n'), /nu are beneficiari/);
  assert.match(totals.warnings.join('\n'), /ore <= 0/);
  assert.match(totals.warnings.join('\n'), /descriere suficientă/);
});

test('folosește fallback la model standard când fine-tuned model lipsește', () => {
  const previousStandard = process.env.OPENAI_STANDARD_REPORT_MODEL;
  const previousFineTuned = process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;
  process.env.OPENAI_STANDARD_REPORT_MODEL = 'openai/test-standard';
  delete process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;

  const selection = selectReportModel(true);

  assert.equal(selection.model, 'openai/test-standard');
  assert.equal(selection.usedFineTunedModel, false);
  assert.match(selection.warnings.join('\n'), /fine-tuned/);

  if (previousStandard === undefined) delete process.env.OPENAI_STANDARD_REPORT_MODEL;
  else process.env.OPENAI_STANDARD_REPORT_MODEL = previousStandard;
  if (previousFineTuned === undefined) delete process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;
  else process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL = previousFineTuned;
});

test('selectează modelul fine-tuned când este configurat și solicitat', () => {
  const previousFineTuned = process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;
  process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL = 'ft:gpt-4o-mini:test';

  const selection = selectReportModel(true);

  assert.equal(selection.model, 'ft:gpt-4o-mini:test');
  assert.equal(selection.usedFineTunedModel, true);
  assert.deepEqual(selection.warnings, []);

  if (previousFineTuned === undefined) delete process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL;
  else process.env.OPENAI_FINE_TUNED_ACTIVITY_REPORT_MODEL = previousFineTuned;
});

test('promptul Anexa 10 conține persoana I, interdicții, structură, totaluri și validări', () => {
  const { normalizedActivities, groupedActivities, totals } = normalizeAndGroupActivities(activities);
  const promptInput = buildActivityReportPromptInput({
    expertName: 'Expert Test',
    expertRole: 'Expert raportare',
    month: 'Martie',
    year: 2026,
    projectCode: '302141',
    activities,
    reportingRules: mergeActivityReportRules({ preferredPhrases: ['am verificat'], forbiddenPhrases: ['sursă externă'] }),
    validatedExamples: [{ title: 'Exemplu bun', outputExample: 'Am elaborat un raport clar.' }],
  }, normalizedActivities, groupedActivities, totals);

  const prompt = buildActivityReportPrompt(promptInput);

  assert.match(prompt, /persoana I singular/);
  assert.match(prompt, /Nu menționa surse, documente, fișiere sau inputuri/);
  assert.match(prompt, /1\. Tabel activități/);
  assert.match(prompt, /2\. Descriere detaliată pe subactivități și zile/);
  assert.match(prompt, /Total ore lunar: 9/);
  assert.match(prompt, /Total ore în raport = 9/);
  assert.match(prompt, /Validări\/warnings/);
  assert.match(prompt, /Exemplu bun/);
});

test('promptul pe sectiuni pastreaza detalierea RA pentru narativ', () => {
  const { normalizedActivities, groupedActivities, totals } = normalizeAndGroupActivities(activities);
  const promptInput = buildActivityReportPromptInput({
    expertName: 'Expert Test',
    expertRole: 'Expert raportare',
    month: 'Martie',
    year: 2026,
    projectCode: '302141',
    activities: activities.filter((activity) => activity.saCode === 'SA1.1'),
    reportingRules: mergeActivityReportRules({ detailLevel: 'foarte_detaliat' }),
  }, normalizedActivities, groupedActivities, totals);

  const prompt = buildActivityReportSectionPrompt(promptInput, {
    kind: 'narrative',
    title: 'Sectiunea 2 - Narativ detaliat',
    index: 2,
    total: 2,
  });

  assert.match(prompt, /Context si obiectiv/);
  assert.match(prompt, /Rezultat/);
  assert.match(prompt, /Beneficiar/);
  assert.match(prompt, /Indicator\/Impact/);
  assert.match(prompt, /Nu scurta continutul final/);
  assert.match(prompt, /fara sectiuni 3\/4\/5/);
});

test('raportul generat se separa strict in sectiunea 1 tabel si sectiunea 2 narativ', () => {
  const table = [
    '# Raport de Activitate - Expert Test',
    '',
    '## 1. Tabel activitati',
    '| SA | Perioada | Activitate | Ore |',
    '| --- | --- | --- | ---: |',
    '| SA1.1 | 01.06.2026 | Activitate prestata | 6 |',
  ].join('\n');
  const narrative = [
    '## 2. Descriere detaliata a activitatilor desfasurate',
    'Am elaborat activitatile raportate si am documentat rezultatele obtinute.',
  ].join('\n');

  const report = combineActivityReportSections({ table, narrative });
  const sections = splitActivityReportSections(report);

  assert.equal(sections.table, table);
  assert.equal(sections.narrative, narrative);
  assert.doesNotMatch(report, /## 3|## 4|## 5/);
});

test('exportă exemple validate în JSONL compatibil pentru fine-tuning', () => {
  const example = buildTrainingExample({
    expertName: 'Expert Test',
    month: 'Martie',
    year: 2026,
    projectCode: '302141',
    activities,
  }, 'Raport validat final.');

  const jsonl = exportTrainingExamplesAsJsonl([example]);
  const parsed = JSON.parse(jsonl);

  assert.equal(parsed.messages[0].role, 'system');
  assert.equal(parsed.messages[1].role, 'user');
  assert.equal(parsed.messages[2].role, 'assistant');
  assert.equal(parsed.messages[2].content, 'Raport validat final.');
});
