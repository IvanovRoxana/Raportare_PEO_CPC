import type { Activity, BusinessHubEventMeta } from './types.ts';
import { getMonthName } from './app-utils.ts';
import { normalizePeoCategory } from './peo-category.ts';

export type BusinessHubContactSource = 'entity_directory' | 'manual' | 'empty';

export function parseBusinessHubMetaJson(value?: string | null): BusinessHubEventMeta | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BusinessHubEventMeta>;
    return normalizeBusinessHubMeta(parsed);
  } catch {
    return null;
  }
}

export function normalizeBusinessHubMeta(input: Partial<BusinessHubEventMeta>): BusinessHubEventMeta {
  const contactPersonName = cleanString(input.contactPersonName);
  return {
    entityName: cleanString(input.entityName),
    eventTitle: cleanString(input.eventTitle),
    date: cleanString(input.date),
    startTime: cleanString(input.startTime),
    endTime: cleanString(input.endTime),
    ...(contactPersonName ? { contactPersonName } : {}),
    contactSource: normalizeContactSource(input.contactSource, contactPersonName),
  };
}

export function serializeBusinessHubMeta(input: Partial<BusinessHubEventMeta>) {
  return JSON.stringify(normalizeBusinessHubMeta(input));
}

export function getBusinessHubMetaMissingFields(input: Partial<BusinessHubEventMeta>) {
  const meta = normalizeBusinessHubMeta(input);
  const missing: string[] = [];
  if (!meta.entityName) missing.push('entitatea organizatoare');
  if (!meta.eventTitle) missing.push('titlul evenimentului');
  if (!meta.date) missing.push('data evenimentului');
  if (!meta.startTime) missing.push('ora de inceput');
  if (!meta.endTime) missing.push('ora de final');
  return missing;
}

export function isBusinessHubActivity(activity: Activity, expertCategory?: string | null) {
  return normalizePeoCategory(expertCategory ?? undefined) === 'bh'
    && activity.saCode === 'SA3.2'
    && Boolean(parseBusinessHubMetaJson(activity.businessHubMetaJson));
}

export function buildBusinessHubPvRows(
  activities: Activity[],
  expertCategory: string | undefined,
  month: number,
  year: number,
) {
  return activities
    .filter((activity) => isBusinessHubActivity(activity, expertCategory))
    .filter((activity) => {
      const [activityYear, activityMonth] = activity.date.split('-').map(Number);
      return activityYear === year && activityMonth === month + 1;
    })
    .map((activity) => {
      const meta = parseBusinessHubMetaJson(activity.businessHubMetaJson)!;
      return {
        entityName: meta.entityName,
        eventTitle: meta.eventTitle,
        date: meta.date || activity.date,
        interval: [meta.startTime, meta.endTime].filter(Boolean).join('-'),
        contactPersonName: meta.contactPersonName || '',
        signature: '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.entityName.localeCompare(b.entityName));
}

export function buildBusinessHubPvText(
  activities: Activity[],
  expertCategory: string | undefined,
  month: number,
  year: number,
) {
  const monthName = getMonthName(month);
  const rows = buildBusinessHubPvRows(activities, expertCategory, month, year);
  const lines = [
    'PROCES-VERBAL EVENIMENTE BUSINESS HUB',
    `Luna: ${monthName} ${year}`,
    '',
    'Nr.\tEntitate\tEveniment\tData\tInterval orar\tPersoana contact\tSemnatura',
    ...rows.map((row, index) => [
      String(index + 1),
      row.entityName,
      row.eventTitle,
      row.date,
      row.interval,
      row.contactPersonName,
      row.signature,
    ].join('\t')),
    '',
    `Total evenimente: ${rows.length}`,
  ];

  return lines.join('\n');
}

export function buildBusinessHubPvFilename(month: number, year: number) {
  return `Proces-verbal_evenimente_Business_HUB_${getMonthName(month)}_${year}.txt`;
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeContactSource(value: unknown, contactPersonName: string): BusinessHubContactSource {
  if (value === 'entity_directory') return 'entity_directory';
  if (value === 'manual') return 'manual';
  if (value === 'empty') return 'empty';
  return contactPersonName ? 'manual' : 'empty';
}

export type GdprBusinessHubEvent = {
  federation: string;
  event: string;
  date: string;
  room: string;
  interval: string;
  signature?: string;
};

export function parseBusinessHubPvRows(rows: unknown[][]): { monthLabel: string; events: GdprBusinessHubEvent[] } {
  const textRows = rows.map((row) => row.map((cell) => formatSpreadsheetCell(cell)));
  const allText = textRows.flat().join(' ');
  const monthMatch = allText.match(/luna\s+([A-Za-zĂÂÎȘȚăâîșț]+)\s+(\d{4})/i);
  const monthLabel = monthMatch ? `${monthMatch[1]} ${monthMatch[2]}` : '';
  const headerIndex = textRows.findIndex((row) =>
    row.some((cell) => /federa/i.test(cell))
    && row.some((cell) => /eveniment/i.test(cell))
    && row.some((cell) => /^data$/i.test(cell)),
  );
  if (headerIndex < 0) {
    throw new Error('Nu am gasit tabelul de evenimente in procesul-verbal Business HUB.');
  }

  const header = textRows[headerIndex];
  const federationIndex = findHeaderIndex(header, /federa|asocia/i);
  const eventIndex = findHeaderIndex(header, /eveniment/i);
  const dateIndex = findHeaderIndex(header, /^data$/i);
  const roomIndex = findHeaderIndex(header, /sala/i);
  const intervalIndex = findHeaderIndex(header, /interval/i);
  const signatureIndex = findHeaderIndex(header, /semn/i);
  const events: GdprBusinessHubEvent[] = [];
  let currentFederation = '';

  for (const row of textRows.slice(headerIndex + 1)) {
    const federation = row[federationIndex] || '';
    const event = row[eventIndex] || '';
    const date = row[dateIndex] || '';
    const room = row[roomIndex] || '';
    const interval = row[intervalIndex] || '';
    const signature = row[signatureIndex] || '';
    if (federation) currentFederation = federation;
    if (!event && !date && !room && !interval) continue;
    if (!event || !date) continue;
    events.push({
      federation: currentFederation,
      event,
      date,
      room,
      interval,
      signature,
    });
  }

  if (events.length === 0) {
    throw new Error('Procesul-verbal a fost citit, dar nu am gasit evenimente cu data completata.');
  }

  return { monthLabel, events };
}

function findHeaderIndex(row: string[], pattern: RegExp) {
  const index = row.findIndex((cell) => pattern.test(cell));
  if (index < 0) {
    throw new Error('Tabelul din PV nu are coloanele asteptate pentru Business HUB.');
  }
  return index;
}

function formatSpreadsheetCell(value: unknown) {
  if (value instanceof Date) {
    return value.toLocaleDateString('ro-RO');
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
