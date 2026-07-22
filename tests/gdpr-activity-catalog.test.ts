import assert from 'node:assert/strict';
import test from 'node:test';

import { getActiveGdprActivityCatalog } from '../lib/activity-catalog-merge.ts';
import { resolveGdprTemplateCodeForCatalogActivity } from '../lib/gdpr-reporting.ts';
import type { ActivityCatalog } from '../lib/types.ts';

function catalogItem(overrides: Partial<ActivityCatalog> = {}): ActivityCatalog {
  return {
    id: 'gdpr-activity',
    category: 'gdpr',
    saCode: 'SA1.1',
    serviceCategory: 'Conformitate GDPR',
    activityNumber: 1,
    activityName: 'Activitate GDPR',
    isActive: true,
    ...overrides,
  };
}

test('formularul GDPR foloseste doar activitatile active din categoria GDPR si SA-urile expertului', () => {
  const result = getActiveGdprActivityCatalog([
    catalogItem({ id: 'allowed', activityName: 'Activitate permisa' }),
    catalogItem({ id: 'inactive', activityName: 'Activitate inactiva', isActive: false }),
    catalogItem({ id: 'other-sa', activityName: 'Alt SA', saCode: 'SA2.1' }),
    catalogItem({ id: 'other-category', activityName: 'Alta categorie', category: 'ap' }),
  ], ['SA1.1']);

  assert.deepEqual(result.map((item) => item.id), ['allowed']);
});

test('activitatea din Admin controleaza explicit sablonul tehnic GDPR', () => {
  assert.equal(resolveGdprTemplateCodeForCatalogActivity(catalogItem({
    activityName: 'Instruire GDPR pentru noii angajati',
    gdprTemplateCode: 'GDPR_ONLINE_MEET',
  })), 'GDPR_ONLINE_MEET');
});

test('activitatile GDPR existente sunt mapate compatibil, iar cele noi primesc sablonul generic', () => {
  assert.equal(resolveGdprTemplateCodeForCatalogActivity(catalogItem({
    activityName: 'Monitorizare implementare eveniment GDPR',
  })), 'GDPR_EVENT_IMPL');
  assert.equal(resolveGdprTemplateCodeForCatalogActivity(catalogItem({
    activityName: 'Evaluare dosar AI pentru transmiterea catre CES',
  })), 'GDPR_ALTE_VERIFICARI');
});
