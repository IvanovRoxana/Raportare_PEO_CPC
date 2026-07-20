import assert from 'node:assert/strict';
import test from 'node:test';

import { isActiveActivityCatalogItem } from '../lib/activity-catalog-merge.ts';

test('activity catalog rows remain active when the status is absent for backward compatibility', () => {
  assert.equal(isActiveActivityCatalogItem({}), true);
});

test('only rows explicitly marked inactive are excluded from activity forms', () => {
  assert.equal(isActiveActivityCatalogItem({ isActive: true }), true);
  assert.equal(isActiveActivityCatalogItem({ isActive: false }), false);
});
