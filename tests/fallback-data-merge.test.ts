import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeActivityCatalogs, resolveExpertActivityCatalog } from '../lib/activity-catalog-merge.ts';
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

test('formularul foloseste doar catalogul Admin cand exista activitati pentru categoria expertului', () => {
  const bhFallbackCatalog = [
    {
      id: 'fallback-bh-sa32-old',
      category: 'bh',
      saCode: 'SA3.2',
      activityNumber: 1,
      activityName: 'S4 — Activitate Business HUB Bucuresti',
    },
  ] as ActivityCatalog[];
  const backendCatalog = [
    {
      id: 'admin-bh-sa32-1',
      category: 'BH',
      saCode: 'SA3.2',
      activityNumber: 1,
      activityName: 'Administrarea si optimizarea utilizarii echipamentelor IT',
    },
    {
      id: 'admin-bh-sa32-2',
      category: 'BH',
      saCode: 'SA3.2',
      activityNumber: 2,
      activityName: 'Suport tehnic si mentenanta echipamente IT',
    },
  ] as ActivityCatalog[];

  const resolved = resolveExpertActivityCatalog({
    fallbackCatalog: bhFallbackCatalog,
    backendCatalog,
    expertCategory: 'bh',
  });

  assert.deepEqual(resolved.map((item) => item.id), ['admin-bh-sa32-1', 'admin-bh-sa32-2']);
  assert.equal(
    resolved.some((item) => item.activityName === 'S4 — Activitate Business HUB Bucuresti'),
    false,
  );
});

[
  { expertCategory: 'ap', backendCategory: 'AP' },
  { expertCategory: 'bh', backendCategory: 'Business Hub' },
  { expertCategory: 'com', backendCategory: 'Comunicare' },
  { expertCategory: 'cr', backendCategory: 'Centre regionale' },
  { expertCategory: 'cercetare', backendCategory: 'Cercetare' },
  { expertCategory: 'gt', backendCategory: 'Grup tinta' },
  { expertCategory: 'gdpr', backendCategory: 'Protectia datelor' },
].forEach(({ expertCategory, backendCategory }) => {
  test(`formularul nu amesteca fallback-ul cand Admin are catalog pentru ${backendCategory}`, () => {
    const staleFallback = [
      {
        id: `fallback-${expertCategory}-old`,
        category: expertCategory,
        saCode: 'SA3.2',
        activityNumber: 1,
        activityName: 'Activitate veche fallback',
      },
    ] as ActivityCatalog[];
    const backendCatalog = [
      {
        id: `admin-${expertCategory}-1`,
        category: backendCategory,
        saCode: 'SA3.2',
        activityNumber: 1,
        activityName: `Activitate Admin ${backendCategory}`,
      },
    ] as ActivityCatalog[];

    const resolved = resolveExpertActivityCatalog({
      fallbackCatalog: staleFallback,
      backendCatalog,
      expertCategory,
    });

    assert.deepEqual(resolved.map((item) => item.id), [`admin-${expertCategory}-1`]);
  });
});

test('formularul pastreaza fallback-ul cand Admin nu are catalog pentru categoria expertului', () => {
  const backendCatalog = [
    {
      id: 'backend-ap-sa31-1',
      category: 'AP',
      saCode: 'SA3.1',
      activityNumber: 1,
      activityName: 'Activitate AP Admin',
    },
  ] as ActivityCatalog[];

  const resolved = resolveExpertActivityCatalog({
    fallbackCatalog,
    backendCatalog,
    expertCategory: 'gt',
  });

  assert.deepEqual(resolved.map((item) => item.id), [
    'backend-ap-sa31-1',
    'fallback-gt-sa11-1',
    'fallback-gt-sa11-2',
  ]);
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
