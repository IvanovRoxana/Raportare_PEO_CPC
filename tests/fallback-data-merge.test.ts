import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeActivityCatalogs } from '../lib/activity-catalog-merge.ts';
import { mergeExpertLists } from '../lib/expert-merge.ts';
import type { ActivityCatalog, Expert } from '../lib/types.ts';

const fallbackCatalog = [
  {
    id: 'fallback-gt-sa11-1',
    category: 'gt',
    saCode: 'SA1.1',
    activityNumber: 1,
    activityName: 'Recrutare GT',
    description: 'Descriere fallback',
  },
  {
    id: 'fallback-gt-sa11-2',
    category: 'gt',
    saCode: 'SA1.1',
    activityNumber: 2,
    activityName: 'Monitorizare GT',
  },
] as ActivityCatalog[];

test('catalogul backend gol pastreaza catalogul fallback complet', () => {
  const merged = mergeActivityCatalogs(fallbackCatalog, []);

  assert.deepEqual(merged.map((item) => item.id), ['fallback-gt-sa11-1', 'fallback-gt-sa11-2']);
});

test('catalogul backend partial completeaza fallback-ul si suprascrie aceeasi activitate', () => {
  const backendCatalog = [
    {
      id: 'backend-gt-sa11-1',
      category: 'GT',
      saCode: 'SA1.1',
      activityNumber: 1,
      activityName: 'Recrutare GT',
      description: 'Descriere editata in Admin',
    },
    {
      id: 'backend-gt-sa11-3',
      category: 'gt',
      saCode: 'SA1.1',
      activityNumber: 3,
      activityName: 'Activitate noua Admin',
    },
  ] as ActivityCatalog[];

  const merged = mergeActivityCatalogs(fallbackCatalog, backendCatalog);

  assert.deepEqual(merged.map((item) => item.id), [
    'backend-gt-sa11-1',
    'fallback-gt-sa11-2',
    'backend-gt-sa11-3',
  ]);
  assert.equal(merged.find((item) => item.activityNumber === 1)?.description, 'Descriere editata in Admin');
});

test('profilul backend incomplet nu sterge categoria si SA-urile fallback', () => {
  const fallbackExpert = {
    id: 'ivanov-roxana',
    name: 'Ivanov Roxana',
    role: 'Expert/PM',
    email: 'roxana.ivanov@confederatia-concordia.ro',
    category: 'gt',
    norma: 8,
    saCodes: ['SA1.1'],
    cognitoGroups: ['expert', 'pm', 'admin'],
    isActive: true,
  } as Expert;
  const backendExpert = {
    id: 'aws-generated-id',
    name: 'Ivanov Roxana',
    role: 'Expert/PM',
    email: 'roxana.ivanov@confederatia-concordia.ro',
    norma: 8,
    saCodes: [],
    isActive: true,
  } as Expert;

  const [merged] = mergeExpertLists([backendExpert], [fallbackExpert]);

  assert.equal(merged.id, 'ivanov-roxana');
  assert.equal(merged.category, 'gt');
  assert.deepEqual(merged.saCodes, ['SA1.1']);
  assert.deepEqual(merged.cognitoGroups, ['expert', 'pm', 'admin']);
});

test('profilul backend inactiv ramane inactiv dupa merge cu fallback', () => {
  const fallbackExpert = {
    id: 'expert-fallback',
    name: 'Expert Fallback',
    role: 'Expert',
    email: 'expert@test.ro',
    category: 'ap',
    norma: 8,
    saCodes: ['SA3.1'],
    isActive: true,
  } as Expert;
  const backendExpert = {
    ...fallbackExpert,
    id: 'aws-generated-id',
    isActive: false,
    saCodes: [],
  } as Expert;

  const [merged] = mergeExpertLists([backendExpert], [fallbackExpert]);

  assert.equal(merged.id, 'expert-fallback');
  assert.equal(merged.isActive, false);
  assert.deepEqual(merged.saCodes, ['SA3.1']);
});
