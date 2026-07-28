import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert } from './types';
import {
  calculateMonthlyNormHours,
  getNonWorkingDayInfo,
  toDateKey,
} from './non-working-days.ts';

export type CellInput = string | number | null | { formula: string };

export interface ExportPayload {
  kind: 'peo' | 'consolidated';
  expert: Partial<Expert> & { beneficiary?: string; hourlyRate?: number };
  activities: Partial<Activity>[];
  concurrentProjects?: Partial<ConcurrentProject>[];
  concurrentTimesheetEntries?: Partial<ConcurrentProjectTimesheetEntry>[];
  month: number;
  year: number;
}

interface GeneratedWorkbook {
  buffer: Buffer;
  filename: string;
}

export interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  modTime: number;
  modDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localExtra: Buffer;
  centralExtra: Buffer;
  comment: Buffer;
  diskStart: number;
  internalAttrs: number;
  externalAttrs: number;
  data: Buffer;
}

const PEO_TEMPLATE = path.join(process.cwd(), 'public', 'templates', 'pontaj-peo-template.xlsx');
const CONSOLIDATED_TEMPLATE = path.join(process.cwd(), 'public', 'templates', 'pontaj-consolidat-template.xlsx');
const CONSOLIDATED_NO_GOODWORKS_TEMPLATE = path.join(process.cwd(), 'public', 'templates', 'pontaj-consolidat-fara-goodworks-template.xlsx');

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_COLUMNS = [
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  'AA',
  'AB',
  'AC',
  'AD',
  'AE',
  'AF',
];

const MONTHS_RO = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
];

const MONTHS_EN = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CRC_TABLE = buildCrcTable();
const SUBACTIVITY_TO_ACTIVITY_CODE = new Map([
  ['SA1.1', 'A1'],
  ['SA2.1', 'A2'],
  ['SA3.2', 'A3'],
  ['SA3.3', 'A3'],
  ['SA3.4', 'A3'],
  ['SA3.5', 'A3'],
  ['SA4.1', 'A4'],
  ['SA6.1', 'A6'],
]);
const SUBACTIVITY_NAMES = new Map([
  ['SA1.1', 'Informare, recrutare, selectie GT'],
  ['SA2.1', 'Realizarea de analize cu privire la tendintele manifestate la nivel national'],
  ['SA3.2', 'Asigurarea infrastructurii necesare in vederea unei functionari adecvate a structurilor reprezentative ale dialogului social pentru Confederatia Patronala Concordia si membrii sai'],
  ['SA3.3', 'Realizarea unor campanii in vederea recrutarii de noi membri'],
  ['SA3.4', 'Dezvoltarea si derularea de activitati si servicii suport si informare pentru membri'],
  ['SA3.5', 'Schimb de bune practici la nivel European'],
  ['SA4.1', 'Programe Formare'],
  ['SA6.1', 'Managementul proiectului'],
]);

interface PeoDetailRow {
  day: number;
  dateKey: string;
  dateSerial: number;
  isWorking: boolean;
  activity?: Partial<Activity>;
}

export async function generatePontajExcel(payload: ExportPayload): Promise<GeneratedWorkbook> {
  validateExportPayload(payload);
  return payload.kind === 'peo' ? generatePeoWorkbook(payload) : generateConsolidatedWorkbook(payload);
}

async function generatePeoWorkbook(payload: ExportPayload): Promise<GeneratedWorkbook> {
  const template = await readFile(PEO_TEMPLATE);
  const { entries, files } = readXlsx(template);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheetXml = files.get(sheetPath)!.toString('utf8');
  const daysInMonth = getDaysInMonth(payload.year, payload.month);
  let totalRow = daysInMonth === 31 ? 45 : 44;
  const monthEndSerial = excelSerial(payload.year, payload.month, daysInMonth);
  const grouped = groupActivitiesByDate(payload.activities);
  const detailRows = buildPeoDetailRows(payload.year, payload.month, grouped);
  const extraRows = Math.max(0, detailRows.length - daysInMonth);
  const dailyHours = getExpertDailyHours(payload.expert);
  const cimDailyHours = getExpertCimDailyHours(payload.expert);
  const hourlyRate = getExpertHourlyRate(payload.expert);
  const lastPeoWorkedDateSerial = getLastPeoWorkedDateSerial(payload.activities, payload.year, payload.month) ?? monthEndSerial;

  if (daysInMonth === 31) {
    sheetXml = insertPeoDay31Row(sheetXml);
  }
  if (extraRows > 0) {
    sheetXml = insertWorksheetRows(sheetXml, totalRow, extraRows);
    totalRow += extraRows;
  }

  sheetXml = setCell(sheetXml, 'G8', stringValue(payload.expert.name));
  sheetXml = setCell(sheetXml, 'G9', stringValue(getExpertPosition(payload.expert)));
  sheetXml = setCell(sheetXml, 'G10', stringValue(getExpertCategoryForExport(payload.expert)));
  sheetXml = setCell(sheetXml, 'G11', stringValue(payload.expert.beneficiary ?? 'CONFEDERATIA PATRONALA CONCORDIA'));
  sheetXml = setCell(sheetXml, 'G12', stringValue(getProjectTitle(payload.expert)));

  const peoDayRows = 30 + (daysInMonth === 31 ? 1 : 0) + extraRows;
  for (let index = 0; index < peoDayRows; index += 1) {
    const detail = detailRows[index];
    const row = 14 + index;
    const activity = detail?.activity;
    const leaveCode = activity ? getLeaveCode([activity]) : null;
    const hours = detail?.isWorking && activity ? Number(activity.hours) || 0 : 0;

    sheetXml = setCell(sheetXml, `A${row}`, detail ? detail.dateSerial : null);
    sheetXml = setCell(sheetXml, `B${row}`, (hours > 0 || leaveCode) && activity ? activityCode(activity, payload.expert) : null);
    sheetXml = setCell(sheetXml, `D${row}`, (hours > 0 || leaveCode) && activity ? activitySubactivity(activity) : null);
    sheetXml = setCell(sheetXml, `G${row}`, hourlyRate && (hours > 0 || leaveCode) ? hourlyRate : null);
    sheetXml = setCell(sheetXml, `H${row}`, leaveCode ?? (hours > 0 ? hours : null));
    sheetXml = setCell(sheetXml, `I${row}`, detail?.isWorking ? Math.max(0, cimDailyHours - dailyHours) : null);
  }

  const lastDayRow = 13 + detailRows.length;
  sheetXml = setCell(sheetXml, `A${totalRow}`, 'NR. TOTAL DE ORE');
  sheetXml = setCell(sheetXml, `H${totalRow}`, { formula: `SUM(H14:H${lastDayRow})+COUNTIF(H14:H${lastDayRow},"CO")*${dailyHours}` });
  sheetXml = setCell(sheetXml, `I${totalRow}`, { formula: `SUM(I14:I${lastDayRow})` });
  sheetXml = setCell(sheetXml, `D${totalRow + 5}`, lastPeoWorkedDateSerial);
  sheetXml = setCell(sheetXml, `D${totalRow + 9}`, lastPeoWorkedDateSerial);

  files.set(sheetPath, Buffer.from(sheetXml, 'utf8'));
  files.set('xl/workbook.xml', Buffer.from(setFullCalcOnLoad(files.get('xl/workbook.xml')!.toString('utf8')), 'utf8'));
  return {
    buffer: writeXlsx(entries, files),
    filename: filenameFor('Pontaj_PEO', payload),
  };
}

async function generateConsolidatedWorkbook(payload: ExportPayload): Promise<GeneratedWorkbook> {
  const hasGoodworks = hasGoodworksProject(payload.concurrentProjects ?? []);
  const template = await readFile(hasGoodworks ? CONSOLIDATED_TEMPLATE : CONSOLIDATED_NO_GOODWORKS_TEMPLATE);
  const { entries, files } = readXlsx(template);
  const workbookXml = files.get('xl/workbook.xml')!.toString('utf8');
  const relsXml = files.get('xl/_rels/workbook.xml.rels')!.toString('utf8');
  const sheetPath = getWorksheetPath(workbookXml, relsXml, sheetNameForMonth(payload.month, payload.year));
  let sheetXml = files.get(sheetPath)!.toString('utf8');
  const sharedStrings = readSharedStrings(files);
  const daysInMonth = getDaysInMonth(payload.year, payload.month);
  const norm = calculateMonthlyNormHours({ month: payload.month, year: payload.year, dailyHours: 8 });
  const grouped = groupActivitiesByDate(payload.activities);
  const goodworksEntries = getGoodworksEntries(payload.concurrentProjects ?? [], payload.concurrentTimesheetEntries ?? [], payload.month, payload.year);
  const goodworksByDate = getGoodworksHours(payload.concurrentProjects ?? [], goodworksEntries, payload.month, payload.year);
  let peoSection = getPeoDetailSection(sheetXml, sharedStrings);
  const goodworksSection = hasGoodworks ? getGoodworksDetailSection(sheetXml, sharedStrings) : null;
  const detailRows = buildPeoDetailRows(payload.year, payload.month, grouped);
  const extraRows = Math.max(0, detailRows.length - peoSection.dayRows);
  if (extraRows > 0) {
    sheetXml = insertWorksheetRows(sheetXml, peoSection.totalRow, extraRows);
    peoSection = { ...peoSection, totalRow: peoSection.totalRow + extraRows, dayRows: peoSection.dayRows + extraRows };
  }
  const detailEnd = peoSection.totalRow - 1;
  const dailyHours = getExpertDailyHours(payload.expert);
  const cimDailyHours = getExpertCimDailyHours(payload.expert);
  const hourlyRate = getExpertHourlyRate(payload.expert);
  const monthEndSerial = excelSerial(payload.year, payload.month, daysInMonth);
  const lastPeoWorkedDateSerial = getLastPeoWorkedDateSerial(payload.activities, payload.year, payload.month) ?? monthEndSerial;
  const summaryRows = hasGoodworks
    ? { concordia: 15, goodworks: 16, peo: 17, total: 18 }
    : { concordia: 15, peo: 16, total: 17 };

  sheetXml = setCell(sheetXml, 'B8', `Timesheet   / Name: ${payload.expert.name ?? 'Expert'} / Position: ${getExpertPosition(payload.expert)}`);
  sheetXml = setCell(sheetXml, 'B11', 'Organisation: Concordia Employers Confederation');
  sheetXml = setCell(sheetXml, 'A12', `${MONTHS_EN[payload.month]} ${payload.year} - ${norm.normHours} working hours`);
  sheetXml = setCell(sheetXml, `A${summaryRows.concordia}`, 'CONCORDIA');
  if (hasGoodworks) {
    sheetXml = setCell(sheetXml, `A${summaryRows.goodworks}`, 'GOODWORKS4ALL');
  }
  sheetXml = setCell(sheetXml, `A${summaryRows.peo}`, `PEO_${getExpertPosition(payload.expert)}`);

  for (let index = 0; index < DAY_COLUMNS.length; index += 1) {
    const day = index + 1;
    const col = DAY_COLUMNS[index];
    const inMonth = day <= daysInMonth;
    const dateKey = inMonth ? isoDate(payload.year, payload.month, day) : '';
    const info = inMonth ? getNonWorkingDayInfo(dateKey) : null;
    const isWorking = !!info && !info.isNonWorkingDay;
    const peoLeaveCode = inMonth ? getLeaveCode(grouped.get(dateKey) ?? []) : null;
    const goodworksLeaveCode = inMonth ? getLeaveCode(goodworksByDate.get(dateKey) ?? []) : null;
    const hasLeave = !!peoLeaveCode || !!goodworksLeaveCode;

    sheetXml = setCell(sheetXml, `${col}13`, inMonth ? day : null);
    sheetXml = setCell(sheetXml, `${col}14`, inMonth ? WEEKDAYS_EN[new Date(payload.year, payload.month, day).getDay()] : null);
    sheetXml = setCell(sheetXml, `${col}${summaryRows.concordia}`, isWorking && !hasLeave ? { formula: `MAX(0,${cimDailyHours}-SUM(${col}${hasGoodworks ? summaryRows.goodworks : summaryRows.peo}:${col}${summaryRows.peo}))` } : null);
    if (hasGoodworks) {
      const goodworksCell = goodworksLeaveCode ?? (isWorking ? { formula: `SUMIFS($E$${goodworksSection!.startRow}:$E$${goodworksSection!.totalRow - 1},$A$${goodworksSection!.startRow}:$A$${goodworksSection!.totalRow - 1},"="&DATE(${payload.year},${payload.month + 1},${col}13))` } : null);
      sheetXml = setCell(sheetXml, `${col}${summaryRows.goodworks}`, goodworksCell);
    }
    sheetXml = setCell(
      sheetXml,
      `${col}${summaryRows.peo}`,
      peoLeaveCode ?? (isWorking ? { formula: `SUMIFS($AL$${peoSection.startRow}:$AL$${detailEnd},$A$${peoSection.startRow}:$A$${detailEnd},"="&DATE(${payload.year},${payload.month + 1},${col}13))` } : null),
    );
    sheetXml = setCell(sheetXml, `${col}${summaryRows.total}`, isWorking ? { formula: `SUM(${col}${summaryRows.concordia}:${col}${summaryRows.peo})` } : null);
  }
  sheetXml = setTimesheetSummaryTotals(sheetXml, summaryRows, dailyHours, getGoodworksDailyHours(payload.concurrentProjects ?? []), cimDailyHours);

  if (goodworksSection) {
    for (let index = 0; index < goodworksSection.dayRows; index += 1) {
      const day = index + 1;
      const row = goodworksSection.startRow + index;
      const inMonth = day <= daysInMonth;
      const dateKey = inMonth ? isoDate(payload.year, payload.month, day) : '';
      const info = inMonth ? getNonWorkingDayInfo(dateKey) : null;
      const isWorking = !!info && !info.isNonWorkingDay;
      const dayEntries = isWorking ? goodworksByDate.get(dateKey) ?? [] : [];
      const leaveCode = getLeaveCode(dayEntries);
      const hours = sumConcurrentHours(dayEntries);

      sheetXml = setCell(sheetXml, `A${row}`, inMonth ? excelSerial(payload.year, payload.month, day) : null);
      sheetXml = setCell(sheetXml, `B${row}`, null);
      sheetXml = setCell(sheetXml, `C${row}`, hours > 0 ? joinUnique(dayEntries.map((entry) => entry.wp ?? '')) : null);
      sheetXml = setCell(sheetXml, `D${row}`, null);
      sheetXml = setCell(sheetXml, `E${row}`, leaveCode ?? (hours > 0 ? hours : null));
      sheetXml = setCell(sheetXml, `F${row}`, leaveCode ?? (hours > 0 ? joinUnique(dayEntries.map((entry) => entry.taskName ?? '')) : null));
      sheetXml = setCell(sheetXml, `AG${row}`, hours > 0 ? joinUnique(dayEntries.map((entry) => entry.relevantDeliverable ?? '')) : null);
    }
  }

  sheetXml = setCell(sheetXml, `G${peoSection.headerRow - 5}`, stringValue(payload.expert.name));
  sheetXml = setCell(sheetXml, `G${peoSection.headerRow - 4}`, stringValue(getExpertPosition(payload.expert)));
  sheetXml = setCell(sheetXml, `G${peoSection.headerRow - 3}`, stringValue(getExpertCategoryForExport(payload.expert)));
  sheetXml = setCell(sheetXml, `G${peoSection.headerRow - 2}`, stringValue(payload.expert.beneficiary ?? 'CONFEDERATIA PATRONALA CONCORDIA'));
  sheetXml = setCell(sheetXml, `G${peoSection.headerRow - 1}`, stringValue(getProjectTitle(payload.expert)));

  for (let index = 0; index < peoSection.dayRows; index += 1) {
    const detail = detailRows[index];
    const row = peoSection.startRow + index;
    const activity = detail?.activity;
    const leaveCode = activity ? getLeaveCode([activity]) : null;
    const hours = detail?.isWorking && activity ? Number(activity.hours) || 0 : 0;

    sheetXml = setCell(sheetXml, `A${row}`, detail ? detail.dateSerial : null);
    sheetXml = setCell(sheetXml, `B${row}`, (hours > 0 || leaveCode) && activity ? activityCode(activity, payload.expert) : null);
    sheetXml = setCell(sheetXml, `D${row}`, (hours > 0 || leaveCode) && activity ? activitySubactivity(activity) : null);
    sheetXml = setCell(sheetXml, `AK${row}`, hourlyRate && (hours > 0 || leaveCode) ? hourlyRate : null);
    sheetXml = setCell(sheetXml, `AL${row}`, leaveCode ?? (hours > 0 ? hours : null));
    sheetXml = setCell(
      sheetXml,
      `AM${row}`,
      detail?.isWorking
        ? {
            formula: `IF(OR(AL${row}="CO",AL${row}="CM"),AL${row},IF(COUNTIF(AO:AO,A${row})=0,0,(${cimDailyHours}-SUMIF(AO:AO,A${row},AL:AL))/COUNTIF(AO:AO,A${row})))`,
          }
        : null,
    );
    sheetXml = setCell(sheetXml, `AN${row}`, (hours > 0 || leaveCode) && activity ? activityDescription(activity) : null);
    sheetXml = setCell(sheetXml, `AO${row}`, detail?.isWorking ? detail.dateSerial : null);
    sheetXml = setCell(sheetXml, `AP${row}`, detail?.isWorking ? { formula: `LEFT(D${row},6)` } : null);
    sheetXml = setCell(sheetXml, `AQ${row}`, null);
    sheetXml = setCell(sheetXml, `AR${row}`, null);
    sheetXml = setCell(sheetXml, `AS${row}`, null);
    sheetXml = setCell(sheetXml, `AT${row}`, null);
    sheetXml = setCell(sheetXml, `AU${row}`, null);
    sheetXml = setCell(sheetXml, `AV${row}`, null);
    sheetXml = setCell(sheetXml, `AW${row}`, null);
    sheetXml = setCell(sheetXml, `AX${row}`, null);
    sheetXml = setCell(sheetXml, `AY${row}`, null);
    sheetXml = setCell(sheetXml, `AZ${row}`, null);
    sheetXml = setCell(sheetXml, `BA${row}`, null);
    sheetXml = setCell(sheetXml, `BB${row}`, hours > 0 && activity ? joinUnique(activityDeliverables(activity)) : null);
  }

  sheetXml = setCell(sheetXml, `AL${peoSection.totalRow}`, {
    formula: `SUM(AL${peoSection.startRow}:AL${detailEnd})+COUNTIF(AL${peoSection.startRow}:AL${detailEnd},"CO")*${dailyHours}`,
  });
  sheetXml = setCell(sheetXml, `AM${peoSection.totalRow}`, {
    formula: `SUM(AM${peoSection.startRow}:AM${detailEnd})+COUNTIF(AM${peoSection.startRow}:AM${detailEnd},"CO")*${Math.max(0, cimDailyHours - dailyHours)}`,
  });
  sheetXml = setCell(sheetXml, `D${peoSection.totalRow + 3}`, stringValue(payload.expert.name));
  sheetXml = setCell(sheetXml, `D${peoSection.totalRow + 5}`, lastPeoWorkedDateSerial);
  sheetXml = setCell(sheetXml, `D${peoSection.totalRow + 9}`, lastPeoWorkedDateSerial);

  files.set(sheetPath, Buffer.from(sheetXml, 'utf8'));
  files.set('xl/workbook.xml', Buffer.from(setFullCalcOnLoad(files.get('xl/workbook.xml')!.toString('utf8')), 'utf8'));
  return {
    buffer: writeXlsx(entries, files),
    filename: filenameFor('Pontaj_final_consolidat', payload),
  };
}

function validateExportPayload(payload: ExportPayload) {
  if (!payload.expert?.name) {
    throw new Error('Expertul este obligatoriu pentru export.');
  }

  if (!Number.isInteger(payload.month) || payload.month < 0 || payload.month > 11) {
    throw new Error('Luna exportului este invalida.');
  }

  if (!Number.isInteger(payload.year) || payload.year < 2024 || payload.year > 2030) {
    throw new Error('Anul exportului este invalid.');
  }

  const invalidActivities = (payload.activities ?? []).filter((activity) => {
    if (!activity.date || !activity.hours) return false;
    return getNonWorkingDayInfo(activity.date).isNonWorkingDay;
  });
  const invalidConcurrentEntries = (payload.concurrentTimesheetEntries ?? []).filter((entry) => {
    if (!entry.date || !entry.hours) return false;
    return getNonWorkingDayInfo(entry.date).isNonWorkingDay;
  });

  if (invalidActivities.length > 0) {
    const dates = [...new Set(invalidActivities.map((activity) => activity.date).filter(Boolean))].join(', ');
    throw new Error(`Exportul a fost oprit: exista ore PEO pontate in zile nelucratoare (${dates}). Corecteaza activitatile inainte de export.`);
  }

  if (invalidConcurrentEntries.length > 0) {
    const dates = [...new Set(invalidConcurrentEntries.map((entry) => entry.date).filter(Boolean))].join(', ');
    throw new Error(`Exportul a fost oprit: exista ore pe proiecte paralele pontate in zile nelucratoare (${dates}). Corecteaza pontajele paralele inainte de export.`);
  }
}

function setTimesheetSummaryTotals(
  sheetXml: string,
  rows: { concordia: number; goodworks?: number; peo: number; total: number },
  peoDailyHours: number,
  goodworksDailyHours: number,
  cimDailyHours = 8,
) {
  const concordiaDailyHours = Math.max(0, cimDailyHours - peoDailyHours - goodworksDailyHours);
  sheetXml = setTimesheetRowTotals(sheetXml, rows.concordia, concordiaDailyHours);
  if (rows.goodworks) {
    sheetXml = setTimesheetRowTotals(sheetXml, rows.goodworks, goodworksDailyHours);
  }
  sheetXml = setTimesheetRowTotals(sheetXml, rows.peo, peoDailyHours);

  for (const col of ['AG', 'AH', 'AI', 'AJ', 'AK', 'AL']) {
    sheetXml = setCell(sheetXml, `${col}${rows.total}`, { formula: `SUM(${col}${rows.concordia}:${col}${rows.peo})` });
  }

  return sheetXml;
}

function setTimesheetRowTotals(sheetXml: string, row: number, dailyHours: number) {
  sheetXml = setCell(sheetXml, `AG${row}`, { formula: `SUM(B${row}:AF${row})+COUNTIF(B${row}:AF${row},"DE")*${dailyHours}` });
  sheetXml = setCell(sheetXml, `AH${row}`, { formula: `AG${row}/8` });
  sheetXml = setCell(sheetXml, `AI${row}`, { formula: `COUNTIF(B${row}:AF${row},"CO")*${dailyHours}` });
  sheetXml = setCell(sheetXml, `AJ${row}`, { formula: `AI${row}/8` });
  sheetXml = setCell(sheetXml, `AK${row}`, { formula: `COUNTIF(B${row}:AF${row},"CM")*8` });
  sheetXml = setCell(sheetXml, `AL${row}`, { formula: `AK${row}/8` });
  return sheetXml;
}

function getGoodworksDailyHours(projects: Partial<ConcurrentProject>[]) {
  return projects
    .filter((project) => project.isActive !== false && isGoodworksProject(project))
    .reduce((total, project) => total + (Number(project.dailyHours) || 0), 0);
}

export function readXlsx(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const files = new Map(entries.map((entry) => [entry.name, inflateEntryData(entry)]));
  return { entries, files };
}

function inflateEntryData(entry: ZipEntry) {
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) throw new Error(`Metoda ZIP nu este suportata pentru ${entry.name}.`);
  return Buffer.from(inflateRawSync(entry.data));
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Arhiva XLSX este invalida: central directory corupt.');
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const modTime = buffer.readUInt16LE(offset + 12);
    const modDate = buffer.readUInt16LE(offset + 14);
    const crc32Value = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const internalAttrs = buffer.readUInt16LE(offset + 36);
    const externalAttrs = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const centralExtra = buffer.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const comment = buffer.subarray(offset + 46 + nameLength + extraLength, offset + 46 + nameLength + extraLength + commentLength);

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Arhiva XLSX este invalida: local header lipsa pentru ${name}.`);
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localExtra = buffer.subarray(
      localHeaderOffset + 30 + localNameLength,
      localHeaderOffset + 30 + localNameLength + localExtraLength,
    );
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.push({
      name,
      flags,
      method,
      modTime,
      modDate,
      crc32: crc32Value,
      compressedSize,
      uncompressedSize,
      localExtra,
      centralExtra,
      comment,
      diskStart,
      internalAttrs,
      externalAttrs,
      data,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

export function writeXlsx(entries: ZipEntry[], files: Map<string, Buffer>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nextData = files.get(entry.name);
    const uncompressed = nextData ?? inflateEntryData(entry);
    const method = entry.method === 0 ? 0 : 8;
    const data = method === 0 ? uncompressed : deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const localHeaderOffset = offset;
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(entry.modTime, 10);
    localHeader.writeUInt16LE(entry.modDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(entry.localExtra.length, 28);
    localParts.push(localHeader, nameBuffer, entry.localExtra, data);
    offset += localHeader.length + nameBuffer.length + entry.localExtra.length + data.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(entry.modTime, 12);
    centralHeader.writeUInt16LE(entry.modDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(entry.centralExtra.length, 30);
    centralHeader.writeUInt16LE(entry.comment.length, 32);
    centralHeader.writeUInt16LE(entry.diskStart, 34);
    centralHeader.writeUInt16LE(entry.internalAttrs, 36);
    centralHeader.writeUInt32LE(entry.externalAttrs, 38);
    centralHeader.writeUInt32LE(localHeaderOffset, 42);
    centralParts.push(centralHeader, nameBuffer, entry.centralExtra, entry.comment);
  });

  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export function setCell(xml: string, ref: string, input: CellInput): string {
  const rowNumber = Number(ref.match(/\d+$/)?.[0]);
  const current = matchCell(xml, ref);
  const style = current?.match(/\bs="([^"]+)"/)?.[1];
  const cellXml = buildCellXml(ref, input, style);

  if (current) {
    return xml.replace(current, cellXml);
  }

  return insertCell(xml, rowNumber, cellXml);
}

function matchCell(xml: string, ref: string): string | null {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<c\\b(?=[^>]*\\br="${escaped}")[^>]*?(?:/>|>[\\s\\S]*?<\\/c>)`));
  return match?.[0] ?? null;
}

function buildCellXml(ref: string, input: CellInput, style?: string) {
  const styleAttr = style ? ` s="${style}"` : '';
  if (input === null || input === undefined || input === '') {
    return `<c r="${ref}"${styleAttr}/>`;
  }

  if (typeof input === 'object' && 'formula' in input) {
    return `<c r="${ref}"${styleAttr}><f>${escapeXml(input.formula)}</f></c>`;
  }

  if (typeof input === 'number') {
    return `<c r="${ref}"${styleAttr}><v>${roundNumber(input)}</v></c>`;
  }

  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(input)}</t></is></c>`;
}

function insertCell(xml: string, rowNumber: number, cellXml: string) {
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  return xml.replace(rowPattern, (_row, open, body, close) => `${open}${insertCellInRow(body, cellXml)}${close}`);
}

function insertCellInRow(rowBody: string, cellXml: string) {
  const ref = cellXml.match(/\br="([^"]+)"/)?.[1] ?? 'A1';
  const col = colNumber(ref.replace(/\d+/g, ''));
  const cells = [...rowBody.matchAll(/<c\b(?=[^>]*\br="([A-Z]+)\d+")[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
  for (const cell of cells) {
    if (colNumber(cell[1]) > col) {
      return `${rowBody.slice(0, cell.index)}${cellXml}${rowBody.slice(cell.index)}`;
    }
  }
  return `${rowBody}${cellXml}`;
}

export function setFullCalcOnLoad(xml: string) {
  if (xml.includes('<calcPr')) {
    return xml.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  }
  return xml.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
}

function insertPeoDay31Row(xml: string) {
  const row43 = xml.match(/<row\b[^>]*\br="43"[^>]*>[\s\S]*?<\/row>/)?.[0];
  if (!row43) return xml;

  let shifted = shiftRows(xml, 44, 1);
  const newRow = clearValues(shiftCellReferences(row43, 43, 44));
  shifted = shifted.replace(/(<row\b[^>]*\br="43"[^>]*>[\s\S]*?<\/row>)/, `$1${newRow}`);
  shifted = shifted.replace(/<dimension ref="A1:I53"\/>/, '<dimension ref="A1:I54"/>');
  shifted = shifted.replace('</mergeCells>', '<mergeCell ref="B44:C44"/><mergeCell ref="D44:F44"/></mergeCells>');
  shifted = shifted.replace(/mergeCells count="(\d+)"/, (_match, count) => `mergeCells count="${Number(count) + 2}"`);
  return shifted;
}

export function insertWorksheetRows(xml: string, insertAtRow: number, count: number) {
  let next = xml;
  for (let index = 0; index < count; index += 1) {
    const sourceRow = insertAtRow - 1;
    const sourceXml = next.match(new RegExp(`<row\\b[^>]*\\br="${sourceRow}"[^>]*>[\\s\\S]*?<\\/row>`))?.[0];
    if (!sourceXml) return next;

    next = shiftRows(next, insertAtRow, 1);
    const newRow = clearValues(shiftCellReferences(sourceXml, sourceRow, insertAtRow));
    next = next.replace(new RegExp(`(<row\\b[^>]*\\br="${sourceRow}"[^>]*>[\\s\\S]*?<\\/row>)`), `$1${newRow}`);
    next = copyMergedRegionsForInsertedRow(next, sourceRow, insertAtRow);
  }
  return next;
}

function copyMergedRegionsForInsertedRow(xml: string, sourceRow: number, targetRow: number) {
  const refs = [...xml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"[^>]*\/>/g)]
    .map((match) => match[1])
    .filter((ref) => mergeRefIsSingleRow(ref, sourceRow))
    .map((ref) => ref.replace(new RegExp(`${sourceRow}\\b`, 'g'), String(targetRow)));

  if (refs.length === 0) return xml;

  const mergeXml = refs.map((ref) => `<mergeCell ref="${ref}"/>`).join('');
  let next = xml.includes('</mergeCells>') ? xml.replace('</mergeCells>', `${mergeXml}</mergeCells>`) : xml.replace('</worksheet>', `<mergeCells count="0">${mergeXml}</mergeCells></worksheet>`);
  next = next.replace(/<mergeCells\b[^>]*\bcount="(\d+)"/, (_match, count) => `<mergeCells count="${Number(count) + refs.length}"`);
  return next;
}

function mergeRefIsSingleRow(ref: string, row: number) {
  const match = ref.match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/);
  return !!match && Number(match[1]) === row && Number(match[2]) === row;
}

function shiftRows(xml: string, startRow: number, delta: number) {
  return xml.replace(/([A-Z]{1,3})(\d+)/g, (match, col, row) => {
    const rowNumber = Number(row);
    return rowNumber >= startRow ? `${col}${rowNumber + delta}` : match;
  });
}

function shiftCellReferences(xml: string, fromRow: number, toRow: number) {
  return xml
    .replace(new RegExp(`\\br="${fromRow}"`, 'g'), `r="${toRow}"`)
    .replace(new RegExp(`([A-Z]{1,3})${fromRow}\\b`, 'g'), `$1${toRow}`);
}

function clearValues(rowXml: string) {
  return rowXml.replace(/<c\b([^>]*)>(?:[\s\S]*?)<\/c>/g, '<c$1/>');
}

function getWorksheetPath(workbookXml: string, relsXml: string, sheetName: string) {
  const sheetRegex = new RegExp(`<sheet\\b[^>]*name="${escapeRegExp(sheetName)}"[^>]*r:id="([^"]+)"[^>]*/>`);
  const relationshipId = workbookXml.match(sheetRegex)?.[1];
  if (!relationshipId) {
    throw new Error(`Nu am gasit foaia ${sheetName} in template-ul consolidat.`);
  }

  const relRegex = new RegExp(`<Relationship\\b[^>]*Id="${escapeRegExp(relationshipId)}"[^>]*Target="([^"]+)"[^>]*/>`);
  const target = relsXml.match(relRegex)?.[1];
  if (!target) {
    throw new Error(`Nu am gasit relatia pentru foaia ${sheetName}.`);
  }

  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`;
}

function getPeoDetailSection(sheetXml: string, sharedStrings: string[]) {
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  const header = rowMatches.find((row) => {
    const rowNumber = Number(row[1]);
    return (
      getCellText(sheetXml, `A${rowNumber}`, sharedStrings) === 'Ziua' &&
      getCellText(sheetXml, `AL${rowNumber}`, sharedStrings) === 'ORE PEO'
    );
  });
  if (!header) {
    throw new Error('Nu am gasit tabelul PEO detaliat in template-ul consolidat.');
  }

  const headerRow = Number(header[1]);
  const total = rowMatches.find((row) => {
    const rowNumber = Number(row[1]);
    return rowNumber > headerRow && getCellText(sheetXml, `A${rowNumber}`, sharedStrings) === 'NR. TOTAL DE ORE';
  });
  if (!total) {
    throw new Error('Nu am gasit randul total din tabelul PEO detaliat.');
  }

  const totalRow = Number(total[1]);
  return {
    headerRow,
    startRow: headerRow + 1,
    totalRow,
    dayRows: totalRow - headerRow - 1,
  };
}

function getGoodworksDetailSection(sheetXml: string, sharedStrings: string[]) {
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  const header = rowMatches.find((row) => {
    const rowNumber = Number(row[1]);
    return (
      getCellText(sheetXml, `A${rowNumber}`, sharedStrings) === 'DATE' &&
      getCellText(sheetXml, `F${rowNumber}`, sharedStrings) === 'TASK NAME'
    );
  });
  if (!header) {
    throw new Error('Nu am gasit tabelul detaliat GOODWORKS4ALL in template-ul consolidat.');
  }

  const headerRow = Number(header[1]);
  const nextHeader = rowMatches.find((row) => {
    const rowNumber = Number(row[1]);
    return rowNumber > headerRow && getCellText(sheetXml, `A${rowNumber}`, sharedStrings) === 'Ziua';
  });
  const totalRow = nextHeader ? Number(nextHeader[1]) : headerRow + 32;
  return {
    headerRow,
    startRow: headerRow + 1,
    totalRow,
    dayRows: totalRow - headerRow - 1,
  };
}

function readSharedStrings(files: Map<string, Buffer>) {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((text) => unescapeXml(text[1])).join(''),
  );
}

function getCellText(sheetXml: string, ref: string, sharedStrings: string[]) {
  const cell = matchCell(sheetXml, ref);
  if (!cell) return '';
  const formula = cell.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1];
  if (formula) return `=${unescapeXml(formula)}`;
  const inline = cell.match(/<is\b[^>]*>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
  if (inline !== undefined) return unescapeXml(inline);
  const value = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return '';
  if (cell.includes(' t="s"')) {
    return sharedStrings[Number(value)] ?? value;
  }
  return value;
}

function getGoodworksEntries(
  projects: Partial<ConcurrentProject>[],
  entries: Partial<ConcurrentProjectTimesheetEntry>[],
  month: number,
  year: number,
) {
  const goodworksProjectIds = new Set(
    projects
      .filter(isGoodworksProject)
      .map((project) => project.id)
      .filter(Boolean),
  );

  return entries.filter((entry) => {
    if (!entry.date || entry.month !== month || entry.year !== year) return false;
    if ((Number(entry.hours) || 0) <= 0 && !getLeaveCode([entry])) return false;
    if (entry.status === 'rejected') return false;
    return goodworksProjectIds.size > 0 && goodworksProjectIds.has(entry.concurrentProjectId);
  });
}

function getGoodworksHours(
  projects: Partial<ConcurrentProject>[],
  entries: Partial<ConcurrentProjectTimesheetEntry>[],
  month: number,
  year: number,
) {
  const hours = new Map<string, Partial<ConcurrentProjectTimesheetEntry>[]>();

  for (const entry of entries) {
    const dateKey = toDateKey(entry.date!);
    hours.set(dateKey, [...(hours.get(dateKey) ?? []), entry]);
  }
  if (entries.length > 0) return hours;

  const daysInMonth = getDaysInMonth(year, month);
  const matchingProjects = projects.filter(isGoodworksProject);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = isoDate(year, month, day);
    if (getNonWorkingDayInfo(dateKey).isNonWorkingDay) continue;

    const dailyHours = matchingProjects.reduce((sum, project) => {
      if (!project.dailyHours || !projectIsActiveOn(project, dateKey)) return sum;
      return sum + Number(project.dailyHours);
    }, 0);

    if (dailyHours > 0) {
      hours.set(dateKey, [
        {
          date: dateKey,
          month,
          year,
          hours: dailyHours,
          wp: '',
          taskName: '',
          relevantDeliverable: '',
        },
      ]);
    }
  }

  return hours;
}

function isGoodworksProject(project: Partial<ConcurrentProject>) {
  const label = `${project.projectName ?? ''} ${project.projectCode ?? ''}`.toLowerCase();
  return project.isActive !== false && (label.includes('goodworks') || label.includes('gw4all'));
}

function hasGoodworksProject(projects: Partial<ConcurrentProject>[]) {
  return projects.some(isGoodworksProject);
}

function projectIsActiveOn(project: Partial<ConcurrentProject>, dateKey: string) {
  const start = project.startDate ? toDateKey(project.startDate) : '0000-00-00';
  const end = project.endDate ? toDateKey(project.endDate) : '9999-12-31';
  return dateKey >= start && dateKey <= end;
}

function buildPeoDetailRows(year: number, month: number, grouped: Map<string, Partial<Activity>[]>) {
  const rows: PeoDetailRow[] = [];
  const daysInMonth = getDaysInMonth(year, month);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = isoDate(year, month, day);
    const isWorking = !getNonWorkingDayInfo(dateKey).isNonWorkingDay;
    const activities = isWorking ? grouped.get(dateKey) ?? [] : [];
    const baseRow = {
      day,
      dateKey,
      dateSerial: excelSerial(year, month, day),
      isWorking,
    };

    if (activities.length === 0) {
      rows.push(baseRow);
    } else {
      activities.forEach((activity) => rows.push({ ...baseRow, activity }));
    }
  }

  return rows;
}

function groupActivitiesByDate(activities: Partial<Activity>[]) {
  const grouped = new Map<string, Partial<Activity>[]>();
  activities
    .filter((activity) => (activity.status as string | undefined) !== 'rejected' && activity.date && (Number(activity.hours) > 0 || getLeaveCode([activity])))
    .forEach((activity) => {
      const date = toDateKey(activity.date!);
      grouped.set(date, [...(grouped.get(date) ?? []), activity]);
    });
  return grouped;
}

function getLeaveCode(entries: Array<Partial<Activity> | Partial<ConcurrentProjectTimesheetEntry>>) {
  const hasCo = entries.some((entry) => normalizeLeaveCode(entry.dayType) === 'CO');
  if (hasCo) return 'CO';
  const hasCm = entries.some((entry) => normalizeLeaveCode(entry.dayType) === 'CM');
  return hasCm ? 'CM' : null;
}

function normalizeLeaveCode(dayType?: string) {
  const value = String(dayType ?? '').trim().toUpperCase();
  if (value === 'CO' || value.includes('CONCEDIU ODIHNA')) return 'CO';
  if (value === 'CM' || value.includes('CONCEDIU MEDICAL')) return 'CM';
  return null;
}

function sumHours(activities: Partial<Activity>[]) {
  return roundNumber(activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0));
}

function sumConcurrentHours(entries: Partial<ConcurrentProjectTimesheetEntry>[]) {
  return roundNumber(entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0));
}

function activityCode(activity: Partial<Activity>, expert?: Partial<Expert>) {
  const saCode = normalizeSaCode(activity.saCode);
  if (!saCode || !expertCanReportSaCode(expert, saCode)) return '';
  return SUBACTIVITY_TO_ACTIVITY_CODE.get(saCode) ?? '';
}

function activitySubactivity(activity: Partial<Activity>) {
  const code = normalizeSaCode(activity.saCode);
  const officialName = code ? SUBACTIVITY_NAMES.get(code) : undefined;
  if (code && officialName) return `${code} ${officialName}`;

  const rawCode = stringValue(activity.saCode).trim();
  const label = [activity.activityType, activity.title].map((value) => stringValue(value).trim()).find(Boolean);
  return [rawCode, label].filter(Boolean).join(' ') || activity.activityType || '';
}

function expertCanReportSaCode(expert: Partial<Expert> | undefined, saCode: string) {
  const eligibleSaCodes = (expert?.saCodes ?? []).map(normalizeSaCode).filter(Boolean);
  return eligibleSaCodes.length === 0 || eligibleSaCodes.includes(saCode);
}

function normalizeSaCode(value: unknown) {
  const match = stringValue(value).toUpperCase().match(/SA\s*(\d+)\s*\.\s*(\d+)/);
  return match ? `SA${match[1]}.${match[2]}` : '';
}

function activityDescription(activity: Partial<Activity>) {
  return [activity.description || activity.title || '', activity.eventExtendedDescription]
    .map((value) => stringValue(value).trim())
    .filter(Boolean)
    .join('\n');
}

function activityDeliverables(activity: Partial<Activity>) {
  return (activity.deliverables ?? []).map((deliverable) =>
    [deliverable.fileName, deliverable.declaredTitle, deliverable.docTitle].find(Boolean) ?? '',
  );
}

function getExpertDailyHours(expert: Partial<Expert>) {
  return Number(expert.oreZi ?? expert.dailyHours ?? expert.norma ?? 8) || 8;
}

function getExpertCimDailyHours(expert: Partial<Expert>) {
  return Number(expert.norma ?? 8) || 8;
}

function getExpertHourlyRate(expert: Partial<Expert> & { hourlyRate?: number | string }) {
  const value = typeof expert.hourlyRate === 'string'
    ? Number(expert.hourlyRate.replace(',', '.'))
    : Number(expert.hourlyRate);
  return Number.isFinite(value) && value > 0 ? roundNumber(value) : 0;
}

function getExpertPosition(expert: Partial<Expert>) {
  return expert.positionInProject || expert.role || '';
}

function getExpertCategoryForExport(expert: Partial<Expert>) {
  return getExpertPosition(expert);
}

function getLastPeoWorkedDateSerial(activities: Partial<Activity>[], year: number, month: number) {
  const lastDate = activities
    .filter((activity) => {
      if (!activity.date || (Number(activity.hours) || 0) <= 0) return false;
      const [activityYear, activityMonth] = activity.date.split('-').map(Number);
      return activityYear === year && activityMonth === month + 1;
    })
    .map((activity) => activity.date!)
    .sort()
    .at(-1);

  if (!lastDate) return null;
  const [dateYear, dateMonth, dateDay] = lastDate.split('-').map(Number);
  return excelSerial(dateYear, dateMonth - 1, dateDay);
}

function getProjectTitle(expert: Partial<Expert>) {
  const code = expert.projectCode || '302141';
  const title = expert.projectTitle || 'Consolidarea capacitatii Concordia pentru dialog social';
  return `${title} - Cod Proiect: ${code}`;
}

function sheetNameForMonth(month: number, year: number) {
  const names = ['IAN', 'FEBR', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
  return `${names[month]} ${year}`;
}

function filenameFor(prefix: string, payload: ExportPayload) {
  const expert = String(payload.expert.name ?? 'Expert').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${prefix}_${expert}_${MONTHS_RO[payload.month]}_${payload.year}.xlsx`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function excelSerial(year: number, month: number, day: number) {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(1899, 11, 30)) / DAY_MS);
}

function joinUnique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))].join(' / ');
}

function stringValue(value: unknown) {
  return value == null ? '' : String(value);
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function colNumber(column: string) {
  return column.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('Arhiva XLSX este invalida: EOCD lipsa.');
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
