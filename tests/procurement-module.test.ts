import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProcurementDashboardSummary,
  buildProcurementProjectFromImportRow,
  CONTRACTED_PROCUREMENT_PLAN_ROWS,
  createProcurementStatusHistoryEntry,
  getContractedProcurementProjects,
  getProcurementAttentionLevel,
  isProcurementChecklistComplete,
  normalizeProcedureType,
  normalizeProcurementType,
  PROCUREMENT_ATTENTION_LABELS,
} from '../lib/procurement.ts';

test('planul contractat contine toate cele 71 de achizitii si totalurile aprobate', () => {
  const projects = getContractedProcurementProjects();
  const summary = buildProcurementDashboardSummary(projects);

  assert.equal(CONTRACTED_PROCUREMENT_PLAN_ROWS.length, 71);
  assert.equal(projects.length, 71);
  assert.equal(summary.totalEstimatedWithoutVat, 12568810.98);
  assert.equal(summary.totalEstimatedVat, 2277251.81);
  assert.equal(summary.totalEstimatedWithVat, 14846062.79);
});

test('normalizarea randului Excel foloseste descrierea ca nume principal si titlul ca grupare', () => {
  const project = buildProcurementProjectFromImportRow({
    'Titlul achiziției': 'Analiza',
    'Descrierea achiziției': 'Serviciu externalizat de elaborare studiu',
    'Tip achiziție': 'Servicii',
    'Tip procedură': 'Achiziţie privată competitivă conform Ordin MFE',
    Perioada: '2026 - 2028',
    Monedă: 'RON',
    'Valoare estimată fără TVA': 100,
    'Valoare TVA': 21,
    'Valoare totală estimată': 121,
  }, 12);

  assert.equal(project.title, 'Serviciu externalizat de elaborare studiu');
  assert.equal(project.category, 'Analiza');
  assert.equal(project.procurementType, 'SERVICII');
  assert.equal(project.procedureType, 'ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE');
  assert.equal(project.currentStatus, 'PLANIFICATA');
  assert.equal(project.plannedStartYear, 2026);
  assert.equal(project.plannedEndYear, 2028);
});

test('tipurile si procedurile sunt mapate catre vocabularul controlat', () => {
  assert.equal(normalizeProcurementType('Furnizare'), 'BUNURI');
  assert.equal(normalizeProcurementType('Lucrări'), 'LUCRARI');
  assert.equal(normalizeProcurementType('Servicii'), 'SERVICII');
  assert.equal(normalizeProcedureType('Achiziție directă'), 'ACHIZITIE_DIRECTA');
  assert.equal(normalizeProcedureType('Achiziţie privată competitivă conform Ordin MFE'), 'ACHIZITIE_PRIVATA_COMPETITIVA_ORDIN_MFE');
});

test('indicatorii de intarziere raman neutri si nu folosesc statusuri agresive', () => {
  assert.equal(getProcurementAttentionLevel({ plannedEndYear: 2024, currentStatus: 'PLANIFICATA', now: new Date('2026-05-21') }), 'decalat_fata_de_plan');
  assert.equal(getProcurementAttentionLevel({ plannedEndYear: 2026, currentStatus: 'PLANIFICATA', now: new Date('2026-05-21') }), 'in_atentie');
  assert.equal(getProcurementAttentionLevel({ currentStatus: 'PLANIFICATA', now: new Date('2026-05-21') }), 'necesita_actualizare_termen');
  assert.equal(PROCUREMENT_ATTENTION_LABELS.decalat_fata_de_plan, 'decalat față de plan');
});

test('schimbarea statusului produce intrare de istoric trasabila', () => {
  const entry = createProcurementStatusHistoryEntry({
    procurementProjectId: 'p1',
    oldStatus: 'PLANIFICATA',
    newStatus: 'DOCUMENTATIE_IN_LUCRU',
    changedBy: 'PM',
    changedAt: '2026-05-21T10:00:00.000Z',
    notes: 'Documentația a fost pornită.',
  });

  assert.equal(entry.procurementProjectId, 'p1');
  assert.equal(entry.oldStatus, 'PLANIFICATA');
  assert.equal(entry.newStatus, 'DOCUMENTATIE_IN_LUCRU');
  assert.equal(entry.changedAt, '2026-05-21T10:00:00.000Z');
});

test('checklistul este complet doar cand toate elementele obligatorii sunt finalizate', () => {
  assert.equal(isProcurementChecklistComplete([
    { isRequired: true, isCompleted: true },
    { isRequired: false, isCompleted: false },
  ]), true);

  assert.equal(isProcurementChecklistComplete([
    { isRequired: true, isCompleted: true },
    { isRequired: true, isCompleted: false },
  ]), false);
});
