import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isActiveActivityCatalogItem,
  isActivityCatalogItemAvailableForForm,
} from '../lib/activity-catalog-merge.ts';

test('activity catalog rows remain active when the status is absent for backward compatibility', () => {
  assert.equal(isActiveActivityCatalogItem({}), true);
});

test('only rows explicitly marked inactive are excluded from activity forms', () => {
  assert.equal(isActiveActivityCatalogItem({ isActive: true }), true);
  assert.equal(isActiveActivityCatalogItem({ isActive: false }), false);
});

test('an inactive catalog row remains available while editing the activity that references it', () => {
  const inactiveItem = { id: 'catalog-inactive', isActive: false };

  assert.equal(isActivityCatalogItemAvailableForForm(inactiveItem), false);
  assert.equal(isActivityCatalogItemAvailableForForm(inactiveItem, 'catalog-other'), false);
  assert.equal(isActivityCatalogItemAvailableForForm(inactiveItem, 'catalog-inactive'), true);
});
