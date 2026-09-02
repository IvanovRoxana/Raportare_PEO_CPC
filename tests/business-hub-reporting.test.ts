import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBusinessHubPvXlsx,
  buildBusinessHubPvRows,
  getBusinessHubMetaMissingFields,
  parseBusinessHubMetaJson,
  resolveBusinessHubEntitiesForRows,
  serializeBusinessHubMeta,
} from '../lib/business-hub-reporting.ts';
import {
  BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
  getActivityFormRoleConfig,
  isBusinessHubRegistryActivity,
  shouldShowGrupTintaActivitySection,
} from '../lib/roles/business-hub.ts';
import type { Activity, BusinessHubEntityDirectoryEntry } from '../lib/types.ts';
import * as XLSX from 'xlsx';

test('role resolver enables Business Hub preset only for BH category', () => {
  const bh = getActivityFormRoleConfig({ category: 'Business Hub' });
  const gdpr = getActivityFormRoleConfig({ category: 'gdpr' });

  assert.equal(bh.category, 'bh');
  assert.equal(bh.enabledSections.businessHubTab, true);
  assert.equal(bh.enabledSections.entityRequestUpload, false);
  assert.equal(bh.defaultSaCode, 'SA3.2');
  assert.equal(bh.defaultActivityTitle, BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE);
  assert.equal(gdpr.enabledSections.businessHubTab, false);
  assert.equal(gdpr.enabledSections.gdprAssistant, true);
});

test('activity form shows Grup Tinta only for GT recruitment and selection expert on SA1.1 collaboration', () => {
  assert.equal(shouldShowGrupTintaActivitySection({
    expert: { category: 'gt' },
    wizardStep: 'collaboration',
    saCode: 'SA1.1',
  }), true);

  for (const category of ['ap', 'com', 'bh', 'gdpr', 'cercetare', 'cr']) {
    assert.equal(shouldShowGrupTintaActivitySection({
      expert: { category },
      wizardStep: 'collaboration',
      saCode: 'SA1.1',
    }), false, `category ${category} must not see the Grup Tinta activity section`);
  }

  assert.equal(shouldShowGrupTintaActivitySection({
    expert: { category: 'gt' },
    wizardStep: 'review',
    saCode: 'SA1.1',
  }), false);
  assert.equal(shouldShowGrupTintaActivitySection({
    expert: { category: 'gt' },
    wizardStep: 'collaboration',
    saCode: 'SA3.2',
  }), false);
});

test('Business Hub metadata keeps the approved field set and derives contact source', () => {
  const json = serializeBusinessHubMeta({
    entityName: 'CPBR',
    eventTitle: 'Sedinta de lucru',
    date: '2026-05-04',
    startTime: '10:00',
    endTime: '12:00',
    contactPersonName: 'Maria Popescu',
  });

  assert.deepEqual(parseBusinessHubMetaJson(json), {
    entityName: 'CPBR',
    eventTitle: 'Sedinta de lucru',
    date: '2026-05-04',
    startTime: '10:00',
    endTime: '12:00',
    contactPersonName: 'Maria Popescu',
    contactSource: 'manual',
  });
});

test('Business Hub metadata validation requires only registry essentials', () => {
  assert.deepEqual(getBusinessHubMetaMissingFields({
    entityName: 'CPBR',
    eventTitle: '',
    date: '2026-05-04',
    startTime: '',
    endTime: '12:00',
  }), ['titlul evenimentului', 'ora de inceput']);
});

test('Business Hub legacy registry activity is recognized without metadata', () => {
  const registryActivity = {
    saCode: 'SA3.2',
    activityType: BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
    title: BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
  };

  assert.equal(isBusinessHubRegistryActivity(registryActivity, 'bh'), true);
  assert.equal(isBusinessHubRegistryActivity(registryActivity, 'ap'), false);
});

test('monthly PV rows include only BH activities from selected month', () => {
  const activities: Activity[] = [
    activity('1', '2026-05-04', serializeBusinessHubMeta({
      entityName: 'CPBR',
      eventTitle: 'Sedinta de lucru',
      date: '2026-05-04',
      startTime: '10:00',
      endTime: '12:00',
      contactPersonName: 'Maria Popescu',
    })),
    activity('2', '2026-06-01', serializeBusinessHubMeta({
      entityName: 'ANIS',
      eventTitle: 'Workshop',
      date: '2026-06-01',
      startTime: '09:00',
      endTime: '10:00',
    })),
    { ...activity('3', '2026-05-10', undefined), businessHubMetaJson: undefined },
  ];

  assert.deepEqual(buildBusinessHubPvRows(activities, 'bh', 4, 2026), [{
    entityName: 'CPBR',
    eventTitle: 'Sedinta de lucru',
    date: '2026-05-04',
    room: '',
    interval: '10:00-12:00',
    contactPersonName: 'Maria Popescu',
    signature: '',
  }]);
});

test('Business Hub PV XLSX has two sheets and keeps Sala empty', () => {
  const activities: Activity[] = [
    activity('1', '2026-05-04', serializeBusinessHubMeta({
      entityName: 'CPBR',
      eventTitle: 'Sedinta de lucru',
      date: '2026-05-04',
      startTime: '10:00',
      endTime: '12:00',
      contactPersonName: 'Maria Popescu',
    })),
  ];

  const workbook = XLSX.read(buildBusinessHubPvXlsx(activities, 'bh', 4, 2026), { type: 'array' });
  assert.deepEqual(workbook.SheetNames, ['PV-Ev BH', 'Anexa GDPR']);
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['PV-Ev BH'], { header: 1 });
  assert.deepEqual(rows[3], ['Federatie/Asociatie', 'Eveniment', 'Data', 'Sala', 'Interval orar', 'Semnatura']);
  assert.equal(rows[4][3] ?? '', '');
});

test('Business Hub entity resolver prioritizes affiliates and reports missing entities', () => {
  const rows = buildBusinessHubPvRows([
    activity('1', '2026-05-04', serializeBusinessHubMeta({
      entityName: 'CPBR',
      eventTitle: 'Sedinta de lucru',
      date: '2026-05-04',
      startTime: '10:00',
      endTime: '12:00',
    })),
    activity('2', '2026-05-05', serializeBusinessHubMeta({
      entityName: 'LIPSA',
      eventTitle: 'Sedinta',
      date: '2026-05-05',
      startTime: '10:00',
      endTime: '11:00',
    })),
  ], 'bh', 4, 2026);
  const directory: BusinessHubEntityDirectoryEntry[] = [
    entity('gt-1', 'target_group', 'CPBR', 'CPBR GT'),
    entity('aff-1', 'affiliate', 'CPBR', 'CPBR Afiliata'),
  ];

  const result = resolveBusinessHubEntitiesForRows(rows, directory);
  assert.equal(result.resolved.get('CPBR')?.legalName, 'CPBR Afiliata');
  assert.deepEqual(result.missing, ['LIPSA']);
});

function activity(id: string, date: string, businessHubMetaJson?: string): Activity {
  return {
    id,
    date,
    expertId: 'alexandru-enache',
    expertName: 'Alexandru Enache',
    hours: 8,
    activityType: BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
    saCode: 'SA3.2',
    title: BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
    businessHubMetaJson,
  };
}

function entity(id: string, directoryType: string, acronym: string, legalName: string): BusinessHubEntityDirectoryEntry {
  return {
    id,
    directoryType,
    acronym,
    legalName,
    status: 'active',
  };
}
