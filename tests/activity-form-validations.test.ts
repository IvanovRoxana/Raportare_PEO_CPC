import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDefaultGdprMeta } from '../lib/gdpr-reporting.ts';
import { validateGdprActivityDraft } from '../lib/validations/gdpr-activity.ts';
import { validateGrupTintaActivityDraft } from '../lib/validations/grup-tinta-activity.ts';
import { validateStandardActivityDraft } from '../lib/validations/standard-activity.ts';

const expert = {
  id: 'expert-1',
  name: 'Expert Standard',
  norma: 8,
};

test('validarea standard accepta activitati in norma zilnica si lunara', () => {
  const result = validateStandardActivityDraft({
    expert,
    existingActivities: [],
    newActivities: [{
      expertId: expert.id,
      date: '2026-05-04',
      hours: 8,
      projectCode: '302141',
    }],
    month: 4,
    year: 2026,
  });

  assert.equal(result.ok, true);
});

test('validarea GDPR ramane specializata pe template si dovezi', () => {
  const meta = buildDefaultGdprMeta('GDPR_PUBLICARE', {
    documenteAnalizate: { selected: ['comunicat_presa'] },
    tipMateriale: { selected: ['materiale_online'] },
    datePersonale: ['nume si prenume'],
    temeiGdpr: ['interes legitim'],
    obiectVerificare: 'Verificare publicare online proiect.',
    lunaAnalizata: 'mai 2026',
    canalPublicare: 'site proiect',
    linkPublicare: 'https://example.com/anunt',
    concluzie: 'conform_fara_neconformitati',
  });

  const result = validateGdprActivityDraft({
    templateCode: 'GDPR_PUBLICARE',
    meta,
    description: 'Descriere GDPR generata pentru verificarea publicarii online.',
    hasDeliverable: true,
  });

  assert.equal(result.ok, true);
});

test('validarea grup tinta aplica regulile de pontaj si intrarile GT', () => {
  const result = validateGrupTintaActivityDraft({
    expert: { ...expert, category: 'gt' },
    existingActivities: [],
    newActivities: [{
      expertId: expert.id,
      date: '2026-05-05',
      hours: 4,
      projectCode: '302141',
    }],
    grupTinta: [{
      id: 'gt-1',
      expertId: expert.id,
      date: '2026-05-05',
      year: 2026,
      month: 4,
      activityType: 'Informare grup tinta',
      organizations: ['CPC'],
      participantsCount: 12,
    }],
    month: 4,
    year: 2026,
  });

  assert.equal(result.ok, true);
});
