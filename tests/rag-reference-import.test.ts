import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferExpertRoleFromFileName,
  inferRagReferenceImportFromFileName,
  inferSaCodeFromFileName,
} from '../lib/rag/reference-import.ts';

test('reference import infers SA code from description file name', () => {
  assert.equal(inferSaCodeFromFileName('Descriere activitati SA3.4.pdf'), 'SA3.4');
  assert.equal(inferSaCodeFromFileName('scop_sa_SA1.1_informare.pdf'), 'SA1.1');
});

test('reference import maps description PDFs to scop_sa with project and SA', () => {
  const inference = inferRagReferenceImportFromFileName('Descriere activitati SA3.4 - comunicare.pdf', {
    projectCode: '302141',
  });

  assert.equal(inference.ok, true);
  if (!inference.ok) return;
  assert.equal(inference.input.sourceType, 'scop_sa');
  assert.equal(inference.input.projectCode, '302141');
  assert.equal(inference.input.saCode, 'SA3.4');
  assert.equal(inference.input.originalFileName, 'Descriere activitati SA3.4 - comunicare.pdf');
  assert.equal(inference.warnings.some((warning) => warning.includes('scop_sa')), true);
});

test('reference import refuses description PDFs without an SA code', () => {
  const inference = inferRagReferenceImportFromFileName('Descriere activitati comunicare.pdf');

  assert.equal(inference.ok, false);
  if (inference.ok) return;
  assert.match(inference.reason, /codul SA/);
});

test('reference import maps job descriptions to fisa_post and infers expert role', () => {
  assert.equal(
    inferExpertRoleFromFileName('FISA_de_POST_Expert_cercetare_si_analize.pdf'),
    'Expert cercetare si analize',
  );

  const inference = inferRagReferenceImportFromFileName('FISA_de_POST_Expert_cercetare_si_analize.pdf');

  assert.equal(inference.ok, true);
  if (!inference.ok) return;
  assert.equal(inference.input.sourceType, 'fisa_post');
  assert.equal(inference.input.expertRole, 'Expert cercetare si analize');
  assert.equal(inference.input.saCode, undefined);
});

test('reference import allows explicit metadata overrides', () => {
  const inference = inferRagReferenceImportFromFileName('document_neclar.pdf', {
    projectCode: '302141',
    override: {
      sourceType: 'fisa_post',
      expertRole: 'Responsabil Informare si Comunicare',
      expertName: 'Alexandra Colceru',
    },
  });

  assert.equal(inference.ok, true);
  if (!inference.ok) return;
  assert.equal(inference.input.sourceType, 'fisa_post');
  assert.equal(inference.input.expertRole, 'Responsabil Informare si Comunicare');
  assert.equal(inference.input.expertName, 'Alexandra Colceru');
});
