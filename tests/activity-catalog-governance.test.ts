import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITY_CATALOG_EXPORT_HEADERS,
  buildActivityCatalogImportPlan,
  exportActivityCatalogCsv,
} from '../lib/activity-catalog-governance.ts';
import type { ActivityCatalog } from '../lib/types.ts';

const baseCatalog: ActivityCatalog[] = [
  {
    id: 'cat-1',
    category: 'ap',
    saCode: 'SA3.2',
    activityNumber: 1,
    activityName: 'Monitorizare legislativa',
    serviceCategory: 'Dialog social',
    eventCategory: 'Dezbatere',
    isActive: true,
    description: 'Descriere veche',
    objectives: '',
    serviceComponent: '',
    beneficiaries: '',
    expectedResults: '',
    deliverables: 'Nota de informare',
    indicators: '',
  },
  {
    id: 'cat-2',
    category: 'com',
    saCode: 'SA4.1',
    activityNumber: 1,
    activityName: 'Comunicare membri',
    serviceCategory: 'Comunicare',
    isActive: true,
    description: '',
    objectives: '',
    serviceComponent: '',
    beneficiaries: '',
    expectedResults: '',
    deliverables: '',
    indicators: '',
  },
];

function csv(rows: string[][]) {
  return rows.map((row) => row.join(',')).join('\n');
}

test('exportul catalogului pastreaza anteturile oficiale', () => {
  const exported = exportActivityCatalogCsv(baseCatalog);
  assert.equal(exported.split(/\r?\n/)[0], ACTIVITY_CATALOG_EXPORT_HEADERS.join(','));
});

test('importul accepta coloanele corecte si converteste Activ Da/Nu', () => {
  const imported = csv([
    [...ACTIVITY_CATALOG_EXPORT_HEADERS],
    ['cat-1', 'ap', 'SA3.2', '1', 'Monitorizare legislativa', 'Dialog social', 'Masa rotunda', 'Nu', 'Descriere noua', '', '', '', '', 'Nota de informare', ''],
    ['', 'gt', 'SA1.1', '2', 'Informare grup tinta', 'Informare', '', 'Da', 'Descriere', '', '', '', '', 'Lista participanti', ''],
  ]);

  const plan = buildActivityCatalogImportPlan(imported, baseCatalog);

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.diffs.filter((diff) => diff.action === 'update').length, 1);
  assert.equal(plan.diffs.filter((diff) => diff.action === 'create').length, 1);
  assert.equal(plan.rows[0].draft.isActive, false);
  assert.equal(plan.rows[0].draft.eventCategory, 'Masa rotunda');
  assert.equal(plan.rows[1].draft.isActive, true);
  assert.equal(plan.rows[1].draft.eventCategory, undefined);
});

test('importul respinge coloane lipsa sau redenumite', () => {
  const imported = csv([
    ACTIVITY_CATALOG_EXPORT_HEADERS.filter((header) => header !== 'Indicatori'),
    ['cat-1', 'ap', 'SA3.2', '1', 'Monitorizare legislativa', 'Dialog social', 'Da'],
  ]);

  const plan = buildActivityCatalogImportPlan(imported, baseCatalog);

  assert.match(plan.errors.join('\n'), /Lipsesc coloane obligatorii: Indicatori/);
});

test('importul respinge duplicate ambigue', () => {
  const imported = csv([
    [...ACTIVITY_CATALOG_EXPORT_HEADERS],
    ['', 'ap', 'SA3.2', '1', 'Monitorizare legislativa', 'Dialog social', '', 'Da', '', '', '', '', '', '', ''],
    ['', 'ap', 'SA3.2', '1', 'Monitorizare legislativa', 'Dialog social', '', 'Da', '', '', '', '', '', '', ''],
  ]);

  const plan = buildActivityCatalogImportPlan(imported, baseCatalog);

  assert.match(plan.errors.join('\n'), /duplicata in import/);
});

test('importul nu sterge randurile absente', () => {
  const imported = csv([
    [...ACTIVITY_CATALOG_EXPORT_HEADERS],
    ['cat-1', 'ap', 'SA3.2', '1', 'Monitorizare legislativa', 'Dialog social', 'Dezbatere', 'Da', 'Descriere veche', '', '', '', '', 'Nota de informare', ''],
  ]);

  const plan = buildActivityCatalogImportPlan(imported, baseCatalog);

  assert.equal(plan.diffs.length, 1);
  assert.match(plan.warnings.join('\n'), /nu vor fi sterse/);
});
