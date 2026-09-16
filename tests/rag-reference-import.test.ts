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

test('reference import handles actual uploaded description names including download suffix', () => {
  for (const [file, sa] of [
    ['DESCRIERE_ACTIVITATE_A1_SA1.1(1).pdf', 'SA1.1'],
    ['DESCRIERE_ACTIVITATE_A2_SA2.1.pdf', 'SA2.1'],
    ...['3.2', '3.3', '3.4', '3.5'].map((code) => [`DESCRIERE_ACTIVITATE_A3_SA${code}.pdf`, `SA${code}`]),
  ]) {
    const result = inferRagReferenceImportFromFileName(file);
    assert.ok(result.ok, file);
    assert.equal(result.input.saCode, sa);
    assert.equal(result.input.sourceType, 'scop_sa');
  }
});

test('reference import handles project documents and keeps SA numeric suffixes', () => {
  for (const [file, type] of [
    ['I10_Manualul Beneficiarului_in vigoare_V5.pdf', 'manual_beneficiar'],
    ['20260317_Text_Cerere_de_Finantare.docx', 'cerere_finantare'],
  ]) {
    const result = inferRagReferenceImportFromFileName(file);
    assert.ok(result.ok);
    assert.equal(result.input.sourceType, type);
    assert.equal(result.input.projectCode, '302141');
  }
  assert.equal(inferSaCodeFromFileName('Descriere SA3.4'), 'SA3.4');
});

test('reference import matches the ten supplied job filenames to catalog roles', () => {
  const names = [
    ['FISA_de_POST_Expert_cu_protectia_datelor_cu_caracter_personal(1).pdf', 'Expert Protectia Datelor'],
    ['Fisa_de_post_Expert_recrutare_si_selectie_grup_tinta(1).pdf', 'Expert Recrutare si Selectie GT'],
    ['FISA_de_POST_Expert_cercetare_si_analize.pdf', 'Expert cercetare si analize'],
    ['FISA_de_POST_Coordonator_Business_HUB.pdf', 'Coordonator Business HUB'],
    ['FISA_de_POST_Coordonator_centre_regionale.pdf', 'Coordonator centre regionale'],
    ['FISA_de_POST_Expert_Afaceri_Publice.pdf', 'Expert Afaceri Publice'],
    ['FISA_de_POST_Expert_informare_si_comunicare.pdf', 'Expert informare si comunicare'],
    ['FISA_de_POST_Responsabil_Afaceri_Publice.pdf', 'Responsabil Afaceri Publice'],
    ['FISA_de_POST_Responsabil_centru_regional.pdf', 'Responsabil Centre Regionale'],
    ['FISA_de_POST_Responsabil_informare_si_comunicare.pdf', 'Responsabil informare si comunicare'],
  ];
  for (const [file, role] of names) {
    const result = inferRagReferenceImportFromFileName(file);
    assert.ok(result.ok, file);
    assert.equal(result.input.sourceType, 'fisa_post');
    assert.equal(result.input.expertRole, role);
    assert.equal(result.input.expertId, undefined);
    assert.equal(result.input.originalFileName, file);
  }
});

test('reference import rejects generic job descriptions, invalid source types and malformed SA overrides', () => {
  assert.equal(inferRagReferenceImportFromFileName('Fisa de post.pdf').ok, false);
  assert.equal(inferRagReferenceImportFromFileName('scop SA3.4.pdf', { override: { sourceType: 'other' } }).ok, false);
  assert.equal(inferRagReferenceImportFromFileName('scop SA3.4.pdf', { override: { saCode: 'unknown' } }).ok, false);
});
