import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBusinessHubPvRows,
  getBusinessHubMetaMissingFields,
  parseBusinessHubMetaJson,
  serializeBusinessHubMeta,
} from '../lib/business-hub-reporting.ts';
import { BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE, getActivityFormRoleConfig } from '../lib/roles/business-hub.ts';
import type { Activity } from '../lib/types.ts';

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
    interval: '10:00-12:00',
    contactPersonName: 'Maria Popescu',
    signature: '',
  }]);
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
