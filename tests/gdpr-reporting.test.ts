import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAndGroupActivities } from '../lib/activity-report/normalize.ts';
import { buildActivityReportPrompt, buildActivityReportPromptInput } from '../lib/activity-report/prompt.ts';
import {
  buildDefaultGdprMeta,
  buildGdprActivityDescription,
  buildGdprDeliverableText,
  getGdprRequiredFields,
  isGdprDeliverableRequired,
  validateGdprActivityDraft,
} from '../lib/gdpr-reporting.ts';
import { isExceptionActivity } from '../lib/peo-constants.ts';

const baseMeta = {
  obiectVerificare: 'comunicate media si anunturi publicate online',
  documenteAnalizate: ['comunicate media', 'anunturi', 'stiri'],
  datePersonale: ['nume si prenume', 'functie', 'imagine foto/video'],
  temeiGdpr: ['interes legitim'],
  concluzie: 'conform_fara_neconformitati',
};

test('publicarea online genereaza descriere si livrabil GDPR specializat', () => {
  const meta = {
    ...baseMeta,
    lunaAnalizata: 'ianuarie 2026',
    tipMateriale: ['comunicate', 'anunturi'],
    canalPublicare: ['website', 'LinkedIn'],
    includeImagini: false,
  };

  const description = buildGdprActivityDescription({
    templateCode: 'GDPR_PUBLICARE',
    meta,
    date: '2026-01-13',
    expertName: 'Khamissi Simona',
  });
  const deliverable = buildGdprDeliverableText({
    templateCode: 'GDPR_PUBLICARE',
    meta,
    date: '2026-01-13',
    expertName: 'Khamissi Simona',
  });

  assert.match(description, /publicarea online/);
  assert.match(description, /website, LinkedIn/);
  assert.match(deliverable, /RAPORT PRELIMINAR PRIVIND VERIFICAREA RESPECTARII GDPR IN PUBLICAREA ONLINE/);
  assert.match(deliverable, /Khamissi Simona/);
});

test('evenimentul cu foto-video cere informare, temei si drept de opozitie', () => {
  const required = getGdprRequiredFields('GDPR_EVENT_CHECK', {
    ...baseMeta,
    numeEveniment: 'Concordia HUB Est',
    locatieEveniment: 'Bucuresti',
    fotoVideo: true,
  });

  assert.ok(required.includes('informareParticipanti'));
  assert.ok(required.includes('temeiFotoVideo'));
  assert.ok(required.includes('dreptOpozitie'));
});

test('intalnirea online cu inregistrare cere acces si retentie', () => {
  const required = getGdprRequiredFields('GDPR_ONLINE_MEET', {
    ...baseMeta,
    perioadaAnalizata: 'decembrie 2025',
    platforma: ['Teams'],
    existaInregistrari: true,
  });

  assert.ok(required.includes('accesInregistrari'));
  assert.ok(required.includes('retentieInregistrari'));
});

test('neconformitatea cere descriere, masuri si recomandari', () => {
  const validation = validateGdprActivityDraft({
    templateCode: 'GDPR_EVENT_IMPL',
    meta: {
      ...baseMeta,
      concluzie: 'neconform_cu_remediere',
      numeEveniment: 'Eveniment test',
      locatieEveniment: 'Bucuresti',
      masuriAplicate: ['informare participanti'],
    },
    description: 'Descriere GDPR generata pentru verificare.',
    hasDeliverable: true,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.missingFields.includes('descriereIncident'));
  assert.ok(validation.missingFields.includes('masuriRemediere'));
  assert.ok(validation.missingFields.includes('recomandari'));
});

test('raportarea Anexa 10 foloseste textul GDPR specializat fara sa modifice totalurile', () => {
  const activities = [
    {
      date: '2026-01-13',
      hours: 6,
      saCode: 'SA1.1',
      activityType: 'gdpr',
      title: 'Verificare GDPR publicare online',
      description: 'Text generic vechi.',
      gdprGeneratedText: 'Text GDPR specializat pentru publicare online si verificare de conformitate.',
      gdprTemplateCode: 'GDPR_PUBLICARE',
      gdprConclusionCode: 'conform_fara_neconformitati',
      deliverables: ['Raport preliminar privind verificarea respectarii GDPR in publicarea online'],
      beneficiaries: ['PM proiect'],
      location: 'online',
    },
  ];

  const { normalizedActivities, groupedActivities, totals } = normalizeAndGroupActivities(activities);
  const promptInput = buildActivityReportPromptInput({
    expertName: 'Khamissi Simona',
    expertRole: 'Expert GDPR',
    month: 'Ianuarie',
    year: 2026,
    projectCode: '302141',
    activities,
  }, normalizedActivities, groupedActivities, totals);
  const prompt = buildActivityReportPrompt(promptInput);

  assert.equal(totals.totalHours, 6);
  assert.match(prompt, /Text GDPR specializat pentru publicare online/);
  assert.match(prompt, /Cod GDPR: GDPR_PUBLICARE/);
  assert.match(prompt, /Raport preliminar privind verificarea respectarii GDPR/);
});

test('activitatile GDPR fara livrabil obligatoriu raman exceptii in readiness', () => {
  assert.equal(isExceptionActivity('Sedinta status PEO - aspecte GDPR'), true);
  assert.equal(isExceptionActivity('Elaborare raport lunar GDPR - Anexa 10'), true);
});

test('publicarea online este eligibila fara livrabil cand exista link si concluzie', () => {
  const meta = buildDefaultGdprMeta('GDPR_PUBLICARE', {
    ...baseMeta,
    lunaAnalizata: 'ianuarie 2026',
    tipMateriale: { selected: ['comunicate_media', 'anunturi'] },
    canalPublicare: ['website'],
    linkPublicare: 'https://example.test/anunt',
  }, 'ianuarie 2026');

  const validation = validateGdprActivityDraft({
    templateCode: 'GDPR_PUBLICARE',
    meta,
    description: 'Descriere GDPR generata.',
    hasDeliverable: false,
  });

  assert.equal(validation.ok, true);
  assert.equal(isGdprDeliverableRequired('GDPR_PUBLICARE', meta), false);
});

test('publicarea online fara link cere dovada minima, nu raport artificial', () => {
  const validation = validateGdprActivityDraft({
    templateCode: 'GDPR_PUBLICARE',
    meta: {
      ...baseMeta,
      lunaAnalizata: 'ianuarie 2026',
      tipMateriale: { selected: ['stiri'] },
      canalPublicare: ['website'],
    },
    description: 'Descriere GDPR generata.',
    hasDeliverable: false,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.missingFields.includes('linkPublicare'));
  assert.equal(validation.missingFields.includes('livrabil_generat_sau_atasat'), false);
});

test('monitorizarea GT ramane activitate cu livrabil obligatoriu', () => {
  const validation = validateGdprActivityDraft({
    templateCode: 'GDPR_GT_MON',
    meta: {
      ...baseMeta,
      lunaAnalizata: 'ianuarie 2026',
      referintaDocument: 'Registru GT ianuarie',
      operatiuniRealizate: ['validare', 'deduplicare'],
    },
    description: 'Descriere GDPR generata.',
    hasDeliverable: false,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.missingFields.includes('livrabil_generat_sau_atasat'));
});
