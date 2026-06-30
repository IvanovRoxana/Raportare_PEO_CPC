import type { Activity, BusinessHubEventMeta } from './types.ts';
import type { BusinessHubEntityDirectoryEntry } from './types.ts';
import { getMonthName } from './app-utils.ts';
import { normalizePeoCategory } from './peo-category.ts';
import * as XLSX from 'xlsx';
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

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
        room: '',
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
  return `Proces-verbal evenimente Business HUB - ${getMonthName(month)} ${year}.xlsx`;
}

export function buildBusinessHubPvWorkbook(
  activities: Activity[],
  expertCategory: string | undefined,
  month: number,
  year: number,
) {
  const monthName = getMonthName(month);
  const rows = buildBusinessHubPvRows(activities, expertCategory, month, year);
  const groupedRows = rows.map((row, index, allRows) => {
    const firstForEntity = allRows.findIndex((candidate) => candidate.entityName === row.entityName) === index;
    return [
      firstForEntity ? row.entityName : '',
      row.eventTitle,
      formatBusinessHubDateLabel(row.date),
      row.room,
      row.interval,
      firstForEntity ? row.contactPersonName : '',
    ];
  });

  const pvSheetRows = [
    ['Programul Educatie si Ocupare 2021-2027 | Proiect 302141 - Consolidarea capacitatii Concordia pentru dialog social'],
    [`PROCES VERBAL - Evenimente desfasurate in cadrul Business HUB in luna ${monthName} ${year}`],
    [`Avand in vedere obiectivele asumate in cadrul proiectului, in luna ${monthName} ${year}, s-au desfasurat urmatoarele activitati pentru facilitarea accesului la resursele disponibile in Business HUB:`],
    ['Federatie/Asociatie', 'Eveniment', 'Data', 'Sala', 'Interval orar', 'Semnatura'],
    ...groupedRows,
  ];
  const workbook = XLSX.utils.book_new();
  const pvSheet = XLSX.utils.aoa_to_sheet(pvSheetRows);
  pvSheet['!cols'] = [
    { wch: 28 },
    { wch: 48 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(workbook, pvSheet, 'PV-Ev BH');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildBusinessHubGdprAnnexRows()), 'Anexa GDPR');
  return workbook;
}

export function buildBusinessHubPvXlsx(
  activities: Activity[],
  expertCategory: string | undefined,
  month: number,
  year: number,
) {
  return XLSX.write(buildBusinessHubPvWorkbook(activities, expertCategory, month, year), {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
}

export function buildBusinessHubAddressFilename(entity: BusinessHubEntityDirectoryEntry, month: number, year: number) {
  const today = new Date(year, month + 1, 0);
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  return `${datePrefix}_Adresa_${safeFilenamePart(entity.acronym || entity.displayName || entity.legalName)}_${getMonthName(month)}.docx`;
}

export function resolveBusinessHubEntitiesForRows(
  rows: ReturnType<typeof buildBusinessHubPvRows>,
  directoryEntries: BusinessHubEntityDirectoryEntry[],
) {
  const activeEntries = directoryEntries.filter((entry) => (entry.status ?? 'active') === 'active');
  const sortedEntries = [...activeEntries].sort((a, b) => directoryPriority(a) - directoryPriority(b));
  const missing = new Set<string>();
  const resolved = new Map<string, BusinessHubEntityDirectoryEntry>();

  rows.forEach((row) => {
    if (resolved.has(row.entityName)) return;
    const match = sortedEntries.find((entry) => entityMatches(row.entityName, entry));
    if (match) {
      resolved.set(row.entityName, match);
    } else {
      missing.add(row.entityName);
    }
  });

  return {
    resolved,
    missing: [...missing].sort((a, b) => a.localeCompare(b)),
  };
}

export function groupBusinessHubRowsByEntity(rows: ReturnType<typeof buildBusinessHubPvRows>) {
  const groups = new Map<string, ReturnType<typeof buildBusinessHubPvRows>>();
  rows.forEach((row) => {
    groups.set(row.entityName, [...(groups.get(row.entityName) ?? []), row]);
  });
  return groups;
}

export async function buildBusinessHubAddressDocxBlob(args: {
  entity: BusinessHubEntityDirectoryEntry;
  rows: ReturnType<typeof buildBusinessHubPvRows>;
  month: number;
  year: number;
}) {
  const { entity, rows, month, year } = args;
  const monthName = getMonthName(month);
  const displayName = entity.displayName || entity.acronym || entity.legalName;
  const representativeName = entity.legalRepresentativeName || entity.designatedPersonName || '';
  const representativeRole = entity.legalRepresentativeRole || 'Reprezentant legal';
  const eventLines = rows.map((row) => `${row.eventTitle} - ${formatBusinessHubDateLabel(row.date)}${row.interval ? `, interval ${row.interval}` : ''}`);

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        paragraph(displayName, { bold: true }),
        spacer(),
        paragraph('Catre,'),
        paragraph('Confederatia Patronala Concordia'),
        spacer(),
        paragraph('Subiect: Confirmare utilizare infrastructura BusinessHUB in vederea unei functionari adecvate a structurilor reprezentative ale dialogului social', { bold: true }),
        spacer(),
        paragraph(
          `${entity.legalName}, cu sediul in ${entity.registeredAddress || '........................'}, CUI/CIF ${entity.cuiOrCif || '........................'}, telefon ${entity.phone || '........................'}, email ${entity.email || '........................'}, reprezentata prin ${representativeName || '........................'}${representativeRole ? `, ${representativeRole}` : ''}, confirma utilizarea infrastructurii BusinessHUB Concordia pentru organizarea activitatilor de interes pentru membrii Confederatiei Patronale Concordia.`,
        ),
        ...(entity.designatedPersonName ? [
          paragraph(`Persoana desemnata pentru relationarea operationala privind utilizarea BusinessHUB: ${entity.designatedPersonName}.`),
        ] : []),
        spacer(),
        paragraph(`In acest context, in luna ${monthName} ${year}, ${entity.acronym || displayName} a organizat urmatoarele evenimente:`),
        ...eventLines.map((line) => paragraph(`- ${line}`)),
        spacer(),
        paragraph('Prin utilizarea infrastructurii BusinessHUB, entitatea a beneficiat de acces la resurse logistice si operationale necesare derularii activitatilor, contribuind la imbunatatirea eficientei si functionarii structurilor reprezentative ale dialogului social.'),
        spacer(),
        paragraph(`Data: ${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`),
        spacer(),
        paragraph(`${representativeRole}: ${representativeName || '........................'}`),
        paragraph('Semnatura: __________________________'),
      ],
    }],
  });

  return Packer.toBlob(doc);
}

function paragraph(text: string, options?: { bold?: boolean }) {
  return new Paragraph({
    children: [new TextRun({ text, bold: options?.bold })],
    spacing: { after: 160 },
  });
}

function spacer() {
  return new Paragraph({ text: '', spacing: { after: 160 }, alignment: AlignmentType.LEFT });
}

function buildBusinessHubGdprAnnexRows() {
  return [
    ['ANEXA GDPR'],
    ['Informare privind prelucrarea datelor cu caracter personal in contextul evenimentelor desfasurate in Business HUB.'],
    ['Datele colectate sunt utilizate exclusiv pentru evidenta participarii, raportare si justificarea activitatilor proiectului.'],
    ['Categoriile de date pot include nume, prenume, organizatie, functie, semnatura si date de contact, dupa caz.'],
    ['Temeiul prelucrarii este indeplinirea obligatiilor de raportare si justificare aferente proiectului.'],
    ['Datele sunt pastrate pe durata necesara implementarii, verificarii si auditarii proiectului, conform regulilor aplicabile.'],
    ['Persoanele vizate isi pot exercita drepturile potrivit Regulamentului (UE) 2016/679.'],
  ];
}

function formatBusinessHubDateLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${String(day).padStart(2, '0')} ${getMonthName(month - 1)}`;
}

function directoryPriority(entry: BusinessHubEntityDirectoryEntry) {
  return entry.directoryType === 'affiliate' ? 0 : 1;
}

function entityMatches(entityName: string, entry: BusinessHubEntityDirectoryEntry) {
  const target = normalizeEntityKey(entityName);
  return [
    entry.acronym,
    entry.displayName,
    entry.legalName,
  ].some((value) => normalizeEntityKey(value) === target);
}

function normalizeEntityKey(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
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
