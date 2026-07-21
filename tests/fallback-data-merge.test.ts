import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterActivityCatalogForFormTab,
  isEventActivityCatalogItem,
  mergeActivityCatalogs,
  normalizeActivityCatalogSaCode,
  resolveExpertActivityCatalog,
  sortActivityCatalog,
} from '../lib/activity-catalog-merge.ts';
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

test('catalogul sorteaza numeric activitatile din acelasi SA', () => {
  const sorted = sortActivityCatalog([
    { ...fallbackCatalog[0], id: 'activity-10', activityNumber: 10, activityName: 'Activitatea 10' },
    { ...fallbackCatalog[0], id: 'activity-2', activityNumber: 2, activityName: 'Activitatea 2' },
    { ...fallbackCatalog[0], id: 'activity-1', activityNumber: 1, activityName: 'Activitatea 1' },
  ]);

  assert.deepEqual(sorted.map((item) => item.activityNumber), [1, 2, 10]);
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

test('formularul completeaza catalogul Admin partial cu fallback-ul local', () => {
  const bhFallbackCatalog = [
    {
      id: 'fallback-bh-sa32-old',
      category: 'bh',
      saCode: 'SA3.2',
      activityNumber: 1,
      activityName: 'S4 — Activitate Business HUB Bucuresti',
    },
    {
      id: 'fallback-bh-sa34-1',
      category: 'bh',
      saCode: 'SA3.4',
      activityNumber: 1,
      activityName: 'Organizare eveniment',
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

  assert.deepEqual(resolved.map((item) => item.id), ['admin-bh-sa32-1', 'admin-bh-sa32-2', 'fallback-bh-sa34-1']);
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
  test(`formularul foloseste Admin peste fallback, dar pastreaza completarile pentru ${backendCategory}`, () => {
    const staleFallback = [
      {
        id: `fallback-${expertCategory}-old`,
        category: expertCategory,
        saCode: 'SA3.2',
        activityNumber: 1,
        activityName: 'Activitate veche fallback',
      },
      {
        id: `fallback-${expertCategory}-extra`,
        category: expertCategory,
        saCode: 'SA3.4',
        activityNumber: 1,
        activityName: 'Activitate fallback suplimentara',
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

    assert.deepEqual(new Set(resolved.map((item) => item.id)), new Set([`admin-${expertCategory}-1`, `fallback-${expertCategory}-extra`]));
    assert.equal(resolved.some((item) => item.id === `fallback-${expertCategory}-old`), false);
  });
});

test('codurile SA din catalog sunt comparate normalizat', () => {
  assert.equal(normalizeActivityCatalogSaCode(' SA 3.2 '), 'SA3.2');
});

test('filtrarea formularului nu amesteca activitati cu acelasi SA din categorii diferite', () => {
  const catalog = mergeActivityCatalogs([
    {
      id: 'ap-sa32-random',
      category: 'ap',
      saCode: 'SA3.2',
      activityNumber: 1,
      activityName: 'S1 - Monitorizare legislativa regionala',
    },
    {
      id: 'bh-sa32-corect',
      category: 'bh',
      saCode: 'SA3.2',
      activityNumber: 1,
      activityName: 'Administrarea si optimizarea utilizarii echipamentelor IT',
    },
  ] as ActivityCatalog[]);
  const allowedSaCodes = new Set(['SA3.2'].map(normalizeActivityCatalogSaCode));
  const filtered = catalog.filter((item) =>
    item.category === 'bh'
    && allowedSaCodes.has(normalizeActivityCatalogSaCode(item.saCode)),
  );

  assert.deepEqual(filtered.map((item) => item.id), ['bh-sa32-corect']);
});

test('formularul separa activitatile standard de activitatile de eveniment dupa categoria serviciului', () => {
  const catalog = [
    {
      id: 'ap-standard',
      category: 'ap',
      saCode: 'SA3.1',
      activityNumber: 1,
      serviceCategory: 'Analiza si politici publice',
      activityName: 'Monitorizare legislativa',
    },
    {
      id: 'ap-event',
      category: 'ap',
      saCode: 'SA3.4',
      activityNumber: 2,
      serviceCategory: 'Reprezentare și participare la evenimente',
      activityName: 'Organizare eveniment / masa rotunda / dezbatere',
    },
  ] as ActivityCatalog[];

  assert.deepEqual(filterActivityCatalogForFormTab(catalog, 'standard').map((item) => item.id), ['ap-standard']);
  assert.deepEqual(filterActivityCatalogForFormTab(catalog, 'event').map((item) => item.id), ['ap-event']);
  assert.deepEqual(filterActivityCatalogForFormTab(catalog, 'business_hub').map((item) => item.id), ['ap-standard', 'ap-event']);
});

test('categoria de eveniment este recunoscuta indiferent de diacritice', () => {
  assert.equal(
    isEventActivityCatalogItem({
      serviceCategory: 'Reprezentare si participare la evenimente',
    } as ActivityCatalog),
    true,
  );
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
