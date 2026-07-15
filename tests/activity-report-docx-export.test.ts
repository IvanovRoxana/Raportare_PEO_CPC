import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnexa10ReportModel } from '../lib/activity-report/build-report-model.ts';
import { buildAnexa10DocxBlob, buildAnexa10DocxFilename } from '../lib/activity-report/docx-export.ts';
import type { Activity, Expert } from '../lib/types.ts';

const expert: Expert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert raportare',
  category: 'ap',
  norma: 4,
  positionInProject: 'Expert politici publice',
  projectCode: '302141',
};

const activities: Activity[] = [
  {
    id: 'a1',
    expertId: expert.id,
    date: '2026-06-02',
    hours: 2,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    projectCode: '302141',
    periodGroupId: 'analysis',
    deliverables: [
      { id: 'd1', fileName: 'Analiza legislativa.docx', fileType: 'docx', fileSize: 12 },
    ],
  },
  {
    id: 'a2',
    expertId: expert.id,
    date: '2026-06-05',
    hours: 3,
    activityType: 'analiza',
    saCode: 'SA3.4',
    title: 'Analiza acte normative',
    projectCode: '302141',
    periodGroupId: 'analysis',
    deliverables: [
      { id: 'd2', fileName: 'Observatii consolidate.docx', fileType: 'docx', fileSize: 10 },
    ],
  },
];

test('genereaza nume stabil pentru DOCX Anexa 10', () => {
  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });

  assert.equal(buildAnexa10DocxFilename(model), 'Anexa_10_Expert_Test_Iunie_2026.docx');
});

test('genereaza un blob DOCX valid din modelul determinist fara apel AI', async () => {
  const model = buildAnexa10ReportModel({ expert, activities, month: 5, year: 2026 });
  const blob = await buildAnexa10DocxBlob(model);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 1000);
});
